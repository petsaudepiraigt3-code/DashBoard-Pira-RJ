const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, patient, parseResult } = require('./helpers/app-harness.cjs');
test('import updates a migrated patient with its original ID and preserves actions', async () => {
 const h=await harness();try {
 await h.seed('pacientes/original-id', {nome:'Old',cpf:'12345678901',unidadeId:'u1',microareaCodigo:'01',historicoAcoes:[{id:'old-action'}]});
 await h.as('manager');const importer=h.load('lib/esus/importer.ts');
 await importer.executeESUSImportToStore(parseResult([patient()]),'teste.csv','1 KB','manager','u1','Unidade',undefined,'GERENTE','u1');
 const store=h.load('lib/store/documents.ts');const rows=await store.getDocs(store.collection(store.db,'pacientes'));
 assert.equal(rows.size,1);assert.equal(rows.docs[0].id,'original-id');assert.equal(rows.docs[0].data().historicoAcoes[0].id,'old-action');
 } finally {await h.close();}
});
test('new imports keep phone, medical appointment and measurement counters', async () => {
 const h=await harness();try {
 await h.as('manager');const importer=h.load('lib/esus/importer.ts');
 const result=await importer.executeFivePatientsTestImportToStore([patient()],'teste.csv','manager','u1','Unidade','GERENTE','u1');
 const patients=await h.load('lib/store/patients.ts').getAllPatientsFromStore({role:'GERENTE',userUnitId:'u1'});
 assert.equal(patients.length,1);assert.equal(patients[0].phone,'24999991234');assert.equal(patients[0].lastMedicalApptDate,'2026-10-01');
 assert.equal(result.novosPesos,1);
 assert.equal(result.novosAtendimentos,1);
 const history=await h.load('lib/store/imports.ts').getImportHistoryFromStore();assert.equal(history[0].status,'Concluído');
 const repeated=await importer.executeFivePatientsTestImportToStore([patient()],'teste.csv','manager','u1','Unidade','GERENTE','u1');
 assert.equal(repeated.novosPesos,0);assert.equal(repeated.novosAtendimentos,0);
 } finally {await h.close();}
});
test('failed import cannot appear as completed in import history', async () => {
 const h=await harness();try {
 await h.as('manager');const importer=h.load('lib/esus/importer.ts');
 // Patient batches fail, while creating and updating import history still work.
 const store=h.load('lib/store/documents.ts');const original=store.writeBatch;
 let duringStatus;
 store.writeBatch=(...args)=>{const batch=original(...args);return {...batch,commit:async()=>{duringStatus=(await h.load('lib/store/imports.ts').getImportHistoryFromStore())[0].status;throw Error('Connection interrupted');}};};
 await assert.rejects(importer.executeESUSImportToStore(parseResult([patient()]),'teste.csv','1 KB','manager','u1','Unidade',undefined,'GERENTE','u1'));
 const history=await h.load('lib/store/imports.ts').getImportHistoryFromStore();
 assert.equal(duringStatus,'Em andamento');
 assert.equal(history.length,1);assert.equal(history[0].status,'Falhou');
 } finally {await h.close();}
});
test('complete import commits several batches with parent and clinical records under RLS', async () => {
 const h=await harness();try {
 await h.as('manager');const importer=h.load('lib/esus/importer.ts');
 const rows=Array.from({length:65},(_,i)=>patient({cpf:String(12345678000+i)}));
 const result=await importer.executeESUSImportToStore(parseResult(rows),'teste.csv','10 KB','manager','u1','Unidade',undefined,'GERENTE','u1');
 assert.equal(result.newPatients,65);assert.equal(result.status,'Concluído');assert.equal(result.weightCount,65);
 const store=h.load('lib/store/documents.ts');const patients=await store.getDocs(store.collection(store.db,'pacientes'));assert.equal(patients.size,65);
 const counts=await h.db.query("select split_part(collection,'/',3) as type,count(*)::int as n from app_documents where path like 'pacientes/%/%/%' group by 1");
 for(const type of ['historicoCargas','vinculosUnidade','pressaoArterial','antropometria','atendimentos'])assert.equal(counts.rows.find(r=>r.type===type)?.n,65);
 } finally {await h.close();}
});
test('ACS actions require ownership and update priority explanations atomically', async () => {
 const h=await harness();try {
 await h.seed('pacientes/p1',{unidadeId:'u1',microareaCodigo:'01',historicoAcoes:[],motivosPrioridade:'PA elevada'});await h.as('acs');
 const action={id:'act1',patientId:'p1',dataAcao:'2026-11-08',tipoAcao:'Visita Domiciliar'};
 const invalid=await h.load('lib/store/documents.ts');
 // RPC must reject incomplete ownership fields instead of SQL NULL bypassing validation.
 const malformed=await h.db.query('select append_patient_action($1,$2,null,null)',['p1',JSON.stringify(action)]).then(()=>null,e=>e);
 assert(malformed,'Action without acsId must be rejected');
 await h.load('lib/store/patients.ts').savePatientActionInStore('p1',{...action,acsId:h.ids.acs},'Acompanhado',undefined,'ACS');
 const p=await invalid.getDoc(invalid.doc(invalid.db,'pacientes','p1'));
 assert.match(p.data().motivosPrioridade,/Acompanhamento realizado/);assert.equal(p.data().historicoAcoes.length,1);
 } finally {await h.close();}
});
test('store paginates beyond 1,000 documents and propagates write errors', async () => {
 const h=await harness();try {
 await h.db.exec(`insert into app_documents(path,data) select 'pacientes/p-'||lpad(i::text,4,'0'), '{"unidadeId":"u1","microareaCodigo":"01"}'::jsonb from generate_series(1,1005) i`);
 await h.as('acs');const store=h.load('lib/store/documents.ts');
 const rows=await store.getDocs(store.collection(store.db,'pacientes'));assert.equal(rows.size,1005);
 assert.deepEqual(h.calls.map(c=>c.offset),[0,500,1000]);
 h.fail('append_patient_action');await assert.rejects(h.load('lib/store/patients.ts').savePatientActionInStore('p-0001',{acsId:h.ids.acs,patientId:'p-0001',tipoAcao:'Visita Domiciliar',dataAcao:'2026-11-08'},undefined,undefined,'ACS'));
 } finally {await h.close();}
});
