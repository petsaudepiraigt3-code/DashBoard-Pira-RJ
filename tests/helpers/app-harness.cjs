const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

// Real application TypeScript + real PostgreSQL/RLS; only the HTTP transport is local.
async function harness() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;`);
  await db.exec(fs.readFileSync('database-schema.sql', 'utf8'));
  const ids = { admin: '00000000-0000-0000-0000-000000000001', manager: '00000000-0000-0000-0000-000000000002', acs: '00000000-0000-0000-0000-000000000003' };
  const seed = (p, data) => db.query('insert into app_documents(path,data) values($1,$2)', [p, JSON.stringify(data)]);
  for (const [role, id] of Object.entries(ids)) await seed('usuarios/' + id, { uid: id, nome: role, email: `${role}@example.com`, perfil: role === 'admin' ? 'ADMIN' : role === 'manager' ? 'GERENTE' : 'ACS', unidadeId: 'u1', ativo: true });
  await seed('unidades/u1', { nome: 'Unidade de teste', codigo: 'u1', ativo: true });
  await seed('microareas/m1', { unidadeId: 'u1', codigo: '01', acsId: ids.acs, acsNome: 'acs', ativo: true });
  let failRpc = null;
  const calls = [];
  const client = {
    from(table) {
      if (table !== 'app_documents') throw Error('Unexpected table ' + table);
      const conditions = [], values = [];
      let single = false, offset = 0, size = null;
      const q = {
        select() { return q; },
        eq(field, value) { values.push(value); const key = field.startsWith('data->>') ? `data->>'${field.slice(7).replaceAll("'", "''")}'` : '"' + field + '"'; conditions.push(`${key} = $${values.length}`); return q; },
        order() { return q; }, range(start, end) { offset = start; size = end - start + 1; return q; },
        maybeSingle() { single = true; return q; },
        async then(resolve) {
          try {
            const sql = 'select path,data from app_documents' + (conditions.length ? ' where ' + conditions.join(' and ') : '') + ' order by path' + (size === null ? '' : ` limit ${size} offset ${offset}`);
            const { rows } = await db.query(sql, values);
            calls.push({ table, offset, size });
            return resolve({ data: single ? rows[0] || null : rows, error: null });
          } catch (error) { return resolve({ data: null, error }); }
        },
      };
      return q;
    },
    async rpc(name, args) {
      try {
        if (name === failRpc) throw Error('Simulated transport failure');
        const params = Object.values(args).map(v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
        const { rows } = await db.query(`select ${name}(${params.map((_, i) => '$' + (i + 1)).join(',')})`, params);
        return { data: rows, error: null };
      } catch (error) { return { data: null, error }; }
    },
  };
  const cache = new Map();
  const overrides = new Map();
  function load(file) {
    const resolved = path.resolve(file);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const loadedModule = { exports: {} }; cache.set(resolved, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function localRequire(name) {
      if (overrides.has(name)) return overrides.get(name);
      if (name === 'server-only') return {};
      if (name === '@/lib/supabase') return { supabase: client };
      if (name.startsWith('@/') || name.startsWith('.')) {
        let p = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(resolved), name);
        if (!path.extname(p)) p += '.ts';
        return load(p);
      }
      return require(name);
    }
    new Function('require', 'module', 'exports', code)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  async function as(role) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[role]]); await db.exec('set role authenticated'); }
  return { db, ids, seed, as, load, calls, client, overrides, fail: name => { failRpc = name; }, close: () => db.close() };
}
const patient = overrides => ({ nome: 'Paciente de teste', nomeNormalizado: 'PACIENTEDETESTE', dataNascimento: '1960-01-02', idade: 66, sexo: 'Feminino', cpf: '12345678901', cns: '', telefoneOriginal: '(24) 99999-1234', telefoneNormalizado: '24999991234', microarea: '01', acsName: 'acs', logradouro: 'Rua teste', bairro: 'Centro', peso: 72, altura: 1.6, imc: 28.125, systolic: 150, diastolic: 95, dataPA: '2026-11-01', dataMedicao: '2026-11-01', lastMedicalCare: '2026-10-01', isElderly: true, isObese: false, isOverweight: true, priority: 'Alta', priorityScore: 20, ...overrides });
const parseResult = rows => ({ rows: rows.map(normalizedData => ({ status: 'Válido', normalizedData })), totalRowsCount: rows.length, validRowsCount: rows.length, warningRowsCount: 0, errorRowsCount: 0 });
module.exports = { harness, patient, parseResult };
