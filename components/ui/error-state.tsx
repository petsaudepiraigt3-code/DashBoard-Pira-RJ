"use client";

import React from "react";
import { AlertOctagon } from "lucide-react";

export function ErrorState({
  title = "Ocorreu um erro ao carregar os dados",
  description = "Por favor, tente novamente ou verifique sua conexão.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 rounded-xl border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-900/60 dark:text-red-300">
        <AlertOctagon className="h-6 w-6" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-bold text-red-900 dark:text-red-200">{title}</h3>
        <p className="text-xs text-red-700 dark:text-red-400">{description}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
