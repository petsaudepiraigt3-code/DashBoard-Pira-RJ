"use client";
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { db, doc, getDoc, getDocs, collection, query, where } from '@/lib/store/documents';
export interface ExtendedUserProfile {
  uid: string; name: string; email: string; role: 'ADMIN' | 'GERENTE' | 'ACS';
  unitId?: string | null; unitName?: string | null; assignedMicroareaCodes?: string[]; ativo?: boolean;
}
type AuthState = { user: User | null; userProfile: ExtendedUserProfile | null; loading: boolean; unauthorizedMessage: string | null };
type AuthContextType = AuthState & {
  role: 'ADMIN' | 'GERENTE' | 'ACS'; userUnitId: string | null; userUnitNome: string | null;
  logout: () => Promise<void>; switchUnitForAdmin: (id: string, name: string) => void;
};
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, userProfile: null, loading: true, unauthorizedMessage: null });
  const generation = useRef(0);
  useEffect(() => {
    let alive = true;
    async function load(user: User | null) {
      const version = ++generation.current;
      if (!user) { if (alive) setState({ user: null, userProfile: null, loading: false, unauthorizedMessage: null }); return; }
      try {
        const profile = await getDoc(doc(db, 'usuarios', user.id));
        const p = profile.data();
        if (!profile.exists() || p.ativo === false || !['ADMIN', 'GERENTE', 'ACS'].includes(p.perfil)) throw new Error('Seu acesso está inativo ou sem perfil. Contate o administrador.');
        if (p.perfil !== 'ADMIN' && !p.unidadeId) throw new Error('Seu usuário não possui unidade configurada.');
        const unit = p.unidadeId ? await getDoc(doc(db, 'unidades', p.unidadeId)) : null;
        const areas = p.perfil === 'ACS' ? await getDocs(query(collection(db, 'microareas'), where('acsId', '==', user.id))) : null;
        if (alive && version === generation.current) setState({ user, loading: false, unauthorizedMessage: null, userProfile: {
          uid: user.id, name: p.nome, email: user.email || '', role: p.perfil,
          unitId: p.unidadeId || null, unitName: unit?.data().nome || null,
          assignedMicroareaCodes: areas?.docs.map(a => String(a.data().codigo)) || [], ativo: true,
        }});
      } catch (error) {
        if (alive && version === generation.current) setState({ user, userProfile: null, loading: false, unauthorizedMessage: error instanceof Error ? error.message : 'Não foi possível validar seu acesso.' });
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => { if (alive) void load(session?.user || null); }, 0); });
    void supabase.auth.getSession().then(({ data, error }) => { if (alive) void load(error ? null : data.session?.user || null); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  const logout = async () => { await supabase.auth.signOut(); generation.current++; setState({ user: null, userProfile: null, loading: false, unauthorizedMessage: null }); };
  const switchUnitForAdmin = (unitId: string, unitName: string) => setState(s => s.userProfile?.role === 'ADMIN' ? { ...s, userProfile: { ...s.userProfile, unitId, unitName } } : s);
  return <AuthContext.Provider value={{ ...state, role: state.userProfile?.role || 'ACS', userUnitId: state.userProfile?.unitId || null, userUnitNome: state.userProfile?.unitName || null, logout,
    switchUnitForAdmin }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider ausente'); return value; }
