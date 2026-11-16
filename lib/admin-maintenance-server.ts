import 'server-only';
import { NextResponse } from 'next/server';
import { AccessError, requireAccess } from './supabase-admin';
import { AdminPurgeTarget, executeAdminPurge } from './admin-purge-core';

export async function handleAdminMaintenance(req: Request) {
  try {
    const { admin, user, profile } = await requireAccess(req);
    if (profile.perfil !== 'ADMIN') {
      throw new AccessError('Acesso restrito ao perfil Administrador (ADMIN).', 403);
    }

    const body = await req.json().catch(() => null);
    const target = body?.target as AdminPurgeTarget | undefined;
    if (target !== 'patients' && target !== 'imports') {
      throw new AccessError('Operação de limpeza inválida. Informe "patients" ou "imports".', 400);
    }

    const result = await executeAdminPurge(admin, target, user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erro de persistência';
    console.error('Falha na limpeza administrativa:', message);
    const isMissingConfig = message.includes('SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json(
      {
        error: isMissingConfig
          ? message
          : 'Não foi possível concluir a operação de limpeza. Verifique a configuração do Supabase no servidor.',
        code: isMissingConfig ? 'MISSING_SERVICE_ROLE' : 'PURGE_FAILED',
      },
      { status: 500 }
    );
  }
}
