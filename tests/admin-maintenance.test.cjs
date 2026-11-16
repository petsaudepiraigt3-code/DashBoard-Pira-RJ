const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, patient, parseResult } = require('./helpers/app-harness.cjs');

function createMaintenanceClient(db, ids) {
  const users = Object.entries(ids).map(([name, id]) => ({ id, email: `${name}@example.com` }));

  return {
    auth: {
      getUser: async (token) => ({
        data: { user: users.find((u) => u.id === ids[token]) || null },
        error: null,
      }),
    },
    from(table) {
      let mode = 'select';
      let headOnly = false;
      let wantCount = false;
      let insertPayload = null;
      const conditions = [];
      const values = [];

      const builder = {
        select(_cols, opts) {
          mode = 'select';
          headOnly = Boolean(opts?.head);
          wantCount = opts?.count === 'exact';
          return builder;
        },
        delete() {
          mode = 'delete';
          return builder;
        },
        insert(payload) {
          mode = 'insert';
          insertPayload = payload;
          return builder;
        },
        eq(field, value) {
          values.push(value);
          conditions.push(`"${field}" = $${values.length}`);
          return builder;
        },
        like(field, pattern) {
          values.push(pattern);
          conditions.push(`"${field}" like $${values.length}`);
          return builder;
        },
        gt(field, value) {
          values.push(value);
          conditions.push(`"${field}" > $${values.length}`);
          return builder;
        },
        maybeSingle() {
          builder._single = true;
          return builder;
        },
        async then(resolve) {
          try {
            const whereClause = conditions.length ? ` where ${conditions.join(' and ')}` : '';
            if (mode === 'insert') {
              const cols = Object.keys(insertPayload);
              const vals = cols.map((c) => {
                const v = insertPayload[c];
                return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
              });
              const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
              await db.query(
                `insert into "${table}" (${cols.map((c) => `"${c}"`).join(',')}) values (${placeholders})`,
                vals
              );
              return resolve({ data: null, error: null });
            }
            if (mode === 'delete') {
              const res = await db.query(`delete from "${table}"${whereClause}`, values);
              return resolve({ data: null, count: res.affectedRows ?? 0, error: null });
            }
            if (headOnly && wantCount) {
              const { rows } = await db.query(`select count(*)::int as c from "${table}"${whereClause}`, values);
              return resolve({ data: null, count: rows[0].c, error: null });
            }
            const { rows } = await db.query(`select * from "${table}"${whereClause}`, values);
            return resolve({ data: builder._single ? rows[0] || null : rows, error: null });
          } catch (error) {
            return resolve({ data: null, count: null, error });
          }
        },
      };

      return builder;
    },
  };
}

