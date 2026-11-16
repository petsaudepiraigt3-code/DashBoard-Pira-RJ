"use client";
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { db, doc, getDoc, getDocs, collection } from '@/lib/store/documents';
import { buildUnitAliasMap, normalizeUnitId, resolveCanonicalUnitId } from '@/lib/store/units';

export interface ExtendedUserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'GERENTE' | 'ACS';
  unitId?: string | null;
  unitName?: string | null;
  assignedMicroareaCodes?: string[];
  ativo?: boolean;
}

type AuthState = {
  user: User | null;
  userProfile: ExtendedUserProfile | null;
  loading: boolean;
  unauthorizedMessage: string | null;
};

type AuthContextType = AuthState & {
  role: 'ADMIN' | 'GERENTE' | 'ACS';
  userUnitId: string | null;
  userUnitNome: string | null;
  logout: () => Promise<void>;
  switchUnitForAdmin: (id: string, name: string) => void;
  loginWithDevCredentials: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    userProfile: null,
    loading: true,
    unauthorizedMessage: null,
  });
  const generation = useRef(0);

  useEffect(() => {
    let alive = true;

    async function load(user: User | null) {
      const version = ++generation.current;
      if (!user) {
        if (alive) {
          if (typeof window !== 'undefined') {
            if (isSupabaseConfigured) {
              localStorage.removeItem('dev_auth_logged');
            } else {
              const devLogged = localStorage.getItem('dev_auth_logged');
              if (devLogged) {
                try {
                  const parsed = JSON.parse(devLogged) as ExtendedUserProfile;
                  if (parsed && parsed.uid && parsed.ativo) {
                    setState({
                      user: { id: parsed.uid, email: parsed.email, user_metadata: { nome: parsed.name } } as unknown as User,
                      userProfile: parsed,
                      loading: false,
                      unauthorizedMessage: null,
                    });
                    return;
                  }
                } catch {
                  localStorage.removeItem('dev_auth_logged');
                }
              }
            }
          }
          setState({ user: null, userProfile: null, loading: false, unauthorizedMessage: null });
        }
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem('dev_auth_logged');
      }

      try {
        let profile = await getDoc(doc(db, 'usuarios', user.id));
        let p = profile.exists() ? profile.data() : null;

        // Se o documento não estava em usuarios/<auth.uid()> ou estava sem unidadeId, reconciliar via RPC
        if (!p || !p.perfil || (p.perfil !== 'ADMIN' && !p.unidadeId)) {
          try {
            const { data: resolved } = await supabase.rpc('resolve_my_profile');
            if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
              p = resolved as Record<string, any>;
            } else {
              profile = await getDoc(doc(db, 'usuarios', user.id));
              if (profile.exists()) p = profile.data();
            }
          } catch {
            // Ignorar erro de RPC e tentar leitura direta por coleção abaixo
          }
        }

        if (!p || !p.perfil) {
          const userDocs = await getDocs(collection(db, 'usuarios'));
          const emailLower = (user.email || '').trim().toLowerCase();
          const matchedDoc = userDocs.docs.find((d) => {
            const dData = d.data();
            return (
              d.id === user.id ||
              dData.uid === user.id ||
              dData.authUid === user.id ||
              (emailLower && String(dData.email || '').trim().toLowerCase() === emailLower)
            );
          });
          if (matchedDoc) p = matchedDoc.data();
        }

        if (!p || !p.perfil || p.ativo === false || !['ADMIN', 'GERENTE', 'ACS'].includes(p.perfil)) {
          throw new Error('Seu acesso está inativo ou sem perfil. Contate o administrador.');
        }

        const rawUnitId = String(p.unidadeId || '').trim();
        const normalizedUnitId = normalizeUnitId(rawUnitId);
        const effectiveUnitId = p.perfil === 'ADMIN' ? (rawUnitId ? normalizedUnitId : 'USF-003') : normalizedUnitId;

        const unitEntries: Array<{ id?: string; codigo?: string; nome?: string; nomeNormalizado?: string }> = [];
        let matchedUnitName: string | null = null;
        try {
          const allUnitsSnap = await getDocs(collection(db, 'unidades'));
          allUnitsSnap.forEach((uDoc) => {
            const uData = uDoc.data();
            unitEntries.push({
              id: uDoc.id,
              codigo: uData.codigo,
              nome: uData.nome,
              nomeNormalizado: uData.nomeNormalizado,
            });
          });
          const aliasMap = buildUnitAliasMap(unitEntries);
          const resolvedId = resolveCanonicalUnitId(effectiveUnitId, aliasMap);
          const matchedUnitDoc = allUnitsSnap.docs.find((uDoc) => {
            const uData = uDoc.data();
            const uCode = resolveCanonicalUnitId(uData.codigo || uDoc.id, aliasMap);
            return uCode.toLowerCase() === resolvedId.toLowerCase();
          });
          if (matchedUnitDoc?.data()?.nome) {
            matchedUnitName = String(matchedUnitDoc.data().nome);
          }
        } catch {
          // Fallback para leitura pontual da unidade
        }

        const unitAliasMap = buildUnitAliasMap(unitEntries);
        const canonicalUnitId = resolveCanonicalUnitId(effectiveUnitId, unitAliasMap);
        if (!matchedUnitName && canonicalUnitId) {
          const unit = await getDoc(doc(db, 'unidades', canonicalUnitId)).catch(() => null);
          if (unit?.exists() && unit.data().nome) {
            matchedUnitName = String(unit.data().nome);
          }
        }

        let assignedCodes: string[] = [];
        if (p.perfil === 'ACS') {
          const acsIdentifiers = new Set(
            [user.id, p.uid, p.authUid]
              .map((v) => String(v || '').trim())
              .filter(Boolean)
          );
          const areas = await getDocs(collection(db, 'microareas'));
          const codeSet = new Set<string>();
          areas.docs.forEach((a) => {
            const mData = a.data();
            if (mData.ativo === false) return;
            const mAcsId = String(mData.acsId || '').trim();
            if (mAcsId && acsIdentifiers.has(mAcsId) && mData.codigo) {
              codeSet.add(String(mData.codigo));
            }
          });
          if (codeSet.size === 0 && Array.isArray(p.microareaIds)) {
            areas.docs.forEach((a) => {
              const mData = a.data();
              if (mData.ativo === false) return;
              if (p.microareaIds.includes(a.id) || (mData.codigo && p.microareaIds.includes(mData.codigo))) {
                if (mData.codigo) codeSet.add(String(mData.codigo));
              }
            });
          }
          assignedCodes = Array.from(codeSet);
        }

        if (alive && version === generation.current) {
          setState({
            user,
            loading: false,
            unauthorizedMessage: null,
            userProfile: {
              uid: user.id,
              name: p.nome,
              email: user.email || p.email || '',
              role: p.perfil,
              unitId: canonicalUnitId,
              unitName: matchedUnitName || (canonicalUnitId === 'USF-003' ? 'USF Arrozal 3' : canonicalUnitId),
              assignedMicroareaCodes: assignedCodes,
              ativo: true,
            },
          });
        }
      } catch (error) {
        if (alive && version === generation.current) {
          setState({
            user,
            userProfile: null,
            loading: false,
            unauthorizedMessage: error instanceof Error ? error.message : 'Não foi possível validar seu acesso.',
          });
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { if (alive) void load(session?.user || null); }, 0);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (alive) void load(error ? null : data.session?.user || null);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginWithDevCredentials = async (emailInput: string, passwordInput: string): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured) {
      return { success: false, error: 'Use uma conta autenticada no Supabase Auth.' };
    }
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    const cleanPassword = (passwordInput || '').trim();

    let devProfile: ExtendedUserProfile | null = null;

    if (cleanEmail === 'admin@dcntsaude.gov.br' && cleanPassword === 'Admin@123456') {
      devProfile = {
        uid: 'admin-dev-id',
        name: 'Administrador Sistema',
        email: 'admin@dcntsaude.gov.br',
        role: 'ADMIN',
        unitId: 'USF-003',
        unitName: 'USF Arrozal 3',
        ativo: true,
      };
    } else if (
      (cleanEmail === 'gerente@dcntsaude.gov.br' || cleanEmail === 'gerente.arrozal3@usf.gov.br') &&
      (cleanPassword === 'Admin@123456' || cleanPassword === 'GerentePass123!')
    ) {
      devProfile = {
        uid: 'gerente-arrozal-3',
        name: 'Gerente USF Arrozal 3',
        email: cleanEmail,
        role: 'GERENTE',
        unitId: 'USF-003',
        unitName: 'USF Arrozal 3',
        ativo: true,
      };
    } else if (
      (cleanEmail === 'acs@dcntsaude.gov.br' || cleanEmail === 'ana.souza@usf.gov.br') &&
      (cleanPassword === 'Admin@123456' || cleanPassword === 'AcsPass123!')
    ) {
      devProfile = {
        uid: 'acs-ana-souza',
        name: 'Ana Maria Souza (ACS)',
        email: cleanEmail,
        role: 'ACS',
        unitId: 'USF-003',
        unitName: 'USF Arrozal 3',
        assignedMicroareaCodes: ['56', '01'],
        ativo: true,
      };
    }

    if (devProfile) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('dev_auth_logged', JSON.stringify(devProfile));
      }
      generation.current++;
      setState({
        user: { id: devProfile.uid, email: devProfile.email, user_metadata: { nome: devProfile.name } } as unknown as User,
        userProfile: devProfile,
        loading: false,
        unauthorizedMessage: null,
      });
      return { success: true };
    }

    return { success: false, error: 'Credenciais inválidas.' };
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dev_auth_logged');
    }
    await supabase.auth.signOut().catch(() => {});
    generation.current++;
    setState({ user: null, userProfile: null, loading: false, unauthorizedMessage: null });
  };

  const switchUnitForAdmin = (unitId: string, unitName: string) =>
    setState(s => (s.userProfile?.role === 'ADMIN' ? { ...s, userProfile: { ...s.userProfile, unitId, unitName } } : s));

  return (
    <AuthContext.Provider
      value={{
        ...state,
        role: state.userProfile?.role || 'ACS',
        userUnitId: state.userProfile?.unitId || null,
        userUnitNome: state.userProfile?.unitName || null,
        logout,
        switchUnitForAdmin,
        loginWithDevCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ausente');
  return value;
}
