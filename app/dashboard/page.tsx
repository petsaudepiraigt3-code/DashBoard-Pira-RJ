"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { CardIndicator } from "@/components/ui/card-indicator";
import { BadgePriority } from "@/components/ui/badge-priority";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { BarChartSVG, DonutChartSVG } from "@/components/ui/charts";
import { getAllPatientsFromStore } from "@/lib/store/patients";
import { getUnitAdministrativeDiagnostics, normalizeUnitId } from "@/lib/store/units";
import { DEFAULT_DCNT_PARAMETERS, getDcntParametersFromStore } from "@/lib/store/parameters";
import { DcntParameters, Patient, BoaPraticaCode } from "@/types/dcnt";
import { useRouter } from "next/navigation";
import { formatDateBR } from "@/lib/utils/formatters";
import { monthsSinceDate } from "@/lib/utils/priority";
import {
  BOAS_PRATICAS_CATALOG,
  evaluatePatientBoasPraticas,
  getEffectiveBoasPraticasParams,
} from "@/lib/utils/boas-praticas";
import {
  Users,
  UserCheck,
  Activity,
  AlertTriangle,
  Clock,
  Heart,
  Scale,
  Flame,
  ArrowRight,
  Filter,
  Calendar,
  FileText,
} from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { getSortedPendingReturns } from "@/lib/utils/returns";
import { RegisterActionModal } from "@/components/ui/register-action-modal";
import {
  isIdoso,
  isCriancaAte2Anos,
  isObesidade,
  isPAAlterada,
  isSemPARecente,
  isSemVisitaACS,
  isSobrepeso,
} from "@/lib/utils/patient-filters";
import { generateManagerPDFReport } from "@/lib/utils/pdf-generator";

