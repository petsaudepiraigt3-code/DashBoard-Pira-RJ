"use client";

import React, { useState } from "react";
import {
  BoaPraticaCode,
  BoaPraticaItem,
  BoaPraticaManualOverride,
  DcntParameters,
  Patient,
  PatientActionRecord,
  PatientBoasPraticasSummary,
  PriorityLevel,
} from "@/types/dcnt";
import { evaluatePatientBoasPraticas } from "@/lib/utils/boas-praticas";
import {
  UpdateBoasPraticasPayload,
  updatePatientBoasPraticasInStore,
} from "@/lib/store/patients";
import { DEFAULT_DCNT_PARAMETERS } from "@/lib/store/parameters";
import { BadgePriority } from "@/components/ui/badge-priority";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Edit3,
  Loader2,
  Users,
  X,
  Check,
} from "lucide-react";

interface BoasPraticasCardProps {
  patient: Patient;
  allActions?: PatientActionRecord[];
  params?: DcntParameters;
  userRole?: string;
  userName?: string;
  onPatientUpdated?: (updated: Partial<Patient>) => void;
}

export function BoasPraticasCard({
  patient,
  allActions,
  params = DEFAULT_DCNT_PARAMETERS,
  userRole,
  userName,
  onPatientUpdated,
}: BoasPraticasCardProps) {
  const [editingCode, setEditingCode] = useState<BoaPraticaCode | null>(null);
  const [editDate, setEditDate] = useState<string>("");
  const [editConfirmTwoVisits, setEditConfirmTwoVisits] = useState<boolean>(false);
  const [editFulfilled, setEditFulfilled] = useState<boolean>(true);
  const [editNotes, setEditNotes] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const summary: PatientBoasPraticasSummary = evaluatePatientBoasPraticas(
    {
      ...patient,
      historicoAcoes: allActions || patient.historicoAcoes,
    },
    params
  );

  const canEdit = userRole === "ACS" || userRole === "GERENTE" || userRole === "ADMIN";

  if (!patient.hasHypertension && !patient.hasDiabetes) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
              Boas Práticas — Diabetes e Hipertensão
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Parâmetros de atenção do ACS aplicados automaticamente quando o paciente possui{" "}
              <strong>Hipertensão Arterial (HAS)</strong> ou <strong>Diabetes Mellitus (DM)</strong>.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const startEdit = (item: BoaPraticaItem) => {
    const todayIso = new Date().toISOString().substring(0, 10);
    setEditingCode(item.code);
    setEditDate(item.lastDate || todayIso);
    setEditFulfilled(true);
    setEditConfirmTwoVisits(item.code === "D" ? summary.homeVisitsValidCount12m >= 2 : false);
    setEditNotes(patient.boasPraticasManuais?.[item.code]?.observacao || "");
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setSaveError(null);
  };

  const handleSaveItem = async (item: BoaPraticaItem) => {
    setSaving(true);
    setSaveError(null);
    try {
      const nowIso = new Date().toISOString();
      const chosenDate = editDate || nowIso.substring(0, 10);

      const manualEntry: BoaPraticaManualOverride = {
        cumprida: editFulfilled,
        data: editFulfilled ? chosenDate : undefined,
        observacao: editNotes.trim() || undefined,
        atualizadoPor: userName || userRole || "Equipe de Saúde",
        atualizadoEm: nowIso,
      };

      const updates: UpdateBoasPraticasPayload = {
        boasPraticasManuais: {
          [item.code]: manualEntry,
        },
      };

      const localPatch: Partial<Patient> = {};

      if (item.code === "A" && editFulfilled) {
        updates.dataUltimaConsulta = chosenDate;
        localPatch.lastMedicalApptDate = chosenDate;
      } else if (item.code === "B" && editFulfilled) {
        updates.dataUltimaPA = chosenDate;
        if (patient.lastPA) {
          localPatch.lastPA = { ...patient.lastPA, date: chosenDate };
        }
      } else if (item.code === "C" && editFulfilled) {
        updates.dataUltimaAntropometria = chosenDate;
        if (patient.lastWeight) {
          localPatch.lastWeight = { ...patient.lastWeight, date: chosenDate };
        }
      } else if (item.code === "D") {
        if (editFulfilled) {
          if (patient.lastVisitDate && chosenDate > patient.lastVisitDate) {
            updates.dataPenultimaVisitaACS = patient.lastVisitDate;
            updates.dataUltimaVisitaACS = chosenDate;
            localPatch.previousVisitDate = patient.lastVisitDate;
            localPatch.lastVisitDate = chosenDate;
          } else if (patient.lastVisitDate && chosenDate < patient.lastVisitDate) {
            updates.dataPenultimaVisitaACS = chosenDate;
            localPatch.previousVisitDate = chosenDate;
          } else {
            updates.dataUltimaVisitaACS = chosenDate;
            localPatch.lastVisitDate = chosenDate;
          }
          if (editConfirmTwoVisits) {
            updates.visitasDomiciliares12Meses = 2;
            localPatch.homeVisitsCount12m = 2;
          }
        } else {
          updates.visitasDomiciliares12Meses = 0;
          localPatch.homeVisitsCount12m = 0;
        }
      } else if (item.code === "E") {
        updates.dataUltimaHemoglobinaGlicada = editFulfilled ? chosenDate : null;
        updates.hbA1cStatus = editFulfilled;
        localPatch.lastHbA1cDate = editFulfilled ? chosenDate : undefined;
        localPatch.hbA1cStatus = editFulfilled;
      } else if (item.code === "F") {
        updates.dataUltimaAvaliacaoPes = editFulfilled ? chosenDate : null;
        updates.footExamStatus = editFulfilled;
        localPatch.lastFootExamDate = editFulfilled ? chosenDate : undefined;
        localPatch.footExamStatus = editFulfilled;
      }

      const result = await updatePatientBoasPraticasInStore(patient.id, updates);

      if (onPatientUpdated) {
        onPatientUpdated({
          ...localPatch,
          boasPraticasManuais: result.boasPraticasManuais,
          boasPraticas: result.boasPraticas,
          priority: result.priority as PriorityLevel,
          activeSearchReason: result.activeSearchReason,
        });
      }

      setEditingCode(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Erro ao atualizar registro da Boa Prática."
      );
    } finally {
      setSaving(false);
    }
  };

  const progressBarColor =
    summary.complianceRate === 100
      ? "bg-emerald-500"
      : summary.attentionLevel === "Alta"
      ? "bg-red-500"
      : summary.attentionLevel === "Média"
      ? "bg-amber-500"
      : "bg-blue-500";

  return (
    <section
      aria-labelledby="boas-praticas-titulo"
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="boas-praticas-titulo"
                className="text-base font-extrabold text-blue-800 dark:text-blue-300 tracking-tight"
              >
                Boas Práticas — Diabetes e Hipertensão
              </h2>
              {patient.hasHypertension && (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  HAS
                </span>
              )}
              {patient.hasDiabetes && (
                <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  DM
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Parâmetros que medem o grau de atenção que o ACS deve dedicar a este paciente.
            </p>
          </div>
        </div>

        {/* Resumo do Grau de Atenção e Conformidade */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
            <span className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">
              Práticas em Dia
            </span>
            <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
              {summary.completedCount} de {summary.totalApplicableCount}{" "}
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                ({summary.complianceRate}%)
              </span>
            </span>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
            <span className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">
              Pendências
            </span>
            <span
              className={`text-sm font-extrabold ${
                summary.pendingCount > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {summary.pendingCount === 0
                ? "Nenhuma pendência"
                : `${summary.pendingCount} prática${summary.pendingCount === 1 ? "" : "s"} pendente${summary.pendingCount === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
            <span className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 mb-0.5">
              Grau de Atenção do ACS
            </span>
            <BadgePriority priority={summary.attentionLevel} />
          </div>
        </div>
      </div>

      {/* Barra de Progresso de Conformidade */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-zinc-700 dark:text-zinc-300">{summary.attentionLabel}</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {summary.completedCount} de {summary.totalApplicableCount} boas práticas em dia
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
            style={{ width: `${summary.complianceRate}%` }}
          />
        </div>
      </div>

      {/* Grid das 6 Boas Práticas (A, B, C, D, E, F) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summary.items.map((item) => {
          const isEditing = editingCode === item.code;

          return (
            <div
              key={item.code}
              className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                !item.applicable
                  ? "border-zinc-200 bg-zinc-50/50 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
                  : item.fulfilled
                  ? "border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                  : "border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/10"
              }`}
            >
              <div className="space-y-3">
                {/* Linha superior: Selo Letra + Texto da Boa Prática */}
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-extrabold text-white shadow-2xs">
                    {item.code}
                  </span>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Divisor + Prazo + Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/70 pt-2.5 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Prazo: últimos {item.maxMonths} meses</span>
                  </div>

                  {item.applicable ? (
                    item.fulfilled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Em dia
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Pendente • Atenção ACS
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      Não aplicável
                    </span>
                  )}
                </div>

                {/* Situação detalhada */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span>{item.detailText}</span>
                  </span>

                  {canEdit && item.applicable && !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>{item.fulfilled ? "Atualizar" : "Registrar"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Mini-formulário inline de atualização da Boa Prática */}
              {isEditing && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3 space-y-2.5 dark:border-blue-900/60 dark:bg-zinc-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-blue-700 dark:text-blue-300">
                      Registrar Boa Prática {item.code}
                    </span>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                        Situação
                      </label>
                      <select
                        value={editFulfilled ? "sim" : "nao"}
                        onChange={(e) => setEditFulfilled(e.target.value === "sim")}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value="sim">Realizada / Em dia</option>
                        <option value="nao">Pendente / Não realizada</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                        Data do Registro
                      </label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        disabled={!editFulfilled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {item.code === "D" && editFulfilled && (
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editConfirmTwoVisits}
                        onChange={(e) => setEditConfirmTwoVisits(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <span>
                        Confirmar cumprimento das 2 visitas domiciliares (intervalo ≥ 30 dias em 12 meses)
                      </span>
                    </label>
                  )}

                  <div>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Observação opcional (ex: exame avaliado na UBS)..."
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>

                  {saveError && (
                    <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                      {saveError}
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="rounded-lg border border-zinc-300 px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveItem(item)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      <span>Salvar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
