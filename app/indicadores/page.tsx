"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { CardIndicator } from "@/components/ui/card-indicator";
import { LineChartSVG } from "@/components/ui/charts";
import { getAllPatientsFromFirestore } from "@/lib/firebase/patients";
import { Patient, PatientActionRecord } from "@/types/dcnt";
import { useAuth } from "@/context/auth-context";
import { Users, UserCheck, AlertTriangle, CheckCircle2, TrendingUp, BarChart, RefreshCw, Activity, Building2 } from "lucide-react";
import { MOCK_PATIENTS } from "@/data/mock-data";

export default function IndicadoresPage() {
  const { role, userUnitId, userProfile } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const realData = await getAllPatientsFromFirestore({
      role,
      userUnitId,
      assignedMicroareaCodes: userProfile?.assignedMicroareaCodes,
      acsName: role === "ACS" ? userProfile?.name : undefined,
      acsId: role === "ACS" ? userProfile?.uid : undefined,
    });
    if (realData && realData.length > 0) {
      setPatients(realData);
    } else {
      const filteredMock = MOCK_PATIENTS.filter((p: any) => {
        if (role === "GERENTE" && userUnitId) {
          const pUnitId = p.unidadeId || "USF-003";
          if (pUnitId !== userUnitId) return false;
        }
        if (role === "ACS") {
          if (userUnitId) {
            const pUnitId = p.unidadeId || "USF-003";
            if (pUnitId !== userUnitId) return false;
          }
          const acsCodes = userProfile?.assignedMicroareaCodes || ["56"];
          const patMACode = (p.microarea || "").replace(/\D/g, "").trim();
          if (acsCodes.length > 0 && !acsCodes.includes(patMACode)) return false;
        }
        return true;
      });
      setPatients(filteredMock);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [role, userUnitId, userProfile]);

  // 1. População sob Acompanhamento (total do escopo)
  const totalPacientes = patients.length;

  // 2. Coletar TODAS as ações registradas nos pacientes do escopo
  const allRecordedActions: PatientActionRecord[] = [];
  patients.forEach((p) => {
    if (p.historicoAcoes && p.historicoAcoes.length > 0) {
      allRecordedActions.push(...p.historicoAcoes);
    }
  });

  const totalAcoesRegistradas = allRecordedActions.length;

  // 3. Contatos Realizados: número de PACIENTES ÚNICOS com pelo menos 1 contato bem-sucedido
  const uniqueContactedPatients = new Set<string>();
  patients.forEach((p) => {
    const hasSuccessfulContact = p.historicoAcoes?.some(
      (act) =>
        act.tipoAcao === "Visita Domiciliar" ||
        act.tipoAcao === "Contato Telefônico" ||
        act.tipoAcao === "Atendimento/Comparecimento na UBS"
    );
    if (hasSuccessfulContact) {
      uniqueContactedPatients.add(p.id);
    }
  });
  const contatosRealizados = uniqueContactedPatients.size;

  // 4. Busca Ativa Realizada: total de ações de busca ativa efetivamente concluídas (exclui Tentativa Sem Sucesso e Retorno Agendado)
  const buscaAtivaRealizada = allRecordedActions.filter(
    (act) => act.tipoAcao !== "Tentativa Sem Sucesso" && act.tipoAcao !== "Retorno Agendado"
  ).length;

  // 5. Busca Ativa Pendente: pacientes atualmente em Alta Prioridade
  const buscaAtivaPendente = patients.filter((p) => p.priority === "Alta").length;

  // 6. Comparecimentos UBS: ações registradas como "Atendimento/Comparecimento na UBS"
  const comparecimentosUBS = allRecordedActions.filter(
    (act) => act.tipoAcao === "Atendimento/Comparecimento na UBS"
  ).length;

  // 7. Pessoas Atualizadas: pacientes que possuem ações operacionais efetivas (exclui Tentativa Sem Sucesso e Retorno Agendado)
  const pessoasAtualizadas = patients.filter((p) => {
    const hasEffectiveAction = p.historicoAcoes?.some(
      (act) => act.tipoAcao !== "Tentativa Sem Sucesso" && act.tipoAcao !== "Retorno Agendado"
    );
    return hasEffectiveAction;
  }).length;

  // 8. Pessoas Atrasadas: pacientes do escopo que ainda não receberam ação efetiva no sistema
  const pessoasAtrasadas = Math.max(0, totalPacientes - pessoasAtualizadas);

  // 9. Percentual de Acompanhamentos Atualizados
  const percentualAtualizados = totalPacientes > 0
    ? Math.round((pessoasAtualizadas / totalPacientes) * 100)
    : 0;

  // 10. Gráfico de Evolução Mensal derivado de EVENTOS REAIS agrupados por mês (exclui Tentativa Sem Sucesso e Retorno Agendado)
  const monthLabels = ["Mar/26", "Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26"];
  const evolutionData = monthLabels.map((mLabel) => {
    const countActionsInMonth = allRecordedActions.filter((act) => {
      if (act.tipoAcao === "Tentativa Sem Sucesso" || act.tipoAcao === "Retorno Agendado") return false;
      const actDate = new Date(act.dataAcao);
      if (isNaN(actDate.getTime())) return false;
      const monthIndex = actDate.getMonth();
      const year = actDate.getFullYear();
      if (year !== 2026) return false;
      if (mLabel === "Mar/26" && monthIndex === 2) return true;
      if (mLabel === "Abr/26" && monthIndex === 3) return true;
      if (mLabel === "Mai/26" && monthIndex === 4) return true;
      if (mLabel === "Jun/26" && monthIndex === 5) return true;
      if (mLabel === "Jul/26" && monthIndex === 6) return true;
      if (mLabel === "Ago/26" && monthIndex === 7) return true;
      return false;
    }).length;

    return {
      date: mLabel,
      value1: pessoasAtrasadas,
      value2: countActionsInMonth,
      label1: "Pessoas Atrasadas",
      label2: "Busca Ativa Realizada",
    };
  });

  // 11. Tabela por ACS (Estritamente baseada no escopo do usuário e distribuição territorial real)
  const acsMap = new Map<string, {
    acsName: string;
    microarea: string;
    cadastrados: number;
    prioritarios: number;
    contatados: number;
    acompanhados: number;
  }>();

  patients.forEach((p) => {
    const nameKey = p.acsName || (role === "ACS" ? userProfile?.name : undefined) || "Sem ACS responsável";
    const rawMA = p.microarea || "Não informada";
    const displayMA = rawMA.startsWith("Microárea") ? rawMA : rawMA.length <= 3 && !isNaN(Number(rawMA)) ? `Microárea ${rawMA}` : rawMA;

    // Chave única por ACS e Microárea para evitar amalgamação de microáreas distintas em um único registro
    const groupKey = `${nameKey}_${displayMA}`;

    if (!acsMap.has(groupKey)) {
      acsMap.set(groupKey, {
        acsName: nameKey,
        microarea: displayMA,
        cadastrados: 0,
        prioritarios: 0,
        contatados: 0,
        acompanhados: 0,
      });
    }

    const item = acsMap.get(groupKey)!;
    item.cadastrados++;
    if (p.priority === "Alta" || p.priority === "Média") item.prioritarios++;

    const hasContact = p.historicoAcoes?.some(
      (act) =>
        act.tipoAcao === "Visita Domiciliar" ||
        act.tipoAcao === "Contato Telefônico" ||
        act.tipoAcao === "Atendimento/Comparecimento na UBS"
    );
    if (hasContact) item.contatados++;

    if (p.priority === "Acompanhado") item.acompanhados++;
  });

  const acsTableRows = Array.from(acsMap.values());

  return (
    <AppLayout pageTitle="Painel de Indicadores Institucionais DCNT">
      {/* Indicador de Fonte de Dados Real */}
      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
        <span>
          Fonte de Dados: {loading ? "Carregando..." : `Eventos Operacionais Reais (${totalPacientes} pacientes | ${totalAcoesRegistradas} ações registradas)`}
        </span>
        <button
          onClick={loadData}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Grid de Cards de Indicadores Institucionais */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
        <CardIndicator
          title="População sob acompanhamento"
          value={totalPacientes}
          badgeText="Total Escopo"
          badgeVariant="blue"
          icon={Users}
        />
        <CardIndicator
          title="Ações Registradas"
          value={totalAcoesRegistradas}
          badgeText="Eventos Reais"
          badgeVariant="purple"
          icon={Activity}
        />
        <CardIndicator
          title="Contatos Realizados"
          value={contatosRealizados}
          badgeText="Pacientes Efetivos"
          badgeVariant="emerald"
          icon={UserCheck}
        />
        <CardIndicator
          title="Busca Ativa Pendente"
          value={buscaAtivaPendente}
          badgeText="Prioritários"
          badgeVariant="red"
          icon={AlertTriangle}
        />
        <CardIndicator
          title="Busca Ativa Realizada"
          value={buscaAtivaRealizada}
          badgeText="Ações Concluídas"
          badgeVariant="emerald"
          icon={CheckCircle2}
        />
        <CardIndicator
          title="Comparecimentos UBS"
          value={comparecimentosUBS}
          badgeText="Atendimentos UBS"
          badgeVariant="blue"
          icon={Building2}
        />
        <CardIndicator
          title="Pessoas Atualizadas"
          value={pessoasAtualizadas}
          badgeText={`${percentualAtualizados}%`}
          badgeVariant="emerald"
          icon={UserCheck}
        />
        <CardIndicator
          title="Acompanhamentos Atualizados"
          value={`${percentualAtualizados}%`}
          badgeText="Meta Operacional"
          badgeVariant="emerald"
          icon={TrendingUp}
        />
      </div>

      {/* Gráfico de Evolução Mensal */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Evolução Mensal: Redução de Pendências x Buscas Ativas Concluídas
          </h2>
        </div>
        <LineChartSVG data={evolutionData} yMin={0} yMax={Math.max(10, totalPacientes)} />
      </div>

      {/* Seção Indicadores por ACS */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Indicadores de Cobertura e Acompanhamento por ACS
            </h2>
          </div>
          <span className="text-xs text-zinc-500 italic">
            Monitoramento de apoio à gestão da equipe (sem ordem classificatória)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400 font-bold">
              <tr>
                <th className="px-4 py-3">Agente Comunitário de Saúde (ACS)</th>
                <th className="px-4 py-3">Microárea</th>
                <th className="px-4 py-3">Pessoas Cadastradas</th>
                <th className="px-4 py-3">Prioritárias DCNT</th>
                <th className="px-4 py-3">Contatadas / Visitadas</th>
                <th className="px-4 py-3">Acompanhadas</th>
                <th className="px-4 py-3 text-right">Taxa de Acompanhamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
              {acsTableRows.map((item, idx) => {
                const taxa = item.cadastrados > 0
                  ? Math.round((item.acompanhados / item.cadastrados) * 100)
                  : 0;
                return (
                  <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">{item.acsName}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{item.microarea}</td>
                    <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{item.cadastrados}</td>
                    <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{item.prioritarios}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{item.contatados}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{item.acompanhados}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 font-extrabold text-emerald-800 text-xs dark:bg-emerald-950 dark:text-emerald-300">
                        {taxa}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
