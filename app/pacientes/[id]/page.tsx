"use client";

import React, { use, useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  getAllPatientsFromStore,
  getPatientActionsFromStore,
  getPatientHistorySnapshotsFromStore,
  getPatientManagerObservationsFromStore,
  updatePatientConditionsInStore,
} from "@/lib/store/patients";
import {
  Patient,
  PatientActionRecord,
  PatientCargaSnapshot,
  ManagerObservationRecord,
  ManagerObservationRevision,
} from "@/types/dcnt";
import { useAuth } from "@/context/auth-context";
import { BadgePriority } from "@/components/ui/badge-priority";
import { CardIndicator } from "@/components/ui/card-indicator";
import { LineChartSVG } from "@/components/ui/charts";
import { useRouter } from "next/navigation";
import { formatDateBR } from "@/lib/utils/formatters";
import { compareActionsChronological } from "@/lib/utils/returns";
import { PriorityExplanationCard } from "@/components/patients/priority-explanation-card";
import { PatientEvolutionHistory } from "@/components/patients/patient-evolution-history";
import { ManagerObservationsSection } from "@/components/patients/manager-observations-section";
import {
  User,
  Phone,
  MapPin,
  Calendar,
  Activity,
  Scale,
  Heart,
  FileText,
  Clock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function PacienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { role, userUnitId, userProfile } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [realActions, setRealActions] = useState<PatientActionRecord[]>([]);
  const [realSnapshots, setRealSnapshots] = useState<PatientCargaSnapshot[]>([]);
  const [realManagerObs, setRealManagerObs] = useState<ManagerObservationRecord[]>([]);
  const [realManagerHist, setRealManagerHist] = useState<ManagerObservationRevision[]>([]);

  useEffect(() => {
    async function loadData() {
      const realData = await getAllPatientsFromStore({
        role,
        userUnitId,
        assignedMicroareaCodes: userProfile?.assignedMicroareaCodes,
      });
      setPatients(realData);

      if (resolvedParams.id) {
        try {
          const [actions, snapshots, managerObsData] = await Promise.all([
            getPatientActionsFromStore(resolvedParams.id),
            getPatientHistorySnapshotsFromStore(resolvedParams.id),
            getPatientManagerObservationsFromStore(resolvedParams.id),
          ]);
          setRealActions(actions);
          setRealSnapshots(snapshots);
          setRealManagerObs(managerObsData.observations);
          setRealManagerHist(managerObsData.history);
        } catch (e) {
          // Tratar silenciosamente
        }
      }
    }
    loadData();
  }, [role, userUnitId, userProfile, resolvedParams.id]);

  const patient = patients.find((p) => p.id === resolvedParams.id);
  if (!patient) return <AppLayout pageTitle="Prontuário"><p>Paciente não encontrado ou acesso não autorizado.</p></AppLayout>;

  // Consolidar eventos reais (do array do documento ou da subcoleção /acoes)
  const actionsFromDoc = patient.historicoAcoes || [];
  const actionMap = new Map<string, PatientActionRecord>();
  actionsFromDoc.forEach((a) => { if (a.id) actionMap.set(a.id, a); });
  realActions.forEach((a) => { if (a.id) actionMap.set(a.id, a); });

  const allActions = Array.from(actionMap.values()).sort((a, b) => compareActionsChronological(b, a));

  // Consolidar snapshots de carga (do documento do paciente ou da subcoleção /historicoCargas)
  const snapshotsFromDoc = patient.historicoCargas || [];
  const snapshotMap = new Map<string, PatientCargaSnapshot>();
  snapshotsFromDoc.forEach((s) => { if (s.id) snapshotMap.set(s.id, s); });
  realSnapshots.forEach((s) => { if (s.id) snapshotMap.set(s.id, s); });

  const allSnapshots = Array.from(snapshotMap.values()).sort((a, b) =>
    (b.dataCarga || "").localeCompare(a.dataCarga || "")
  );

  // Consolidar observações da gerência e seu histórico (do documento do paciente e subcoleção /observacoesGerente)
  const obsFromDoc = patient.observacoesGerente || (patient.observacaoGerenteAtual ? [patient.observacaoGerenteAtual] : []);
  const obsMap = new Map<string, ManagerObservationRecord>();
  obsFromDoc.forEach((o) => { if (o?.id) obsMap.set(o.id, o); });
  realManagerObs.forEach((o) => { if (o?.id) obsMap.set(o.id, o); });
  const allManagerObservations = Array.from(obsMap.values()).sort((a, b) =>
    (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "")
  );

  const histFromDoc = patient.historicoObservacoesGerente || [];
  const histMap = new Map<string, ManagerObservationRevision>();
  histFromDoc.forEach((h) => { if (h?.id) histMap.set(h.id, h); });
  realManagerHist.forEach((h) => { if (h?.id) histMap.set(h.id, h); });
  const allManagerHistory = Array.from(histMap.values()).sort((a, b) =>
    (b.dataRegistro || "").localeCompare(a.dataRegistro || "")
  );

  // Procurar especificamente a Visita Domiciliar mais recente para o card "Última Visita ACS"
  const lastVisitaDomiciliar = allActions.find((act) => act.tipoAcao === "Visita Domiciliar");

  // Validação estrita de escopo para perfil ACS
  const normalizedAcsCodes = (userProfile?.assignedMicroareaCodes || []).map((c) => {
    const d = String(c || "").replace(/\D/g, "").trim();
    return d ? d.padStart(2, "0") : String(c || "").trim();
  });
  const rawDigits = (patient?.microarea || "").replace(/\D/g, "").trim() || (patient?.microareaCodigo || "").replace(/\D/g, "").trim();
  const patMACode = rawDigits ? rawDigits.padStart(2, "0") : (patient?.microareaCodigo || "");
  const patUnitId = (patient as any)?.unidadeId || "USF-003";

  const isAccessAllowed =
    role === "ADMIN" ||
    (role === "GERENTE" && (!userUnitId || patUnitId === userUnitId)) ||
    (role === "ACS" &&
      (!userUnitId || patUnitId === userUnitId) &&
      normalizedAcsCodes.length > 0 &&
      (normalizedAcsCodes.includes(patMACode) || (!!rawDigits && normalizedAcsCodes.includes(rawDigits))));

  const handleToggleCondition = async (
    field: "hasHypertension" | "hasDiabetes" | "isSmoker" | "hasCardiovascularDisease"
  ) => {
    if (role !== "ADMIN" && role !== "GERENTE") return;
    const nextVal = !patient[field];
    try {
      await updatePatientConditionsInStore(patient.id, { [field]: nextVal });
      setPatients((prev) =>
        prev.map((p) => (p.id === patient.id ? { ...p, [field]: nextVal } : p))
      );
    } catch (e) {
      // Ignorar erro silenciosamente
    }
  };

  if (!isAccessAllowed) {
    return (
      <AppLayout pageTitle="Acesso Restrito">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/40 text-center space-y-4 my-8">
          <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-red-900 dark:text-red-200">
            Acesso Restrito ao Prontuário
          </h2>
          <p className="text-xs text-red-700 dark:text-red-300 max-w-md mx-auto">
            Este paciente pertence à <strong>{patient?.microarea || "outra microárea/unidade"}</strong> fora do seu escopo de atuação atribuído ({userProfile?.name || "Usuário"}).
          </p>
          <button
            onClick={() => router.push("/pacientes")}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar para Lista de Pacientes</span>
          </button>
        </div>
      </AppLayout>
    );
  }

  // Consolidar medições de PA para os gráficos (combinando paHistory do doc/mock e medições dos snapshots)
  const paPointsMap = new Map<string, { date: string; systolic: number; diastolic: number }>();
  (patient.paHistory || []).forEach((h) => {
    paPointsMap.set(h.date, { date: h.date, systolic: h.systolic, diastolic: h.diastolic });
  });
  allSnapshots.forEach((s) => {
    const d = s.dataPA || (s.dataCarga ? s.dataCarga.substring(0, 10) : "");
    if (d && s.pressaoSistolica && s.pressaoDiastolica) {
      paPointsMap.set(d, { date: d, systolic: s.pressaoSistolica, diastolic: s.pressaoDiastolica });
    }
  });
  if (patient.lastPA?.date && patient.lastPA?.systolic && patient.lastPA?.diastolic) {
    paPointsMap.set(patient.lastPA.date, {
      date: patient.lastPA.date,
      systolic: patient.lastPA.systolic,
      diastolic: patient.lastPA.diastolic,
    });
  }
  const consolidatedPAHistory = Array.from(paPointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Consolidar medições de Peso e IMC para os gráficos
  const weightPointsMap = new Map<string, { date: string; weight: number; imc: number }>();
  (patient.weightHistory || []).forEach((w) => {
    weightPointsMap.set(w.date, { date: w.date, weight: w.weight, imc: w.imc });
  });
  allSnapshots.forEach((s) => {
    const d = s.dataAntropometria || (s.dataCarga ? s.dataCarga.substring(0, 10) : "");
    if (d && s.peso) {
      weightPointsMap.set(d, { date: d, weight: s.peso, imc: s.imc || 0 });
    }
  });
  if (patient.lastWeight?.date && patient.lastWeight?.weight) {
    weightPointsMap.set(patient.lastWeight.date, {
      date: patient.lastWeight.date,
      weight: patient.lastWeight.weight,
      imc: patient.lastWeight.imc || 0,
    });
  }
  const consolidatedWeightHistory = Array.from(weightPointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const paChartData = consolidatedPAHistory.map((h) => ({
    date: formatDateBR(h.date),
    value1: h.systolic,
    value2: h.diastolic,
    label1: "PA Sistólica (mmHg)",
    label2: "PA Diastólica (mmHg)",
  }));

  const weightChartData = consolidatedWeightHistory.map((w) => ({
    date: formatDateBR(w.date),
    value1: w.weight,
    label1: "Peso (kg)",
  }));

  const imcChartData = consolidatedWeightHistory.map((w) => ({
    date: formatDateBR(w.date),
    value1: w.imc,
    label1: "IMC (kg/m²)",
  }));

  return (
    <AppLayout pageTitle={`Prontuário Individual — ${patient.name}`}>
      {/* Botão de Voltar */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Voltar para lista de pacientes</span>
      </button>

      {/* Cartão de Identificação do Paciente */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 font-extrabold text-xl dark:bg-blue-900/60 dark:text-blue-300">
              {patient.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
                  {patient.name}
                </h1>
                <BadgePriority priority={patient.priority} />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                CPF: {patient.cpf} | CNS: {patient.cns} | {patient.age} anos ({patient.sex})
                {patient.birthDate ? ` | Nasc.: ${formatDateBR(patient.birthDate)}` : ""}
                {patient.raceColor ? ` | Raça/Cor: ${patient.raceColor}` : ""}
                {patient.bolsaFamilia !== undefined
                  ? ` | Bolsa Família: ${patient.bolsaFamilia ? "Sim" : "Não"}`
                  : ""}
              </p>
              {(patient.street || patient.neighborhood || patient.city) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Endereço: {[
                    patient.street,
                    patient.number ? `nº ${patient.number}` : null,
                    patient.complement,
                    patient.neighborhood,
                    patient.city ? `${patient.city}${patient.state ? `/${patient.state}` : ""}` : null,
                    patient.zipCode ? `CEP ${patient.zipCode}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <div className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
              <Phone className="h-3.5 w-3.5 text-zinc-500" />
              <span>{patient.phone || "Sem telefone"}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
              <MapPin className="h-3.5 w-3.5 text-zinc-500" />
              <span>{patient.microarea} ({patient.acsName})</span>
            </div>
          </div>
        </div>

        {/* Tags de Condições Registradas */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Fatores de Risco & Condições DCNT:
            </span>
            {(role === "ADMIN" || role === "GERENTE") && (
              <span className="text-[11px] text-zinc-400">
                Clique em uma condição crônica para ativar/desativar no prontuário:
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(patient.hasHypertension || role === "ADMIN" || role === "GERENTE") && (
              <button
                type="button"
                onClick={() => handleToggleCondition("hasHypertension")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  patient.hasHypertension
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                    : "border border-dashed border-zinc-300 text-zinc-400 hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700"
                } ${role === "ADMIN" || role === "GERENTE" ? "cursor-pointer" : "cursor-default"}`}
              >
                {patient.hasHypertension ? "Hipertensão Arterial (HAS)" : "+ Hipertensão"}
              </button>
            )}
            {(patient.hasDiabetes || role === "ADMIN" || role === "GERENTE") && (
              <button
                type="button"
                onClick={() => handleToggleCondition("hasDiabetes")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  patient.hasDiabetes
                    ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                    : "border border-dashed border-zinc-300 text-zinc-400 hover:border-purple-400 hover:text-purple-600 dark:border-zinc-700"
                } ${role === "ADMIN" || role === "GERENTE" ? "cursor-pointer" : "cursor-default"}`}
              >
                {patient.hasDiabetes ? "Diabetes Mellitus (DM)" : "+ Diabetes"}
              </button>
            )}
            {patient.isObese && (
              <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                Obesidade (IMC &gt;= 30)
              </span>
            )}
            {patient.isOverweight && !patient.isObese && (
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Sobrepeso (IMC &gt;= 25)
              </span>
            )}
            {(patient.isSmoker || role === "ADMIN" || role === "GERENTE") && (
              <button
                type="button"
                onClick={() => handleToggleCondition("isSmoker")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  patient.isSmoker
                    ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    : "border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700"
                } ${role === "ADMIN" || role === "GERENTE" ? "cursor-pointer" : "cursor-default"}`}
              >
                {patient.isSmoker ? "Tabagismo" : "+ Tabagismo"}
              </button>
            )}
            {(patient.hasCardiovascularDisease || role === "ADMIN" || role === "GERENTE") && (
              <button
                type="button"
                onClick={() => handleToggleCondition("hasCardiovascularDisease")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  patient.hasCardiovascularDisease
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    : "border border-dashed border-zinc-300 text-zinc-400 hover:border-rose-400 hover:text-rose-600 dark:border-zinc-700"
                } ${role === "ADMIN" || role === "GERENTE" ? "cursor-pointer" : "cursor-default"}`}
              >
                {patient.hasCardiovascularDisease ? "Doença Cardiovascular" : "+ Doença Cardiovascular"}
              </button>
            )}
            {patient.isElderly && (
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                Idoso (60+ anos)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cards de Métricas do Paciente */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <CardIndicator
          title="Última PA"
          value={patient.lastPA ? `${patient.lastPA.systolic}/${patient.lastPA.diastolic}` : "N/A"}
          subtitle={patient.lastPA ? formatDateBR(patient.lastPA.date) : ""}
          badgeText="mmHg"
          badgeVariant="red"
          icon={Activity}
        />
        <CardIndicator
          title="Peso Atual"
          value={patient.lastWeight ? `${patient.lastWeight.weight} kg` : "N/A"}
          subtitle={patient.lastWeight ? formatDateBR(patient.lastWeight.date) : ""}
          badgeVariant="zinc"
          icon={Scale}
        />
        <CardIndicator
          title="IMC"
          value={patient.lastWeight ? patient.lastWeight.imc.toFixed(1) : "N/A"}
          subtitle={patient.isObese ? "Obesidade" : patient.isOverweight ? "Sobrepeso" : "Adequado"}
          badgeVariant="amber"
        />
        <CardIndicator
          title="Última Consulta"
          value={formatDateBR(patient.lastMedicalApptDate)}
          subtitle="Médica / Enfermagem"
          badgeVariant="blue"
          icon={Calendar}
        />
        <CardIndicator
          title="Última Visita ACS"
          value={formatDateBR(patient.lastVisitDate)}
          subtitle={patient.acsName || "ACS responsável"}
          badgeVariant="emerald"
          icon={Clock}
        />
        <CardIndicator
          title="Situação"
          value={patient.priority}
          subtitle="Busca Ativa"
          badgeVariant="purple"
          icon={Heart}
        />
      </div>

      {/* Seção de Observações da Gerência da Unidade (Editável pelo Gerente, Histórico Visível ao ACS) */}
      <ManagerObservationsSection
        patient={patient}
        observations={allManagerObservations}
        history={allManagerHistory}
        onObservationSaved={(obs, histEntry, isEdit) => {
          setRealManagerObs((prev) =>
            isEdit ? prev.map((o) => (o.id === obs.id ? obs : o)) : [obs, ...prev]
          );
          setRealManagerHist((prev) => [histEntry, ...prev]);
          setPatients((prev) =>
            prev.map((p) => {
              if (p.id !== patient.id) return p;
              const prevObs = p.observacoesGerente || [];
              const nextObs = isEdit
                ? prevObs.map((o) => (o.id === obs.id ? obs : o))
                : [obs, ...prevObs];
              const nextHist = [histEntry, ...(p.historicoObservacoesGerente || [])];
              return {
                ...p,
                observacaoGerenteAtual: obs,
                observacoesGerente: nextObs,
                historicoObservacoesGerente: nextHist,
              };
            })
          );
        }}
      />

      {/* Seção de Motivos da Sinalização (Explicabilidade da Prioridade) */}
      <PriorityExplanationCard patient={patient} allActions={allActions} />

      {/* Histórico e Evolução das Cargas de Dados e-SUS APS */}
      <PatientEvolutionHistory patient={patient} snapshots={allSnapshots} />

      {/* Gráficos de Evolução Temporal */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Evolução da Pressão Arterial (PA sistólica x diastólica)
          </h2>
          <LineChartSVG data={paChartData} yMin={60} yMax={180} />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Evolução do Peso e IMC
          </h2>
          <LineChartSVG data={weightChartData} yMin={50} yMax={110} />
        </div>
      </div>

      {/* Linha do Tempo do Paciente */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          Linha do Tempo de Atendimentos & Acompanhamentos
        </h2>

        {allActions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-xs font-semibold text-zinc-500 dark:border-zinc-800">
            Nenhum acompanhamento registrado para este paciente.
          </div>
        ) : (
          <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-4 space-y-6">
            {allActions.map((action) => {
              const badgeStyle =
                action.tipoAcao === "Visita Domiciliar"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  : action.tipoAcao === "Contato Telefônico"
                  ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                  : action.tipoAcao === "Tentativa Sem Sucesso"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : action.tipoAcao === "Encaminhamento para Consulta"
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                  : action.tipoAcao === "Retorno Agendado"
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

              return (
                <div key={action.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-white bg-blue-600 dark:border-zinc-900" />
                  <div className="space-y-1.5 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${badgeStyle}`}>
                          {action.tipoAcao}
                        </span>
                        <span className="text-xs text-zinc-500 font-bold">
                          {formatDateBR(action.dataAcao)}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        ACS: <span className="text-zinc-800 dark:text-zinc-200">{action.acsNome}</span> ({action.microarea || patient.microarea})
                      </div>
                    </div>

                    {action.resultado && (
                      <div className="text-xs text-zinc-800 dark:text-zinc-200 font-medium">
                        <strong>Resultado / Diagnóstico de Campo:</strong> {action.resultado}
                      </div>
                    )}

                    {action.observacoes && (
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        <strong>Observações e Orientações:</strong> {action.observacoes}
                      </div>
                    )}

                    {action.proximoRetorno && (
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 pt-0.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Previsão do Próximo Retorno: {formatDateBR(action.proximoRetorno)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
