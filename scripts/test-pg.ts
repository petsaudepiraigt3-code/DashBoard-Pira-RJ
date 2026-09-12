import { pool } from "../lib/db";

async function testDirectPg() {
  console.log("Testando conexão direta com PostgreSQL via pool...");
  try {
    const res = await pool.query("SELECT current_database(), now();");
    console.log("Conectado com sucesso!", res.rows[0]);

    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log("Tabelas encontradas no banco:");
    tables.rows.forEach((r) => console.log(" -", r.table_name));
  } catch (err) {
    console.error("Erro na conexão direta com PostgreSQL:", err);
  } finally {
    await pool.end();
  }
}

testDirectPg();
