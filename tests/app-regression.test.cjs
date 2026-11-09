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

test('34-column e-SUS CSV mapping, DCNT parameterization, and deferred ACS microarea linkage', async () => {
 const h=await harness();try {
 await h.as('manager');
 const mappers=h.load('lib/esus/mappers.ts');
 const validator=h.load('lib/esus/validator.ts');
 const importer=h.load('lib/esus/importer.ts');
 const units=h.load('lib/store/units.ts');
 const patientsStore=h.load('lib/store/patients.ts');
 const paramsStore=h.load('lib/store/parameters.ts');
 const headers=[
  'Nome','Data de nascimento','Idade','Sexo','Identidade de gênero','Raça/cor',
  'Beneficiário do programa Bolsa Família','Vigência do programa Bolsa Família','CPF','CNS',
  'Telefone celular','Telefone residencial','Telefone de contato','Microárea','Rua','Número',
  'Complemento','Bairro','Município','UF','CEP','Dias desde o último atendimento médico',
  'Meses desde o último atendimento médico','Dias desde o último atendimento de enfermagem',
  'Meses desde o último atendimento de enfermagem','Dias desde o último atendimento odontológico',
  'Meses desde o último atendimento odontológico','Dias desde a última visita domiciliar',
  'Meses desde a última visita domiciliar','Última medição de peso','Última medição de altura',
  'Data da última medição de peso e altura','Última medição de pressão arterial','Data da última medição de pressão arterial'
 ];
 const values=[
  'ADENILTON MALAQUIAS IDALINO','09/02/1971','55 anos e 8 meses e 25 dias','Masculino','-','PARDA',
  'Não','-','032.975.037-26','704607685220220','(24) 99951-4115','-','-','56','Seis - loteamento fraternidade','27',
  '-','ARROZAL','Piraí','RJ','27185-000','24','2','8','7','-','-','20','0','90,60','172,00','10/08/2026','132/82','10/08/2026'
 ];
 const rawRow=Object.fromEntries(headers.map((k,i)=>[k,values[i]]));
 const {mappedColumns,unrecognizedColumns}=mappers.mapHeaders(headers);
 assert.equal(unrecognizedColumns.length,0);
 assert.equal(Object.keys(mappedColumns).length,34);
 await paramsStore.saveDcntParametersInStore({...paramsStore.DEFAULT_DCNT_PARAMETERS,systolicAlteradaCutoff:130});
 const customParams=await paramsStore.getDcntParametersFromStore();
 assert.equal(customParams.systolicAlteradaCutoff,130);
 const parsed=validator.validateAndNormalizeESUSData({headerRowIndex:1,headersFound:headers,mappedColumns,unrecognizedColumns,rawRows:[rawRow]},new Map(),customParams);
 assert.equal(parsed.validRowsCount,1);
 const norm=parsed.rows[0].normalizedData;
 assert.equal(norm.idade,55);
 assert.equal(norm.telefoneNormalizado,'24999514115');
 assert.equal(norm.microarea,'Microárea 56');
 assert.equal(norm.racaCor,'PARDA');
 assert.equal(norm.beneficiarioBolsaFamilia,false);
 assert.equal(norm.priority,'Alta');
 await importer.executeESUSImportToStore(parsed,'arrozal.csv','2 KB','manager','u1','Unidade',undefined,'GERENTE','u1');
 await h.as('acs');
 const beforeLink=await patientsStore.getAllPatientsFromStore({role:'ACS',userUnitId:'u1',assignedMicroareaCodes:['01']});
 assert.equal(beforeLink.length,0);
 await h.as('manager');
 await units.assignAcsToMicroarea('ma_u1_56',h.ids.acs,'ACS Arrozal','manager');
 await h.as('acs');
 const afterLink=await patientsStore.getAllPatientsFromStore({role:'ACS',userUnitId:'u1',assignedMicroareaCodes:['01','56']});
 assert.equal(afterLink.length,1);
 assert.equal(afterLink[0].name,'ADENILTON MALAQUIAS IDALINO');
 assert.equal(afterLink[0].phone,'24999514115');
 assert.equal(afterLink[0].acsName,'ACS Arrozal');
 assert.equal(afterLink[0].street,'Seis - loteamento fraternidade');
 assert.ok(afterLink[0].lastMedicalApptDate);
 await h.db.exec('set role service_role');
 const relPat=(await h.db.query("select * from public.paciente where cpf='03297503726'")).rows[0];
 assert.ok(relPat);
 assert.equal(relPat.nome,'ADENILTON MALAQUIAS IDALINO');
 assert.equal(relPat.idade,55);
 assert.equal(relPat.raca_cor,'PARDA');
 assert.equal(relPat.beneficiario_bolsa_familia,false);
 assert.equal(relPat.telefone_celular,'24999514115');
 assert.equal(relPat.microarea,56);
 assert.equal(relPat.microarea_codigo,'56');
 assert.equal(relPat.acs_nome,'ACS Arrozal');
 assert.equal(relPat.rua,'Seis - loteamento fraternidade');
 assert.equal(relPat.numero,'27');
 assert.equal(relPat.bairro,'ARROZAL');
 assert.equal(relPat.municipio,'Piraí');
 assert.equal(relPat.uf,'RJ');
 assert.equal(relPat.cep,'27185-000');
 assert.equal(relPat.dias_ultimo_atendimento_medico,24);
 assert.equal(relPat.meses_ultimo_atendimento_medico,2);
 assert.equal(relPat.dias_ultimo_atendimento_enfermagem,8);
 assert.equal(relPat.meses_ultimo_atendimento_enfermagem,7);
 assert.equal(relPat.dias_ultima_visita_domiciliar,20);
 assert.equal(relPat.meses_ultima_visita_domiciliar,0);
 assert.equal(Number(relPat.peso_atual),90.6);
 assert.equal(Number(relPat.altura_atual),1.72);
 assert.equal(relPat.pressao_sistolica_atual,132);
 assert.equal(relPat.pressao_diastolica_atual,82);
 const relPa=(await h.db.query('select * from public.afericao_pressao where id_paciente=$1',[relPat.id_paciente])).rows;
 assert.equal(relPa.length,1);
 assert.equal(relPa[0].pressao_sistolica,132);
 const relMed=(await h.db.query('select * from public.afericao_medidas where id_paciente=$1',[relPat.id_paciente])).rows;
 assert.equal(relMed.length,1);
 assert.equal(Number(relMed[0].peso),90.6);
 const relAtt=(await h.db.query('select * from public.atendimento where id_paciente=$1',[relPat.id_paciente])).rows;
 assert.ok(relAtt.length>=3);
 const relParams=(await h.db.query("select * from public.parametros_dcnt where id='dcnt'")).rows[0];
 assert.equal(relParams.pa_sistolica_alterada,130);
 } finally {await h.close();}
});

