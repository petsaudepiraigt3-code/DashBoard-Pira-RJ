// Import a flat JSON export: [{ path: 'pacientes/id', data: {...} }, ...].
// Dry-run unless --apply is passed. No invitation emails or password reset emails are sent.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
async function main() {
 const file = process.argv.find((v,i)=>i>1 && !v.startsWith('--'));
 const apply = process.argv.includes('--apply');
 if(!file) throw new Error('Uso: npm run supabase:import -- migration-data.json [--apply]');
 const rows = JSON.parse(fs.readFileSync(file,'utf8'));
 if(!Array.isArray(rows) || !rows.every(r=>typeof r.path==='string' && /^[^/]+\/[^/]+(\/[^/]+\/[^/]+)*$/.test(r.path) && r.data && typeof r.data==='object' && !Array.isArray(r.data))) throw new Error('Formato inválido: esperado array de {path,data}.');
 if(new Set(rows.map(r=>r.path)).size!==rows.length) throw new Error('Caminhos duplicados no arquivo.');
 const profiles=rows.filter(r=>r.path.startsWith('usuarios/') && r.path.split('/').length===2);
 const emails=new Set();
 for(const row of profiles) {
  const p=row.data; p.email=String(p.email || '').trim().toLowerCase(); p.ativo=p.ativo!==false;
  if(!p.email.includes('@') || !['ADMIN','GERENTE','ACS'].includes(p.perfil) || (p.perfil!=='ADMIN' && !p.unidadeId)) throw new Error('Perfil inválido no arquivo: '+row.path);
  if(emails.has(p.email)) throw new Error('E-mail duplicado no arquivo. Reconcilie antes de importar.');
  emails.add(p.email);
 }
 console.log(`${rows.length} documentos válidos, ${profiles.length} perfis. Modo: ${apply?'APLICAR':'SIMULAÇÃO (sem escrita)'}.`);
 if(!apply) return;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url || !key)throw new Error('Configure as variáveis Supabase.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const users=[];
 for(let page=1;;page++) {const {data,error}=await client.auth.admin.listUsers({page,perPage:1000});if(error)throw error;users.push(...data.users);if(data.users.length<1000)break;}
 const mapping=new Map();
 for(const row of profiles) {
  let user=users.find(u=>u.email?.toLowerCase()===row.data.email);
  if(!user) {
   const {data,error}=await client.auth.admin.createUser({email:row.data.email,password:crypto.randomBytes(32).toString('base64url'),email_confirm:true,user_metadata:{nome:row.data.nome}});
   if(error)throw error;user=data.user;users.push(user);
  }
  for(const old of [row.path.slice(9),row.data.uid,row.data.authUid].filter(Boolean))mapping.set(old,user.id);
 }
 function remap(value) {
  if(typeof value==='string')return mapping.get(value)||value;
  if(Array.isArray(value))return value.map(remap);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
  return value;
 }
 const migrated=rows.map(row=>({path:row.path.split('/').map(v=>mapping.get(v)||v).join('/'),data:remap(row.data)}));
 if(new Set(migrated.map(r=>r.path)).size!==migrated.length)throw new Error('Colisão de IDs depois da reconciliação.');
 // Insert only: never overwrite an existing patient or administrator silently.
 // Whole import is transactional, so failure leaves existing data intact.
 const {error}=await client.rpc('import_documents',{documents:migrated});if(error)throw error;
 console.log('Documentos importados. Novas contas usam senha aleatória: defina senhas pela gestão antes de liberar o acesso.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
