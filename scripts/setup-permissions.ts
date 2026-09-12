import { pool } from "../lib/db";

async function enableAnonAccess() {
  console.log("Configurando permissões para as tabelas públicas...");
  try {
    const query = `
      -- Concede permissões para as roles anon e authenticated do Supabase
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

      -- Desativa RLS para simplificar o acesso da aplicação direta
      ALTER TABLE paciente DISABLE ROW LEVEL SECURITY;
      ALTER TABLE comorbidade DISABLE ROW LEVEL SECURITY;
      ALTER TABLE paciente_comorbidade DISABLE ROW LEVEL SECURITY;
      ALTER TABLE atendimento DISABLE ROW LEVEL SECURITY;
      ALTER TABLE afericao_pressao DISABLE ROW LEVEL SECURITY;
      ALTER TABLE afericao_medidas DISABLE ROW LEVEL SECURITY;
    `;
    await pool.query(query);
    console.log("Permissões e políticas ajustadas com sucesso!");
  } catch (err) {
    console.error("Erro ao configurar permissões:", err);
  } finally {
    await pool.end();
  }
}

enableAnonAccess();
