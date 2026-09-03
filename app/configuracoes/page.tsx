"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { MOCK_PARAMETERS } from "@/data/mock-data";
import { DcntParameters } from "@/types/dcnt";
import {
  getAllActiveUnitsFromFirestore,
  createHealthUnit,
  getMicroareasByUnit,
  assignAcsToMicroarea,
  getAcsUsersByUnit,
  getAllUserProfilesFromFirestore,
  seedTestManagerProfileForArrozal3,
  migrateExistingPatientsMicroareaLinks,
  getUnitAdministrativeDiagnostics,
  getPatientCountMapByMicroarea,
  createAcsUser,
  recordAuditLog,
  HealthUnit,
  MicroareaDoc,
  UserProfileDoc,
} from "@/lib/firebase/units";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  Settings,
  Users,
  Building2,
  UserCheck,
  Sliders,
  FileSpreadsheet,
  ShieldAlert,
  Save,
  Plus,
  Edit2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  MapPin,
  ShieldCheck,
  UserPlus,
  Layers,
  Lock,
  Tag,
  KeyRound,
  Mail,
  Check,
  XCircle,
  Phone,
  ArrowRightLeft,
  Trash2,
} from "lucide-react";

interface ReconciledUser extends UserProfileDoc {
  docId?: string;
  authStatus?: "AUTH_OK" | "AUTH_UID_DIVERGENTE" | "AUTH_INEXISTENTE";
  authUid?: string | null;
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { role, userUnitId, userUnitNome, userProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<"unidades" | "microareas" | "acs" | "usuarios" | "diagnostico" | "parametros">("microareas");
  const [params, setParams] = useState<DcntParameters>(MOCK_PARAMETERS);

  // Unidades de Saúde
  const [units, setUnits] = useState<HealthUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [loadingUnits, setLoadingUnits] = useState(true);

  // Microáreas
  const [microareas, setMicroareas] = useState<MicroareaDoc[]>([]);
  const [patientCounts, setPatientCounts] = useState<Record<string, number>>({});
  const [loadingMicroareas, setLoadingMicroareas] = useState(false);

  // Profissionais ACS
  const [acsUsers, setAcsUsers] = useState<ReconciledUser[]>([]);
  const [loadingAcs, setLoadingAcs] = useState(false);

  // Usuários Globais (Visão ADMIN)
  const [allUsers, setAllUsers] = useState<ReconciledUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Diagnóstico Administrativo
  const [unitDiag, setUnitDiag] = useState<any>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  // Modais de Criação
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState({ nome: "", codigo: "", cnes: "", tipo: "USF" });

  // Modal Novo ACS
  const [showNewAcsModal, setShowNewAcsModal] = useState(false);
  const [newAcsForm, setNewAcsForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    unidadeId: "",
    senhaInicial: "",
    criarAuthImediato: false,
  });
  const [isCreatingAcs, setIsCreatingAcs] = useState(false);

