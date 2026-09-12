import { supabase } from "../lib/supabase";

async function testConnection() {
  console.log("Testando conexão com Supabase...");
  const { data, error } = await supabase.from("paciente").select("count", { count: "exact" });
  if (error) {
    console.error("Erro ao consultar tabela 'paciente':", error);
  } else {
    console.log("Conexão bem sucedida! Total de pacientes no banco:", data);
  }
}

testConnection();
