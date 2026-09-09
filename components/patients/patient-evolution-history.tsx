"use client";

import React, { useState } from "react";
import { Patient, PatientCargaSnapshot } from "@/types/dcnt";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/formatters";
import { BadgePriority } from "@/components/ui/badge-priority";
import {
  History,
  TrendingDown,
  TrendingUp,
  Minus,
  FileSpreadsheet,
  Activity,
  Scale,
  Clock,
  UserCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface PatientEvolutionHistoryProps {
  patient: Patient;
  snapshots?: PatientCargaSnapshot[];
}

export function PatientEvolutionHistory({
  patient,
  snapshots,
}: PatientEvolutionHistoryProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Utilizar snapshots recebidos ou do paciente
  const historyList = snapshots || patient.historicoCargas || [];

  // Ordenar do mais recente para o mais antigo por dataCarga
  const sortedHistory = [...historyList].sort((a, b) =>
    (b.dataCarga || "").localeCompare(a.dataCarga || "")
  );

  const latestSnapshot = sortedHistory.length > 0 ? sortedHistory[0] : null;
  const previousSnapshot = sortedHistory.length > 1 ? sortedHistory[1] : null;

  const toggleRow = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3.5 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
              <span>Evolução por Cargas de Dados</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                {sortedHistory.length} {sortedHistory.length === 1 ? "carga registrada" : "cargas registradas"}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Histórico temporal das medições clínicas e acompanhamentos importados via arquivo CSV/e-SUS APS.
            </p>
          </div>
        </div>
      </div>

      {/* Cards de Resumo da Evolução Recente (se houver histórico) */}
      {sortedHistory.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card Evolução da PA */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Pressão Arterial
              </span>
              {latestSnapshot?.comparativo?.statusPA === "Melhorou" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <TrendingDown className="h-3 w-3" /> Melhorou
                </span>
              ) : latestSnapshot?.comparativo?.statusPA === "Piorou" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                  <TrendingUp className="h-3 w-3" /> Elevou
                </span>
              ) : latestSnapshot?.comparativo?.statusPA === "Estável" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                  <Minus className="h-3 w-3" /> Estável
                </span>
              ) : (
                <span className="text-[10px] text-zinc-400 font-medium">Registrado</span>
              )}
            </div>
            <div className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">
              {latestSnapshot?.pressaoSistolica && latestSnapshot?.pressaoDiastolica
                ? `${latestSnapshot.pressaoSistolica}/${latestSnapshot.pressaoDiastolica} mmHg`
                : "Sem medição"}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {latestSnapshot?.comparativo?.deltaSistolica !== undefined ? (
                <span>
                  Variação:{" "}
                  <strong
                    className={
                      latestSnapshot.comparativo.deltaSistolica < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : latestSnapshot.comparativo.deltaSistolica > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-600 dark:text-zinc-400"
                    }
                  >
                    {latestSnapshot.comparativo.deltaSistolica > 0 ? "+" : ""}
                    {latestSnapshot.comparativo.deltaSistolica} mmHg
                  </strong>{" "}
                  na sistólica
                </span>
              ) : (
                <span>Última carga processada</span>
              )}
            </div>
          </div>

          {/* Card Evolução de Peso / IMC */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Peso Corporal & IMC
              </span>
              {latestSnapshot?.comparativo?.statusPeso === "Reduziu" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <TrendingDown className="h-3 w-3" /> Reduziu
                </span>
              ) : latestSnapshot?.comparativo?.statusPeso === "Aumentou" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <TrendingUp className="h-3 w-3" /> Aumentou
                </span>
              ) : latestSnapshot?.comparativo?.statusPeso === "Estável" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                  <Minus className="h-3 w-3" /> Estável
                </span>
              ) : (
                <span className="text-[10px] text-zinc-400 font-medium">Registrado</span>
              )}
            </div>
            <div className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">
              {latestSnapshot?.peso ? `${latestSnapshot.peso} kg` : "N/A"}{" "}
              {latestSnapshot?.imc ? (
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  (IMC {latestSnapshot.imc.toFixed(1)})
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {latestSnapshot?.comparativo?.deltaPeso !== undefined ? (
                <span>
                  Variação:{" "}
                  <strong>
                    {latestSnapshot.comparativo.deltaPeso > 0 ? "+" : ""}
                    {latestSnapshot.comparativo.deltaPeso} kg
                  </strong>
                </span>
              ) : (
                <span>Aferição antropométrica</span>
              )}
            </div>
          </div>

          {/* Card Visita Domiciliar ACS */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Visita ACS na Carga
              </span>
              {latestSnapshot?.comparativo?.statusVisita === "Atualizada" ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> Atualizada
                </span>
              ) : (
                <span className="text-[10px] text-zinc-400 font-medium">Histórico</span>
              )}
            </div>
            <div className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">
              {latestSnapshot?.dataUltimaVisitaACS
                ? formatDateBR(latestSnapshot.dataUltimaVisitaACS)
                : "Sem data registrada"}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {latestSnapshot?.diasSemVisitaACS !== null && latestSnapshot?.diasSemVisitaACS !== undefined
                ? `Registrado há ~${latestSnapshot.diasSemVisitaACS} dias no e-SUS`
                : latestSnapshot?.mesesSemVisitaACS !== null && latestSnapshot?.mesesSemVisitaACS !== undefined
                ? `Registrado há ~${latestSnapshot.mesesSemVisitaACS} meses no e-SUS`
                : "Acompanhamento territorial"}
            </div>
          </div>

          {/* Card Transição de Prioridade */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                Situação / Prioridade
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">Busca Ativa</span>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              {previousSnapshot && previousSnapshot.prioridade !== latestSnapshot?.prioridade ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <BadgePriority priority={previousSnapshot.prioridade} />
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
                  <BadgePriority priority={latestSnapshot?.prioridade || patient.priority} />
                </div>
              ) : (
                <BadgePriority priority={latestSnapshot?.prioridade || patient.priority} />
              )}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {latestSnapshot?.motivosPrioridade || "Critérios clínicos avaliados"}
            </div>
          </div>
        </div>
      )}

      {/* Linha do Tempo / Tabela das Cargas de Dados */}
      {sortedHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800 space-y-2">
          <FileSpreadsheet className="h-8 w-8 text-zinc-400 mx-auto" />
          <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            Nenhum histórico de múltiplas cargas registrado ainda.
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            A cada importação de arquivo CSV ou planilha do e-SUS APS, o sistema registrará automaticamente um snapshot
            com as medições de PA, peso, visita do ACS e a prioridade calculada para permitir o acompanhamento da evolução.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs text-zinc-600 dark:text-zinc-300">
            <thead className="bg-zinc-50 text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="px-4 py-3">Carga / Arquivo</th>
                <th className="px-4 py-3">Pressão Arterial</th>
                <th className="px-4 py-3">Peso & IMC</th>
                <th className="px-4 py-3">Última Visita ACS</th>
                <th className="px-4 py-3">Prioridade na Carga</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-medium">
              {sortedHistory.map((snap, idx) => {
                const isLatest = idx === 0;
                const isExpanded = expandedRowId === snap.id;

                return (
                  <React.Fragment key={snap.id}>
                    <tr
                      onClick={() => toggleRow(snap.id)}
                      className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors ${
                        isLatest ? "bg-blue-50/30 dark:bg-blue-950/10" : ""
                      }`}
                    >
                      {/* Carga / Arquivo */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <span>{snap.dataCarga ? formatDateBR(snap.dataCarga) : "Data não informada"}</span>
                              {isLatest && (
                                <span className="rounded-md bg-blue-100 px-1.5 py-0.2 text-[9px] font-black uppercase text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                  Mais Recente
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[180px]">
                              {snap.fileName || "Carga e-SUS"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Pressão Arterial */}
                      <td className="px-4 py-3">
                        {snap.pressaoSistolica && snap.pressaoDiastolica ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <span>{snap.pressaoSistolica}/{snap.pressaoDiastolica} mmHg</span>
                              {snap.comparativo?.deltaSistolica !== undefined && snap.comparativo.deltaSistolica !== 0 && (
                                <span
                                  className={`inline-flex items-center text-[10px] font-bold ${
                                    snap.comparativo.deltaSistolica < 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {snap.comparativo.deltaSistolica > 0 ? (
                                    <TrendingUp className="h-3 w-3 mr-0.5" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3 mr-0.5" />
                                  )}
                                  {snap.comparativo.deltaSistolica > 0 ? "+" : ""}
                                  {snap.comparativo.deltaSistolica}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {snap.dataPA ? `Aferida em ${formatDateBR(snap.dataPA)}` : "Sem data da PA"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Não aferida</span>
                        )}
                      </td>

                      {/* Peso & IMC */}
                      <td className="px-4 py-3">
                        {snap.peso ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <span>{snap.peso} kg</span>
                              {snap.comparativo?.deltaPeso !== undefined && snap.comparativo.deltaPeso !== 0 && (
                                <span
                                  className={`inline-flex items-center text-[10px] font-bold ${
                                    snap.comparativo.deltaPeso < 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-amber-600 dark:text-amber-400"
                                  }`}
                                >
                                  {snap.comparativo.deltaPeso > 0 ? "+" : ""}
                                  {snap.comparativo.deltaPeso} kg
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              IMC {snap.imc ? snap.imc.toFixed(1) : "N/A"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Sem pesagem</span>
                        )}
                      </td>

                      {/* Última Visita ACS */}
                      <td className="px-4 py-3">
                        {snap.dataUltimaVisitaACS ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100">
                              {formatDateBR(snap.dataUltimaVisitaACS)}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {snap.diasSemVisitaACS !== null && snap.diasSemVisitaACS !== undefined
                                ? `Há ${snap.diasSemVisitaACS} dias`
                                : snap.mesesSemVisitaACS !== null && snap.mesesSemVisitaACS !== undefined
                                ? `Há ${snap.mesesSemVisitaACS} meses`
                                : "Visita e-SUS"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Sem registro</span>
                        )}
                      </td>

                      {/* Prioridade */}
                      <td className="px-4 py-3">
                        <BadgePriority priority={snap.prioridade} />
                      </td>

                      {/* Ação / Expandir */}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                          aria-label="Ver detalhes da carga"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>

                    {/* Linha de Detalhes Expandida */}
                    {isExpanded && (
                      <tr className="bg-zinc-50/90 dark:bg-zinc-800/70 border-t border-zinc-200 dark:border-zinc-700">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1">
                              <span className="font-bold text-zinc-500 uppercase text-[10px]">Origem e Processamento:</span>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                <strong>Arquivo:</strong> {snap.fileName}
                              </p>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                <strong>Processado em:</strong> {formatDateTimeBR(snap.dataCarga)}
                              </p>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                <strong>Responsável:</strong> {snap.usuarioUpload || "Sistema"}
                              </p>
                            </div>

                            <div className="space-y-1">
                              <span className="font-bold text-zinc-500 uppercase text-[10px]">Atendimentos Médicos / Enfermagem:</span>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                <strong>Último Atendimento Médico:</strong>{" "}
                                {snap.dataUltimoAtendimentoMedico ? formatDateBR(snap.dataUltimoAtendimentoMedico) : "Não consta"}
                              </p>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                <strong>Último Atendimento Enfermagem:</strong>{" "}
                                {snap.dataUltimoAtendimentoEnfermagem ? formatDateBR(snap.dataUltimoAtendimentoEnfermagem) : "Não consta"}
                              </p>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                <strong>Microárea na Carga:</strong> {snap.microarea || "Não informada"}
                              </p>
                            </div>

                            <div className="space-y-1">
                              <span className="font-bold text-zinc-500 uppercase text-[10px]">Motivo da Prioridade na Carga:</span>
                              <p className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                {snap.motivosPrioridade || "Sem fatores graves sinalizados na carga."}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
