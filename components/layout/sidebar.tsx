"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  LayoutDashboard,
  Search,
  MapPin,
  Users,
  BarChart3,
  FileSpreadsheet,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  UserCheck,
} from "lucide-react";
import { UserRole } from "@/types/dcnt";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Busca Ativa", href: "/busca-ativa", icon: Search },
  { label: "Território", href: "/territorio", icon: MapPin },
  { label: "Pacientes", href: "/pacientes", icon: Users },
  { label: "Indicadores", href: "/indicadores", icon: BarChart3 },
  { label: "Importar e-SUS", href: "/importar", icon: FileSpreadsheet },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

export function Sidebar({
  isOpenMobile,
  setIsOpenMobile,
}: {
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const { userProfile, logout, switchRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Overlay mobile */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col border-r border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "w-20" : "w-64"}`}
      >
        {/* Cabeçalho do Sidebar */}
        <div className="flex h-32 items-center justify-between px-2.5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center w-full overflow-hidden">
            {!collapsed ? (
              <div className="flex flex-col w-full gap-1.5 bg-white p-2 rounded-xl border border-zinc-200/90 shadow-2xs dark:bg-zinc-800 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-1 h-10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-prefeitura-pirai.png"
                    alt="Prefeitura de Piraí"
                    className="h-10 w-auto max-w-[58%] object-contain"
                  />
                  <div className="h-7 w-px bg-zinc-200 dark:bg-zinc-700" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-sus.jpg"
                    alt="SUS"
                    className="h-9 w-auto max-w-[38%] object-contain"
                  />
                </div>
                <div className="h-px w-full bg-zinc-100 dark:bg-zinc-700/60" />
                <div className="flex items-center justify-between gap-1 h-9">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-pet-saude.jpg"
                    alt="PET-Saúde Informação e Saúde Digital"
                    className="h-9 w-auto max-w-[55%] object-contain"
                  />
                  <div className="h-7 w-px bg-zinc-200 dark:bg-zinc-700" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-ugb-ferp.jpg"
                    alt="UGB FERP"
                    className="h-9 w-auto max-w-[40%] object-contain rounded-md"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 border border-zinc-200 shadow-xs dark:bg-zinc-800 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-pet-saude.jpg"
                  alt="PET-Saúde"
                  className="h-full w-full object-contain"
                />
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors shrink-0 ml-1 cursor-pointer"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {navItems
            .filter((item) => {
              if (userProfile?.role === "ACS") {
                if (item.href === "/importar" || item.href === "/configuracoes") return false;
              }
              return true;
            })
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpenMobile(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-blue-600 dark:text-blue-400" : ""}`} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Seletor de Perfil Simulado (Exclusivo para ADMIN em ambiente de demonstração) */}
        {!collapsed && userProfile?.role === "ADMIN" && (
          <div className="p-3 mx-3 mb-2 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-800 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Simular Perfil (ADMIN):</span>
            </div>
            <select
              value={userProfile?.role || "ADMIN"}
              onChange={(e) => switchRole(e.target.value as UserRole)}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 shadow-xs focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 font-medium cursor-pointer"
            >
              <option value="ADMIN">Administrador (Todas Unidades)</option>
              <option value="GERENTE">Gerente de Unidade (Toda USF)</option>
              <option value="ACS">ACS (Apenas Microárea 01)</option>
            </select>
          </div>
        )}

        {/* Bloco de Parceria Institucional na Sidebar */}
        {!collapsed && (
          <div className="mx-3 mb-3 rounded-xl bg-zinc-50 p-2 border border-zinc-200/80 dark:bg-zinc-800/40 dark:border-zinc-800 space-y-1">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 text-center">
              Parceria Institucional
            </span>
            <div className="flex items-center justify-around gap-1 bg-white p-1.5 rounded-lg border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-prefeitura-pirai.png" alt="Prefeitura de Piraí" className="h-6 w-auto object-contain" />
              <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-sus.jpg" alt="SUS" className="h-6 w-auto object-contain" />
              <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-pet-saude.jpg" alt="PET-Saúde" className="h-6 w-auto object-contain" />
              <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-ugb-ferp.jpg" alt="UGB FERP" className="h-6 w-auto object-contain rounded-xs" />
            </div>
          </div>
        )}

        {/* Rodapé da Sidebar - Usuário & Perfil */}
        <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 uppercase">
                {userProfile?.name?.substring(0, 2) || "US"}
              </div>
              {!collapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {userProfile?.name || "Usuário"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {userProfile?.role || "Operador"}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={logout}
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
              title="Sair do sistema"
              aria-label="Sair do sistema"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
