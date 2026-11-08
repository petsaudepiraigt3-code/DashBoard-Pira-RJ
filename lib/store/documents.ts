import { supabase } from '@/lib/supabase';
// Existing heterogeneous clinical documents are validated by their domain mappers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;
type Ref = { path: string; id?: string };
type Constraint = { kind: 'where' | 'order' | 'limit'; field?: string; value?: unknown; direction?: string };
type Query = Ref & { constraints?: Constraint[] };
export const db = { path: '' };
export const collection = (base: Ref, ...parts: string[]): Ref => ({ path: [base.path, ...parts].filter(Boolean).join('/') });
export function doc(base: Ref, ...parts: string[]): Ref & { id: string } {
  const ref = collection(base, ...(parts.length ? parts : [crypto.randomUUID()]));
  return { ...ref, id: ref.path.split('/').at(-1)! };
}
export const serverTimestamp = () => new Date().toISOString();
export const where = (field: string, operator: string, value: unknown): Constraint => {
  if (operator !== '==') throw new Error('Operador não suportado');
  return { kind: 'where', field, value };
};
export const orderBy = (field: string, direction = 'asc'): Constraint => ({ kind: 'order', field, direction });
export const limit = (value: number): Constraint => ({ kind: 'limit', value });
export const query = (ref: Ref, ...constraints: Constraint[]): Query => ({ ...ref, constraints });
function snapshot(path: string, data?: Data) {
  return { id: path.split('/').at(-1)!, ref: { path }, exists: () => data !== undefined, data: (): Data => data || {} };
}
export async function getDoc(ref: Ref) {
  const { data, error } = await supabase.from('app_documents').select('data').eq('path', ref.path).maybeSingle();
  if (error) throw error;
  return snapshot(ref.path, data?.data);
}
export async function getDocs(ref: Query) {
  const rows: { path: string; data: Data }[] = [];
  // Paginate beyond the PostgREST default row limit; RLS enforces access scope.
  for (let offset = 0; ; offset += 500) {
    let request = supabase.from('app_documents').select('path,data').eq('collection', ref.path).order('path').range(offset, offset + 499);
    for (const c of ref.constraints || []) if (c.kind === 'where') request = request.eq(`data->>${c.field}`, String(c.value));
    const { data, error } = await request;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  for (const c of ref.constraints || []) if (c.kind === 'order') rows.sort((a, b) => {
    const x = a.data[c.field!], y = b.data[c.field!];
    return (x === y ? 0 : x > y ? 1 : -1) * (c.direction === 'desc' ? -1 : 1);
  });
  const max = ref.constraints?.find(c => c.kind === 'limit')?.value;
  const docs = (typeof max === 'number' ? rows.slice(0, max) : rows).map(r => snapshot(r.path, r.data));
  return { docs, empty: !docs.length, size: docs.length, forEach: (fn: (value: ReturnType<typeof snapshot>) => void) => docs.forEach(fn) };
}
type Operation = { path: string; data: Data; merge: boolean; must_exist?: boolean };
async function commit(operations: Operation[]) {
  const { error } = await supabase.rpc('write_documents', { operations });
  if (error) throw error;
}
export const setDoc = (ref: Ref, data: Data, options?: { merge?: boolean }) => commit([{ path: ref.path, data, merge: !!options?.merge }]);
export const updateDoc = (ref: Ref, data: Data) => commit([{ path: ref.path, data, merge: true, must_exist: true }]);
export async function addDoc(ref: Ref, data: Data) { const target = doc(ref); await setDoc(target, data); return target; }
export function writeBatch(database: Ref) {
  if (database.path) throw new Error('O lote deve usar a raiz do armazenamento.');
  const operations: Operation[] = [];
  return {
    set(ref: Ref, data: Data, options?: { merge?: boolean }) { operations.push({ path: ref.path, data, merge: !!options?.merge }); },
    update(ref: Ref, data: Data) { operations.push({ path: ref.path, data, merge: true, must_exist: true }); },
    commit: () => commit(operations),
  };
}
