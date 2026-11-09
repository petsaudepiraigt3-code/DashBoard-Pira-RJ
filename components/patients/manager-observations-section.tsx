"use client";

import React, { useState } from "react";
import {
  Patient,
  ManagerObservationRecord,
  ManagerObservationRevision,
  ManagerObservationCategory,
} from "@/types/dcnt";
import {
  addManagerObservationInStore,
  updateManagerObservationInStore,
} from "@/lib/store/patients";
import { useAuth } from "@/context/auth-context";
import { formatDateTimeBR } from "@/lib/utils/formatters";
import {
  ClipboardList,
  PlusCircle,
  Pencil,
  History,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";

export const MANAGER_OBSERVATION_CATEGORIES: ManagerObservationCategory[] = [
  "Ausência em Visita",
  "Orientação para ACS",
  "Apoio à Tomada de Decisão",
  "Dificuldade de Contato / Localização",
  "Recusa ou Impossibilidade de Atendimento",
  "Observação Geral",
];

interface ManagerObservationsSectionProps {
  patient: Patient;
  observations: ManagerObservationRecord[];
  history: ManagerObservationRevision[];
  onObservationSaved: (
    observation: ManagerObservationRecord,
    historyEntry: ManagerObservationRevision,
    isEdit: boolean
  ) => void;
}

export function ManagerObservationsSection({
  patient,
  observations,
  history,
  onObservationSaved,
}: ManagerObservationsSectionProps) {
  const { role, userUnitId, userProfile } = useAuth();
  const canEdit = role === "GERENTE" || role === "ADMIN";

  const [isAdding, setIsAdding] = useState(false);
  const [editingObs, setEditingObs] = useState<ManagerObservationRecord | null>(null);
  const [categoria, setCategoria] = useState<string>("Ausência em Visita");
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showFullHistory, setShowFullHistory] = useState(true);

  const handleStartAdd = () => {
    if (!canEdit) return;
    setEditingObs(null);
    setCategoria("Ausência em Visita");
    setTexto("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsAdding(true);
  };

  const handleStartEdit = (obs: ManagerObservationRecord) => {
    if (!canEdit) return;
    setIsAdding(false);
    setEditingObs(obs);
    setCategoria(obs.categoria || "Observação Geral");
    setTexto(obs.texto || "");
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingObs(null);
    setTexto("");
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setErrorMsg("Apenas o Gerente de Unidade possui permissão para registrar ou editar observações.");
      return;
    }
    if (!texto.trim()) {
      setErrorMsg("Por favor, preencha o texto da observação.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (editingObs) {
        const { observation, historyEntry } = await updateManagerObservationInStore(
          patient.id,
          editingObs.id,
          {
            texto: texto.trim(),
            categoria,
            autorId: userProfile?.uid || "gerente-uid",
            autorNome: userProfile?.name || "Gerente da Unidade",
            autorPerfil: role,
          },
          editingObs
        );
        onObservationSaved(observation, historyEntry, true);
        setEditingObs(null);
        setTexto("");
        setSuccessMsg("Observação atualizada e registrada no histórico com sucesso.");
      } else {
        const { observation, historyEntry } = await addManagerObservationInStore(patient.id, {
          unidadeId: patient.unidadeId || userUnitId || "USF-003",
          texto: texto.trim(),
          categoria,
          autorId: userProfile?.uid || "gerente-uid",
          autorNome: userProfile?.name || "Gerente da Unidade",
          autorPerfil: role,
        });
        onObservationSaved(observation, historyEntry, false);
        setIsAdding(false);
        setTexto("");
        setSuccessMsg("Nova observação acrescentada ao prontuário e disponibilizada para o ACS.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Erro ao salvar observação. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const categoryBadgeStyle = (cat: string) => {
    switch (cat) {
      case "Ausência em Visita":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800";
      case "Orientação para ACS":
        return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800";
      case "Apoio à Tomada de Decisão":
        return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800";
      case "Dificuldade de Contato / Localização":
        return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800";
      case "Recusa ou Impossibilidade de Atendimento":
        return "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800";
      default:
        return "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  return (
    <section
      aria-labelledby="observacoes-gerente-titulo"
      className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-2xs dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-4"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-200/70 pb-3.5 dark:border-indigo-900/50">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-2xs shrink-0">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="observacoes-gerente-titulo"
                className="text-sm font-extrabold uppercase tracking-tight text-indigo-950 dark:text-indigo-100"
              >
                Observações da Gerência da Unidade
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800 border border-indigo-300 dark:bg-indigo-900/70 dark:text-indigo-200 dark:border-indigo-700">
                <ShieldCheck className="h-3 w-3" />
                {canEdit
                  ? "Controle Gerencial (Edição Habilitada)"
                  : "Visível para ACS — Orientação da Gerência"}
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Registro gerencial editável com histórico completo para acompanhamento de ausências em visitas, orientações ao ACS e tomada de decisão.
            </p>
          </div>
        </div>

        {canEdit && !isAdding && !editingObs && (
          <button
            type="button"
            onClick={handleStartAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition-colors cursor-pointer shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Acrescentar Observação</span>
          </button>
        )}
      </div>

      {/* Mensagens de Sucesso / Erro */}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-[11px] underline hover:no-underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Formulário de Criação / Edição (exclusivo para GERENTE / ADMIN) */}
      {canEdit && (isAdding || editingObs) && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-indigo-300 bg-white p-4 shadow-xs dark:border-indigo-800 dark:bg-zinc-900 space-y-3.5"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5 dark:border-zinc-800">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
              {editingObs
                ? "Editar Observação da Gerência (Mantém Histórico)"
                : "Nova Observação da Gerência para o Paciente"}
            </h3>
            <span className="text-[11px] text-zinc-500">
              Responsável: <strong>{userProfile?.name || "Gerente da Unidade"}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Contexto / Situação da Observação
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-indigo-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {MANAGER_OBSERVATION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Descrição da Observação / Orientação para o ACS
            </label>
            <textarea
              rows={3}
              required
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex: ACS tentou visitar o paciente e foi impossibilitado por ausência no domicílio. Orientado reagendar visita em horário alternativo e registrar retorno..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-indigo-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {editingObs && (
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Ao salvar a edição, o texto anterior (<em>&ldquo;{editingObs.texto}&rdquo;</em>) ficará preservado no histórico abaixo para consulta do ACS e da Gerência.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-lg border border-zinc-300 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving
                ? "Salvando..."
                : editingObs
                ? "Salvar Edição no Histórico"
                : "Salvar Observação"}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Observações Vigentes */}
      {observations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 bg-white/70 p-6 text-center dark:border-indigo-900/40 dark:bg-zinc-900/50">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Nenhuma observação gerencial registrada para este paciente até o momento.
          </p>
          {canEdit && !isAdding && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Clique em <strong>&ldquo;Acrescentar Observação&rdquo;</strong> acima para registrar uma anotação (ex.: paciente ausente na visita do ACS, orientação de busca ativa ou apoio à decisão).
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {observations.map((obs, idx) => {
            const isLatest = idx === 0;
            return (
              <div
                key={obs.id}
                className={`rounded-xl border p-4 transition-all ${
                  isLatest
                    ? "border-indigo-300 bg-white shadow-xs dark:border-indigo-800 dark:bg-zinc-900"
                    : "border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isLatest && (
                      <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        Observação Atual
                      </span>
                    )}
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${categoryBadgeStyle(
                        obs.categoria
                      )}`}
                    >
                      {obs.categoria || "Observação Geral"}
                    </span>
                    {obs.editado && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                        <Pencil className="h-2.5 w-2.5" />
                        Editada
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {obs.editado
                        ? `Atualizada em ${formatDateTimeBR(obs.updatedAt)}`
                        : `Registrada em ${formatDateTimeBR(obs.createdAt)}`}
                    </span>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(obs)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900 transition-colors cursor-pointer"
                        title="Editar esta observação (mantendo histórico)"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Editar</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 whitespace-pre-line leading-relaxed">
                  {obs.texto}
                </p>

                <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    Registrado por: <strong className="text-zinc-700 dark:text-zinc-300">{obs.autorNome}</strong> ({obs.autorPerfil === "ADMIN" ? "Administração" : "Gerente de Unidade"})
                  </span>
                  {obs.editado && (
                    <span>
                      Criação original: {formatDateTimeBR(obs.createdAt)} ({obs.historicoEdicoes?.length || 1} registro(s) no histórico)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico Completo de Observações e Edições (Visível para ACS e Gerente) */}
      {history.length > 0 && (
        <div className="pt-2 border-t border-indigo-200/70 dark:border-indigo-900/50 space-y-3">
          <button
            type="button"
            onClick={() => setShowFullHistory((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-xs font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-200 hover:text-indigo-700 cursor-pointer py-1"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Histórico de Observações e Edições ({history.length})</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {showFullHistory ? (
                <>
                  <span>Ocultar histórico</span>
                  <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  <span>Ver histórico completo</span>
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </span>
          </button>

          {showFullHistory && (
            <div className="relative border-l-2 border-indigo-300 dark:border-indigo-800 ml-3 space-y-3 pt-1">
              {history.map((rev) => {
                const isEdit = rev.tipoEvento === "EDICAO";
                return (
                  <div key={rev.id} className="relative pl-5">
                    <div
                      className={`absolute -left-[7px] top-2 h-3 w-3 rounded-full border-2 border-white dark:border-zinc-900 ${
                        isEdit ? "bg-amber-500" : "bg-indigo-600"
                      }`}
                    />
                    <div className="rounded-lg border border-zinc-200/80 bg-white/90 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/80 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isEdit
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}
                          >
                            {isEdit ? "Edição de Observação" : "Observação Criada"}
                          </span>
                          {rev.categoriaNova && (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {rev.categoriaNova}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-zinc-500">
                            {formatDateTimeBR(rev.dataRegistro)}
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Por: <strong className="text-zinc-800 dark:text-zinc-200">{rev.autorNome}</strong>
                        </span>
                      </div>

                      <div className="text-zinc-800 dark:text-zinc-200 font-medium">
                        <span className="font-bold text-zinc-600 dark:text-zinc-400">
                          {isEdit ? "Texto atualizado: " : "Observação registrada: "}
                        </span>
                        {rev.textoNovo}
                      </div>

                      {isEdit && rev.textoAnterior && (
                        <div className="rounded border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5 text-[11px] text-zinc-600 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-zinc-400">
                          <strong className="text-amber-900 dark:text-amber-300">Texto anterior: </strong>
                          <span className="italic">{rev.textoAnterior}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

