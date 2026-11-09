"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { getAllPatientsFromStore } from "@/lib/store/patients";
import { normalizeUnitId } from "@/lib/store/units";
import { DEFAULT_DCNT_PARAMETERS, getDcntParametersFromStore } from "@/lib/store/parameters";
import { DcntParameters, Patient } from "@/types/dcnt";
import { BadgePriority } from "@/components/ui/badge-priority";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { ManagerObservationModal } from "@/components/ui/manager-observation-modal";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Eye,
  RefreshCw,
  X,
  AlertTriangle,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { formatDateBR } from "@/lib/utils/formatters";
import {
  isIdoso,
  isCriancaAte2Anos,
  isSobrepeso,
  isObesidade,
  isPAAlterada,
  isSemPARecente,
  isSemVisitaACS,
  isBuscaAtivaPrioritaria,
} from "@/lib/utils/patient-filters";

const FILTER_LABELS: Record<string, string> = {
  "criancas-ate-2-anos": "Crianças de até 2 anos (Primeira Infância)",
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

  const { role, userUnitId, userProfile, loading: authLoading } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dcntParams, setDcntParams] = useState<DcntParameters>(DEFAULT_DCNT_PARAMETERS);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterACS, setFilterACS] = useState(paramACS || "Todos");
  const [filterMicroarea, setFilterMicroarea] = useState(paramMicroarea || "Todas");
  const [filterSex, setFilterSex] = useState("Todos");

  // Estado de Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Estado do Modal de Observações da Gerência
  const [obsPatient, setObsPatient] = useState<Patient | null>(null);
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);

  // Reiniciar para página 1 sempre que os filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterACS, filterMicroarea, filterSex, activeFilter]);

  // Sincronizar parâmetros de URL com os filtros locais de ACS/Microárea
  useEffect(() => {
    if (paramACS) setFilterACS(paramACS);
    if (paramMicroarea) setFilterMicroarea(paramMicroarea);
  }, [paramACS, paramMicroarea]);

  const loadData = async () => {
    if (authLoading || !userProfile) return;
    const profile = userProfile;
    setLoading(true);

    const [realData, loadedParams] = await Promise.all([
      getAllPatientsFromStore({
        role: profile.role,
        userUnitId: profile.unitId || userUnitId,
        assignedMicroareaCodes: profile.role === "ACS" ? profile.assignedMicroareaCodes : undefined,
        acsName: profile.role === "ACS" ? profile.name : undefined,
        acsId: profile.role === "ACS" ? profile.uid : undefined,
      }),
      getDcntParametersFromStore(),
    ]);
    setPatients(realData || []);
    setDcntParams(loadedParams);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !userProfile) return;
    loadData();
  }, [authLoading, userProfile?.role, userProfile?.unitId, userProfile?.uid]);

  useEffect(() => {
    if (role === "ACS" || role === "GERENTE" || role === "ADMIN") {
      setFilterACS(paramACS || "Todos");
      setFilterMicroarea(paramMicroarea || "Todas");
    }
  }, [role, userProfile?.uid]);

  const normalizedAcsCodes = (userProfile?.assignedMicroareaCodes || []).map((c) => {
    const d = String(c || "").replace(/\D/g, "").trim();
    return d ? d.padStart(2, "0") : String(c || "").trim();
  });

  const normUnitId = userUnitId ? normalizeUnitId(userUnitId) : null;

  // Lista dinâmica de ACS e Microáreas da unidade para filtros do Gerente e Admin
  const availableACSList = Array.from(
    new Set(
      patients
        .filter((p) => role !== "GERENTE" || !normUnitId || normalizeUnitId((p as any).unidadeId) === normUnitId)
        .map((p) => p.acsName)
    )
  ).filter(Boolean).sort();

  const availableMicroareasList = Array.from(
    new Set(
      patients
        .filter((p) => role !== "GERENTE" || !normUnitId || normalizeUnitId((p as any).unidadeId) === normUnitId)
        .map((p) => p.microarea)
    )
  ).filter(Boolean).sort();

  const filteredPatients = patients.filter((p) => {
    const pUnitId = normalizeUnitId((p as any).unidadeId);
    if (role === "GERENTE" && normUnitId) {
      if (pUnitId !== normUnitId) return false;
    }
    if (role === "ACS") {
      if (normUnitId && pUnitId !== normUnitId) return false;
      const rawDigits = (p.microarea || "").replace(/\D/g, "").trim() || ((p as any).microareaCodigo || "").replace(/\D/g, "").trim();
      const patMACode = rawDigits ? rawDigits.padStart(2, "0") : ((p as any).microareaCodigo || "");
      if (normalizedAcsCodes.length === 0 || (!normalizedAcsCodes.includes(patMACode) && !(rawDigits && normalizedAcsCodes.includes(rawDigits)))) {
        return false;
      }
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
    if (activeFilter === "criancas-ate-2-anos" && !isCriancaAte2Anos(p, dcntParams)) return false;
    if (activeFilter === "idosos" && !isIdoso(p, dcntParams)) return false;
    if (activeFilter === "sobrepeso" && !isSobrepeso(p, dcntParams)) return false;
    if (activeFilter === "obesidade" && !isObesidade(p, dcntParams)) return false;
    if (activeFilter === "pa-alterada" && !isPAAlterada(p, dcntParams)) return false;
    if (activeFilter === "sem-pa-recente" && !isSemPARecente(p, dcntParams)) return false;
    if (activeFilter === "sem-visita-acs" && !isSemVisitaACS(p, dcntParams)) return false;
    if (activeFilter === "busca-ativa-prioritaria" && !isBuscaAtivaPrioritaria(p)) return false;

    return true;
  });

  // Cálculo de Paginação
  const totalPages = Math.ceil(filteredPatients.length / pageSize) || 1;
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPatients.slice(start, start + pageSize);
  }, [filteredPatients, currentPage, pageSize]);

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
                  {normalizedAcsCodes.length > 0
                    ? `Microárea ${normalizedAcsCodes.join(", ")}`
                    : "Sem microárea atribuída"}
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
            title="Atualizar dados do Supabase"
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
              {paginatedPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-zinc-500">
                    Nenhum paciente encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedPatients.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/pacientes/${p.id}`)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{p.name}</span>
                        <WhatsAppButton
                          phoneCell={p.phoneCell}
                          patientName={p.name}
                          size="sm"
                        />
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {p.cpf !== "Sem CPF" ? `CPF: ${p.cpf}` : p.cns !== "Sem CNS" ? `CNS: ${p.cns}` : "Sem documento"}
                      </div>
                      {p.observacaoGerenteAtual && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setObsPatient(p);
                            setIsObsModalOpen(true);
                          }}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 text-left max-w-xs truncate cursor-pointer"
                          title={`Observação da Gerência (${p.observacaoGerenteAtual.categoria}): ${p.observacaoGerenteAtual.texto}`}
                        >
                          <ClipboardList className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            Obs. Gerência: {p.observacaoGerenteAtual.texto}
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {p.age === 0 ? "< 1 ano" : p.age === 1 ? "1 ano" : `${p.age} anos`} ({p.sex.substring(0, 1)})
                      {(p.isChildUnder2 || (p.age >= 0 && p.age <= 2)) && (
                        <div className="mt-0.5">
                          <span className="inline-block rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                            0-2 anos
                          </span>
                        </div>
                      )}
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
                      <div className="flex items-center justify-end gap-1.5">
                        {(role === "GERENTE" || role === "ADMIN") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setObsPatient(p);
                              setIsObsModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300 transition-colors cursor-pointer"
                            title="Acrescentar ou editar observação da gerência"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>{p.observacaoGerenteAtual ? "Editar Obs." : "Observação"}</span>
                          </button>
                        )}
                        {role === "ACS" && p.observacaoGerenteAtual && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setObsPatient(p);
                              setIsObsModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300 transition-colors cursor-pointer"
                            title="Visualizar observação e histórico da Gerência da Unidade"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>Obs. Gerência</span>
                          </button>
                        )}
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Controles de Paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-zinc-500 dark:text-zinc-400">
            <span>
              Mostrando{" "}
              <strong className="text-zinc-800 dark:text-zinc-200">
                {filteredPatients.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>{" "}
              a{" "}
              <strong className="text-zinc-800 dark:text-zinc-200">
                {Math.min(currentPage * pageSize, filteredPatients.length)}
              </strong>{" "}
              de{" "}
              <strong className="text-zinc-800 dark:text-zinc-200">
                {filteredPatients.length}
              </strong>{" "}
              pacientes
            </span>

            <div className="flex items-center gap-1.5">
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors cursor-pointer"
              title="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors cursor-pointer"
              title="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-3 py-1 font-semibold text-zinc-700 dark:text-zinc-300">
              Página {currentPage} de {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors cursor-pointer"
              title="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors cursor-pointer"
              title="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Observações da Gerência da Unidade (com Histórico para o ACS) */}
      <ManagerObservationModal
        isOpen={isObsModalOpen}
        onClose={() => setIsObsModalOpen(false)}
        patient={obsPatient}
        onPatientUpdated={(updatedPatient) => {
          setObsPatient(updatedPatient);
          setPatients((prev) =>
            prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p))
          );
        }}
      />
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
