"use client";

import React from "react";
import { PriorityLevel } from "@/types/dcnt";
import { AlertTriangle, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

interface BadgePriorityProps {
  priority: PriorityLevel;
  showIcon?: boolean;
}

export function BadgePriority({ priority, showIcon = true }: BadgePriorityProps) {
  const configs = {
    Alta: {
      label: "Alta Prioridade",
      icon: AlertTriangle,
      className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/80 dark:text-red-300 dark:border-red-900/60",
    },
    Média: {
      label: "Média Prioridade",
      icon: AlertCircle,
      className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-900/60",
    },
    Atenção: {
      label: "Atenção",
      icon: Clock,
      className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-900/60",
    },
    Acompanhado: {
      label: "Acompanhado",
      icon: CheckCircle2,
      className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-900/60",
    },
  };

  const config = configs[priority] || configs.Atenção;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${config.className}`}
    >
      {showIcon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{config.label}</span>
    </span>
  );
}
