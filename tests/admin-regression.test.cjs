const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/app-harness.cjs');
test('administrative routes validate tokens, manager scope and rollback of account creation', async () => {
 const h=await harness();const env={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 try {
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='local-test';
 const users=Object.entries(h.ids).map(([name,id])=>({id,email:`${name}@example.com`}));
 let deleted=null,updated=null;
 const createdId='00000000-0000-0000-0000-000000000009';
 h.client.auth={getUser:async token=>({data:{user:users.find(u=>u.id===h.ids[token])||null},error:null}),admin:{
  listUsers:async()=>({data:{users},error:null}),
  createUser:async body=>({data:{user:{id:createdId,email:body.email}},error:null}),
  deleteUser:async id=>{deleted=id;return {error:null};},
  updateUserById:async id=>{updated=id;return {error:null};},
 }};
 h.overrides.set('@supabase/supabase-js',{createClient:()=>h.client});
 await h.db.exec('set role service_role');
 const {requireAccess}=h.load('lib/supabase-admin.ts');
 const request=(token,body)=>new Request('http://localhost/api/admin/users',{method:'POST',headers:token?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{},body:JSON.stringify(body||{})});
 await assert.rejects(requireAccess(request()),e=>e.status===401);
 await assert.rejects(requireAccess(request('invalid')),e=>e.status===401);
 const {manageUsers}=h.load('lib/user-management.ts');
 const body={nome:'Novo ACS',email:'novo@example.com',senhaInicial:'SecurePassword123',perfil:'ADMIN',unidadeId:'u2'};
 const created=await manageUsers(request('manager',body),'create');assert.equal(created.status,201);
 const result=await created.json();assert.equal(result.perfil,'ACS');assert.equal(result.unidadeId,'u1');
 const stored=(await h.db.query('select data from app_documents where path=$1',['usuarios/'+createdId])).rows[0].data;assert.equal(stored.perfil,'ACS');
 const blocked=await manageUsers(request('acs',body),'create');assert.equal(blocked.status,403);
 const short=await manageUsers(request('manager',{...body,senhaInicial:'short'}),'create');assert.equal(short.status,400);
 await h.seed('usuarios/outside',{nome:'Other',email:'other@example.com',perfil:'ACS',unidadeId:'u2',ativo:true});
 const outside=await manageUsers(request('manager',{email:'other@example.com',novaSenha:'SecurePassword123'}),'reset');assert.equal(outside.status,403);assert.equal(updated,null);
 // Rollback is attempted when Auth succeeds but profile persistence fails.
 h.fail('reconcile_user_profile');const rollback=await manageUsers(request('admin',{...body,email:'rollback@example.com',perfil:'ADMIN'}),'create');assert.equal(rollback.status,500);assert.equal(deleted,createdId);
 } finally {
 if(env.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=env.url;
 if(env.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=env.key;
 await h.close();
 }
});
