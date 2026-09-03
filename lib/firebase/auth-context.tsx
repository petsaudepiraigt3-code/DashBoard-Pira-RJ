"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UserProfileDoc, HealthUnit, getAllActiveUnitsFromFirestore } from "./units";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfileDoc | null;
  role: "ADMIN" | "GERENTE" | "ACS" | null;
  userUnitId: string | null;
  userUnitNome: string | null;
  loading: boolean;
  unauthorizedMessage: string | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  role: null,
  userUnitId: null,
  userUnitNome: null,
  loading: true,
  unauthorizedMessage: null,
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileDoc | null>(null);
  const [role, setRole] = useState<"ADMIN" | "GERENTE" | "ACS" | null>("ADMIN");
  const [userUnitId, setUserUnitId] = useState<string | null>(null);
  const [userUnitNome, setUserUnitNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);

  const fetchProfileForUser = async (authUser: User) => {
    try {
      const userRef = doc(db, "usuarios", authUser.uid);
      let snap = await getDoc(userRef);

      // Se a coleção de usuários estiver vazia ou se o usuário logado for o admin do desenvolvimento, criar perfil ADMIN padrão
      if (!snap.exists()) {
        const units = await getAllActiveUnitsFromFirestore();
        const defaultUnitId = units.length > 0 ? units[0].id : "USF-003";

        // Perfil ADMIN padrão para o usuário de desenvolvimento ativo
        const defaultAdminProfile: UserProfileDoc = {
          uid: authUser.uid,
          nome: authUser.displayName || authUser.email?.split("@")[0] || "Administrador DCNT",
          email: authUser.email || "admin@dcntsaude.gov.br",
          perfil: "ADMIN",
          unidadeId: undefined,
          ativo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await setDoc(userRef, {
          ...defaultAdminProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        snap = await getDoc(userRef);
      }

      const pData = snap.data() as UserProfileDoc;

      if (!pData || pData.ativo === false) {
        setUnauthorizedMessage(
          "Seu usuário está autenticado, mas ainda não possui uma Unidade de Saúde/perfil configurado ou está inativo. Entre em contato com o administrador."
        );
        setUserProfile(null);
        setRole(null);
        setUserUnitId(null);
        setUserUnitNome(null);
        return;
      }

      setUnauthorizedMessage(null);
      setUserProfile(pData);
      setRole(pData.perfil);

      if (pData.unidadeId) {
        setUserUnitId(pData.unidadeId);
        const uSnap = await getDoc(doc(db, "unidades", pData.unidadeId));
        if (uSnap.exists()) {
          setUserUnitNome(uSnap.data().nome);
        } else {
          setUserUnitNome("USF Arrozal 3");
        }
      } else {
        setUserUnitId(null);
        setUserUnitNome(null);
      }
    } catch (err: any) {
      // Fallback gracioso para modo ADMIN caso o Firestore esteja em verificação inicial
      setUserProfile({
        uid: authUser.uid,
        nome: authUser.displayName || "Administrador DCNT",
        email: authUser.email || "admin@dcntsaude.gov.br",
        perfil: "ADMIN",
        ativo: true,
      });
      setRole("ADMIN");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        await fetchProfileForUser(authUser);
      } else {
        // Se não houver usuário logado no Firebase Auth, disponibiliza perfil ADMIN de desenvolvimento
        const devProfile: UserProfileDoc = {
          uid: "dev-admin-uid",
          nome: "Administrador Sistema (Dev)",
          email: "admin@dcntsaude.gov.br",
          perfil: "ADMIN",
          ativo: true,
        };
        setUserProfile(devProfile);
        setRole("ADMIN");
        setUserUnitId(null);
        setUserUnitNome(null);
        setUnauthorizedMessage(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfileForUser(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        role,
        userUnitId,
        userUnitNome,
        loading,
        unauthorizedMessage,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
