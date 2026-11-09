"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { CardIndicator } from "@/components/ui/card-indicator";
import { BadgePriority } from "@/components/ui/badge-priority";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { Modal } from "@/components/ui/modal";
import { RegisterActionModal } from "@/components/ui/register-action-modal";
import { ManagerObservationModal } from "@/components/ui/manager-observation-modal";
import { getAllPatientsFromStore, savePatientActionInStore } from "@/lib/store/patients";
import { normalizeUnitId } from "@/lib/store/units";
import { Patient, PriorityLevel, ActiveSearchRecord, PatientActionType } from "@/types/dcnt";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { formatDateBR } from "@/lib/utils/formatters";
import {
  Search,
  UserCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Eye,
  PlusCircle,
  Check,
  RefreshCw,
  ClipboardList,
} from "lucide-react";

export default function BuscaAtivaPage() {
  const router = useRouter();
  const { role, userUnitId, userProfile, loading: authLoading } = useAuth();

  // Estados dos Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [filterACS, setFilterACS] = useState("Todos");
  const [filterMicroarea, setFilterMicroarea] = useState("Todas");
  const [filterPriority, setFilterPriority] = useState<string>("Todas");
  const [filterCondition, setFilterCondition] = useState("Todas");

  // Lista de pacientes (Supabase)
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (authLoading || !userProfile) return;
    setLoading(true);
    const activeRole = userProfile?.role || role;
    const activeUnitId = userProfile?.unitId || userUnitId;
    const realData = await getAllPatientsFromStore({
      role: activeRole,
      userUnitId: activeUnitId,
      assignedMicroareaCodes: activeRole === "ACS" ? userProfile?.assignedMicroareaCodes : undefined,
      acsName: activeRole === "ACS" ? userProfile?.name : undefined,
      acsId: activeRole === "ACS" ? userProfile?.uid : undefined,
    });
    setPatients(realData || []);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !userProfile) return;
    loadData();
  }, [authLoading, userProfile?.role, userProfile?.unitId, userProfile?.uid]);

  useEffect(() => {
    setFilterACS("Todos");
    setFilterMicroarea("Todas");
  }, [role, userProfile?.uid]);

  // Estado do Modal de Registro de Ação
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [obsPatient, setObsPatient] = useState<Patient | null>(null);
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [actionType, setActionType] = useState<ActiveSearchRecord["action"]>("Visita Domiciliar");
  const [actionDate, setActionDate] = useState(new Date().toISOString().substring(0, 10));
  const [actionResult, setActionResult] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [nextReturnDate, setNextReturnDate] = useState("");

  // Contadores por prioridade
  const countAlta = patients.filter((p) => p.priority === "Alta").length;
  const countMedia = patients.filter((p) => p.priority === "Média").length;
  const countAtencao = patients.filter((p) => p.priority === "Atenção").length;
  const countAcompanhado = patients.filter((p) => p.priority === "Acompanhado").length;

  const currentUnitId = userProfile?.unitId || userUnitId;
  const normUnitId = currentUnitId ? normalizeUnitId(currentUnitId) : null;

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

  // Filtragem dos Pacientes da Busca Ativa
  const filteredPatients = patients.filter((p) => {
    const pUnitId = normalizeUnitId((p as any).unidadeId);
    if (role === "GERENTE" && normUnitId) {
      if (pUnitId !== normUnitId) return false;
    }
    if (role === "ACS") {
      if (normUnitId && pUnitId !== normUnitId) return false;
      const acsCodes = (userProfile?.assignedMicroareaCodes || []).map((c) => {
        const d = String(c || "").replace(/\D/g, "").trim();
        return d ? d.padStart(2, "0") : String(c || "").trim();
      });
      const rawDigits = (p.microarea || "").replace(/\D/g, "").trim() || ((p as any).microareaCodigo || "").replace(/\D/g, "").trim();
      const patMACode = rawDigits ? rawDigits.padStart(2, "0") : ((p as any).microareaCodigo || "");
      if (acsCodes.length > 0 && !acsCodes.includes(patMACode) && !(rawDigits && acsCodes.includes(rawDigits))) {
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
    if (filterPriority !== "Todas" && p.priority !== filterPriority) return false;

    if (filterCondition === "Hipertensão" && !p.hasHypertension) return false;
    if (filterCondition === "Diabetes" && !p.hasDiabetes) return false;
    if (filterCondition === "Obesidade" && !p.isObese) return false;
    if (filterCondition === "Crianca2Anos" && !(p.isChildUnder2 || (p.age >= 0 && p.age <= 2))) return false;

    return true;
  });

  const handleOpenActionModal = (patient: Patient) => {
    if (role !== "ACS") {
      alert("Apenas Agentes Comunitários de Saúde (ACS) possuem permissão para registrar ações operacionais.");
      return;
    }
    setSelectedPatient(patient);
    setIsModalOpen(true);
  };

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    if (role !== "ACS") {
      alert("Apenas Agentes Comunitários de Saúde (ACS) possuem permissão para registrar ações operacionais.");
      setIsModalOpen(false);
      return;
    }

    const isNoStatusChange = actionType === "Tentativa Sem Sucesso" || actionType === "Retorno Agendado";
    const isVisit = actionType === "Visita Domiciliar";
    const isSuccessfulContact = isVisit || actionType === "Contato Telefônico" || actionType === "Atendimento/Comparecimento na UBS";

    const newPriority: PriorityLevel | undefined = isNoStatusChange
      ? undefined
      : isSuccessfulContact
      ? "Acompanhado"
      : undefined;

    const newVisitDate = isVisit ? actionDate : undefined;

    // Salva a ação de forma persistente no Supabase
    const savedAction = await savePatientActionInStore(
      selectedPatient.id,
      {
        patientId: selectedPatient.id,
        unidadeId: selectedPatient.unidadeId || userUnitId || "USF-003",
        microarea: selectedPatient.microarea,
        microareaCodigo: (selectedPatient.microarea || "").replace(/\D/g, "").trim(),
        acsId: userProfile?.uid || "acs-uid",
        acsNome: userProfile?.name || selectedPatient.acsName || "ACS teste 01",
        tipoAcao: actionType as PatientActionType,
        dataAcao: actionDate,
        resultado: actionResult,
        observacoes: actionNotes,
        proximoRetorno: nextReturnDate,
      },
      newPriority,
      newVisitDate,
      role
    );

    const updated = patients.map((p) => {
      if (p.id === selectedPatient.id) {
        const currentHistorico = p.historicoAcoes || [];
        const updatedHistorico = [savedAction, ...currentHistorico];

        const updatedPriority = isNoStatusChange
          ? p.priority
          : isSuccessfulContact
          ? ("Acompanhado" as PriorityLevel)
          : p.priority;

        const updatedStatus = isNoStatusChange
          ? p.activeSearchStatus
          : isSuccessfulContact
          ? ("Acompanhado" as const)
          : p.activeSearchStatus;

        return {
          ...p,
          lastVisitDate: isVisit ? actionDate : p.lastVisitDate,
          activeSearchStatus: updatedStatus,
          priority: updatedPriority,
          historicoAcoes: updatedHistorico,
          timeline: [
            {
              id: savedAction.id,
              date: actionDate,
              type: (isVisit ? "Visita ACS" : actionType === "Contato Telefônico" ? "Contato Telefônico" : "Busca Ativa") as any,
              title: `Registro de ${actionType}`,
              description: `${actionResult}${actionNotes ? `. OBS: ${actionNotes}` : ""}`,
              professional: userProfile?.name || "Operador de Saúde",
            },
            ...p.timeline,
          ],
        };
      }
      return p;
    });

    setPatients(updated);
    setIsModalOpen(false);
    setSelectedPatient(null);
    setActionResult("");
    setActionNotes("");
  };

  const handleMarkAsAcompanhado = (patientId: string) => {
    if (role !== "ACS") {
      alert("Apenas Agentes Comunitários de Saúde (ACS) possuem permissão para alterar o status de acompanhamento.");
      return;
    }
    setPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, priority: "Acompanhado", activeSearchStatus: "Acompanhado" } : p))
    );
  };

  return (
    <AppLayout pageTitle="Gestão de Busca Ativa DCNT">
      {/* Cards de Prioridade Clicáveis */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CardIndicator
          title="Alta Prioridade"
          value={countAlta}
          badgeText="Urgente"
          badgeVariant="red"
          icon={AlertTriangle}
          isActive={filterPriority === "Alta"}
          onClick={() => setFilterPriority(filterPriority === "Alta" ? "Todas" : "Alta")}
        />

        <CardIndicator
          title="Média Prioridade"
          value={countMedia}
          badgeText="Acompanhar"
          badgeVariant="amber"
          icon={Clock}
          isActive={filterPriority === "Média"}
          onClick={() => setFilterPriority(filterPriority === "Média" ? "Todas" : "Média")}
        />

        <CardIndicator
          title="Atenção"
          value={countAtencao}
          badgeText="Preventivo"
          badgeVariant="blue"
          icon={UserCheck}
          isActive={filterPriority === "Atenção"}
          onClick={() => setFilterPriority(filterPriority === "Atenção" ? "Todas" : "Atenção")}
        />

        <CardIndicator
          title="Acompanhados"
          value={countAcompanhado}
          badgeText="Em dia"
          badgeVariant="emerald"
          icon={CheckCircle2}
          isActive={filterPriority === "Acompanhado"}
          onClick={() => setFilterPriority(filterPriority === "Acompanhado" ? "Todas" : "Acompanhado")}
        />
      </div>

      {/* Painel de Filtros e Busca */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
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

            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
            >
              <option value="Todas">Todas as Condições</option>
              <option value="Crianca2Anos">Crianças (0-2 anos)</option>
              <option value="Hipertensão">Hipertensão (HAS)</option>
              <option value="Diabetes">Diabetes (DM)</option>
              <option value="Obesidade">Obesidade (OB)</option>
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
            >
              <option value="Todas">Todas as Prioridades</option>
              <option value="Alta">Alta Prioridade</option>
              <option value="Média">Média Prioridade</option>
              <option value="Atenção">Atenção</option>
              <option value="Acompanhado">Acompanhados</option>
            </select>

            <button
              onClick={loadData}
              className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Busca Ativa */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400 font-bold">
              <tr>
                <th className="px-4 py-3">Paciente</th>
                <th className="px-4 py-3">Idade/Sexo</th>
                <th className="px-4 py-3">Microárea (ACS)</th>
                <th className="px-4 py-3">Condições</th>
                <th className="px-4 py-3">Última PA</th>
                <th className="px-4 py-3">Última Visita</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    Nenhum paciente encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{p.name}</span>
                        <WhatsAppButton
                          phoneCell={p.phoneCell}
                          patientName={p.name}
                          size="sm"
                        />
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {p.cpf !== "Sem CPF" ? `CPF: ${p.cpf}` : p.cns !== "Sem CNS" ? `CNS: ${p.cns}` : "Sem doc"}
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
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      <div className="font-semibold">{p.microarea}</div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400">{p.acsName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.isChildUnder2 || (p.age >= 0 && p.age <= 2)) && (
                          <span
                            className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                            title="Criança até 2 anos (Primeira Infância / Puericultura)"
                          >
                            0-2 ANOS
                          </span>
                        )}
                        {p.hasHypertension && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">HAS</span>}
                        {p.hasDiabetes && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">DM</span>}
                        {p.isObese && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">OB</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">
                      {p.lastPA ? `${p.lastPA.systolic}/${p.lastPA.diastolic}` : "N/A"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDateBR(p.lastVisitDate)}
                    </td>
                    <td className="px-4 py-3">
                      <BadgePriority priority={p.priority} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => router.push(`/pacientes/${p.id}`)}
                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 cursor-pointer"
                          title="Ver prontuário do paciente"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {(role === "GERENTE" || role === "ADMIN") && (
                          <button
                            onClick={() => {
                              setObsPatient(p);
                              setIsObsModalOpen(true);
                            }}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
                            title="Acrescentar ou editar observação da gerência neste paciente"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>{p.observacaoGerenteAtual ? "Editar Obs." : "Observação"}</span>
                          </button>
                        )}
                        {role === "ACS" && p.observacaoGerenteAtual && (
                          <button
                            onClick={() => {
                              setObsPatient(p);
                              setIsObsModalOpen(true);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 transition-colors cursor-pointer"
                            title="Visualizar observação e histórico da Gerência da Unidade"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>Obs. Gerência</span>
                          </button>
                        )}
                        {role === "ACS" && (
                          <button
                            onClick={() => handleOpenActionModal(p)}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 shadow-2xs transition-colors cursor-pointer"
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span>Registrar</span>
                          </button>
                        )}
                        {role === "ACS" && p.priority !== "Acompanhado" && (
                          <button
                            onClick={() => handleMarkAsAcompanhado(p.id)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                            title="Marcar como Acompanhado"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Registro de Ação de Busca Ativa Reutilizável */}
      <RegisterActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        patient={selectedPatient}
        onActionSaved={(updatedPatient) => {
          setPatients((prev) =>
            prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p))
          );
        }}
      />

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
