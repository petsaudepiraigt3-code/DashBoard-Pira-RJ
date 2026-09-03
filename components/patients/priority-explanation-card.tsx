"use client";

import React from "react";
import { Patient, PatientActionRecord } from "@/types/dcnt";
import { getPriorityExplanation, PriorityExplanation } from "@/lib/utils/priority";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ShieldAlert,
  Database,
  CalendarCheck,
} from "lucide-react";

interface PriorityExplanationCardProps {
  patient: Patient;
  allActions?: PatientActionRecord[];
}

export function PriorityExplanationCard({
  patient,
  allActions,
}: PriorityExplanationCardProps) {
  const explanation: PriorityExplanation = getPriorityExplanation(patient, allActions);

  // Configurações visuais por nível de prioridade (Acessibilidade e Contraste)
  const stylesByPriority = {
    Alta: {
      container: "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20",
      titleColor: "text-red-950 dark:text-red-100",
      introColor: "text-red-900 dark:text-red-200",
      badge: "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/60 dark:text-red-200",
      bulletIcon: AlertCircle,
      bulletColor: "text-red-600 dark:text-red-400",
      divider: "border-red-200/80 dark:border-red-900/40",
      cardIcon: ShieldAlert,
      cardIconColor: "text-red-600 dark:text-red-400",
    },
    Média: {
      container: "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20",
      titleColor: "text-amber-950 dark:text-amber-100",
      introColor: "text-amber-900 dark:text-amber-200",
      badge: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
      bulletIcon: AlertTriangle,
      bulletColor: "text-amber-600 dark:text-amber-400",
      divider: "border-amber-200/80 dark:border-amber-900/40",
      cardIcon: AlertTriangle,
      cardIconColor: "text-amber-600 dark:text-amber-400",
    },
    Atenção: {
      container: "border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20",
      titleColor: "text-blue-950 dark:text-blue-100",
      introColor: "text-blue-900 dark:text-blue-200",
      badge: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
      bulletIcon: Info,
      bulletColor: "text-blue-600 dark:text-blue-400",
      divider: "border-blue-200/80 dark:border-blue-900/40",
      cardIcon: Info,
      cardIconColor: "text-blue-600 dark:text-blue-400",
    },
    Acompanhado: {
      container: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20",
      titleColor: "text-emerald-950 dark:text-emerald-100",
      introColor: "text-emerald-900 dark:text-emerald-200",
      badge: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
      bulletIcon: CheckCircle2,
      bulletColor: "text-emerald-600 dark:text-emerald-400",
      divider: "border-emerald-200/80 dark:border-emerald-900/40",
      cardIcon: CheckCircle2,
      cardIconColor: "text-emerald-600 dark:text-emerald-400",
    },
  };

  const style = stylesByPriority[explanation.priority] || stylesByPriority.Acompanhado;
  const BulletIcon = style.bulletIcon;
  const CardHeaderIcon = style.cardIcon;

  return (
    <section
      aria-labelledby="motivos-sinalizacao-titulo"
      className={`rounded-xl border p-5 shadow-2xs transition-all ${style.container}`}
    >
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 mb-3.5 border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg bg-white/80 dark:bg-zinc-900/80 shadow-2xs ${style.cardIconColor}`}>
            <CardHeaderIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="motivos-sinalizacao-titulo"
              className={`text-sm font-extrabold tracking-tight uppercase ${style.titleColor}`}
            >
              MOTIVOS DA SINALIZAÇÃO
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
              Por que este paciente está nesta situação?
            </p>
          </div>
        </div>

        {/* Badge da Classificação Atual */}
        <div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${style.badge}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
            {explanation.title}
          </span>
        </div>
      </div>

      {/* Texto Introdutório */}
      <p className={`text-xs font-semibold leading-relaxed mb-3.5 ${style.introColor}`}>
        {explanation.intro}
      </p>

      {/* Lista Dinâmica dos Fatores Reais */}
      <ul className="space-y-2.5 mb-3.5" role="list">
        {explanation.contributingFactors.map((factor) => {
          const isSUS = factor.source === "e-SUS APS";
          return (
            <li
              key={factor.id}
              className="flex items-start gap-2.5 rounded-lg bg-white/70 dark:bg-zinc-900/60 p-2.5 border border-zinc-200/50 dark:border-zinc-800/50"
            >
              <BulletIcon
                className={`h-4 w-4 mt-0.5 shrink-0 ${style.bulletColor}`}
                aria-hidden="true"
              />
              <div className="flex-1 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {factor.title}
                  </span>
                  {/* Diferenciação Visual da Origem dos Dados */}
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isSUS
                        ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-300"
                        : "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/70 dark:text-purple-300"
                    }`}
                    title={`Dado proveniente de: ${factor.source}`}
                  >
                    {isSUS ? (
                      <Database className="h-2.5 w-2.5" aria-hidden="true" />
                    ) : (
                      <CalendarCheck className="h-2.5 w-2.5" aria-hidden="true" />
                    )}
                    <span>{factor.source}</span>
                  </span>
                </div>
                <p className="text-zinc-700 dark:text-zinc-300 leading-normal">
                  {factor.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Nota sobre Dados Ausentes (Diferenciando 'não possui o problema' de 'não existe informação') */}
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-white/40 dark:bg-zinc-900/30 rounded-md p-2 border border-zinc-200/40 dark:border-zinc-800/40">
        <p>
          <strong>Nota sobre registros:</strong> Dados sem lançamento no sistema (como consultas médicas ou aferições sem data) representam ausência de registro para o período analisado, não sendo interpretados automaticamente como realização ou não de atendimento.
        </p>
      </div>

      {/* Aviso Obrigatório */}
      <footer className="mt-3 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60">
        <p className="text-[11px] italic text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          <span>{explanation.disclaimer}</span>
        </p>
      </footer>
    </section>
  );
}
