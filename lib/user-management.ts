import 'server-only';
import { NextResponse } from 'next/server';
import { AccessError, requireAccess } from './supabase-admin';
import type { SupabaseClient, User } from '@supabase/supabase-js';
async function authUsers(admin: SupabaseClient) {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}
export async function manageUsers(req: Request, action: 'create' | 'access' | 'reset' | 'list') {
  try {
    const { admin, profile: requester } = await requireAccess(req);
    if (!['ADMIN', 'GERENTE'].includes(requester.perfil)) throw new AccessError('Acesso restrito à gestão.', 403);
    if (action === 'list') {
      let query = admin.from('app_documents').select('path,data').eq('collection', 'usuarios');
      if (requester.perfil === 'GERENTE') query = query.eq('data->>unidadeId', requester.unidadeId).eq('data->>perfil', 'ACS');
      const rows: { path: string; data: Record<string, unknown> }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await query.order('path').range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      const users = await authUsers(admin);
      return NextResponse.json({ users: rows.map(row => {
        const match = users.find(u => u.email?.toLowerCase() === String(row.data.email || '').toLowerCase());
        return { ...row.data, docId: row.path.slice(9), uid: match?.id || row.path.slice(9), authUid: match?.id || null,
          authStatus: !match ? 'AUTH_INEXISTENTE' : row.path === `usuarios/${match.id}` ? 'AUTH_OK' : 'AUTH_UID_DIVERGENTE' };
      }) });
    }
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = action === 'reset' ? body.novaSenha : action === 'access' ? body.senhaTemporaria : body.senhaInicial;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8) throw new AccessError('Informe e-mail válido e senha de pelo menos 8 caracteres.', 400);
    const { data: existing, error: lookupError } = await admin.from('app_documents').select('path,data').eq('collection', 'usuarios').eq('data->>email', email);
    if (lookupError) throw lookupError;
    if ((existing?.length || 0) > 1) throw new AccessError('Existem perfis duplicados para este e-mail. Reconcilie os dados antes de prosseguir.', 409);
    const old = existing?.[0];
    if ((action === 'access' || action === 'reset') && !old) throw new AccessError('Perfil não encontrado. Cadastre o usuário primeiro.', 404);
    if (body.docId && old && old.path !== `usuarios/${body.docId}`) throw new AccessError('O cadastro informado não corresponde ao e-mail.', 400);
    let role = old?.data.perfil || body.perfil || 'ACS';
    let unit = old?.data.unidadeId || body.unidadeId || null;
    if (requester.perfil === 'GERENTE') {
      if (old && (old.data.perfil !== 'ACS' || old.data.unidadeId !== requester.unidadeId)) throw new AccessError('Usuário fora da sua unidade.', 403);
      role = 'ACS'; unit = requester.unidadeId;
    }
    if (!['ADMIN', 'GERENTE', 'ACS'].includes(role) || (role !== 'ADMIN' && !unit)) throw new AccessError('Perfil ou unidade inválidos.', 400);
    if (role !== 'ADMIN') {
      const { data: unitRow, error } = await admin.from('app_documents').select('data').eq('path', `unidades/${unit}`).maybeSingle();
      if (error) throw error;
      if (!unitRow || unitRow.data.ativo === false) throw new AccessError('Unidade inexistente ou inativa.', 400);
    }
    const name = old?.data.nome || (typeof body.nome === 'string' ? body.nome.trim() : '');
    if (!name) throw new AccessError('Nome obrigatório.', 400);
    const users = await authUsers(admin);
    let target = users.find(u => u.email?.toLowerCase() === email);
    if (action === 'create' && target) throw new AccessError('Já existe uma conta para este e-mail. Use Criar Acesso.', 409);
    if (action === 'reset' && !target) throw new AccessError('Conta inexistente. Use Criar Acesso.', 404);
    // Reconcile profile first for existing accounts so profile failure never changes their password.
    let created = false;
    if (!target) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: name } });
      if (error) throw error;
      target = data.user; created = true;
    }
    const uid = target!.id;
    const { error: profileError } = await admin.rpc('reconcile_user_profile', {
      old_path: old?.path || `usuarios/${uid}`, new_uid: uid,
      profile: { ...old?.data, uid, authUid: uid, authAtiva: true, nome: name, email, perfil: role, unidadeId: role === 'ADMIN' ? null : unit, ativo: old?.data.ativo !== false, updatedAt: new Date().toISOString() },
    });
    if (profileError) {
      if (created) await admin.auth.admin.deleteUser(uid);
      throw profileError;
    }
    if (!created) { const { error } = await admin.auth.admin.updateUserById(uid, { password }); if (error) throw error; }
    return NextResponse.json({ success: true, uid, email, perfil: role, unidadeId: unit }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Falha na gestão de usuários:', error instanceof Error ? error.message : 'Erro de persistência');
    return NextResponse.json({ error: 'Não foi possível concluir a operação. Verifique a configuração do Supabase no servidor.' }, { status: 500 });
  }
}
