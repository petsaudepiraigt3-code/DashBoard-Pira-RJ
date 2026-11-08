const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
async function main() {
 const output=process.argv[2];
 if(!output || fs.existsSync(output))throw new Error('Informe um arquivo JSON novo para a exportação.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Configure o Supabase.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const tables={};
 for(const name of ['area','microarea','usuario','paciente','atendimento','afericao_pressao','afericao_medidas','comorbidade','paciente_comorbidade','controle_carga']) {
  tables[name]=[];
  const primary={area:'id_area',microarea:'id_microarea',usuario:'id_usuario',paciente:'id_paciente',atendimento:'id_atendimento',afericao_pressao:'id_afericao',afericao_medidas:'id_afericao',comorbidade:'id_comorbidade',paciente_comorbidade:'id_paciente',controle_carga:'id_carga'}[name];
  for(let offset=0;;offset+=500){
   let q=client.from(name).select('*').order(primary).range(offset,offset+499);
   if(name==='paciente_comorbidade')q=q.order('id_comorbidade');
   const {data,error}=await q;if(error)throw error;tables[name].push(...data);if(data.length<500)break;
  }
 }
 const docs=[];const add=(path,data)=>docs.push({path,data});
 const unitId=a=>a?.codigo || `area-${a?.id_area}`;
 const areaFor=p=>tables.area.find(a=>[a.nome,a.codigo,String(a.id_area)].includes(String(p.area)));
 for(const a of tables.area)add('unidades/'+unitId(a),{...a,nome:a.nome,codigo:unitId(a),ativo:a.ativa!==false});
 const uid=u=>u.uid || `usuario-${u.id_usuario}`;
 for(const u of tables.usuario){const a=tables.area.find(a=>a.id_area===u.id_area);if(u.perfil!=='ADMIN'&&!a)throw new Error(`Usuário ${u.id_usuario} sem área vinculada.`);add('usuarios/'+uid(u),{...u,uid:uid(u),unidadeId:u.perfil==='ADMIN'?null:unitId(a),ativo:u.ativo!==false});}
 for(const m of tables.microarea){const a=tables.area.find(a=>a.id_area===m.id_area);const acs=tables.usuario.find(u=>u.id_usuario===m.responsavel_id);add(`microareas/ma_${unitId(a)}_${m.codigo}`,{...m,unidadeId:unitId(a),acsId:acs?uid(acs):null,acsNome:acs?.nome || m.responsavel_nome,codigo:String(m.codigo),tipoMicroarea:m.tipo || 'NORMAL',ativo:m.ativa!==false});}
 for(const p of tables.paciente){
  const a=areaFor(p);if(!a)throw new Error(`Paciente ${p.id_paciente} sem área reconhecida. Corrija o vínculo antes de exportar.`);
  const pressure=tables.afericao_pressao.filter(r=>r.id_paciente===p.id_paciente).sort((a,b)=>String(b.data_afericao).localeCompare(String(a.data_afericao)));
  const weights=tables.afericao_medidas.filter(r=>r.id_paciente===p.id_paciente).sort((a,b)=>String(b.data_afericao).localeCompare(String(a.data_afericao)));
  const appointments=tables.atendimento.filter(r=>r.id_paciente===p.id_paciente);
  const last=type=>appointments.filter(a=>a.tipo_atendimento===type).map(a=>a.data_ultimo_atendimento).sort().at(-1)||null;
  const pa=pressure[0],w=weights[0]; const code=String(p.microarea??'').padStart(2,'0');
  const birth=p.data_nascimento?new Date(p.data_nascimento):null,now=new Date();
  let age=birth?now.getFullYear()-birth.getFullYear():null;if(birth&&(now.getMonth()<birth.getMonth() || now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;
  const history=[...pressure.map(r=>({id:`pa-${r.id_afericao}`,dataCarga:r.data_afericao,dataPA:r.data_afericao,pressaoSistolica:r.pressao_sistolica,pressaoDiastolica:r.pressao_diastolica})),...weights.map(r=>({id:`peso-${r.id_afericao}`,dataCarga:r.data_afericao,dataAntropometria:r.data_afericao,peso:Number(r.peso),altura:Number(r.altura),imc:r.altura?Number(r.peso)/(Number(r.altura)**2):null}))];
  add(`pacientes/pg-${p.id_paciente}`,{...p,dataNascimento:p.data_nascimento,idade:age,unidadeId:unitId(a),unidadeNome:a.nome,microarea:`Microárea ${code}`,microareaCodigo:code,pesoAtual:w?Number(w.peso):null,alturaAtual:w?Number(w.altura):null,imcAtual:w?.altura?Number(w.peso)/(Number(w.altura)**2):null,pressaoSistolicaAtual:pa?.pressao_sistolica||null,pressaoDiastolicaAtual:pa?.pressao_diastolica||null,dataUltimaPA:pa?.data_afericao||null,dataUltimaVisitaACS:last('Visita Domiciliar'),dataUltimaConsulta:last('Médico'),prioridade:pa?.pressao_sistolica>=140?'Alta':'Atenção',requerRevisao:true,historicoAcoes:[],historicoCargas:history,legacyAtendimentos:appointments});
 }
 // Preserve every original row too, including attributes not displayed by current screens.
 for(const [table,rows]of Object.entries(tables))rows.forEach((data,i)=>add(`legacy_records/${table}-${i}`,data));
 fs.writeFileSync(output,JSON.stringify(docs,null,2),{flag:'wx'});
 console.log(`Exportados ${docs.length} documentos. Revise antes de importar; nenhum dado remoto foi alterado.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
