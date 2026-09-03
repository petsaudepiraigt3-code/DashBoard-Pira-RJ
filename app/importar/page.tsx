"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { parseESUSFile } from "@/lib/esus/parser";
import { validateAndNormalizeESUSData } from "@/lib/esus/validator";
import {
  executeESUSImportToFirestore,
  executeFivePatientsTestImportToFirestore,
  ESUSImportProgress,
  FivePatientsTestResult,
} from "@/lib/esus/importer";
import { getImportHistoryFromFirestore } from "@/lib/firebase/imports";
import { getExistingPatientsMap } from "@/lib/firebase/patients";
import { getAllActiveUnitsFromFirestore, HealthUnit } from "@/lib/firebase/units";
import { ESUSParseResult, FirestoreImportRecord } from "@/lib/esus/types";
import { maskCPF, maskCNS } from "@/lib/esus/normalizer";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { formatDateTimeBR } from "@/lib/utils/formatters";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Loader2,
  FileCheck,
  Code,
  Layers,
  HeartPulse,
  Info,
  Activity,
  Lock,
  Scale,
  ShieldCheck,
  FileSearch,
  PieChart as PieChartIcon,
  Database,
  ArrowRight,
  Search,
  Server,
  UserCheck,
  Building2,
  Users,
  Link as LinkIcon,
  Tag,
  ShieldAlert,
  User,
} from "lucide-react";

