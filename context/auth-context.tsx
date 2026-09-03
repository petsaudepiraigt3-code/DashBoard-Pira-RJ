"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { UserRole } from "@/types/dcnt";
import { getAllActiveUnitsFromFirestore, UserProfileDoc } from "@/lib/firebase/units";

export interface ExtendedUserProfile {
  uid: string;
  name: string;
  email: string;
  role: "ADMIN" | "GERENTE" | "ACS";
  unitId?: string | null;
  unitName?: string | null;
  microarea?: string;
  assignedMicroareaCodes?: string[];
  ativo?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: ExtendedUserProfile | null;
  role: "ADMIN" | "GERENTE" | "ACS";
  userUnitId: string | null;
  userUnitNome: string | null;
  loading: boolean;
  unauthorizedMessage: string | null;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  switchUnitForAdmin: (unitId: string, unitName: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<ExtendedUserProfile | null>(null);
  const [role, setRole] = useState<"ADMIN" | "GERENTE" | "ACS">("ADMIN");
  const [userUnitId, setUserUnitId] = useState<string | null>(null);
  const [userUnitNome, setUserUnitNome] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);

  const fetchUserProfileFromFirestore = async (currentUser: User) => {
    try {
      const userRef = doc(db, "usuarios", currentUser.uid);
      let snap = await getDoc(userRef);

      const units = await getAllActiveUnitsFromFirestore();
      const defaultUnit = units.find((u) => u.codigo === "USF-003") || units[0];

      if (!snap.exists()) {
        // Se o usuário autenticado não possuir documento em 'usuarios', registrar como ADMIN para não quebrar o acesso atual
        const newAdminDoc = {
          uid: currentUser.uid,
          nome: currentUser.displayName || currentUser.email?.split("@")[0] || "Administrador DCNT",
          email: currentUser.email || "admin@dcntsaude.gov.br",
          perfil: "ADMIN",
          unidadeId: null,
          ativo: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userRef, newAdminDoc);
        snap = await getDoc(userRef);
      }

      const pData = snap.data() as UserProfileDoc;

      if (!pData || pData.ativo === false) {
        setUnauthorizedMessage(
          "Seu usuário está autenticado, mas ainda não possui uma Unidade de Saúde/perfil configurado ou está inativo. Entre em contato com o administrador."
        );
        setUserProfile(null);
        return;
      }

      setUnauthorizedMessage(null);
      const currentRole = (pData.perfil?.toUpperCase() || "ADMIN") as "ADMIN" | "GERENTE" | "ACS";
      setRole(currentRole);

      let uId: string | null = null;
      let uNome: string | null = null;

      if (currentRole === "GERENTE" || currentRole === "ACS") {
        uId = pData.unidadeId || defaultUnit?.id || null;
        if (uId) {
          const uSnap = await getDoc(doc(db, "unidades", uId));
          if (uSnap.exists()) {
            uNome = uSnap.data().nome;
          } else {
            uNome = defaultUnit?.nome || "USF Arrozal 3";
          }
        }
      } else {
        // ADMIN inicia com visão da USF Arrozal 3 para testes
        uId = defaultUnit?.id || null;
        uNome = defaultUnit?.nome || "USF Arrozal 3";
      }

      let assignedMicroareaCodes: string[] = [];
      if (currentRole === "ACS" && uId) {
        try {
          const maQuery = query(
            collection(db, "microareas"),
            where("unidadeId", "==", uId),
            where("acsId", "==", pData.uid || currentUser.uid)
          );
          const maSnap = await getDocs(maQuery);
          maSnap.forEach((docSnap) => {
            const code = docSnap.data().codigo;
            if (code) assignedMicroareaCodes.push(code);
          });
        } catch (err) {
          // Ignorar
        }

        if (assignedMicroareaCodes.length === 0) {
          if (pData.microareaIds && Array.isArray(pData.microareaIds)) {
            pData.microareaIds.forEach((id: string) => {
              const code = id.replace(/\D/g, "").trim();
              if (code) assignedMicroareaCodes.push(code);
            });
          }
          if ((pData as any).assignedMicroareaCodes && Array.isArray((pData as any).assignedMicroareaCodes)) {
            assignedMicroareaCodes = (pData as any).assignedMicroareaCodes;
          } else if ((pData as any).microarea) {
            const code = String((pData as any).microarea).replace(/\D/g, "").trim();
            if (code) assignedMicroareaCodes.push(code);
          } else if ((pData as any).microareaCodigo) {
            assignedMicroareaCodes.push(String((pData as any).microareaCodigo));
          }
        }

        if (assignedMicroareaCodes.length === 0) {
          // ACS teste 01 da USF Arrozal 3 possui a microárea 56 atribuída
          assignedMicroareaCodes.push("56");
        }
      }

      setUserUnitId(uId);
      setUserUnitNome(uNome);

      setUserProfile({
        uid: pData.uid || currentUser.uid,
        name: pData.nome || currentUser.displayName || "Usuário",
        email: pData.email || currentUser.email || "",
        role: currentRole,
        unitId: uId,
        unitName: uNome,
        assignedMicroareaCodes,
        ativo: pData.ativo,
      });
    } catch (err) {
      // Fallback gracioso
      setRole("ADMIN");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserProfileFromFirestore(currentUser);
      } else {
        // Usuário em ambiente local sem login ativo no Firebase Auth -> carregar perfil ADMIN Padrão
        const units = await getAllActiveUnitsFromFirestore();
        const defaultUnit = units.find((u) => u.codigo === "USF-003") || units[0];

        const defaultAdmin: ExtendedUserProfile = {
          uid: "dev-admin-uid",
          name: "Administrador Sistema (Dev)",
          email: "admin@dcntsaude.gov.br",
          role: "ADMIN",
          unitId: defaultUnit?.id || null,
          unitName: defaultUnit?.nome || "USF Arrozal 3",
          ativo: true,
        };
        setUserProfile(defaultAdmin);
        setRole("ADMIN");
        setUserUnitId(defaultAdmin.unitId || null);
        setUserUnitNome(defaultAdmin.unitName || null);
        setUnauthorizedMessage(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await firebaseSignOut(auth);
  };

  const switchRole = (newRole: UserRole) => {
    // Trava de Segurança: Apenas Administradores podem alternar perfis
    if (userProfile?.role !== "ADMIN" && role !== "ADMIN") {
      return;
    }
    const upper = (String(newRole).toUpperCase() || "ADMIN") as "ADMIN" | "GERENTE" | "ACS";
    setRole(upper);
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        role: upper,
      });
    }
  };

  const switchUnitForAdmin = (unitId: string, unitName: string) => {
    // Trava de Segurança: Apenas Administradores podem alterar a unidade ativa
    if (userProfile?.role === "ADMIN" && role === "ADMIN") {
      setUserUnitId(unitId);
      setUserUnitNome(unitName);
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          unitId,
          unitName,
        });
      }
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
        logout,
        switchRole,
        switchUnitForAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um AuthProvider");
  }
  return context;
}
