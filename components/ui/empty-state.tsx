"use client";

import React from "react";
import { FolderOpen } from "lucide-react";

export function EmptyState({
  title = "Nenhum registro encontrado",
  description = "Não foram encontrados resultados para os filtros selecionados.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12 space-y-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <div className="rounded-full bg-zinc-100 p-4 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">
        <FolderOpen className="h-8 w-8" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