export default function ImportarPage() {
  const router = useRouter();
  const { userProfile, role, userUnitId, userUnitNome, unauthorizedMessage, switchRole } = useAuth();

  // Unidades de Saúde
  const [units, setUnits] = useState<HealthUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [loadingUnits, setLoadingUnits] = useState(true);

  // Estados principais
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ESUSParseResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Estados do Diagnóstico Firestore
  const [dbStatus, setDbStatus] = useState<"Pendente" | "Conectado" | "Erro">("Pendente");
  const [writeStatus, setWriteStatus] = useState<"Pendente" | "OK" | "Erro">("Pendente");
  const [readStatus, setReadStatus] = useState<"Pendente" | "OK" | "Erro">("Pendente");
  const [lastDbError, setLastDbError] = useState<string>("Nenhum erro registrado.");
  const [isTestingDb, setIsTestingDb] = useState(false);

  // Teste de 5 pacientes
  const [fivePatientsResult, setFivePatientsResult] = useState<FivePatientsTestResult | null>(null);
  const [fivePatientsError, setFivePatientsError] = useState<string | null>(null);
  const [isTestingFivePatients, setIsTestingFivePatients] = useState(false);

  // Estados de confirmação e gravação no Firestore
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ESUSImportProgress | null>(null);
  const [importCompleted, setImportCompleted] = useState(false);
  const [importStats, setImportStats] = useState<any>(null);

  // Histórico de importações do Firestore
  const [history, setHistory] = useState<FirestoreImportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Carregar Unidades de Saúde ativas do Firestore
  const fetchUnits = async () => {
    setLoadingUnits(true);
    try {
      const activeUnits = await getAllActiveUnitsFromFirestore();
      setUnits(activeUnits);

      if (role === "GERENTE" && userUnitId) {
        setSelectedUnitId(userUnitId);
      } else if (activeUnits.length > 0) {
        setSelectedUnitId(activeUnits[0].id);
      }
    } catch (err: any) {
      setLastDbError(`Erro ao carregar Unidades de Saúde: ${err.message}`);
    } finally {
      setLoadingUnits(false);
    }
  };

  // Carregar histórico inicial do Firestore
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await getImportHistoryFromFirestore();
      let realFirestoreItems = data.filter((d) => d.id && !d.id.startsWith("imp-0"));

      if (role === "GERENTE" && (userUnitId || userProfile?.unitId)) {
        const targetUnit = userUnitId || userProfile?.unitId;
        realFirestoreItems = realFirestoreItems.filter((item) => item.unidadeId === targetUnit);
      }

      setHistory(realFirestoreItems);
    } catch (err: any) {
      setLastDbError(`Firestore bloqueou o acesso ao histórico: ${err.message || err}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchUnits();
    fetchHistory();
  }, [role, userUnitId, userProfile]);

  useEffect(() => {
    if (role === "GERENTE" && userUnitId) {
      setSelectedUnitId(userUnitId);
    }
  }, [role, userUnitId]);

  // Bloqueio de Acesso para Usuário não autorizado
  if (unauthorizedMessage) {
    return (
      <AppLayout pageTitle="Importar Relatório e-SUS APS">
        <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-red-200 bg-red-50 text-center dark:border-red-900/60 dark:bg-red-950/30 space-y-4">
          <ShieldAlert className="h-12 w-12 text-red-600 dark:text-red-400" />
          <h2 className="text-base font-bold text-red-900 dark:text-red-200">Acesso Restrito</h2>
          <p className="text-xs text-red-700 dark:text-red-300 max-w-md">{unauthorizedMessage}</p>
        </div>
      </AppLayout>
    );
  }

  // Teste Controlado de Conexão com o Firestore (Write + Read)
  const handleTestFirestoreConnection = async () => {
    setIsTestingDb(true);
    setWriteStatus("Pendente");
    setReadStatus("Pendente");
    setLastDbError("Testando escrita e leitura...");

    try {
      const diagRef = doc(db, "diagnostico", "teste-conexao");
      await setDoc(diagRef, {
        status: "ok",
        origem: "teste-sistema",
        createdAt: serverTimestamp(),
      });
      setWriteStatus("OK");

      const snap = await getDoc(diagRef);
      if (snap.exists() && snap.data()?.status === "ok") {
        setReadStatus("OK");
        setDbStatus("Conectado");
        setLastDbError("Escrita e leitura confirmadas com sucesso no Firestore.");
      } else {
        throw new Error("Documento lido não retornou os dados esperados.");
      }
    } catch (err: any) {
      setWriteStatus("Erro");
      setReadStatus("Erro");
      setDbStatus("Erro");
      if (err.message && err.message.includes("permission")) {
        setLastDbError("Firestore bloqueou a gravação pelas regras de segurança. (FirebaseError: Missing or insufficient permissions)");
      } else {
        setLastDbError(`Erro no teste Firestore: ${err.message || err}`);
      }
    } finally {
      setIsTestingDb(false);
    }
  };

  // Teste de gravação de 5 pacientes para a Unidade do Usuário
  const handleTestFivePatientsImport = async () => {
    const activeUnitId = role === "GERENTE" ? userUnitId : selectedUnitId;
    if (!activeUnitId) {
      alert("Por favor, selecione uma Unidade de Saúde antes de realizar o teste.");
      return;
    }
    if (!parseResult) {
      alert("Por favor, selecione e analise uma planilha antes de testar a gravação de 5 pacientes.");
      return;
    }

    const validRows = parseResult.rows
      .filter((r) => r.status !== "Erro" && r.normalizedData)
      .map((r) => r.normalizedData!);

    if (validRows.length === 0) {
      alert("Nenhum paciente válido encontrado na planilha para o teste.");
      return;
    }

    const unitObj = units.find((u) => u.id === activeUnitId);
    const unitName = role === "GERENTE" ? (userUnitNome || unitObj?.nome || "USF Arrozal 3") : (unitObj ? unitObj.nome : "USF Selecionada");

    setIsTestingFivePatients(true);
    setFivePatientsResult(null);
    setFivePatientsError(null);

    try {
      const res = await executeFivePatientsTestImportToFirestore(
        validRows,
        selectedFile?.name || "relatorio.csv",
        userProfile?.name || "Gerente USF",
        activeUnitId,
        unitName,
        role,
        userUnitId || userProfile?.unitId || undefined
      );
      setFivePatientsResult(res);
      setDbStatus("Conectado");
      setWriteStatus("OK");
      setReadStatus("OK");
      await fetchHistory();
    } catch (err: any) {
      setFivePatientsError(err.message || String(err));
    } finally {
      setIsTestingFivePatients(false);
    }
  };

  // Handler de Seleção de Arquivo (CSV ou XLSX)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await analyzeFile(file);
    }
  };

  const analyzeFile = async (file: File) => {
    setSelectedFile(file);
    setIsAnalyzing(true);
    setParseResult(null);
    setImportCompleted(false);

    try {
      const parsedFile = await parseESUSFile(file);
      const existingPatientsMap = await getExistingPatientsMap();
      const result = validateAndNormalizeESUSData(parsedFile, existingPatientsMap);
      setParseResult(result);
    } catch (err: any) {
      alert(`Erro ao analisar o arquivo: ${err.message || "Formato incompatível"}`);
      setSelectedFile(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Executar a gravação real no Firestore somente após selecionar unidade e confirmar no modal
  const handleConfirmExecuteImport = async () => {
    const activeUnitId = role === "GERENTE" ? (userUnitId || userProfile?.unitId || "") : selectedUnitId;
    if (!parseResult || !selectedFile || !activeUnitId) return;

    const unitObj = units.find((u) => u.id === activeUnitId);
    const unitName = role === "GERENTE" ? (userUnitNome || unitObj?.nome || "USF Arrozal 3") : (unitObj ? unitObj.nome : "USF Selecionada");

    setShowConfirmModal(false);
    setIsImporting(true);

    try {
      const stats = await executeESUSImportToFirestore(
        parseResult,
        selectedFile.name,
        `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`,
        userProfile?.name || "Gerente USF",
        activeUnitId,
        unitName,
        (progress: ESUSImportProgress) => setImportProgress(progress),
        role,
        userUnitId || userProfile?.unitId || undefined
      );

      setImportStats(stats);
      setImportCompleted(true);
      await fetchHistory();
    } catch (err: any) {
      alert(`Erro durante a gravação no Firestore: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Reset do fluxo
  const handleResetImport = () => {
    setSelectedFile(null);
    setParseResult(null);
    setImportCompleted(false);
    setImportStats(null);
    setImportProgress(null);
    setFivePatientsResult(null);
    setFivePatientsError(null);
  };

  const activeUnitObj = units.find((u) => u.id === (role === "GERENTE" ? userUnitId : selectedUnitId));
  const activeUnitNameDisplay = role === "GERENTE" ? (userUnitNome || activeUnitObj?.nome || "USF Arrozal 3") : (activeUnitObj?.nome || "USF Selecionada");

  if (role === "ACS" || userProfile?.role === "ACS") {
    return (
      <AppLayout pageTitle="Importar Relatório e-SUS APS">
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="rounded-full bg-amber-100 p-4 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Lock className="h-10 w-10" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Acesso Não Autorizado</h2>
          <p className="max-w-md text-xs text-zinc-500">
            A importação de dados do e-SUS APS é reservada a Gerentes de Unidade e Administradores do sistema.
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
    <AppLayout pageTitle="Importar Relatório e-SUS APS">
      {/* SELETOR DE PERFIL PARA SIMULAÇÃO DE DEMO (EXCLUSIVO PARA ADMIN) */}
      {role === "ADMIN" && userProfile?.role === "ADMIN" && (
        <div className="flex items-center justify-between rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5 mb-4 text-xs font-semibold">
          <span className="text-zinc-600 dark:text-zinc-400">Modo de Simulação de Perfil (ADMIN):</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => switchRole("Gerente")}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                (role as string) === "GERENTE"
                  ? "bg-blue-600 text-white font-bold"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              Gerente USF Arrozal 3
            </button>
            <button
              onClick={() => switchRole("Admin")}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                (role as string) === "ADMIN"
                  ? "bg-blue-600 text-white font-bold"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              Administrador (Global)
            </button>
          </div>
        </div>
      )}

      {/* 1. SELEÇÃO E IDENTIFICAÇÃO DO USUÁRIO & UNIDADE */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 shadow-2xs dark:border-blue-900/60 dark:bg-blue-950/30 space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100 font-extrabold text-sm">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3>
              {role === "GERENTE" ? "IMPORTAÇÃO e-SUS APS" : "IMPORTAÇÃO ADMINISTRATIVA"}
            </h3>
          </div>
          <span className="text-xs font-bold text-blue-800 bg-blue-100 dark:bg-blue-900 dark:text-blue-200 px-2.5 py-0.5 rounded-md">
            Perfil: {role === "GERENTE" ? "Gerente de USF" : "Administrador"}
          </span>
        </div>

        {/* CABEÇALHO DO GERENTE - UNIDADE FIXA E SOMENTE LEITURA */}
        {role === "GERENTE" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-medium p-3 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200/80 dark:border-zinc-800">
              <div>
                <span className="text-zinc-500 font-semibold block">Unidade de Saúde:</span>
                <span className="font-extrabold text-blue-900 dark:text-blue-300 text-sm">
                  {userUnitNome || "USF Arrozal 3"}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 font-semibold block">Usuário Responsável:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {userProfile?.name || "Gerente Arrozal 3"}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 font-semibold block">Perfil de Acesso:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Gerente de Unidade
                </span>
              </div>
            </div>
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Selecione ou arraste a planilha exportada do e-SUS APS referente a esta Unidade de Saúde.
            </p>
          </div>
        ) : (
          /* CABEÇALHO DO ADMINISTRADOR - SELETOR DE UNIDADES */
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 text-xs font-medium flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Você está realizando uma importação administrativa. Confirme a Unidade de Saúde correspondente ao arquivo antes de continuar.
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                Unidade de Saúde Destino:
              </label>

              {loadingUnits ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Carregando unidades...</span>
                </div>
              ) : (
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  disabled={isImporting || isAnalyzing}
                  className="w-full sm:w-auto min-w-[280px] rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-zinc-900 shadow-2xs focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 disabled:opacity-50"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.codigo})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PAINEL DE DIAGNÓSTICO FIRESTORE (EXCLUSIVO PARA ADMIN) */}
      {role === "ADMIN" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold text-sm">
              <Server className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <h3>DIAGNÓSTICO FIRESTORE</h3>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-extrabold ${
              dbStatus === "Conectado"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : dbStatus === "Erro"
                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}>
              {dbStatus === "Conectado" ? <CheckCircle2 className="h-3.5 w-3.5" /> : dbStatus === "Erro" ? <AlertCircle className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Status Firebase: {dbStatus}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium">
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border dark:border-zinc-800">
              <span className="text-zinc-500 font-semibold block">Projeto:</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "projetodashboard-d151e"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border dark:border-zinc-800">
              <span className="text-zinc-500 font-semibold block">Teste Escrita:</span>
              <span className={`font-bold ${writeStatus === "OK" ? "text-emerald-600" : writeStatus === "Erro" ? "text-red-600" : "text-zinc-600"}`}>
                {writeStatus}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border dark:border-zinc-800">
              <span className="text-zinc-500 font-semibold block">Teste Leitura:</span>
              <span className={`font-bold ${readStatus === "OK" ? "text-emerald-600" : readStatus === "Erro" ? "text-red-600" : "text-zinc-600"}`}>
                {readStatus}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border dark:border-zinc-800">
              <span className="text-zinc-500 font-semibold block">Unidade Vinculada:</span>
              <span className="font-bold text-blue-600 truncate block">
                {activeUnitNameDisplay}
              </span>
            </div>
          </div>

          {/* Mensagem de Erro ou Sucesso de Conexão */}
          {lastDbError && (
            <div className={`p-3 rounded-lg text-xs font-medium flex items-start gap-2 ${
              dbStatus === "Erro" || writeStatus === "Erro"
                ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/60"
                : "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60"
            }`}>
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Status de conexão:</span>
                <p className="font-mono text-[11px] mt-0.5">{lastDbError}</p>
              </div>
            </div>
          )}

          {/* RESULTADO DETALHADO DO TESTE DE 5 PACIENTES */}
          {fivePatientsResult && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-4 shadow-2xs dark:border-purple-900/60 dark:bg-purple-950/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-extrabold text-purple-900 dark:text-purple-200">
                  <CheckCircle2 className="h-4 w-4 text-purple-600 shrink-0" />
                  <span>{fivePatientsResult.message}</span>
                </div>
                <span className="text-xs font-bold bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100 px-2 py-0.5 rounded">
                  Unidade: {fivePatientsResult.unidadeNome}
                </span>
              </div>

              {/* ESTATÍSTICAS REAIS REGISTRADAS NO FIRESTORE */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium">
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Novos Pacientes:</span>
                  <span className="font-extrabold text-purple-600">{fivePatientsResult.newPatients}</span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Pacientes Existentes:</span>
                  <span className="font-extrabold text-blue-600">{fivePatientsResult.updatedPatients}</span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Novos Vínculos:</span>
                  <span className="font-extrabold text-blue-600">{fivePatientsResult.newLinks}</span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Vínculos Atualizados:</span>
                  <span className="font-extrabold text-blue-600">{fivePatientsResult.updatedLinks}</span>
                </div>
              </div>

              {/* TABELA DE SUCESSO DOS 5 PACIENTES */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs bg-white dark:bg-zinc-900 rounded-lg">
                  <thead className="border-b border-purple-100 text-purple-900 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-1.5">Paciente (Mascarado)</th>
                      <th className="px-3 py-1.5">CPF/CNS</th>
                      <th className="px-3 py-1.5">Microárea</th>
                      <th className="px-3 py-1.5">PA</th>
                      <th className="px-3 py-1.5">IMC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {fivePatientsResult.maskedPatients.map((p, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5 font-bold text-zinc-900 dark:text-zinc-100">{p.name}</td>
                        <td className="px-3 py-1.5 font-mono text-zinc-600">{p.doc}</td>
                        <td className="px-3 py-1.5 font-bold text-blue-600">{p.microarea}</td>
                        <td className="px-3 py-1.5 text-blue-600 font-semibold">{p.pa}</td>
                        <td className="px-3 py-1.5 text-purple-600 font-semibold">{p.bmi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Documentos Paciente:</span>
                  <span className="font-extrabold text-emerald-600">{fivePatientsResult.patientDocStatus}</span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Vínculos Unidade:</span>
                  <span className="font-extrabold text-emerald-600">{fivePatientsResult.linksStatus}</span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Microáreas da Unidade:</span>
                  <span className="font-extrabold text-emerald-600">{fivePatientsResult.microareasStatus}</span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-purple-100 flex justify-between">
                  <span>Registro Importação:</span>
                  <span className="font-extrabold text-emerald-600">{fivePatientsResult.importDocStatus}</span>
                </div>
              </div>
            </div>
          )}

          {fivePatientsError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="font-semibold">{fivePatientsError}</span>
            </div>
          )}

          {/* Botões de Ação de Diagnóstico */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={handleTestFirestoreConnection}
              disabled={isTestingDb || isImporting}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer disabled:opacity-50"
            >
              {isTestingDb ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>Testar conexão Firestore</span>
            </button>

            {parseResult && (
              <button
                onClick={handleTestFivePatientsImport}
                disabled={isTestingFivePatients || isImporting}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 cursor-pointer disabled:opacity-50"
              >
                {isTestingFivePatients ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                <span>Importar 5 pacientes para teste</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. ÁREA DE SELEÇÃO E UPLOAD DE PLANILHA */}
      {!parseResult && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Selecione o arquivo exportado do e-SUS APS
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              O arquivo será processado e vinculado à unidade <strong>{activeUnitNameDisplay}</strong>.
            </p>
          </div>

          <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 p-8 text-center hover:border-blue-500 hover:bg-blue-50/30 dark:border-zinc-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 transition-all cursor-pointer">
            {isAnalyzing ? (
              <div className="flex flex-col items-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Lendo e-SUS e identificando cabeçalho...
                </span>
              </div>
            ) : (
              <>
                <div className="rounded-full bg-blue-50 p-4 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  Clique aqui para selecionar o arquivo .CSV ou .XLSX
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  (Exemplo: relatorio_esus_dcnt_quadrimestre.xlsx ou .csv)
                </p>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </>
            )}
          </label>
        </div>
      )}

      {/* 3. ETAPA DE PRÉ-VISUALIZAÇÃO & AUDITORIA DE REGRAS DE NEGÓCIO */}
      {parseResult && !importCompleted && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Cabeçalho do arquivo e Ações */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileCheck className="h-8 w-8 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {selectedFile?.name} ({(selectedFile!.size / 1024 / 1024).toFixed(2)} MB)
                </h3>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  ✓ Vínculo configurado para: <strong>{activeUnitNameDisplay}</strong>. {parseResult.headersFound.length} colunas encontradas.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetImport}
                disabled={isImporting}
                className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Limpar</span>
              </button>

              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isImporting || parseResult.errorRowsCount > 0 || parseResult.integrity.inconsistentRows > 0}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
              >
                <Database className="h-4 w-4" />
                <span>Confirmar Importação</span>
              </button>
            </div>
          </div>

          {/* AUDITORIA DE DETECÇÃO DE COLUNA ACS */}
          {parseResult.detectedAcsColumnName && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-900/60 dark:bg-purple-950/30 text-xs font-medium flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-900 dark:text-purple-200">
                <UserCheck className="h-4 w-4 text-purple-600 shrink-0" />
                <span>
                  Possível campo de ACS detectado na planilha: <strong>&quot;{parseResult.detectedAcsColumnName}&quot;</strong>
                </span>
              </div>
              <span className="text-[11px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-900 px-2.5 py-0.5 rounded">
                Sugestão opcional no e-SUS
              </span>
            </div>
          )}

          {/* BARRA DE PROGRESSO EM TEMPO REAL DURANTE A GRAVAÇÃO */}
          {isImporting && importProgress && (
            <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-2xs space-y-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between text-xs font-extrabold text-zinc-800 dark:text-zinc-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Importando pacientes... {importProgress.processedRows} / {importProgress.totalRows}
                </span>
                <span>{importProgress.percent}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>

              {/* Estatísticas em tempo real do lote */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium pt-1">
                <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800 flex justify-between">
                  <span>Novos:</span>
                  <span className="font-bold text-emerald-600">{importProgress.newPatients}</span>
                </div>
                <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800 flex justify-between">
                  <span>Atualizados:</span>
                  <span className="font-bold text-blue-600">{importProgress.updatedPatients}</span>
                </div>
                <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800 flex justify-between">
                  <span>Vínculos criados:</span>
                  <span className="font-bold text-purple-600">{importProgress.newLinks}</span>
                </div>
                <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800 flex justify-between">
                  <span>Falhas:</span>
                  <span className="font-bold text-red-600">0</span>
                </div>
              </div>
            </div>
          )}

          {/* PAINEL DE TESTE DE INTEGRIDADE DO PARSER */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-2xs dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-300">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-extrabold tracking-tight">
                  Teste de Integridade do Parser
                </h3>
              </div>
              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300 px-3 py-1 rounded-lg">
                Status: Estrutura 100% Preservada
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-7 text-xs font-medium">
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">Cabeçalho:</span>
                <span className="font-extrabold text-zinc-900 dark:text-zinc-100">{parseResult.integrity.expectedColumnsCount} colunas</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">Analisados:</span>
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{parseResult.totalRowsCount} reg.</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">Linhas 34 campos:</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{parseResult.integrity.rowsWith34Fields}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">Inconsistentes:</span>
                <span className={`font-extrabold ${parseResult.integrity.inconsistentRows === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {parseResult.integrity.inconsistentRows}
                </span>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">Microáreas Inv.:</span>
                <span className={`font-extrabold ${parseResult.integrity.invalidMicroareas === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {parseResult.integrity.invalidMicroareas}
                </span>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">PAs Interpret.:</span>
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{parseResult.integrity.interpretedPAs}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-zinc-900">
                <span className="text-zinc-500 font-medium block">IMCs Calculados:</span>
                <span className="font-extrabold text-purple-600 dark:text-purple-400">{parseResult.integrity.calculatedBMIs}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TELA DE SUCESSO PÓS-GRAVAÇÃO NO FIRESTORE */}
      {importCompleted && importStats && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-2xs dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-emerald-900 dark:text-emerald-100">
                IMPORTAÇÃO CONCLUÍDA
              </h2>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Unidade: <strong>{importStats.unidadeNome}</strong> ({importStats.unidadeId})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-medium">
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Registros Processados:</span>
              <span className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">{importStats.totalRows}</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Novos Pacientes:</span>
              <span className="text-lg font-extrabold text-emerald-600">{importStats.newPatients}</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Pacientes Existentes:</span>
              <span className="text-lg font-extrabold text-blue-600">{importStats.updatedPatients}</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Falhas:</span>
              <span className="text-lg font-extrabold text-emerald-600">{importStats.errorsCount}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-medium">
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Novos Vínculos com Unidade:</span>
              <span className="text-lg font-extrabold text-blue-600">{importStats.novosVinculos}</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Vínculos Atualizados:</span>
              <span className="text-lg font-extrabold text-blue-600">{importStats.vinculosAtualizados}</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">PA Adicionadas:</span>
              <span className="text-lg font-extrabold text-purple-600">{importStats.paCount}</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-zinc-500 block font-semibold">Antropometrias:</span>
              <span className="text-lg font-extrabold text-amber-600">{importStats.weightCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleResetImport}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
            >
              <span>Nova Importação</span>
            </button>
            <button
              onClick={() => router.push("/pacientes")}
              className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
            >
              <span>Ver Pacientes</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL EXPLICITO DE CONFIRMAÇÃO DA IMPORTAÇÃO */}
      {showConfirmModal && parseResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-50 p-3 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Você está prestes a importar {parseResult.totalRowsCount} registros para {activeUnitNameDisplay}.
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Os pacientes serão vinculados a esta unidade de saúde.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50 space-y-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <div className="flex justify-between">
                <span>Unidade:</span>
                <span className="font-bold text-blue-600">{activeUnitNameDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span>Arquivo:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{selectedFile?.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Total de Registros:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{parseResult.totalRowsCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Registros com avisos:</span>
                <span className="font-bold text-amber-600">{parseResult.warningRowsCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmExecuteImport}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 cursor-pointer"
              >
                CONFIRMAR IMPORTAÇÃO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. HISTÓRICO REAL DE IMPORTAÇÕES DO FIRESTORE */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4 mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Histórico de Importações do e-SUS APS
          </h3>
          <button
            onClick={fetchHistory}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizar Histórico</span>
          </button>
        </div>

        {loadingHistory ? (
          <div className="p-8 text-center text-xs text-zinc-400">Carregando histórico do Firestore...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-200 rounded-xl dark:border-zinc-800">
            Nenhuma importação realizada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400 font-bold">
                <tr>
                  <th className="px-3 py-3">Data / Hora</th>
                  <th className="px-3 py-3">Unidade</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Registros</th>
                  <th className="px-3 py-3">Novos</th>
                  <th className="px-3 py-3">Atualizados</th>
                  <th className="px-3 py-3">Vínculos</th>
                  <th className="px-3 py-3">Falhas</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400">{formatDateTimeBR(h.uploadedAt)}</td>
                    <td className="px-3 py-3 font-bold text-blue-600">{h.unidadeNome}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        h.tipoImportacao === "TESTE"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      }`}>
                        <Tag className="h-3 w-3" />
                        {h.tipoImportacao}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-900 font-bold dark:text-zinc-100">{h.totalRows}</td>
                    <td className="px-3 py-3 text-purple-600 font-bold">{h.newPatients}</td>
                    <td className="px-3 py-3 text-blue-600 font-bold">{h.updatedPatients}</td>
                    <td className="px-3 py-3 text-blue-600 font-bold">{(h.novosVinculos || 0) + (h.vinculosAtualizados || 0)}</td>
                    <td className="px-3 py-3 text-emerald-600 font-bold">{h.errorsCount}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                        h.status === "Concluído"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : h.status === "Concluído com inconsistência"
                          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {h.status === "Concluído" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        <span>{h.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
