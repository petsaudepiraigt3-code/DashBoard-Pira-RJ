"use client";

import React from "react";
import { useAuth } from "@/context/auth-context";
import { Menu, Building2, Calendar, User } from "lucide-react";
import { MOCK_UNIT_NAME } from "@/data/mock-data";

interface HeaderProps {
  pageTitle: string;
  setIsOpenMobile: (open: boolean) => void;
  periodFilter?: string;
  setPeriodFilter?: (period: string) => void;
}

export function Header({
  pageTitle,
  setIsOpenMobile,
  periodFilter = "Últimos 12 meses",
  setPeriodFilter,
}: HeaderProps) {
  const { userProfile } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-20 w-full items-center justify-between border-b border-zinc-200 bg-white/95 px-4 sm:px-6 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsOpenMobile(true)}
          className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:hidden cursor-pointer"
          aria-label="Abrir menu lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {pageTitle}
          </h1>
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hidden sm:inline-block">
            Saúde Digital Busca Ativa
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6 text-xs text-zinc-600 dark:text-zinc-400">
        {/* Banner de Logos das Parceiras na Parte Superior */}
        <div className="hidden lg:flex items-center gap-3 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200 shadow-2xs dark:bg-zinc-800 dark:border-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-prefeitura-pirai.png" alt="Prefeitura de Piraí" className="h-9 w-auto object-contain" />
          <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-600" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-sus.jpg" alt="SUS" className="h-9 w-auto object-contain" />
          <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-600" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pet-saude.jpg" alt="PET-Saúde" className="h-9 w-auto object-contain" />
          <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-600" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ugb-ferp.jpg" alt="UGB FERP" className="h-9 w-auto object-contain rounded-xs" />
        </div>

        {/* Unidade Atual */}
        <div className="hidden md:flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800 font-medium text-zinc-700 dark:text-zinc-300">
          <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>{userProfile?.unitName || MOCK_UNIT_NAME}</span>
        </div>

        {/* Filtro de Período quando aplicável */}
        {setPeriodFilter && (
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-800">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-transparent font-medium text-zinc-800 focus:outline-none dark:text-zinc-200 cursor-pointer"
            >
              <option value="Últimos 30 dias">Últimos 30 dias</option>
              <option value="Últimos 3 meses">Últimos 3 meses</option>
              <option value="Últimos 6 meses">Últimos 6 meses</option>
              <option value="Últimos 12 meses">Últimos 12 meses</option>
              <option value="Ano Vigente">Ano Vigente</option>
            </select>
          </div>
        )}

        {/* Identificação do Usuário */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
            <User className="h-4 w-4" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {userProfile?.name || "Usuário"}
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {userProfile?.role}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
