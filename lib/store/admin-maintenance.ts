import { supabase } from '@/lib/supabase';
import { AdminPurgeResult, AdminPurgeTarget, executeAdminPurge } from '@/lib/admin-purge-core';

export type { AdminPurgeTarget, AdminPurgeResult };

async function verifyAuthenticatedAdmin(userId: string): Promise<void> {
  const { data: profileRow, error } = await supabase
    .from('app_documents')
    .select('data')
    .eq('path', `usuarios/${userId}`)
    .maybeSingle();

  if (error) throw error;

  let profile = profileRow?.data as { perfil?: string; ativo?: boolean } | undefined;
  if (!profile) {
    const { data: resolved } = await supabase.rpc('resolve_my_profile');
    if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
      profile = resolved as { perfil?: string; ativo?: boolean };
    }
  }

  if (!profile || profile.ativo === false || profile.perfil !== 'ADMIN') {
    throw new Error('Acesso restrito ao perfil Administrador (ADMIN).');
  }
}

export async function purgeAdminDataInStore(target: AdminPurgeTarget): Promise<AdminPurgeResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const session = sessionData.session;
  const token = session?.access_token;
  if (!token || !session?.user?.id) {
    throw new Error('Sessão autenticada de Administrador não encontrada. Faça login novamente.');
  }

  const res = await fetch('/api/admin/maintenance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ target }),
  });

  const payload = await res.json().catch(() => ({}));
  if (res.ok) {
    return payload as AdminPurgeResult;
  }

  if (res.status === 500 && payload?.code === 'MISSING_SERVICE_ROLE') {
    await verifyAuthenticatedAdmin(session.user.id);
    return executeAdminPurge(supabase, target, session.user.id);
  }

  throw new Error(payload?.error || 'Não foi possível concluir a operação de limpeza.');
}