test('Manager observations: GERENTE can add and edit with history, ACS can view history but cannot edit', async () => {
 const h=await harness();try {
 await h.seed('pacientes/p-obs',{nome:'Maria Observada',cpf:'99988877766',unidadeId:'u1',microarea:'Microárea 01',microareaCodigo:'01',prioridade:'Alta'});
 const patientsStore=h.load('lib/store/patients.ts');

 // 1. GERENTE adds an observation (e.g. absence during ACS visit)
 await h.as('manager');
 const created=await patientsStore.addManagerObservationInStore('p-obs',{
  unidadeId:'u1',
  categoria:'Ausência em Visita',
  texto:'ACS tentou visitar paciente em 09/11, porém estava ausente.',
  autorId:h.ids.manager,
  autorNome:'Gerente Unidade 1',
  autorPerfil:'GERENTE',
 });
 assert.equal(created.observation.editado,false);
 assert.equal(created.historyEntry.tipoEvento,'CRIACAO');

 // 2. GERENTE edits the observation; history keeps previous and new text
 const edited=await patientsStore.updateManagerObservationInStore('p-obs',created.observation.id,{
  categoria:'Orientação para ACS',
  texto:'Paciente retornou; ACS deve realizar nova visita no período da tarde.',
  autorId:h.ids.manager,
  autorNome:'Gerente Unidade 1',
  autorPerfil:'GERENTE',
 },created.observation);
 assert.equal(edited.observation.editado,true);
 assert.equal(edited.historyEntry.tipoEvento,'EDICAO');
 assert.equal(edited.historyEntry.textoAnterior,'ACS tentou visitar paciente em 09/11, porém estava ausente.');
 assert.equal(edited.historyEntry.textoNovo,'Paciente retornou; ACS deve realizar nova visita no período da tarde.');

 // 3. ACS can view current observation and complete edit history
 await h.as('acs');
 const acsPatients=await patientsStore.getAllPatientsFromStore({role:'ACS',userUnitId:'u1',assignedMicroareaCodes:['01']});
 assert.equal(acsPatients.length,1);
 assert.equal(acsPatients[0].observacaoGerenteAtual.texto,'Paciente retornou; ACS deve realizar nova visita no período da tarde.');
 assert.equal(acsPatients[0].historicoObservacoesGerente.length,2);

 const acsObsHistory=await patientsStore.getPatientManagerObservationsFromStore('p-obs');
 assert.equal(acsObsHistory.observations.length,1);
 assert.equal(acsObsHistory.history.length,2);

 // 4. ACS cannot add or edit manager observations (both client guard and SQL RPC guard)
 await assert.rejects(patientsStore.addManagerObservationInStore('p-obs',{
  unidadeId:'u1',
  texto:'Tentativa indevida pelo ACS',
  autorId:h.ids.acs,
  autorNome:'ACS',
  autorPerfil:'ACS',
 }),/Acesso Negado/);
 await assert.rejects(h.db.query('select save_manager_patient_observation($1,$2,$3)',[
  'p-obs',
  JSON.stringify(edited.observation),
  JSON.stringify(edited.historyEntry),
 ]),/Only GERENTE or ADMIN/i);
 } finally {await h.close();}
});

