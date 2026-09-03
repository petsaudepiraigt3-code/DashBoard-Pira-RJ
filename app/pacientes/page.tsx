"use client";

import React, { useState, useEffect, Suspense } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { MOCK_PATIENTS } from "@/data/mock-data";
import { getAllPatientsFromFirestore } from "@/lib/firebase/patients";
import { Patient } from "@/types/dcnt";
import { BadgePriority } from "@/components/ui/badge-priority";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Eye, RefreshCw, X, AlertTriangle, Filter } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { formatDateBR } from "@/lib/utils/formatters";
import {
  isIdoso,
  isSobrepeso,
  isObesidade,
  isPAAlterada,
  isSemPARecente,
  isSemVisitaACS,
  isBuscaAtivaPrioritaria,
} from "@/lib/utils/patient-filters";

const FILTER_LABELS: Record<string, string> = {
  "idosos": "Idosos (60+ anos)",
  "sobrepeso": "Sobrepeso",
  "obesidade": "Obesidade",
  "pa-alterada": "PA Alterada (>= 140/90 mmHg)",
  "sem-pa-recente": "Sem PA Recente (> 6 meses)",
  "sem-visita-acs": "Sem visita ACS (Visita ACS atrasada)",
  "busca-ativa-prioritaria": "Busca Ativa Prioritária (Urgente)",
};

function PacientesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get("filtro");
  const paramACS = searchParams.get("acs");
  const paramMicroarea = searchParams.get("microarea");

  const { role, userUnitId, userProfile } = useAuth();

  const [patients, setPatients] = useState<Patient[]>(MOCK_PATIENTS);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterACS, setFilterACS] = useState(paramACS || "Todos");
  const [filterMicroarea, setFilterMicroarea] = useState(paramMicroarea || "Todas");
  const [filterSex, setFilterSex] = useState("Todos");

  // Sincronizar parâmetros de URL com os filtros locais de ACS/Microárea
  useEffect(() => {
    if (paramACS) setFilterACS(paramACS);
    if (paramMicroarea) setFilterMicroarea(paramMicroarea);
  }, [paramACS, paramMicroarea]);

  const loadData = async () => {
    setLoading(true);
    const realData = await getAllPatientsFromFirestore({
      role,
      userUnitId,
      assignedMicroareaCodes: userProfile?.assignedMicroareaCodes,
      acsName: role === "ACS" ? userProfile?.name : undefined,
      acsId: role === "ACS" ? userProfile?.uid : undefined,
    });
    if (realData && realData.length > 0) {
      setPatients(realData);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [role, userUnitId, userProfile]);

  useEffect(() => {
    if (role === "ACS") {
      if (userProfile?.name) {
        setFilterACS(userProfile.name);
      }
      const codes = userProfile?.assignedMicroareaCodes || ["56"];
      if (codes.length > 0) {
        setFilterMicroarea(`Microárea ${codes[0]}`);
      }
    }
  }, [role, userProfile]);

  // Lista dinâmica de ACS e Microáreas da unidade para filtros do Gerente e Admin
  const availableACSList = Array.from(
    new Set(
      patients
        .filter((p) => role !== "GERENTE" || !userUnitId || (p as any).unidadeId === userUnitId)
        .map((p) => p.acsName)
    )
  ).filter(Boolean).sort();

  const availableMicroareasList = Array.from(
    new Set(
      patients
        .filter((p) => role !== "GERENTE" || !userUnitId || (p as any).unidadeId === userUnitId)
        .map((p) => p.microarea)
    )
  ).filter(Boolean).sort();

  const filteredPatients = patients.filter((p) => {
    if (role === "GERENTE" && userUnitId) {
      const pUnitId = (p as any).unidadeId || "USF-003";
      if (pUnitId !== userUnitId) return false;
    }
    if (role === "ACS") {
      if (userUnitId) {
        const pUnitId = (p as any).unidadeId || "USF-003";
        if (pUnitId !== userUnitId) return false;
      }
      const acsCodes = userProfile?.assignedMicroareaCodes || ["56"];
      const patMACode = (p.microarea || "").replace(/\D/g, "").trim();
      if (acsCodes.length > 0 && !acsCodes.includes(patMACode)) return false;
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchCPF = p.cpf.includes(q);
      const matchCNS = p.cns.includes(q);
      if (!matchName && !matchCPF && !matchCNS) return false;
    }

    if (filterACS !== "Todos" && p.acsName !== filterACS) return false;
    if (filterMicroarea !== "Todas" && p.microarea !== filterMicroarea) return false;
    if (filterSex !== "Todos" && p.sex !== filterSex) return false;

    // Filtros específicos vindos via Query String do Dashboard
    if (activeFilter === "idosos" && !isIdoso(p)) return false;
    if (activeFilter === "sobrepeso" && !isSobrepeso(p)) return false;
    if (activeFilter === "obesidade" && !isObesidade(p)) return false;
    if (activeFilter === "pa-alterada" && !isPAAlterada(p)) return false;
    if (activeFilter === "sem-pa-recente" && !isSemPARecente(p)) return false;
    if (activeFilter === "sem-visita-acs" && !isSemVisitaACS(p)) return false;
    if (activeFilter === "busca-ativa-prioritaria" && !isBuscaAtivaPrioritaria(p)) return false;

    return true;
  });

  const clearActiveFilter = () => {
    router.push("/pacientes");
  };

  return (
    <AppLayout pageTitle="Cadastro Geral de Pacientes DCNT">
      {/* Indicador de Filtro Ativo vindo do Dashboard */}
      {activeFilter && FILTER_LABELS[activeFilter] && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/90 p-3.5 text-xs text-blue-900 shadow-2xs dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
          <div className="flex items-center gap-2 font-medium">
            <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              Filtro ativo: <strong>{FILTER_LABELS[activeFilter]}</strong> — {filteredPatients.length} pacientes listados
            </span>
          </div>
          <button
            onClick={clearActiveFilter}
            className="flex items-center gap-1 rounded-lg bg-blue-200/80 px-2.5 py-1 text-xs font-semibold text-blue-900 hover:bg-blue-300 dark:bg-blue-900/80 dark:text-blue-200 dark:hover:bg-blue-800 transition-colors cursor-pointer"
            aria-label="Limpar filtro de pacientes"
          >
            <X className="h-3.5 w-3.5" />
            <span>Limpar filtro</span>
          </button>
        </div>
      )}

      {/* Barra de Filtro e Pesquisa */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por Nome, CPF ou CNS..."
            className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 shadow-2xs focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {role === "ACS" ? (
            <>
              <div className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <span>{userProfile?.name || "ACS teste 01"}</span>
                <span title="ACS autenticado">🔒</span>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <span>
                  {userProfile?.assignedMicroareaCodes && userProfile.assignedMicroareaCodes.length > 0
                    ? `Microárea ${userProfile.assignedMicroareaCodes.join(", ")}`
                    : "Microárea 56"}
                </span>
                <span title="Microárea atribuída">🔒</span>
              </div>
            </>
          ) : (
            <>
              <select
                value={filterACS}
                onChange={(e) => setFilterACS(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
              >
                <option value="Todos">Todos os ACS</option>
                {availableACSList.map((acsName) => (
                  <option key={acsName} value={acsName}>{acsName}</option>
                ))}
              </select>

              <select
                value={filterMicroarea}
                onChange={(e) => setFilterMicroarea(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
              >
                <option value="Todas">Todas as Microáreas</option>
                {availableMicroareasList.map((maName) => (
                  <option key={maName} value={maName}>{maName}</option>
                ))}
              </select>
            </>
          )}

          <button
            onClick={loadData}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
            title="Atualizar dados do Firestore"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Tabela de Pacientes */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400 font-bold">
              <tr>
                <th className="px-4 py-3">Nome / Identificação</th>
                <th className="px-4 py-3">Idade / Sexo</th>
                <th className="px-4 py-3">ACS / Microárea</th>
                <th className="px-4 py-3">Última PA</th>
                <th className="px-4 py-3">IMC</th>
                <th className="px-4 py-3">Última Visita</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
              {filteredPatients.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/pacientes/${p.id}`)}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-900 dark:text-zinc-100">{p.name}</div>
                    <div className="text-[11px] text-zinc-500">
                      {p.cpf !== "Sem CPF" ? `CPF: ${p.cpf}` : p.cns !== "Sem CNS" ? `CNS: ${p.cns}` : "Sem documento"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {p.age} anos ({p.sex.substring(0, 1)})
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    <div className="font-semibold">{p.microarea}</div>
                    <div className="text-[11px] text-zinc-500">{p.acsName}</div>
                  </td>
                  <td className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">
                    {p.lastPA ? `${p.lastPA.systolic}/${p.lastPA.diastolic} mmHg` : "Sem registro"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {p.lastWeight ? `${p.lastWeight.imc.toFixed(1)} (${p.isObese ? "Obeso" : p.isOverweight ? "Sobrepeso" : "Adequado"})` : "N/A"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDateBR(p.lastVisitDate)}
                  </td>
                  <td className="px-4 py-3">
                    <BadgePriority priority={p.priority} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/pacientes/${p.id}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-blue-50 hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-blue-950 dark:hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Ver Prontuário</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

export default function PacientesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center text-xs font-semibold text-zinc-500">
        Carregando lista de pacientes...
      </div>
    }>
      <PacientesContent />
    </Suspense>
  );
}
