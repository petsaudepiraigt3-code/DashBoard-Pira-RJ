import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export class AccessError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function requireAccess(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AccessError('Autenticação obrigatória.', 401);
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AccessError('Sessão inválida ou expirada.', 401);
  const { data: row, error: dbError } = await admin.from('app_documents').select('data').eq('path', `usuarios/${data.user.id}`).maybeSingle();
  if (dbError) throw dbError;
  if (!row || row.data.ativo === false) throw new AccessError('Usuário inativo ou sem perfil.', 403);
  return { admin, user: data.user, profile: row.data as { perfil: string; unidadeId: string | null; ativo: boolean } };
}
