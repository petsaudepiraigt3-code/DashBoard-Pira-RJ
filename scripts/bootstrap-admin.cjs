const { createClient } = require('@supabase/supabase-js');
async function main() {
 const { NEXT_PUBLIC_SUPABASE_URL:url, SUPABASE_SERVICE_ROLE_KEY:key, BOOTSTRAP_ADMIN_EMAIL:email, BOOTSTRAP_ADMIN_PASSWORD:password, BOOTSTRAP_ADMIN_NAME:nome } = process.env;
 if(!url || !key || !email || !nome || !password || password.length<12) throw new Error('Configure as variáveis Supabase e BOOTSTRAP_ADMIN_*; senha mínima de 12 caracteres.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {count,error:lookup}=await client.from('app_documents').select('path',{count:'exact',head:true}).eq('collection','usuarios').eq('data->>perfil','ADMIN');
 if(lookup) throw lookup; if(count) throw new Error('Já existe administrador. Use a gestão de usuários.');
 const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nome}});if(error)throw error;
 const uid=data.user.id;
 const {error:saveError}=await client.from('app_documents').insert({path:'usuarios/'+uid,data:{uid,nome,email:email.trim().toLowerCase(),perfil:'ADMIN',ativo:true,authUid:uid,authAtiva:true,unidadeId:null}});
 if(saveError){await client.auth.admin.deleteUser(uid);throw saveError;}
 console.log('Administrador criado. Entre com o e-mail e a senha configurados.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