test('admin maintenance deletes all patients and import history while enforcing ADMIN-only access', async () => {
  const h = await harness();
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test';

    const mockClient = createMaintenanceClient(h.db, h.ids);
    h.overrides.set('@supabase/supabase-js', { createClient: () => mockClient });

    // Seed two imports and two patients with clinical records as manager
    await h.as('manager');
    const importer = h.load('lib/esus/importer.ts');
    await importer.executeESUSImportToStore(
      parseResult([patient({ cpf: '11111111111' }), patient({ cpf: '22222222222', nome: 'Segundo Paciente' })]),
      'carga-1.csv',
      '2 KB',
      'manager',
      'u1',
      'Unidade',
      undefined,
      'GERENTE',
      'u1'
    );
    await importer.executeFivePatientsTestImportToStore(
      [patient({ cpf: '11111111111' })],
      'carga-2.csv',
      'manager',
      'u1',
      'Unidade',
      'GERENTE',
      'u1'
    );

    await h.db.exec('set role service_role');
    const { handleAdminMaintenance } = h.load('lib/admin-maintenance-server.ts');

    const makeReq = (token, body) =>
      new Request('http://localhost/api/admin/maintenance', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    // 1. Unauthenticated / non-ADMIN / invalid target checks
    const unauth = await handleAdminMaintenance(makeReq(null, { target: 'patients' }));
    assert.equal(unauth.status, 401);

    const managerForbidden = await handleAdminMaintenance(makeReq('manager', { target: 'patients' }));
    assert.equal(managerForbidden.status, 403);

    const acsForbidden = await handleAdminMaintenance(makeReq('acs', { target: 'imports' }));
    assert.equal(acsForbidden.status, 403);

    const badTarget = await handleAdminMaintenance(makeReq('admin', { target: 'units' }));
    assert.equal(badTarget.status, 400);

    // 2. ADMIN deletes all import history (imports + controle_carga) while preserving patients
    const clearImportsRes = await handleAdminMaintenance(makeReq('admin', { target: 'imports' }));
    assert.equal(clearImportsRes.status, 200);
    const clearImportsBody = await clearImportsRes.json();
    assert.equal(clearImportsBody.success, true);
    assert.equal(clearImportsBody.target, 'imports');
    assert.equal(clearImportsBody.deletedCount, 2);

    const remainingImportsDocs = (await h.db.query("select count(*)::int as n from app_documents where path like 'imports/%'")).rows[0].n;
    const remainingControleCarga = (await h.db.query('select count(*)::int as n from public.controle_carga')).rows[0].n;
    const patientsAfterImportsClear = (await h.db.query("select count(*)::int as n from app_documents where collection = 'pacientes'")).rows[0].n;
    assert.equal(remainingImportsDocs, 0);
    assert.equal(remainingControleCarga, 0);
    assert.equal(patientsAfterImportsClear, 2);

    // 3. ADMIN deletes all patients (docs + subcollections + relational paciente/child tables) while preserving units, microareas and users
    const clearPatientsRes = await handleAdminMaintenance(makeReq('admin', { target: 'patients' }));
    assert.equal(clearPatientsRes.status, 200);
    const clearPatientsBody = await clearPatientsRes.json();
    assert.equal(clearPatientsBody.success, true);
    assert.equal(clearPatientsBody.target, 'patients');
    assert.equal(clearPatientsBody.deletedCount, 2);

    const remainingPatientPaths = (await h.db.query("select count(*)::int as n from app_documents where path like 'pacientes/%'")).rows[0].n;
    const remainingRelPatients = (await h.db.query('select count(*)::int as n from public.paciente')).rows[0].n;
    const remainingRelPa = (await h.db.query('select count(*)::int as n from public.afericao_pressao')).rows[0].n;
    const remainingRelMedidas = (await h.db.query('select count(*)::int as n from public.afericao_medidas')).rows[0].n;
    const remainingRelAtend = (await h.db.query('select count(*)::int as n from public.atendimento')).rows[0].n;

    assert.equal(remainingPatientPaths, 0);
    assert.equal(remainingRelPatients, 0);
    assert.equal(remainingRelPa, 0);
    assert.equal(remainingRelMedidas, 0);
    assert.equal(remainingRelAtend, 0);

    // Preserved entities
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where collection = 'unidades'")).rows[0].n, 1);
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where collection = 'microareas'")).rows[0].n, 2);
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where collection = 'usuarios'")).rows[0].n, 3);

    // Audit logs created
    const audits = (await h.db.query("select data->>'tipo' as tipo from app_documents where collection = 'auditLogs'")).rows.map((r) => r.tipo);
    assert.ok(audits.includes('HISTORICO_CARGAS_EXCLUIDO_ADMIN'));
    assert.ok(audits.includes('PACIENTES_EXCLUIDOS_ADMIN'));

    // 4. Verify RLS fallback path: authenticated GERENTE cannot delete via executeAdminPurge, while authenticated ADMIN can
    await h.seed('pacientes/p-rls', { nome: 'Paciente RLS', unidadeId: 'u1', microareaCodigo: '01' });
    await h.seed('imports/imp-rls', { arquivo: 'rls.csv', unidadeId: 'u1', status: 'Concluído' });
    const { executeAdminPurge } = h.load('lib/admin-purge-core.ts');

    await h.as('manager');
    await executeAdminPurge(mockClient, 'patients', h.ids.manager);
    await executeAdminPurge(mockClient, 'imports', h.ids.manager);
    // RLS documents_delete blocks GERENTE from deleting any rows in app_documents
    await h.db.exec('set role service_role');
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where path = 'pacientes/p-rls'")).rows[0].n, 1);
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where path = 'imports/imp-rls'")).rows[0].n, 1);

    await h.as('admin');
    const rlsPatRes = await executeAdminPurge(mockClient, 'patients', h.ids.admin);
    const rlsImpRes = await executeAdminPurge(mockClient, 'imports', h.ids.admin);
    assert.equal(rlsPatRes.deletedCount, 1);
    assert.equal(rlsImpRes.deletedCount, 1);
    await h.db.exec('set role service_role');
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where path like 'pacientes/%'")).rows[0].n, 0);
    assert.equal((await h.db.query("select count(*)::int as n from app_documents where path like 'imports/%'")).rows[0].n, 0);
  } finally {
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = env.key;
    await h.close();
  }
});
