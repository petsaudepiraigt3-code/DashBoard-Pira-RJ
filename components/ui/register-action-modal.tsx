"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "./modal";
import {
  BoaPraticaCode,
  BoaPraticaManualOverride,
  DcntParameters,
  Patient,
  PatientActionType,
  PriorityLevel,
} from "@/types/dcnt";
import {
  savePatientActionInStore,
  UpdateBoasPraticasPayload,
  updatePatientBoasPraticasInStore,
} from "@/lib/store/patients";
import { DEFAULT_DCNT_PARAMETERS, getDcntParametersFromStore } from "@/lib/store/parameters";
import { evaluatePatientBoasPraticas } from "@/lib/utils/boas-praticas";
import { calculateAdminPriorityScore } from "@/lib/utils/priority";
import { useAuth } from "@/context/auth-context";
import { CheckCircle2, AlertTriangle } from "lucide-react";

interface RegisterActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onActionSaved?: (updatedPatient: Patient) => void;
}

export function RegisterActionModal({
  isOpen,
  onClose,
  patient,
  onActionSaved,
}: RegisterActionModalProps) {
  const { role, userUnitId, userProfile } = useAuth();

  const [actionDate, setActionDate] = useState("");
  const [actionType, setActionType] = useState<PatientActionType>("Visita Domiciliar");
  const [actionResult, setActionResult] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [nextReturnDate, setNextReturnDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [dcntParams, setDcntParams] = useState<DcntParameters>(DEFAULT_DCNT_PARAMETERS);
  const [checkedBp, setCheckedBp] = useState<Partial<Record<BoaPraticaCode, boolean>>>({});
  const [bpDates, setBpDates] = useState<Partial<Record<BoaPraticaCode, string>>>({});

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const todayIso = `${year}-${month}-${day}`;
      setActionDate(todayIso);
      setActionType("Visita Domiciliar");
      setActionResult("");
      setActionNotes("");
      setNextReturnDate("");
      setCheckedBp({});
      setBpDates({
        A: todayIso,
        B: todayIso,
        C: todayIso,
        D: todayIso,
        E: todayIso,
        F: todayIso,
      });
      getDcntParametersFromStore()
        .then((loaded) => setDcntParams(loaded))
        .catch(() => {});
    }
  }, [isOpen]);

  const currentBpSummary = useMemo(() => {
    if (!patient) return null;
    return evaluatePatientBoasPraticas(patient, dcntParams);
  }, [patient, dcntParams]);

  if (!patient) return null;

  const isHasOrDm = Boolean(patient.hasHypertension || patient.hasDiabetes);

  const handleToggleBp = (code: BoaPraticaCode) => {
    setCheckedBp((prev) => ({ ...prev, [code]: !prev[code] }));
    setBpDates((prev) => ({
      ...prev,
      [code]: prev[code] || actionDate || new Date().toISOString().substring(0, 10),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (role !== "ACS") {
      alert("Apenas Agentes Comunitários de Saúde (ACS) possuem permissão para registrar ações operacionais.");
      onClose();
      return;
    }

    setSaving(true);

    try {
      const isNoStatusChange =
        actionType === "Tentativa Sem Sucesso" || actionType === "Retorno Agendado";
      const isVisit = actionType === "Visita Domiciliar";
      const isSuccessfulContact =
        isVisit ||
        actionType === "Contato Telefônico" ||
        actionType === "Atendimento/Comparecimento na UBS";

      const selectedBpCodes = (Object.keys(checkedBp) as BoaPraticaCode[]).filter(
        (code) => Boolean(checkedBp[code])
      );
      const hasAnyBpUpdate = isHasOrDm && selectedBpCodes.length > 0;

      // Preparar atualizações de Boas Práticas se o paciente possuir HAS ou DM
      const nowIso = new Date().toISOString();
      const newManuais: Partial<Record<BoaPraticaCode, BoaPraticaManualOverride>> = {
        ...(patient.boasPraticasManuais || {}),
      };
      const bpFieldUpdates: UpdateBoasPraticasPayload = {};
      const localPatch: Partial<Patient> = {};

      if (hasAnyBpUpdate) {
        selectedBpCodes.forEach((code) => {
          const dt = bpDates[code] || actionDate;
          newManuais[code] = {
            cumprida: true,
            data: dt,
            observacao: `Verificado pelo ACS em ${actionType}`,
            atualizadoPor: userProfile?.name || "ACS responsável",
            atualizadoEm: nowIso,
          };

          if (code === "A") {
            bpFieldUpdates.dataUltimaConsulta = dt;
            localPatch.lastMedicalApptDate = dt;
          } else if (code === "B") {
            bpFieldUpdates.dataUltimaPA = dt;
            if (patient.lastPA) {
              localPatch.lastPA = { ...patient.lastPA, date: dt };
            }
          } else if (code === "C") {
            bpFieldUpdates.dataUltimaAntropometria = dt;
            if (patient.lastWeight) {
              localPatch.lastWeight = { ...patient.lastWeight, date: dt };
            }
          } else if (code === "D") {
            bpFieldUpdates.visitasDomiciliares12Meses = Math.max(
              patient.homeVisitsCount12m || 0,
              2
            );
            localPatch.homeVisitsCount12m = bpFieldUpdates.visitasDomiciliares12Meses;
            if (patient.lastVisitDate && dt > patient.lastVisitDate) {
              bpFieldUpdates.dataPenultimaVisitaACS = patient.lastVisitDate;
              bpFieldUpdates.dataUltimaVisitaACS = dt;
              localPatch.previousVisitDate = patient.lastVisitDate;
            }
          } else if (code === "E") {
            bpFieldUpdates.dataUltimaHemoglobinaGlicada = dt;
            bpFieldUpdates.hbA1cStatus = true;
            localPatch.lastHbA1cDate = dt;
            localPatch.hbA1cStatus = true;
          } else if (code === "F") {
            bpFieldUpdates.dataUltimaAvaliacaoPes = dt;
            bpFieldUpdates.footExamStatus = true;
            localPatch.lastFootExamDate = dt;
            localPatch.footExamStatus = true;
          }
        });
        bpFieldUpdates.boasPraticasManuais = newManuais;
      }

      const currentHistorico = patient.historicoAcoes || [];
      const optimisticAction = {
        id: `act_preview_${Date.now()}`,
        patientId: patient.id,
        unidadeId: patient.unidadeId || userUnitId || "USF-003",
        microarea: patient.microarea,
        microareaCodigo: (patient.microarea || "").replace(/\D/g, "").trim(),
        acsId: userProfile?.uid || "acs-uid",
        acsNome: userProfile?.name || patient.acsName || "ACS responsável",
        tipoAcao: actionType,
        dataAcao: actionDate,
        resultado: actionResult,
        observacoes: actionNotes,
        proximoRetorno: nextReturnDate,
        createdAt: nowIso,
      };

      const nextHistoricoPreview = [optimisticAction, ...currentHistorico];
      const nextLastVisit = isVisit
        ? actionDate
        : localPatch.lastVisitDate || patient.lastVisitDate;

      let newPriority: PriorityLevel | undefined = undefined;
      if (isHasOrDm && (!isNoStatusChange || hasAnyBpUpdate)) {
        const calc = calculateAdminPriorityScore(
          {
            systolic: patient.lastPA?.systolic,
            diastolic: patient.lastPA?.diastolic,
            dataPA: bpFieldUpdates.dataUltimaPA || patient.lastPA?.date,
            monthsSinceHomeVisit: isVisit ? 0 : patient.monthsSinceHomeVisit,
            lastHomeVisit: nextLastVisit,
            isElderly: patient.isElderly,
            isObese: patient.isObese,
            isChildUnder2: patient.isChildUnder2,
            age: patient.age,
            hasHypertension: patient.hasHypertension,
            hasDiabetes: patient.hasDiabetes,
            lastMedicalCare: bpFieldUpdates.dataUltimaConsulta || patient.lastMedicalApptDate,
            lastNursingCare: patient.lastNursingApptDate,
            daysSinceMedicalCare: patient.daysSinceMedicalCare,
            monthsSinceMedicalCare: patient.monthsSinceMedicalCare,
            daysSinceNursingCare: patient.daysSinceNursingCare,
            monthsSinceNursingCare: patient.monthsSinceNursingCare,
            peso: patient.lastWeight?.weight,
            altura: patient.lastWeight?.height,
            dataMedicao: bpFieldUpdates.dataUltimaAntropometria || patient.lastWeight?.date,
            lastHbA1cDate: bpFieldUpdates.dataUltimaHemoglobinaGlicada || patient.lastHbA1cDate,
            hbA1cStatus: bpFieldUpdates.hbA1cStatus ?? patient.hbA1cStatus,
            lastFootExamDate: bpFieldUpdates.dataUltimaAvaliacaoPes || patient.lastFootExamDate,
            footExamStatus: bpFieldUpdates.footExamStatus ?? patient.footExamStatus,
            homeVisitsCount12m: bpFieldUpdates.visitasDomiciliares12Meses ?? patient.homeVisitsCount12m,
            previousVisitDate: bpFieldUpdates.dataPenultimaVisitaACS || patient.previousVisitDate,
            historicoAcoes: nextHistoricoPreview,
            historicoCargas: patient.historicoCargas,
            boasPraticasManuais: newManuais,
          },
          dcntParams
        );
        newPriority = calc.priority;
      } else if (!isNoStatusChange && isSuccessfulContact) {
        newPriority = "Acompanhado";
      }

      const newVisitDate = isVisit ? actionDate : undefined;

      const savedAction = await savePatientActionInStore(
        patient.id,
        {
          patientId: patient.id,
          unidadeId: patient.unidadeId || userUnitId || "USF-003",
          microarea: patient.microarea,
          microareaCodigo: (patient.microarea || "").replace(/\D/g, "").trim(),
          acsId: userProfile?.uid || "acs-uid",
          acsNome: userProfile?.name || patient.acsName || "ACS responsável",
          tipoAcao: actionType,
          dataAcao: actionDate,
          resultado: actionResult,
          observacoes: actionNotes,
          proximoRetorno: nextReturnDate,
        },
        newPriority,
        newVisitDate,
        role
      );

      let persistedBpResult: Awaited<ReturnType<typeof updatePatientBoasPraticasInStore>> | null =
        null;
      if (isHasOrDm && (hasAnyBpUpdate || isSuccessfulContact)) {
        persistedBpResult = await updatePatientBoasPraticasInStore(
          patient.id,
          bpFieldUpdates
        ).catch(() => null);
      }

      const updatedHistorico = [savedAction, ...currentHistorico];

      const updatedPriority =
        persistedBpResult?.priority ??
        newPriority ??
        patient.priority;

      const updatedStatus = isNoStatusChange
        ? patient.activeSearchStatus
        : updatedPriority === "Acompanhado"
        ? ("Acompanhado" as const)
        : isSuccessfulContact
        ? ("Em Contato" as const)
        : patient.activeSearchStatus;

      const finalBoasPraticas =
        persistedBpResult?.boasPraticas ??
        (isHasOrDm
          ? evaluatePatientBoasPraticas(
              {
                ...patient,
                ...localPatch,
                lastVisitDate: isVisit ? actionDate : patient.lastVisitDate,
                historicoAcoes: updatedHistorico,
                boasPraticasManuais: newManuais,
              },
              dcntParams
            )
          : patient.boasPraticas);

      const updatedPatient: Patient = {
        ...patient,
        ...localPatch,
        lastVisitDate: isVisit ? actionDate : patient.lastVisitDate,
        activeSearchStatus: updatedStatus,
        priority: updatedPriority,
        activeSearchReason: persistedBpResult?.activeSearchReason ?? patient.activeSearchReason,
        boasPraticasManuais: persistedBpResult?.boasPraticasManuais ?? newManuais,
        boasPraticas: finalBoasPraticas,
        historicoAcoes: updatedHistorico,
        timeline: [
          {
            id: savedAction.id,
            date: actionDate,
            type: isVisit
              ? "Visita ACS"
              : actionType === "Contato Telefônico"
              ? "Contato Telefônico"
              : "Busca Ativa",
            title: `Registro de ${actionType}`,
            description: `${actionResult}${actionNotes ? `. OBS: ${actionNotes}` : ""}`,
            professional: userProfile?.name || "Operador de Saúde",
          },
          ...(patient.timeline || []),
        ],
      };

      if (onActionSaved) {
        onActionSaved(updatedPatient);
      }

      onClose();
    } catch (err) {
      console.error("Erro ao salvar ação:", err);
      alert("Ocorreu um erro ao salvar a ação. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Registrar Ação — ${patient.name}`}
      subtitle={`Microárea: ${patient.microarea} | ACS: ${patient.acsName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Data da Ação</label>
            <input
              type="date"
              required
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Tipo de Ação</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as PatientActionType)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="Visita Domiciliar">Visita Domiciliar</option>
              <option value="Contato Telefônico">Contato Telefônico</option>
              <option value="Tentativa Sem Sucesso">Tentativa Sem Sucesso</option>
              <option value="Encaminhamento para Consulta">Encaminhamento para Consulta</option>
              <option value="Retorno Agendado">Retorno Agendado</option>
              <option value="Atendimento/Comparecimento na UBS">Atendimento/Comparecimento na UBS</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Resultado / Diagnóstico de Campo</label>
          <input
            type="text"
            required
            value={actionResult}
            onChange={(e) => setActionResult(e.target.value)}
            placeholder="Ex: Paciente orientado, PA aferida em 135/85 mmHg"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        {/* Atualização das Boas Práticas (para pacientes com Hipertensão ou Diabetes) */}
        {isHasOrDm && currentBpSummary && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2.5 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-blue-900 dark:text-blue-200">
                Atualizar Boas Práticas Verificadas pelo ACS (HAS / DM)
              </span>
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                {currentBpSummary.earnedPoints}/{currentBpSummary.totalPossiblePoints} pts atuais
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              Marque as boas práticas verificadas ou realizadas durante este acompanhamento:
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {currentBpSummary.items
                .filter((it) => it.applicable)
                .map((item) => {
                  const isChecked = Boolean(checkedBp[item.code]);
                  return (
                    <div
                      key={item.code}
                      className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900 space-y-1.5"
                    >
                      <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleBp(item.code)}
                            className="rounded border-zinc-300 text-blue-600"
                          />
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10px] font-extrabold text-white">
                            {item.code}
                          </span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                            {item.shortTitle} ({item.points} pts)
                          </span>
                        </div>
                        {item.fulfilled ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> Em dia
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                            <AlertTriangle className="h-3 w-3" /> Pendente
                          </span>
                        )}
                      </label>

                      {isChecked && (
                        <div className="flex items-center gap-2 pl-6 text-[11px]">
                          <span className="text-zinc-500 font-semibold">Data:</span>
                          <input
                            type="date"
                            value={bpDates[item.code] || actionDate}
                            onChange={(e) =>
                              setBpDates((prev) => ({ ...prev, [item.code]: e.target.value }))
                            }
                            className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Observações e Orientações</label>
          <textarea
            rows={3}
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="Digite observações sobre medicação, recusa ou situação encontrada..."
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Previsão de Próximo Retorno (Opcional)</label>
          <input
            type="date"
            value={nextReturnDate}
            onChange={(e) => setNextReturnDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar Acompanhamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