test('GERENTE views 100% of unit patients across all microareas, and multi-unit separation isolates Pirai units', async () => {
 const h=await harness();try {
  const units=h.load('lib/store/units.ts');
  const patientsStore=h.load('lib/store/patients.ts');
  const documents=h.load('lib/store/documents.ts');

  // 1. Create a second health unit for Pirai (e.g. USF-002)
  await h.as('admin');
  const unit2Id=await units.createHealthUnit({
   codigo:'USF-002',
   nome:'USF Pirai Centro',
   tipo:'USF',
   municipio:'Pirai',
   ativo:true,
  });
  assert.equal(unit2Id,'USF-002');

  // 2. Insert patients in unit u1: microarea 01 (ACS), microarea 56 (ACS), and microarea 99 (no ACS)
  await h.as('manager');
  await documents.setDoc(documents.doc(documents.db,'pacientes','p-u1-01'),{
   nome:'Paciente Microarea 01',
   unidadeId:'u1',
   microarea:'Microarea 01',
   microareaCodigo:'01',
   prioridade:'Alta',
   historicoAcoes:[{id:'act-1',tipoAcao:'Visita Domiciliar',dataAcao:'2026-11-01',resultado:'Realizada'}],
  });
  await documents.setDoc(documents.doc(documents.db,'pacientes','p-u1-56'),{
   nome:'Paciente Microarea 56',
   unidadeId:'u1',
   microarea:'Microarea 56',
   microareaCodigo:'56',
   prioridade:'Media',
  });
  await documents.setDoc(documents.doc(documents.db,'pacientes','p-u1-sem-acs'),{
   nome:'Paciente Sem ACS',
   unidadeId:'u1',
   microarea:'Microarea 99',
   microareaCodigo:'99',
   prioridade:'Alta',
  });

  // 3. Verify manager of u1 CANNOT write patients into unit USF-002 (RLS unit isolation)
  await assert.rejects(
   documents.setDoc(documents.doc(documents.db,'pacientes','p-u2-denied'),{
    nome:'Tentativa Indevida',
    unidadeId:'USF-002',
    microarea:'Microarea 01',
   }),
   /Write denied/
  );

  // Insert patient in unit USF-002 (Pirai) as admin
  await h.as('admin');
  await documents.setDoc(documents.doc(documents.db,'pacientes','p-u2-01'),{
   nome:'Paciente Pirai Centro',
   unidadeId:'USF-002',
   microarea:'Microarea 01',
   microareaCodigo:'01',
   prioridade:'Alta',
  });
  await h.as('manager');

  // 4. Verify GERENTE of u1 sees 100% of u1 patients (3 patients) and zero patients from USF-002
  const gerentePatients=await patientsStore.getAllPatientsFromStore({role:'GERENTE',userUnitId:'u1'});
  assert.equal(gerentePatients.length,3);
  const names=gerentePatients.map(p=>p.name);
  assert.ok(names.includes('Paciente Microarea 01'));
  assert.ok(names.includes('Paciente Microarea 56'));
  assert.ok(names.includes('Paciente Sem ACS'));
  assert.ok(!names.includes('Paciente Pirai Centro'));

  // 5. Verify ACS of u1 only sees their assigned microarea
  await h.as('acs');
  const acsOnly01=await patientsStore.getAllPatientsFromStore({role:'ACS',userUnitId:'u1',assignedMicroareaCodes:['01']});
  assert.equal(acsOnly01.length,1);
  assert.equal(acsOnly01[0].name,'Paciente Microarea 01');

  // 6. Verify merge preserves actions on existing patient
  await h.as('manager');
  await documents.setDoc(documents.doc(documents.db,'pacientes','p-u1-01'),{
   telefoneCelular:'24999998888',
   updatedAt:'2026-11-09T10:00:00.000Z',
  },{merge:true});
  const mergedPatient=(await documents.getDoc(documents.doc(documents.db,'pacientes','p-u1-01'))).data();
  assert.equal(mergedPatient.telefoneCelular,'24999998888');
  assert.equal(mergedPatient.nome,'Paciente Microarea 01');
  assert.equal(mergedPatient.historicoAcoes.length,1);
 } finally {await h.close();}
});
