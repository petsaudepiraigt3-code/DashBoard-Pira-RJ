"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { Loading } from "@/components/ui/loading";

interface AppLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  periodFilter?: string;
  setPeriodFilter?: (period: string) => void;
}

export function AppLayout({
  children,
  pageTitle,
  periodFilter,
  setPeriodFilter,
}: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loading message="Verificando autenticação..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Sidebar isOpenMobile={isOpenMobile} setIsOpenMobile={setIsOpenMobile} />

      <div className="flex flex-1 flex-col transition-all duration-300 lg:pl-64">
        <Header
          pageTitle={pageTitle}
          setIsOpenMobile={setIsOpenMobile}
          periodFilter={periodFilter}
          setPeriodFilter={setPeriodFilter}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>

        <footer className="border-t border-zinc-200 bg-white py-4 px-6 dark:border-zinc-800 dark:bg-zinc-900 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
            <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                Saúde Digital Busca Ativa
              </span>
              <span className="hidden sm:inline">•</span>
              <span>Desenvolvido em Parceria Institucional</span>
            </div>

            <div className="flex items-center gap-4 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-prefeitura-pirai.png" alt="Prefeitura de Piraí" className="h-6 w-auto object-contain" />
              <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-sus.jpg" alt="SUS" className="h-6 w-auto object-contain" />
              <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-pet-saude.jpg" alt="PET-Saúde" className="h-6 w-auto object-contain" />
              <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-ugb-ferp.jpg" alt="UGB FERP" className="h-6 w-auto object-contain rounded-xs" />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