  // Modal Novo Usuário (Servidor API Admin)
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    nome: "",
    email: "",
    senhaInicial: "",
    confirmarSenha: "",
    perfil: "GERENTE" as "ADMIN" | "GERENTE" | "ACS",
    unidadeId: "",
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreationError, setUserCreationError] = useState<string | null>(null);
  const [userCreationSuccess, setUserCreationSuccess] = useState<string | null>(null);

  // Modal Criar Acesso
  const [createAccessTarget, setCreateAccessTarget] = useState<ReconciledUser | null>(null);
  const [createAccessForm, setCreateAccessForm] = useState({ senhaInicial: "", confirmarSenha: "" });
  const [isCreatingAccess, setIsCreatingAccess] = useState(false);
  const [createAccessError, setCreateAccessError] = useState<string | null>(null);
  const [createAccessSuccess, setCreateAccessSuccess] = useState<string | null>(null);

  // Modal Redefinir Senha Temporária Direta
  const [resetPassTarget, setResetPassTarget] = useState<ReconciledUser | null>(null);
  const [resetPassForm, setResetPassForm] = useState({ novaSenha: "", confirmarSenha: "" });
  const [isResettingPass, setIsResettingPass] = useState(false);
  const [resetPassError, setResetPassError] = useState<string | null>(null);
  const [resetPassSuccess, setResetPassSuccess] = useState<string | null>(null);

  // Modal de Vínculo de Microáreas ao ACS
  const [assignAcsTarget, setAssignAcsTarget] = useState<ReconciledUser | null>(null);
  const [selectedMicroareaIdsForAcs, setSelectedMicroareaIdsForAcs] = useState<string[]>([]);
  const [transferConflictPrompt, setTransferConflictPrompt] = useState<{
    microareaId: string;
    microareaNome: string;
    existingAcsNome: string;
  } | null>(null);

  const [editingMicroarea, setEditingMicroarea] = useState<MicroareaDoc | null>(null);
  const [selectedAcsForMicroarea, setSelectedAcsForMicroarea] = useState<string>("");

  // Carregar Unidades
  const fetchUnits = async () => {
    setLoadingUnits(true);
    try {
      await seedTestManagerProfileForArrozal3();
      const list = await getAllActiveUnitsFromFirestore();
      setUnits(list);

      const targetUnitId = (role as string) === "GERENTE" && userUnitId ? userUnitId : (list.length > 0 ? list[0].id : "");
      setSelectedUnitId(targetUnitId);
    } catch (err) {
      // Ignorar
    } finally {
      setLoadingUnits(false);
    }
  };

  // Consultar usuários reconciliados
  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const res = await fetch("/api/admin/users/list-with-auth", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data.users || []);
      }
    } catch (err) {
      // Ignorar
    } finally {
      setLoadingUsers(false);
    }
  };

  // Carregar dados de Microáreas, ACS e Contagem de Pacientes para a unidade selecionada
  const fetchUnitData = async (uId: string) => {
    if (!uId) return;
    setLoadingMicroareas(true);
    setLoadingAcs(true);
    try {
      const maList = await getMicroareasByUnit(uId);
      setMicroareas(maList);

      const rawAcsList = await getAcsUsersByUnit(uId);
      
      // Associar status de autenticação real aos ACS da unidade
      const reconcAcsList: ReconciledUser[] = rawAcsList.map((a) => {
        const matched = allUsers.find((u) => u.email === a.email);
        return {
          ...a,
          authStatus: matched?.authStatus || "AUTH_INEXISTENTE",
          authUid: matched?.authUid || a.uid,
          docId: a.uid,
        };
      });
      setAcsUsers(reconcAcsList);

      const counts = await getPatientCountMapByMicroarea(uId);
      setPatientCounts(counts);

      const diag = await getUnitAdministrativeDiagnostics(uId);
      setUnitDiag(diag);
    } catch (err) {
      // Ignorar
    } finally {
      setLoadingMicroareas(false);
      setLoadingAcs(false);
    }
  };

  useEffect(() => {
    fetchUnits();
    fetchAllUsers();
  }, []);

  useEffect(() => {
    if (selectedUnitId) {
      fetchUnitData(selectedUnitId);
    }
  }, [selectedUnitId, allUsers]);

  // Criar Novo ACS na Unidade
  const handleCreateAcs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcsForm.nome || !newAcsForm.email) {
      alert("Nome e E-mail são obrigatórios.");
      return;
    }

    const cleanEmail = newAcsForm.email.trim().toLowerCase();
    const activeUnit = (role as string) === "GERENTE" ? (userUnitId || selectedUnitId) : (newAcsForm.unidadeId || selectedUnitId);

    if (!activeUnit) {
      alert("Por favor, selecione uma Unidade de Saúde.");
      return;
    }

    setIsCreatingAcs(true);

    try {
      if (newAcsForm.criarAuthImediato) {
        if (!newAcsForm.senhaInicial || newAcsForm.senhaInicial.length < 6) {
          alert("A senha inicial deve possuir no mínimo 6 caracteres.");
          setIsCreatingAcs(false);
          return;
        }
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            nome: newAcsForm.nome.trim(),
            email: cleanEmail,
            senhaInicial: newAcsForm.senhaInicial,
            perfil: "ACS",
            unidadeId: activeUnit,
            ativo: true,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao criar conta de ACS.");
      } else {
        await createAcsUser({
          nome: newAcsForm.nome.trim(),
          email: cleanEmail,
          telefone: newAcsForm.telefone,
          unidadeId: activeUnit,
        });
      }

      setShowNewAcsModal(false);
      setNewAcsForm({ nome: "", email: "", telefone: "", unidadeId: "", senhaInicial: "", criarAuthImediato: false });
      await fetchAllUsers();
      await fetchUnitData(activeUnit);
      alert("ACS cadastrado com sucesso. Agora você pode associar as microáreas de responsabilidade.");
    } catch (err: any) {
      alert(`Erro ao criar ACS: ${err.message}`);
    } finally {
      setIsCreatingAcs(false);
    }
  };

  // Criar Novo Usuário (GERENTE / ADMIN / ACS)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserCreationError(null);
    setUserCreationSuccess(null);

    if (!newUserForm.nome || !newUserForm.email) {
      setUserCreationError("Nome completo e E-mail são obrigatórios.");
      return;
    }

    if (!newUserForm.senhaInicial || newUserForm.senhaInicial.length < 6) {
      setUserCreationError("A senha inicial deve possuir no mínimo 6 caracteres.");
      return;
    }

    if (newUserForm.senhaInicial !== newUserForm.confirmarSenha) {
      setUserCreationError("A confirmação da senha não confere.");
      return;
    }

    const targetUnit = newUserForm.unidadeId || selectedUnitId;
    if (newUserForm.perfil !== "ADMIN" && !targetUnit) {
      setUserCreationError("Por favor, selecione uma Unidade de Saúde.");
      return;
    }

    setIsCreatingUser(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          nome: newUserForm.nome,
          email: newUserForm.email,
          senhaInicial: newUserForm.senhaInicial,
          perfil: newUserForm.perfil,
          unidadeId: newUserForm.perfil === "ADMIN" ? null : targetUnit,
          ativo: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário.");

      setUserCreationSuccess(`Usuário ${newUserForm.perfil} (${newUserForm.email}) criado com sucesso!`);
      setNewUserForm({
        nome: "",
        email: "",
        senhaInicial: "",
        confirmarSenha: "",
        perfil: "GERENTE",
        unidadeId: "",
      });
      await fetchAllUsers();
      if (selectedUnitId) await fetchUnitData(selectedUnitId);

      setTimeout(() => {
        setShowNewUserModal(false);
        setUserCreationSuccess(null);
      }, 1500);
    } catch (err: any) {
      setUserCreationError(err.message || String(err));
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Abrir Modal de Vínculo de Microáreas para o ACS
  const handleOpenAssignMicroareas = (acs: ReconciledUser) => {
    setAssignAcsTarget(acs);
    const assignedMAs = microareas.filter((m) => m.acsId === acs.uid).map((m) => m.id);
    setSelectedMicroareaIdsForAcs(assignedMAs);
  };

  // Alternar checkbox de Microárea para o ACS
  const handleToggleMicroareaCheckbox = async (ma: MicroareaDoc) => {
    if (!assignAcsTarget) return;

    const isCurrentlyAssigned = selectedMicroareaIdsForAcs.includes(ma.id);

    if (isCurrentlyAssigned) {
      // Desvincular
      try {
        await assignAcsToMicroarea(ma.id, null, null, userProfile?.uid || "gerente");
        setSelectedMicroareaIdsForAcs((prev) => prev.filter((id) => id !== ma.id));
        await fetchUnitData(selectedUnitId);
      } catch (err: any) {
        alert(`Erro ao desvincular microárea: ${err.message}`);
      }
    } else {
      // Se a microárea já estiver atribuída a outro ACS, pedir confirmação de transferência
      if (ma.acsId && ma.acsId !== assignAcsTarget.uid) {
        const existingAcsObj = acsUsers.find((a) => a.uid === ma.acsId);
        setTransferConflictPrompt({
          microareaId: ma.id,
          microareaNome: ma.nome,
          existingAcsNome: ma.acsNome || existingAcsObj?.nome || "Outro ACS",
        });
        return;
      }

      // Atribuir diretamente
      try {
        await assignAcsToMicroarea(ma.id, assignAcsTarget.uid, assignAcsTarget.nome, userProfile?.uid || "gerente");
        setSelectedMicroareaIdsForAcs((prev) => [...prev, ma.id]);
        await fetchUnitData(selectedUnitId);
      } catch (err: any) {
        alert(`Erro ao vincular microárea: ${err.message}`);
      }
    }
  };

  // Confirmar Transferência de Responsabilidade
  const handleConfirmTransferMicroarea = async () => {
    if (!transferConflictPrompt || !assignAcsTarget) return;
    try {
      await assignAcsToMicroarea(
        transferConflictPrompt.microareaId,
        assignAcsTarget.uid,
        assignAcsTarget.nome,
        userProfile?.uid || "gerente"
      );
      setSelectedMicroareaIdsForAcs((prev) => [...prev, transferConflictPrompt.microareaId]);
      setTransferConflictPrompt(null);
      await fetchUnitData(selectedUnitId);
    } catch (err: any) {
      alert(`Erro na transferência de responsabilidade: ${err.message}`);
    }
  };

  // Atribuir/Trocar ACS diretamente da tabela de Microáreas
  const handleSaveMicroareaAcs = async () => {
    if (!editingMicroarea) return;
    try {
      const selectedAcsObj = acsUsers.find((a) => a.uid === selectedAcsForMicroarea);
      await assignAcsToMicroarea(
        editingMicroarea.id,
        selectedAcsForMicroarea || null,
        selectedAcsObj?.nome || null,
        userProfile?.uid || "gerente"
      );
      setEditingMicroarea(null);
      await fetchUnitData(selectedUnitId);
    } catch (err: any) {
      alert(`Erro ao vincular ACS: ${err.message}`);
    }
  };

  // Ativar / Desativar Usuário
  const handleToggleUserStatus = async (userDoc: ReconciledUser) => {
    try {
      const newStatus = !userDoc.ativo;
      const targetDocId = userDoc.authUid || userDoc.uid || userDoc.docId || userDoc.uid;
      const uRef = doc(db, "usuarios", targetDocId);
      await updateDoc(uRef, {
        ativo: newStatus,
        updatedAt: serverTimestamp(),
      });

      if (userDoc.perfil === "ACS" && userDoc.unidadeId) {
        await recordAuditLog({
          tipo: newStatus ? "ACS_ATIVADO" : "ACS_DESATIVADO",
          usuarioId: userProfile?.uid || "gerente",
          unidadeId: userDoc.unidadeId,
          acsId: targetDocId,
          acao: `ACS ${userDoc.nome} ${newStatus ? "ativado" : "desativado"}`,
        });
      }

      await fetchAllUsers();
      if (selectedUnitId) await fetchUnitData(selectedUnitId);
    } catch (err: any) {
      alert(`Erro ao alterar status: ${err.message}`);
    }
  };

  // Executar Migração Segura
  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationResult("Executando vinculação incremental dos pacientes às microáreas...");
    try {
      const res = await migrateExistingPatientsMicroareaLinks();
      setMigrationResult(`✓ Migração concluída com sucesso: ${res.updatedCount} pacientes vinculados.`);
      await fetchUnitData(selectedUnitId);
    } catch (err: any) {
      setMigrationResult(`Erro na migração: ${err.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  // Criar Acesso para Usuário Legado
  const handleCreateAccessForLegacyUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateAccessError(null);
    setCreateAccessSuccess(null);

    if (!createAccessTarget) return;

    if (!createAccessForm.senhaInicial || createAccessForm.senhaInicial.length < 6) {
      setCreateAccessError("A senha temporária deve possuir no mínimo 6 caracteres.");
      return;
    }

    if (createAccessForm.senhaInicial !== createAccessForm.confirmarSenha) {
      setCreateAccessError("A confirmação da senha não confere.");
      return;
    }

    setIsCreatingAccess(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";

      const res = await fetch("/api/admin/users/create-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          docId: createAccessTarget.docId || createAccessTarget.uid,
          email: createAccessTarget.email,
          nome: createAccessTarget.nome,
          perfil: createAccessTarget.perfil,
          unidadeId: createAccessTarget.unidadeId,
          senhaTemporaria: createAccessForm.senhaInicial,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar acesso.");

      setCreateAccessSuccess(`Acesso criado com sucesso para ${createAccessTarget.email}!`);
      setCreateAccessForm({ senhaInicial: "", confirmarSenha: "" });
      await fetchAllUsers();
      if (selectedUnitId) await fetchUnitData(selectedUnitId);
      setTimeout(() => setCreateAccessTarget(null), 1500);
    } catch (err: any) {
      setCreateAccessError(err.message || String(err));
    } finally {
      setIsCreatingAccess(false);
    }
  };

  // Redefinir Senha Temporária
  const handleDirectPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetPassError(null);
    setResetPassSuccess(null);

    if (!resetPassTarget) return;

    if (!resetPassForm.novaSenha || resetPassForm.novaSenha.length < 6) {
      setResetPassError("A nova senha temporária deve possuir no mínimo 6 caracteres.");
      return;
    }

    if (resetPassForm.novaSenha !== resetPassForm.confirmarSenha) {
      setResetPassError("A confirmação da senha não confere.");
      return;
    }

    setIsResettingPass(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";

      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          uid: resetPassTarget.authUid || resetPassTarget.uid,
          email: resetPassTarget.email,
          novaSenha: resetPassForm.novaSenha,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao redefinir senha.");

      setResetPassSuccess("Senha redefinida com sucesso.");
      setResetPassForm({ novaSenha: "", confirmarSenha: "" });
      await fetchAllUsers();
      setTimeout(() => setResetPassTarget(null), 1500);
    } catch (err: any) {
      setResetPassError(err.message || String(err));
    } finally {
      setIsResettingPass(false);
    }
  };

  const selectedUnitObj = units.find((u) => u.id === selectedUnitId);

  if (role === "ACS" || userProfile?.role === "ACS") {
    return (
      <AppLayout pageTitle="Configurações e Gestão da Unidade">
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="rounded-full bg-amber-100 p-4 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Lock className="h-10 w-10" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Acesso Não Autorizado</h2>
          <p className="max-w-md text-xs text-zinc-500">
            As configurações administrativas e a gestão de microáreas/equipe são reservadas a Gerentes de Unidade e Administradores.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 cursor-pointer"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout pageTitle="Configurações e Gestão da Unidade">
      {/* Navegação por Abas */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 space-x-2 overflow-x-auto">
        {(role as string) === "ADMIN" && (
          <button
            onClick={() => setActiveTab("unidades")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "unidades"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Unidades de Saúde</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab("microareas")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "microareas"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span>Microáreas</span>
        </button>

        <button
          onClick={() => setActiveTab("acs")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "acs"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Equipe de ACS</span>
        </button>

        {(role as string) === "ADMIN" && (
          <>
            <button
              onClick={() => setActiveTab("usuarios")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "usuarios"
                  ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Usuários e Perfis (ADMIN)</span>
            </button>

            <button
              onClick={() => setActiveTab("diagnostico")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "diagnostico"
                  ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Diagnóstico</span>
            </button>

            <button
              onClick={() => setActiveTab("parametros")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "parametros"
                  ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>Parâmetros DCNT</span>
            </button>
          </>
        )}
      </div>

      {/* SELETOR DE UNIDADE ATIVA (ADMIN OU FIXO GERENTE) */}
      {activeTab !== "unidades" && activeTab !== "usuarios" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 flex items-center justify-between my-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Unidade de Saúde:
            </span>
          </div>

          {(role as string) === "GERENTE" ? (
            <span className="text-xs font-extrabold text-blue-900 bg-blue-100 dark:bg-blue-950 dark:text-blue-300 px-3 py-1 rounded-md">
              {userUnitNome || "USF Arrozal 3"} (USF Arrozal 3 - Fixo)
            </span>
          ) : (
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-900 shadow-2xs focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 cursor-pointer"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.codigo})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ABA: MICROÁREAS DA UNIDADE */}
      {activeTab === "microareas" && (
        <div className="space-y-4 my-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Microáreas da Unidade ({selectedUnitObj?.nome || "USF Arrozal 3"})
              </h2>
              <p className="text-xs text-zinc-500">
                Microáreas identificadas da planilha do e-SUS APS e seus ACS responsáveis.
              </p>
            </div>
          </div>

          {loadingMicroareas ? (
            <div className="p-8 text-center text-xs text-zinc-500">Carregando microáreas...</div>
          ) : microareas.length === 0 ? (
            <div className="p-8 text-center text-xs font-semibold text-zinc-500 border border-dashed border-zinc-200 rounded-xl dark:border-zinc-800">
              Nenhuma microárea cadastrada para esta unidade.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 font-bold">
                  <tr>
                    <th className="px-4 py-3">Microárea</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">ACS Responsável</th>
                    <th className="px-4 py-3">Pacientes (Derivado)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                  {microareas.map((m) => {
                    const assignedACS = acsUsers.find((a) => a.uid === m.acsId);
                    const pCount = patientCounts[m.codigo] || 0;
                    return (
                      <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3 font-extrabold text-zinc-900 dark:text-zinc-100">
                          {m.nome}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                            m.tipoMicroarea === "NORMAL"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}>
                            {m.tipoMicroarea}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-zinc-800 dark:text-zinc-200">
                          {assignedACS ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <UserCheck className="h-3.5 w-3.5" />
                              {assignedACS.nome}
                            </span>
                          ) : m.tipoMicroarea === "NORMAL" ? (
                            <span className="text-amber-600 dark:text-amber-400 font-normal">Sem ACS atribuído</span>
                          ) : (
                            <span className="text-zinc-400 font-normal">Não aplicável</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-extrabold text-zinc-900 dark:text-zinc-100">
                          {pCount} pacientes
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-emerald-600 font-bold">Ativa</span>
                        </td>
                        <td className="px-4 py-3">
                          {m.tipoMicroarea === "NORMAL" && (
                            <button
                              onClick={() => {
                                setEditingMicroarea(m);
                                setSelectedAcsForMicroarea(m.acsId || "");
                              }}
                              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span>{m.acsId ? "Alterar ACS" : "Associar ACS"}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ABA: EQUIPE DE ACS */}
      {activeTab === "acs" && (
        <div className="space-y-4 my-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Equipe de ACS ({selectedUnitObj?.nome || "USF Arrozal 3"})
              </h2>
              <p className="text-xs text-zinc-500">
                Cadastro e atribuição de responsabilidades sobre microáreas da unidade.
              </p>
            </div>

            <button
              onClick={() => {
                setNewAcsForm({
                  nome: "",
                  email: "",
                  telefone: "",
                  unidadeId: selectedUnitId,
                  senhaInicial: "",
                  criarAuthImediato: false,
                });
                setShowNewAcsModal(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Novo ACS</span>
            </button>
          </div>

          {loadingAcs ? (
            <div className="p-8 text-center text-xs text-zinc-500">Carregando profissionais ACS...</div>
          ) : acsUsers.length === 0 ? (
            <div className="p-8 text-center text-xs font-semibold text-zinc-500 border border-dashed border-zinc-200 rounded-xl dark:border-zinc-800">
              Nenhum profissional ACS cadastrado para esta unidade. Clique no botão acima para adicionar um ACS.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 font-bold">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Unidade</th>
                    <th className="px-4 py-3">Microáreas Atribuídas</th>
                    <th className="px-4 py-3">Pacientes</th>
                    <th className="px-4 py-3">Autenticação</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                  {acsUsers.map((a) => {
                    const assignedMAs = microareas.filter((m) => m.acsId === a.uid);
                    let totalPatientsForAcs = 0;
                    assignedMAs.forEach((m) => {
                      totalPatientsForAcs += patientCounts[m.codigo] || 0;
                    });

                    const hasAuth = a.authStatus === "AUTH_OK" || a.authStatus === "AUTH_UID_DIVERGENTE" || a.authAtiva === true;

                    return (
                      <tr key={a.uid} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3 font-extrabold text-zinc-900 dark:text-zinc-100">
                          {a.nome}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{a.email}</td>
                        <td className="px-4 py-3 font-semibold">{selectedUnitObj?.nome || "USF Arrozal 3"}</td>
                        <td className="px-4 py-3">
                          {assignedMAs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {assignedMAs.map((m) => (
                                <span key={m.id} className="rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-bold">
                                  {m.nome}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-amber-600 font-normal">Nenhuma microárea</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-extrabold text-zinc-900 dark:text-zinc-100">
                          {totalPatientsForAcs}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold ${
                            hasAuth
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}>
                            {hasAuth ? "Ativa" : "Sem conta de login"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${a.ativo !== false ? "text-emerald-600" : "text-red-600"}`}>
                            {a.ativo !== false ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenAssignMicroareas(a)}
                              className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-blue-700 cursor-pointer"
                            >
                              <MapPin className="h-3 w-3" />
                              <span>Associar Microáreas</span>
                            </button>

                            {!hasAuth ? (
                              <button
                                onClick={() => {
                                  setCreateAccessTarget(a);
                                  setCreateAccessError(null);
                                  setCreateAccessSuccess(null);
                                  setCreateAccessForm({ senhaInicial: "", confirmarSenha: "" });
                                }}
                                className="flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-700 cursor-pointer"
                              >
                                <KeyRound className="h-3 w-3" />
                                <span>Criar Acesso</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setResetPassTarget(a);
                                  setResetPassError(null);
                                  setResetPassSuccess(null);
                                  setResetPassForm({ novaSenha: "", confirmarSenha: "" });
                                }}
                                className="flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
                              >
                                <Lock className="h-3 w-3" />
                                <span>Redefinir Senha</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleToggleUserStatus(a)}
                              className={`rounded px-2 py-1 text-[11px] font-bold cursor-pointer ${
                                a.ativo !== false
                                  ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                              }`}
                            >
                              {a.ativo !== false ? "Desativar" : "Ativar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ABA: UNIDADES DE SAÚDE (ADMIN) */}
      {activeTab === "unidades" && (role as string) === "ADMIN" && (
        <div className="space-y-4 my-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Unidades de Saúde Cadastradas
              </h2>
              <p className="text-xs text-zinc-500">
                Gestão das USFs e estrutura administrativa no Cloud Firestore.
              </p>
            </div>

            <button
              onClick={() => setShowNewUnitModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Unidade de Saúde</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {units.map((u) => (
              <div
                key={u.id}
                className={`rounded-xl border p-5 shadow-2xs space-y-3 transition-all ${
                  selectedUnitId === u.id
                    ? "border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 dark:border-blue-600"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                      {u.nome}
                    </h3>
                    <span className="text-xs font-mono text-zinc-500">
                      Código: {u.codigo} | CNES: {u.cnes || "Não informado"} | Tipo: {u.tipo}
                    </span>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Ativa
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA: USUÁRIOS E PERFIS (ADMIN) */}
      {activeTab === "usuarios" && (role as string) === "ADMIN" && (
        <div className="space-y-4 my-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Gestão Server-Side de Usuários Globais
              </h2>
              <p className="text-xs text-zinc-500">
                Reconciliação e alinhamento do Cloud Firestore com o Firebase Authentication real.
              </p>
            </div>

            <button
              onClick={() => setShowNewUserModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Novo Usuário</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 font-bold">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Unidade de Saúde</th>
                  <th className="px-4 py-3">Autenticação</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                {allUsers.map((u) => {
                  const hasAuth = u.authStatus === "AUTH_OK" || u.authStatus === "AUTH_UID_DIVERGENTE";
                  const unitObj = units.find((unit) => unit.id === u.unidadeId);
                  const unitDisplayName = unitObj ? unitObj.nome : u.unidadeId || "Global";

                  return (
                    <tr key={u.uid || u.email}>
                      <td className="px-4 py-3 font-extrabold text-zinc-900 dark:text-zinc-100">{u.nome}</td>
                      <td className="px-4 py-3">{u.email}</td>
                      <td className="px-4 py-3 font-bold">{u.perfil}</td>
                      <td className="px-4 py-3 font-semibold">{unitDisplayName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                          hasAuth
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}>
                          {hasAuth ? "Ativa" : "Sem conta de login"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${u.ativo !== false ? "text-emerald-600" : "text-red-600"}`}>
                          {u.ativo !== false ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {!hasAuth ? (
                            <button
                              onClick={() => {
                                setCreateAccessTarget(u);
                                setCreateAccessError(null);
                                setCreateAccessSuccess(null);
                                setCreateAccessForm({ senhaInicial: "", confirmarSenha: "" });
                              }}
                              className="flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-700 cursor-pointer"
                            >
                              <KeyRound className="h-3 w-3" />
                              <span>Criar Acesso</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setResetPassTarget(u);
                                setResetPassError(null);
                                setResetPassSuccess(null);
                                setResetPassForm({ novaSenha: "", confirmarSenha: "" });
                              }}
                              className="flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
                            >
                              <Lock className="h-3 w-3" />
                              <span>Redefinir Senha</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleUserStatus(u)}
                            className={`rounded px-2 py-1 text-[11px] font-bold cursor-pointer ${
                              u.ativo !== false
                                ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}
                          >
                            {u.ativo !== false ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NOVO USUÁRIO (GERENTE / ADMIN / ACS) */}
      {showNewUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Cadastrar Novo Usuário (Gerente / Admin / ACS)
            </h3>

            {userCreationError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium">
                {userCreationError}
              </div>
            )}

            {userCreationSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-medium">
                {userCreationSuccess}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs font-medium">
              <div>
                <label className="block font-semibold mb-1">Nome Completo *:</label>
                <input
                  type="text"
                  placeholder="Ex: Maria da Silva"
                  value={newUserForm.nome}
                  onChange={(e) => setNewUserForm({ ...newUserForm, nome: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">E-mail corporativo *:</label>
                <input
                  type="email"
                  placeholder="maria.gerente@usf.gov.br"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Perfil do Usuário *:</label>
                <select
                  value={newUserForm.perfil}
                  onChange={(e) => setNewUserForm({ ...newUserForm, perfil: e.target.value as any })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800 font-bold cursor-pointer"
                >
                  <option value="GERENTE">GERENTE DE UNIDADE</option>
                  <option value="ACS">ACS (AGENTE COMUNITÁRIO)</option>
                  <option value="ADMIN">ADMINISTRADOR GLOBAL</option>
                </select>
              </div>

              {newUserForm.perfil !== "ADMIN" && (
                <div>
                  <label className="block font-semibold mb-1">Unidade de Saúde *:</label>
                  <select
                    value={newUserForm.unidadeId || selectedUnitId}
                    onChange={(e) => setNewUserForm({ ...newUserForm, unidadeId: e.target.value })}
                    className="w-full rounded-lg border p-2 dark:bg-zinc-800 cursor-pointer"
                    required
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} ({u.codigo})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">Senha Inicial * (mínimo 6 caracteres):</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newUserForm.senhaInicial}
                  onChange={(e) => setNewUserForm({ ...newUserForm, senhaInicial: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Confirmar Senha Inicial *:</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newUserForm.confirmarSenha}
                  onChange={(e) => setNewUserForm({ ...newUserForm, confirmarSenha: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  disabled={isCreatingUser}
                  className="rounded-lg border px-3 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isCreatingUser && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Criar Usuário</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO ACS */}
      {showNewAcsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Cadastrar Novo Agente Comunitário de Saúde (ACS)
            </h3>

            <form onSubmit={handleCreateAcs} className="space-y-3 text-xs font-medium">
              <div>
                <label className="block font-semibold mb-1">Nome Completo *:</label>
                <input
                  type="text"
                  placeholder="Ex: Maria da Silva"
                  value={newAcsForm.nome}
                  onChange={(e) => setNewAcsForm({ ...newAcsForm, nome: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">E-mail corporativo *:</label>
                <input
                  type="email"
                  placeholder="maria.silva@usf.gov.br"
                  value={newAcsForm.email}
                  onChange={(e) => setNewAcsForm({ ...newAcsForm, email: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Telefone (Opcional):</label>
                <input
                  type="text"
                  placeholder="(24) 99999-8888"
                  value={newAcsForm.telefone}
                  onChange={(e) => setNewAcsForm({ ...newAcsForm, telefone: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Unidade de Saúde:</label>
                {(role as string) === "GERENTE" ? (
                  <input
                    type="text"
                    value={selectedUnitObj?.nome || "USF Arrozal 3"}
                    disabled
                    className="w-full rounded-lg border p-2 bg-zinc-100 dark:bg-zinc-800 font-bold"
                  />
                ) : (
                  <select
                    value={newAcsForm.unidadeId || selectedUnitId}
                    onChange={(e) => setNewAcsForm({ ...newAcsForm, unidadeId: e.target.value })}
                    className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                    required
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} ({u.codigo})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAcsForm.criarAuthImediato}
                    onChange={(e) => setNewAcsForm({ ...newAcsForm, criarAuthImediato: e.target.checked })}
                    className="rounded border-zinc-300"
                  />
                  <span>Criar conta de login no Firebase Auth imediatamente</span>
                </label>
              </div>

              {newAcsForm.criarAuthImediato && (
                <div>
                  <label className="block font-semibold mb-1">Senha Inicial * (mínimo 6 caracteres):</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newAcsForm.senhaInicial}
                    onChange={(e) => setNewAcsForm({ ...newAcsForm, senhaInicial: e.target.value })}
                    className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewAcsModal(false)}
                  disabled={isCreatingAcs}
                  className="rounded-lg border px-3 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAcs}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isCreatingAcs && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Salvar ACS</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSOCIAR MICROÁREAS AO ACS */}
      {assignAcsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Associar Microáreas - {assignAcsTarget.nome}
            </h3>
            <p className="text-xs text-zinc-500">
              Selecione as microáreas da {selectedUnitObj?.nome || "USF Arrozal 3"} sob a responsabilidade deste ACS.
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3">
              {microareas
                .filter((m) => m.tipoMicroarea === "NORMAL")
                .map((m) => {
                  const isAssigned = selectedMicroareaIdsForAcs.includes(m.id);
                  const isOtherAcs = m.acsId && m.acsId !== assignAcsTarget.uid;

                  return (
                    <div
                      key={m.id}
                      onClick={() => handleToggleMicroareaCheckbox(m)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isAssigned
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40"
                          : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => {}}
                          className="rounded border-zinc-300"
                        />
                        <span className="font-extrabold text-zinc-900 dark:text-zinc-100">{m.nome}</span>
                      </div>

                      <div>
                        {isOtherAcs ? (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded">
                            Atual: {m.acsNome || "Outro ACS"} (Clique para transferir)
                          </span>
                        ) : isAssigned ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded">
                            Atribuída a este ACS
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">Disponível</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignAcsTarget(null)}
                className="rounded-lg border px-4 py-2 text-xs font-bold cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFLITO / CONFIRMAÇÃO DE TRANSFERÊNCIA DE RESPONSABILIDADE */}
      {transferConflictPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/60 space-y-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-extrabold text-base">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <h3>Transferência de Responsabilidade</h3>
            </div>

            <p className="text-xs text-zinc-700 dark:text-zinc-300">
              A <strong>{transferConflictPrompt.microareaNome}</strong> já possui um ACS responsável:
              <br />
              <strong className="text-amber-700 dark:text-amber-300 font-extrabold">{transferConflictPrompt.existingAcsNome}</strong>.
              <br /><br />
              Deseja transferir a responsabilidade desta microárea para <strong>{assignAcsTarget?.nome}</strong>?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTransferConflictPrompt(null)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmTransferMicroarea}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 cursor-pointer"
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span>Transferir Responsabilidade</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR ACESSO FIREBASE AUTH */}
      {createAccessTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Criar Acesso Firebase Auth – {createAccessTarget.nome}
            </h3>

            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Nome:</span>
                <span className="font-extrabold text-zinc-900 dark:text-zinc-100">{createAccessTarget.nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">E-mail:</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{createAccessTarget.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Unidade de Saúde:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {selectedUnitObj?.nome || createAccessTarget.unidadeId || "USF Arrozal 3"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Perfil:</span>
                <span className="font-bold text-purple-600 dark:text-purple-400">{createAccessTarget.perfil || "ACS"}</span>
              </div>
            </div>

            {createAccessError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium">
                {createAccessError}
              </div>
            )}

            {createAccessSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-medium">
                {createAccessSuccess}
              </div>
            )}

            <form onSubmit={handleCreateAccessForLegacyUser} className="space-y-3 text-xs font-medium">
              <div>
                <label className="block font-semibold mb-1">Senha Temporária * (mínimo 6 caracteres):</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={createAccessForm.senhaInicial}
                  onChange={(e) => setCreateAccessForm({ ...createAccessForm, senhaInicial: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Confirmar Senha *:</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={createAccessForm.confirmarSenha}
                  onChange={(e) => setCreateAccessForm({ ...createAccessForm, confirmarSenha: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    className="rounded border-zinc-300"
                  />
                  <span>Exigir alteração de senha no primeiro acesso</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateAccessTarget(null)}
                  disabled={isCreatingAccess}
                  className="rounded-lg border px-3 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAccess}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isCreatingAccess && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Criar Acesso</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REDEFINIR SENHA TEMPORÁRIA */}
      {resetPassTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Redefinir Senha Temporária - {resetPassTarget.nome}
            </h3>

            {resetPassError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium">
                {resetPassError}
              </div>
            )}

            {resetPassSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-medium">
                {resetPassSuccess}
              </div>
            )}

            <form onSubmit={handleDirectPasswordReset} className="space-y-3 text-xs font-medium">
              <div>
                <label className="block font-semibold mb-1">Nova Senha Temporária * (mínimo 6 caracteres):</label>
                <input
                  type="password"
                  value={resetPassForm.novaSenha}
                  onChange={(e) => setResetPassForm({ ...resetPassForm, novaSenha: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Confirmar Nova Senha *:</label>
                <input
                  type="password"
                  value={resetPassForm.confirmarSenha}
                  onChange={(e) => setResetPassForm({ ...resetPassForm, confirmarSenha: e.target.value })}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPassTarget(null)}
                  disabled={isResettingPass}
                  className="rounded-lg border px-3 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isResettingPass}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  Definir Nova Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSOCIAR ACS À MICROÁREA DIRETO DA TABELA */}
      {editingMicroarea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Associar ACS Responsável - {editingMicroarea.nome}
            </h3>

            <div className="space-y-3 text-xs font-medium">
              <div>
                <label className="block font-semibold mb-1">Selecione o ACS Responsável:</label>
                <select
                  value={selectedAcsForMicroarea}
                  onChange={(e) => setSelectedAcsForMicroarea(e.target.value)}
                  className="w-full rounded-lg border p-2 dark:bg-zinc-800 cursor-pointer"
                >
                  <option value="">Nenhum (Sem ACS atribuído)</option>
                  {acsUsers.map((a) => (
                    <option key={a.uid} value={a.uid}>
                      {a.nome} ({a.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingMicroarea(null)}
                  className="rounded-lg border px-3 py-1.5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMicroareaAcs}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-white font-bold cursor-pointer"
                >
                  Salvar Associação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