export default function DashboardPage() {
  const router = useRouter();
  const { role, userUnitId, userUnitNome, userProfile, loading: authLoading } = useAuth();

  // Estado dos Pacientes (Supabase)
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [coverageStats, setCoverageStats] = useState<any>(null);
  const [dcntParams, setDcntParams] = useState<DcntParameters>(DEFAULT_DCNT_PARAMETERS);

  // Modal de Ação Operacional
  const [selectedPatientForAction, setSelectedPatientForAction] = useState<Patient | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  // Carregar dados reais (Supabase PostgreSQL) garantindo que o perfil autenticado esteja carregado
  useEffect(() => {
    if (authLoading || !userProfile) return;
    const profile = userProfile;
    const activeUnit = profile.unitId || userUnitId;
    let cancelled = false;
    async function loadPatients() {
      setLoadingPatients(true);
      const [realData, loadedParams] = await Promise.all([
        getAllPatientsFromStore({
          role: profile.role,
          userUnitId: activeUnit,
          assignedMicroareaCodes: profile.role === "ACS" ? profile.assignedMicroareaCodes : undefined,
          acsName: profile.role === "ACS" ? profile.name : undefined,
          acsId: profile.role === "ACS" ? profile.uid : undefined,
        }),
        getDcntParametersFromStore(),
      ]);
      if (cancelled) return;
      const loadedList = realData || [];
      setPatients(loadedList);
      setDcntParams(loadedParams);
      setLoadingPatients(false);

      if (activeUnit) {
        getUnitAdministrativeDiagnostics(activeUnit, loadedList)
          .then((diag) => {
            if (!cancelled) setCoverageStats(diag);
          })
          .catch(() => {});
      }
    }
    loadPatients();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userProfile?.role, userProfile?.unitId, userProfile?.uid, userProfile?.assignedMicroareaCodes?.join(",")]);

  // Filtros Globais
  const [filterACS, setFilterACS] = useState("Todos");
  const [filterMicroarea, setFilterMicroarea] = useState("Todas");
  const [filterSex, setFilterSex] = useState("Todos");
  const [filterAgeGroup, setFilterAgeGroup] = useState("Todas");
  const [filterCondition, setFilterCondition] = useState("Todas");
  const [periodFilter, setPeriodFilter] = useState("Últimos 12 meses");

  // Função para construir URL da tela Pacientes preservando os filtros superiores de ACS e Microárea
  const buildPacientesUrl = (filtroKey?: string) => {
    const params = new URLSearchParams();
    if (filtroKey) {
      params.set("filtro", filtroKey);
    }
    if (filterACS !== "Todos") {
      params.set("acs", filterACS);
    }
    if (filterMicroarea !== "Todas") {
      params.set("microarea", filterMicroarea);
    }
    const queryString = params.toString();
    return queryString ? `/pacientes?${queryString}` : "/pacientes";
  };

  // Sincronizar filtros automáticos do perfil ACS (mantendo "Todos"/"Todas" para exibir todas as microáreas atribuídas ao ACS)
  useEffect(() => {
    if (role === "ACS") {
      setFilterACS("Todos");
      setFilterMicroarea("Todas");
    }
  }, [role, userProfile]);

  const normUnitId = userUnitId ? normalizeUnitId(userUnitId) : null;

  // Lista dinâmica de ACS e Microáreas da unidade para filtros do Gerente e Admin
  const availableACSList = Array.from(
    new Set(patients.map((p) => p.acsName))
  ).filter(Boolean).sort();

  const availableMicroareasList = Array.from(
    new Set(patients.map((p) => p.microarea))
  ).filter(Boolean).sort();

  const normalizedAcsCodes = (userProfile?.assignedMicroareaCodes || []).map((c) => {
    const d = String(c || "").replace(/\D/g, "").trim();
    return d ? d.padStart(2, "0") : String(c || "").trim();
  });

  // Filtragem dos pacientes considerando perfil e filtros selecionados
  const filteredPatients = patients.filter((pat: any) => {
    const pUnitId = normalizeUnitId(pat.unidadeId);
    if (role === "ACS") {
      if (normUnitId && pUnitId.toUpperCase() !== normUnitId.toUpperCase()) return false;
      const rawDigits = (pat.microarea || "").replace(/\D/g, "").trim() || (pat.microareaCodigo || "").replace(/\D/g, "").trim();
      const patMACode = rawDigits ? rawDigits.padStart(2, "0") : (pat.microareaCodigo || "");
      if (normalizedAcsCodes.length === 0 || (!normalizedAcsCodes.includes(patMACode) && !(rawDigits && normalizedAcsCodes.includes(rawDigits)))) {
        return false;
      }
    }
    if (filterACS !== "Todos" && pat.acsName !== filterACS) return false;
    if (filterMicroarea !== "Todas" && pat.microarea !== filterMicroarea) return false;
    if (filterSex !== "Todos" && pat.sex !== filterSex) return false;

    const elderlyCutoff = dcntParams.elderlyAgeCutoff ?? 60;
    if (filterAgeGroup === "Idosos (60+)" && pat.age < elderlyCutoff) return false;
    if (filterAgeGroup === "Adultos (18-59)" && (pat.age < 18 || pat.age >= elderlyCutoff)) return false;
    if (filterAgeGroup === "Crianças (0-2)" && !isCriancaAte2Anos(pat, dcntParams)) return false;

    if (filterCondition === "Hipertensão" && !pat.hasHypertension) return false;
    if (filterCondition === "Diabetes" && !pat.hasDiabetes) return false;
    if (filterCondition === "Obesidade" && !isObesidade(pat, dcntParams)) return false;
    if (filterCondition === "Tabagismo" && !pat.isSmoker) return false;

    return true;
  });

  // Cálculo de Estado Nutricional Mutuamente Exclusivo por IMC (parametrizado)
  let adequadoCount = 0;
  let sobrepesoCount = 0;
  let obesidadeCount = 0;
  let semInformacaoCount = 0;

  const obesityCutoff = dcntParams.obesityImcCutoff ?? 30;
  const overweightCutoff = dcntParams.overweightImcCutoff ?? 25;

  filteredPatients.forEach((p) => {
    const imc = p.lastWeight?.imc ?? (p as any).imcAtual;
    if (imc == null || typeof imc !== "number" || isNaN(imc) || imc <= 0) {
      semInformacaoCount++;
    } else if (imc >= obesityCutoff) {
      obesidadeCount++;
    } else if (imc >= overweightCutoff) {
      sobrepesoCount++;
    } else {
      adequadoCount++;
    }
  });

  // Métricas para os Cards (parametrizadas)
  const totalCadastrados = filteredPatients.length;
  const countIdosos = filteredPatients.filter((p) => isIdoso(p, dcntParams)).length;
  const countSobrepeso = sobrepesoCount;
  const countObesidade = obesidadeCount;
  const countPAAlterada = filteredPatients.filter((p) => isPAAlterada(p, dcntParams)).length;
  const countSemPARecente = filteredPatients.filter((p) => isSemPARecente(p, dcntParams)).length;
  const countSemAcompanhamento = filteredPatients.filter((p) => isSemVisitaACS(p, dcntParams)).length;
  const countBuscaAtivaAlta = filteredPatients.filter((p) => p.priority === "Alta").length;

  // Dados dos Gráficos (Categorias Mutuamente Exclusivas)
  const nutritionalData = [
    { label: "Adequado", value: adequadoCount, color: "text-emerald-500" },
    { label: "Sobrepeso", value: sobrepesoCount, color: "text-amber-500" },
    { label: "Obesidade", value: obesidadeCount, color: "text-red-500" },
    { label: "Sem informação", value: semInformacaoCount, color: "text-zinc-400" },
  ];

  const maxMonthsPA = dcntParams.monthsWithoutPA ?? 6;
  const bpData = [
    {
      label: `Acompanhamento recente (≤ ${maxMonthsPA} meses)`,
      value: filteredPatients.filter((p) => p.lastPA?.date && monthsSinceDate(p.lastPA.date) <= maxMonthsPA).length,
      color: "bg-emerald-600",
    },
    {
      label: `${maxMonthsPA} a 12 meses`,
      value: filteredPatients.filter((p) => {
        if (!p.lastPA?.date) return false;
        const m = monthsSinceDate(p.lastPA.date);
        return m > maxMonthsPA && m <= 12;
      }).length,
      color: "bg-amber-500",
    },
    {
      label: "Mais de 12 meses",
      value: filteredPatients.filter((p) => {
        if (!p.lastPA?.date) return false;
        const m = monthsSinceDate(p.lastPA.date);
        return m > 12 && m !== 999;
      }).length,
      color: "bg-red-600",
    },
    {
      label: "Sem informação",
      value: filteredPatients.filter((p) => !p.lastPA?.date).length,
      color: "bg-zinc-400",
    },
  ];

  const conditionsData = [
    { label: "Hipertensão", value: filteredPatients.filter((p) => p.hasHypertension).length, color: "bg-blue-600" },
    { label: "Diabetes", value: filteredPatients.filter((p) => p.hasDiabetes).length, color: "bg-purple-600" },
    { label: "Obesidade", value: countObesidade, color: "bg-red-600" },
    { label: "Tabagismo", value: filteredPatients.filter((p) => p.isSmoker).length, color: "bg-amber-600" },
    { label: "Doença Cardiovascular", value: filteredPatients.filter((p) => p.hasCardiovascularDisease).length, color: "bg-rose-600" },
  ];

  // Atenção Necessária (priorizando Alta/Média/Atenção; se todos estiverem Acompanhados, exibe os pacientes da unidade)
  const priorityFiltered = filteredPatients.filter(
    (p) => p.priority === "Alta" || p.priority === "Média" || p.priority === "Atenção"
  );
  const atencaoNecessaria = priorityFiltered.length > 0 ? priorityFiltered : filteredPatients;
  const displayedAtencaoNecessaria = atencaoNecessaria.slice(0, 15);

  const sortedPendingReturns = useMemo(
    () => getSortedPendingReturns(filteredPatients),
    [filteredPatients]
  );
  const pendingReturnsAtrasadosCount = useMemo(
    () => sortedPendingReturns.filter((i) => i.status === "Atrasado").length,
    [sortedPendingReturns]
  );
  const pendingReturnsHojeCount = useMemo(
    () => sortedPendingReturns.filter((i) => i.status === "Hoje").length,
    [sortedPendingReturns]
  );
  const pendingReturnsAgendadosCount = useMemo(
    () => sortedPendingReturns.filter((i) => i.status === "Agendado").length,
    [sortedPendingReturns]
  );

  // Estatísticas das 6 Boas Práticas (Diabetes e Hipertensão — Grau de Atenção do ACS)
  const boasPraticasOverview = (() => {
    const bpParams = getEffectiveBoasPraticasParams(dcntParams);
    const hasDmPatients = filteredPatients.filter((p) => p.hasHypertension || p.hasDiabetes);
    const summaries = hasDmPatients.map((p) => evaluatePatientBoasPraticas(p, dcntParams));

    const totalHasDm = hasDmPatients.length;
    const avgCompleted =
      totalHasDm > 0
        ? (summaries.reduce((acc, s) => acc + s.completedCount, 0) / totalHasDm).toFixed(1)
        : "0";
    const avgTotal =
      totalHasDm > 0
        ? Math.round(summaries.reduce((acc, s) => acc + s.totalApplicableCount, 0) / totalHasDm)
        : 6;
    const avgRate =
      totalHasDm > 0
        ? Math.round(summaries.reduce((acc, s) => acc + s.complianceRate, 0) / totalHasDm)
        : 0;

    const attentionCounts = {
      Alta: summaries.filter((s) => s.attentionLevel === "Alta").length,
      "Média": summaries.filter((s) => s.attentionLevel === "Média").length,
      "Atenção": summaries.filter((s) => s.attentionLevel === "Atenção").length,
      Acompanhado: summaries.filter((s) => s.attentionLevel === "Acompanhado").length,
    };

    const codes: BoaPraticaCode[] = ["A", "B", "C", "D", "E", "F"];

    const items = codes.map((code) => {
      const meta = BOAS_PRATICAS_CATALOG[code];
      let applicableCount = 0;
      let fulfilledCount = 0;
      summaries.forEach((s) => {
        const it = s.items.find((i) => i.code === code);
        if (it && it.applicable) {
          applicableCount++;
          if (it.fulfilled) fulfilledCount++;
        }
      });
      const pendingCount = Math.max(0, applicableCount - fulfilledCount);
      const pct = applicableCount > 0 ? Math.round((fulfilledCount / applicableCount) * 100) : 0;

      return {
        code,
        shortTitle: meta.shortTitle,
        description: meta.description,
        applicableCount,
        fulfilledCount,
        pendingCount,
        pct,
      };
    });

    return {
      totalHasDm,
      avgCompleted,
      avgTotal,
      avgRate,
      attentionCounts,
      items,
    };
  })();

  // Handler de Geração do Relatório Gerencial em PDF
  const handleGeneratePDF = () => {
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const pendingReturns = {
      atrasados: pendingReturnsAtrasadosCount,
      hoje: pendingReturnsHojeCount,
      agendados: pendingReturnsAgendadosCount,
    };

    generateManagerPDFReport({
      unitName: userUnitNome || userProfile?.unitName || "USF Arrozal 3",
      userName: userProfile?.name || "Gerente Arrozal 3",
      userRole: role === "GERENTE" ? "Gerente de Unidade" : role === "ADMIN" ? "Administrador do Sistema" : role,
      generationDate: dateStr,
      filters: {
        filterACS,
        filterMicroarea,
        filterSex,
        filterAgeGroup,
        filterCondition,
        periodFilter,
      },
      patients: filteredPatients,
      coverageStats,
      pendingReturns,
    });
  };

  return (
    <AppLayout
      pageTitle="Dashboard — Saúde Digital Busca Ativa"
      periodFilter={periodFilter}
      setPeriodFilter={setPeriodFilter}
    >
      {/* Aviso de Fonte de Dados */}
      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
        <span>
          Fonte de Dados: {loadingPatients ? "Carregando..." : "Sincronizado com Supabase"}
        </span>
        <span className="italic">Este indicador não representa diagnóstico médico automático.</span>
      </div>

      {/* Barra de Filtros Globais */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Filtros Globais de Monitoramento</span>
          </div>

          {(role === "GERENTE" || role === "ADMIN") && (
            <button
              onClick={handleGeneratePDF}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
              title="Gerar Relatório Gerencial Consolidado em PDF"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Gerar Relatório PDF</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">ACS Responsável</label>
            {role === "ACS" ? (
              <div className="mt-1 flex items-center justify-between w-full rounded-lg border border-zinc-300 bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                <span>{userProfile?.name || "ACS teste 01"}</span>
                <span title="Filtro de ACS fixo para o perfil autenticado">🔒</span>
              </div>
            ) : (
              <select
                value={filterACS}
                onChange={(e) => setFilterACS(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 cursor-pointer"
              >
                <option value="Todos">Todos os ACS</option>
                {availableACSList.map((acsName) => (
                  <option key={acsName} value={acsName}>{acsName}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Microárea</label>
            {role === "ACS" ? (
              <div className="mt-1 flex items-center justify-between w-full rounded-lg border border-zinc-300 bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                <span>
                  {normalizedAcsCodes.length > 0
                    ? `Microárea ${normalizedAcsCodes.join(", ")}`
                    : "Sem microárea atribuída"}
                </span>
                <span title="Filtro de microárea fixo para o perfil ACS">🔒</span>
              </div>
            ) : (
              <select
                value={filterMicroarea}
                onChange={(e) => setFilterMicroarea(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 cursor-pointer"
              >
                <option value="Todas">Todas as Microáreas</option>
                {availableMicroareasList.map((maName) => (
                  <option key={maName} value={maName}>{maName}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Sexo</label>
            <select
              value={filterSex}
              onChange={(e) => setFilterSex(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="Todos">Todos</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Faixa Etária</label>
            <select
              value={filterAgeGroup}
              onChange={(e) => setFilterAgeGroup(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 cursor-pointer"
            >
              <option value="Todas">Todas</option>
              <option value="Crianças (0-2)">Crianças (0-2 anos)</option>
              <option value="Adultos (18-59)">Adultos (18-59)</option>
              <option value="Idosos (60+)">Idosos (60+)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Condição DCNT</label>
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="Todas">Todas as condições</option>
              <option value="Hipertensão">Hipertensão</option>
              <option value="Diabetes">Diabetes</option>
              <option value="Obesidade">Obesidade</option>
              <option value="Tabagismo">Tabagismo</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                if (role !== "ACS") {
                  setFilterACS("Todos");
                  setFilterMicroarea("Todas");
                }
                setFilterSex("Todos");
                setFilterAgeGroup("Todas");
                setFilterCondition("Todas");
              }}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Cards Clicáveis de Indicadores */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
        <CardIndicator
          title="Pessoas Cadastradas"
          value={totalCadastrados}
          badgeText="e-SUS APS"
          badgeVariant="blue"
          icon={Users}
          onClick={() => router.push(buildPacientesUrl())}
        />

        <CardIndicator
          title="Idosos (60+ anos)"
          value={countIdosos}
          badgeText={`${Math.round((countIdosos / (totalCadastrados || 1)) * 100)}%`}
          badgeVariant="purple"
          icon={UserCheck}
          onClick={() => router.push(buildPacientesUrl("idosos"))}
        />

        <CardIndicator
          title="Sobrepeso"
          value={countSobrepeso}
          badgeText="25 <= IMC < 30"
          badgeVariant="amber"
          icon={Scale}
          onClick={() => router.push(buildPacientesUrl("sobrepeso"))}
        />

        <CardIndicator
          title="Obesidade"
          value={countObesidade}
          badgeText="IMC >= 30"
          badgeVariant="red"
          icon={Flame}
          onClick={() => router.push(buildPacientesUrl("obesidade"))}
        />

        <CardIndicator
          title="PA Alterada"
          value={countPAAlterada}
          badgeText=">= 140/90"
          badgeVariant="red"
          icon={Activity}
          onClick={() => router.push(buildPacientesUrl("pa-alterada"))}
        />

        <CardIndicator
          title="Sem PA Recente"
          value={countSemPARecente}
          badgeText="> 6 meses"
          badgeVariant="amber"
          icon={Clock}
          onClick={() => router.push(buildPacientesUrl("sem-pa-recente"))}
        />

        <CardIndicator
          title="Sem Visita ACS"
          value={countSemAcompanhamento}
          badgeText="Atrasado"
          badgeVariant="amber"
          icon={AlertTriangle}
          onClick={() => router.push(buildPacientesUrl("sem-visita-acs"))}
        />

        <CardIndicator
          title="Busca Ativa Prioritária"
          value={countBuscaAtivaAlta}
          badgeText="Urgente"
          badgeVariant="red"
          icon={Heart}
          onClick={() => router.push(buildPacientesUrl("busca-ativa-prioritaria"))}
        />
      </div>

      {/* Cards de Cobertura da Equipe de ACS (Gerente) */}
      {(role as string) === "GERENTE" && coverageStats && (
        <div className="space-y-2 my-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            Indicadores Administrativos de Cobertura de ACS
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-[11px] font-semibold text-zinc-500 block">ACS Ativos</span>
              <span className="text-base font-extrabold text-emerald-600">{coverageStats.totalACS}</span>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-[11px] font-semibold text-zinc-500 block">Microáreas com ACS</span>
              <span className="text-base font-extrabold text-blue-600">{coverageStats.totalMicroareas - coverageStats.microareasSemACS}</span>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-[11px] font-semibold text-zinc-500 block">Microáreas sem ACS</span>
              <span className="text-base font-extrabold text-amber-600">{coverageStats.microareasSemACS}</span>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-[11px] font-semibold text-zinc-500 block">Sem Microárea</span>
              <span className="text-base font-extrabold text-zinc-700 dark:text-zinc-300">{coverageStats.pacientesSemMicroarea}</span>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-[11px] font-semibold text-zinc-500 block">Fora da Área</span>
              <span className="text-base font-extrabold text-purple-600">{coverageStats.pacientesForaArea}</span>
            </div>
          </div>
        </div>
      )}

      {/* Seção de Gráficos Analíticos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Estado Nutricional
          </h2>
          <DonutChartSVG data={nutritionalData} />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Aferição de Pressão Arterial (PA)
          </h2>
          <BarChartSVG data={bpData} />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Distribuição por Fator / Condição
          </h2>
          <BarChartSVG data={conditionsData} />
        </div>
      </div>

      {/* Seção: Boas Práticas — Indicadores de Diabetes e Hipertensão (Grau de Atenção do ACS) */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-blue-800 dark:text-blue-300 tracking-tight">
                Boas Práticas — Indicadores de Diabetes e Hipertensão
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Parâmetros que medem o grau de atenção que o ACS deve ter com pacientes com HAS e/ou DM.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              HAS/DM: {boasPraticasOverview.totalHasDm} paciente(s)
            </span>
            <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-bold text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
              Média: {boasPraticasOverview.avgCompleted} de {boasPraticasOverview.avgTotal} em dia ({boasPraticasOverview.avgRate}%)
            </span>
            <span className="rounded-lg bg-red-100 px-2 py-1 text-[11px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
              Atenção Alta: {boasPraticasOverview.attentionCounts.Alta}
            </span>
            <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Moderada: {boasPraticasOverview.attentionCounts["Média"]}
            </span>
            <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Em dia: {boasPraticasOverview.attentionCounts.Acompanhado}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {boasPraticasOverview.items.map((item) => (
            <div
              key={item.code}
              onClick={() => router.push(`/busca-ativa?bp=${item.code}`)}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 hover:border-blue-400 hover:bg-blue-50/20 dark:border-zinc-800 dark:bg-zinc-800/30 dark:hover:border-blue-700 transition-all cursor-pointer"
              title={`Clique para visualizar pacientes com pendência na Boa Prática ${item.code}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-extrabold text-white shadow-2xs">
                  {item.code}
                </span>
                <p className="text-xs font-semibold leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {item.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-zinc-200/80 dark:border-zinc-700/70 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-500 dark:text-zinc-400">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{item.shortTitle}</span>
                  </div>

                  {boasPraticasOverview.totalHasDm > 0 ? (
                    <div className="flex items-center gap-2 text-[11px] font-bold">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {item.fulfilledCount} em dia
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-600">•</span>
                      <span className="text-red-600 dark:text-red-400">
                        {item.pendingCount} pendente(s) ({item.pct}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-zinc-400">Sem pacientes HAS/DM no filtro</span>
                  )}
                </div>

                {boasPraticasOverview.totalHasDm > 0 && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seção "Atenção Necessária" */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Atenção Necessária (Sinalização de Busca Ativa)
            </h2>
          </div>
          <button
            onClick={() => router.push("/busca-ativa")}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
          >
            <span>Ver busca ativa completa</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {atencaoNecessaria.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs font-semibold text-zinc-500 dark:border-zinc-800">
            Nenhum paciente encontrado para os filtros selecionados nesta unidade.
          </div>
        ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-x-auto">
          {displayedAtencaoNecessaria.map((patient) => (
            <div
              key={patient.id}
              onClick={() => router.push(`/pacientes/${patient.id}`)}
              className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {patient.name}
                  </span>
                  <WhatsAppButton
                    phoneCell={patient.phoneCell}
                    patientName={patient.name}
                    size="sm"
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    ({patient.age} anos, {patient.sex})
                  </span>
                  <BadgePriority priority={patient.priority} />
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  <strong className="text-zinc-800 dark:text-zinc-200">{patient.microarea}</strong> ({patient.acsName}) — {patient.activeSearchReason}
                </p>
              </div>

              <div className="text-right">
                <div className="text-xs font-bold text-red-600 dark:text-red-400">
                  PA: {patient.lastPA ? `${patient.lastPA.systolic}/${patient.lastPA.diastolic} mmHg` : "Sem informação"}
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Última visita: {formatDateBR(patient.lastVisitDate)}
                </span>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* SEÇÃO COMPLEMENTAR: PRÓXIMOS RETORNOS / PENDÊNCIAS DO ACS */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Próximos Retornos / Pendências do ACS
            </h2>
          </div>
          <span className="text-xs text-zinc-500 font-medium">
            Acompanhamentos futuros programados pelos ACS
          </span>
        </div>

        {/* Cards de Métricas de Pendências */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/60 dark:bg-red-950/30 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-red-900 dark:text-red-300 block">Retornos Atrasados</span>
              <span className="text-2xl font-extrabold text-red-600 dark:text-red-400">
                {pendingReturnsAtrasadosCount}
              </span>
            </div>
            <AlertTriangle className="h-7 w-7 text-red-500 opacity-80" />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-900 dark:text-amber-300 block">Retornos para Hoje</span>
              <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                {pendingReturnsHojeCount}
              </span>
            </div>
            <Clock className="h-7 w-7 text-amber-500 opacity-80" />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/30 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-blue-900 dark:text-blue-300 block">Próximos Retornos Agendados</span>
              <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                {pendingReturnsAgendadosCount}
              </span>
            </div>
            <Calendar className="h-7 w-7 text-blue-500 opacity-80" />
          </div>
        </div>

        {/* Tabela/Lista de Pendências de Retorno */}
        {sortedPendingReturns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs font-semibold text-zinc-500 dark:border-zinc-800">
            Nenhuma pendência de retorno operacional registrada para os pacientes selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 text-[10px]">
                <tr>
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Microárea</th>
                  <th className="px-3 py-2">Última Ação</th>
                  <th className="px-3 py-2">Data da Última Ação</th>
                  <th className="px-3 py-2">Próximo Retorno</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                {sortedPendingReturns.slice(0, 50).map((item) => (
                  <tr key={`${item.patient.id}_${item.actionId}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{item.patient.name}</span>
                        <WhatsAppButton
                          phoneCell={item.patient.phoneCell}
                          patientName={item.patient.name}
                          size="sm"
                        />
                      </div>
                      <div className="text-[11px] text-zinc-500">{item.patient.age} anos ({item.patient.sex})</div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200">
                      {item.patient.microarea}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                      {item.actionType}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {formatDateBR(item.actionDate)}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-blue-600 dark:text-blue-400">
                      {formatDateBR(item.returnDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold ${
                        item.status === "Atrasado"
                          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          : item.status === "Hoje"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => router.push(`/pacientes/${item.patient.id}`)}
                        className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        Ver Prontuário
                      </button>
                      {role === "ACS" && (
                        <button
                          onClick={() => {
                            setSelectedPatientForAction(item.patient);
                            setIsActionModalOpen(true);
                          }}
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          Registrar Ação
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Reutilizável de Registro de Ação Operacional do ACS */}
      <RegisterActionModal
        isOpen={isActionModalOpen}
        onClose={() => {
          setIsActionModalOpen(false);
          setSelectedPatientForAction(null);
        }}
        patient={selectedPatientForAction}
        onActionSaved={(updatedPatient) => {
          setPatients((prev) =>
            prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p))
          );
        }}
      />
    </AppLayout>
  );
}
