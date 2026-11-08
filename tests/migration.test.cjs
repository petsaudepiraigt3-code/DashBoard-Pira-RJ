const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('Supabase SQL: scope, privilege boundaries, atomic batches and clinical history', async () => {
 const db = new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
 const migration=fs.readFileSync('supabase/migrations/202611080001_supabase_only.sql','utf8');
 assert.equal(fs.readFileSync('database-schema.sql','utf8'),migration);
 await db.exec(migration);
 const ids = { admin:'00000000-0000-0000-0000-000000000001', manager:'00000000-0000-0000-0000-000000000002', acs:'00000000-0000-0000-0000-000000000003', inactive:'00000000-0000-0000-0000-000000000004', unassigned:'00000000-0000-0000-0000-000000000005' };
 const insert = (path,data) => db.query('insert into app_documents(path,data) values($1,$2)',[path,JSON.stringify(data)]);
 for(const [role,id] of Object.entries(ids)) await insert('usuarios/'+id,{uid:id,perfil:role==='admin'?'ADMIN':role==='manager'?'GERENTE':'ACS',unidadeId:'u1',ativo:role!=='inactive'});
 await insert('unidades/u1',{nome:'Unit',ativo:true}); await insert('unidades/u2',{nome:'Other',ativo:true});
 await insert('microareas/m1',{unidadeId:'u1',codigo:'01',acsId:ids.acs,ativo:true});
 await insert('pacientes/p1',{unidadeId:'u1',microareaCodigo:'01',nome:'Test',historicoAcoes:[]});
 await insert('pacientes/p2',{unidadeId:'u2',microareaCodigo:'01',nome:'Other'});
 await insert('pacientes/p1/historicoCargas/h1',{peso:70});
 async function as(role) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role] || '']); await db.exec('set role authenticated'); }
 async function paths() { return (await db.query('select path from app_documents order by path')).rows.map(r=>r.path); }
 await as('acs'); assert((await paths()).includes('pacientes/p1')); assert(!(await paths()).includes('pacientes/p2'));
 assert((await paths()).includes('pacientes/p1/historicoCargas/h1'));
 await assert.rejects(db.query('select write_documents($1)',[JSON.stringify([{path:'usuarios/'+ids.acs,data:{perfil:'ADMIN'},merge:true}])]),/row-level security|Write denied/i);
 const action={id:'a1',acsId:ids.acs,patientId:'p1',dataAcao:'2026-11-08',tipoAcao:'Visita Domiciliar'};
 await db.query('select append_patient_action($1,$2,$3,$4)',['p1',JSON.stringify(action),'Acompanhado','2026-11-08']);
 assert.equal((await db.query("select data->'historicoAcoes' as history from app_documents where path='pacientes/p1'")).rows[0].history.length,1);
 await assert.rejects(db.query('select append_patient_action($1,$2,null,null)',['p2',JSON.stringify({...action,id:'a2',patientId:'p2'})]),/not found|denied/i);
 await as('unassigned'); assert(!(await paths()).some(p=>p.startsWith('pacientes/')));
 await as('inactive'); assert.deepEqual(await paths(),[]);
 await as('manager'); assert(!(await paths()).includes('pacientes/p2'));
 await assert.rejects(db.query('select write_documents($1)',[JSON.stringify([{path:'usuarios/'+ids.manager,data:{perfil:'ADMIN'},merge:true}])]),/row-level security|denied/i);
 // A failure later in a batch rolls the first write back.
 await assert.rejects(db.query('select write_documents($1)',[JSON.stringify([{path:'diagnostico/atomic',data:{status:'ok'},merge:false},{path:'pacientes/p2',data:{nome:'forbidden'},merge:true}])]),/security|denied|duplicate/i);
 assert(!(await paths()).includes('diagnostico/atomic'));
 await assert.rejects(db.query("select reconcile_user_profile('usuarios/legacy',$1,'{}')",[ids.acs]),/permission denied/i);
 await as('admin'); assert((await paths()).includes('pacientes/p2'));
 await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(db.query('select * from app_documents'),/permission denied/i);
 await db.exec('reset role');
 await insert('usuarios/legacy',{perfil:'ACS',ativo:true,unidadeId:'u1'});
 await insert('microareas/legacy',{acsId:'legacy',unidadeId:'u1',codigo:'02',ativo:true});
 await db.exec('set role service_role');
 await db.query('select reconcile_user_profile($1,$2,$3)',['usuarios/legacy',ids.acs,JSON.stringify({uid:ids.acs,perfil:'ACS',ativo:true,unidadeId:'u1'})]);
 assert.equal((await db.query("select data->>'acsId' as acs from app_documents where path='microareas/legacy'")).rows[0].acs,ids.acs);
 assert.equal((await db.query("select count(*)::int as n from app_documents where path='usuarios/legacy'")).rows[0].n,0);
 await assert.rejects(db.query('select import_documents($1)',[JSON.stringify([{path:'imports/new',data:{}},{path:'pacientes/p1',data:{}}])]),/duplicate/i);
 assert.equal((await db.query("select count(*)::int as n from app_documents where path='imports/new'")).rows[0].n,0);
 } finally { await db.close(); }
});
