import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

const globalForPg = globalThis as unknown as { pgPool: Pool };

export const pool =
  globalForPg.pgPool ||
  new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Necessário para conexões em nuvem Supabase
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
