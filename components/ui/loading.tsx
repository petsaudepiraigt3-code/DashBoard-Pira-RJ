"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export function Loading({ message = "Carregando dados..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-3 min-h-[200px]">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{message}</p>
    </div>
  );
}
