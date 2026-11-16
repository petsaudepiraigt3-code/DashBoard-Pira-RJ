import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminClient } from './supabase-admin';
import { buildUnitAliasMap, normalizeUnitId, resolveCanonicalUnitId } from './store/units';

export async function handleReconcileManager(req: Request) {
  try {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) {
      return NextResponse.json({ error: 'Autenticação obrigatória.' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    const user = authData.user;
    const emailLower = (user.email || '').trim().toLowerCase();

    const { data: userRows, error: usersError } = await admin
      .from('app_documents')
      .select('path,data,updated_at')
      .eq('collection', 'usuarios');
    if (usersError) throw usersError;

    const matchingProfiles = (userRows || []).filter((row) => {
      const d = row.data || {};
      return (
        row.path === `usuarios/${user.id}` ||
        d.uid === user.id ||
        d.authUid === user.id ||
        (emailLower && String(d.email || '').trim().toLowerCase() === emailLower)
      );
    });

    matchingProfiles.sort((a, b) => {
      const aCanonical = a.path === `usuarios/${user.id}` ? 1 : 0;
      const bCanonical = b.path === `usuarios/${user.id}` ? 1 : 0;
      if (aCanonical !== bCanonical) return bCanonical - aCanonical;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });

    const primaryProfile = matchingProfiles[0]?.data as Record<string, unknown> | undefined;
    const role = String(primaryProfile?.perfil || '').trim().toUpperCase();
    if (!primaryProfile || primaryProfile.ativo === false || role !== 'GERENTE') {
      return NextResponse.json({ error: 'Apenas Gerentes ativos podem reconciliar escopo de unidade.' }, { status: 403 });
    }

    const { data: unitRows, error: unitsError } = await admin
      .from('app_documents')
      .select('path,data')
      .eq('collection', 'unidades');
    if (unitsError) throw unitsError;

    const unitEntries = (unitRows || []).map((u) => ({
      id: u.path.split('/')[1],
      codigo: u.data?.codigo,
      nome: u.data?.nome,
      nomeNormalizado: u.data?.nomeNormalizado,
      gerenteEmail: u.data?.gerenteEmail,
      gerenteId: u.data?.gerenteId,
    }));
    const aliasMap = buildUnitAliasMap(unitEntries);

    let resolvedUnitId = resolveCanonicalUnitId(
      String(primaryProfile.unidadeId || primaryProfile.unidade_id || ''),
      aliasMap
    );

    // Quick count check for the manager's current unit before fetching all patients
    let quickUnitPatients: Array<{ path: string; data: Record<string, unknown> }> | null = null;
    try {
      const { data: qData, error: qError } = await admin
        .from('app_documents')
        .select('path,data')
        .eq('collection', 'pacientes')
        .eq('data->>unidadeId', resolvedUnitId)
        .order('path')
        .range(0, 499);
      if (!qError && qData) {
        quickUnitPatients = qData;
      }
    } catch {
      // Fallback para varredura completa
    }

    if (quickUnitPatients && quickUnitPatients.length > 0 && quickUnitPatients.length < 500) {
      const updatedProfile = {
        ...primaryProfile,
        uid: user.id,
        authUid: user.id,
        authAtiva: true,
        perfil: 'GERENTE',
        unidadeId: resolvedUnitId,
        ativo: true,
        updatedAt: new Date().toISOString(),
      };

      await admin.from('app_documents').upsert({
        path: `usuarios/${user.id}`,
        data: updatedProfile,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        unitId: resolvedUnitId,
        patients: quickUnitPatients.map((r) => ({ id: r.path.split('/').at(-1)!, data: r.data })),
      });
    }

    // Fetch all patient documents to check unit distribution
    const patientRows: Array<{ path: string; data: Record<string, unknown> }> = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error: patError } = await admin
        .from('app_documents')
        .select('path,data')
        .eq('collection', 'pacientes')
        .order('path')
        .range(offset, offset + 499);
      if (patError) throw patError;
      patientRows.push(...(page || []));
      if (!page || page.length < 500) break;
    }

    const patientsByCanonicalUnit = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
    for (const row of patientRows) {
      const patId = row.path.split('/').at(-1)!;
      const patUnit = resolveCanonicalUnitId(
        String(row.data?.unidadeId || row.data?.unidadeNome || ''),
        aliasMap
      );
      const key = patUnit.toUpperCase();
      if (!patientsByCanonicalUnit.has(key)) {
        patientsByCanonicalUnit.set(key, []);
      }
      patientsByCanonicalUnit.get(key)!.push({ id: patId, data: row.data });
    }

    // If current unit has 0 patients, check if manager is linked via unidades.gerenteEmail or another profile doc, or fallback to populated unit when only one unit has patients
    const currentUnitPatients = patientsByCanonicalUnit.get(resolvedUnitId.toUpperCase()) || [];
    if (currentUnitPatients.length === 0 && patientRows.length > 0) {
      const unitByManagerEmail = unitEntries.find(
        (u) =>
          (emailLower && String(u.gerenteEmail || '').trim().toLowerCase() === emailLower) ||
          (u.gerenteId && String(u.gerenteId).trim() === user.id)
      );
      if (unitByManagerEmail) {
        const candidate = resolveCanonicalUnitId(unitByManagerEmail.codigo || unitByManagerEmail.id, aliasMap);
        if ((patientsByCanonicalUnit.get(candidate.toUpperCase()) || []).length > 0) {
          resolvedUnitId = candidate;
        }
      }

      if ((patientsByCanonicalUnit.get(resolvedUnitId.toUpperCase()) || []).length === 0) {
        for (const prof of matchingProfiles) {
          const altUnit = resolveCanonicalUnitId(
            String(prof.data?.unidadeId || prof.data?.unidade_id || ''),
            aliasMap
          );
          if ((patientsByCanonicalUnit.get(altUnit.toUpperCase()) || []).length > 0) {
            resolvedUnitId = altUnit;
            break;
          }
        }
      }

      // If there is only 1 unit with patients in the entire system, bind the manager to that active unit
      if (
        (patientsByCanonicalUnit.get(resolvedUnitId.toUpperCase()) || []).length === 0 &&
        patientsByCanonicalUnit.size === 1
      ) {
        const onlyUnitKey = Array.from(patientsByCanonicalUnit.keys())[0];
        const firstPatient = patientsByCanonicalUnit.get(onlyUnitKey)?.[0];
        resolvedUnitId = normalizeUnitId(String(firstPatient?.data?.unidadeId || onlyUnitKey));
      }
    }

    const updatedProfile = {
      ...primaryProfile,
      uid: user.id,
      authUid: user.id,
      authAtiva: true,
      perfil: 'GERENTE',
      unidadeId: resolvedUnitId,
      ativo: true,
      updatedAt: new Date().toISOString(),
    };

    await admin.from('app_documents').upsert({
      path: `usuarios/${user.id}`,
      data: updatedProfile,
      updated_at: new Date().toISOString(),
    });

    const finalPatients = patientsByCanonicalUnit.get(resolvedUnitId.toUpperCase()) || [];
    return NextResponse.json({
      success: true,
      unitId: resolvedUnitId,
      patients: finalPatients,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
