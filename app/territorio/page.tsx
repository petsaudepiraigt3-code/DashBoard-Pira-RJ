"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { MOCK_PATIENTS } from "@/data/mock-data";
import { getAllPatientsFromFirestore } from "@/lib/firebase/patients";
import { MicroareaStats, Patient } from "@/types/dcnt";
import { Modal } from "@/components/ui/modal";
import { BarChartSVG } from "@/components/ui/charts";
import { MapPin, Users, UserCheck, AlertTriangle, ChevronRight, Activity, Heart, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export default function TerritorioPage() {
  const { role, userUnitId, userProfile } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMicroarea, setSelectedMicroarea] = useState<MicroareaStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // Agregação dos dados reais por Microárea
  const microareaMap = new Map<string, {
    code: string;
    acsName: string;
    patients: Patient[];
  }>();

  patients.forEach((p) => {
    const rawMA = p.microarea || "Não informada";
    const codeClean = rawMA.replace(/\D/g, "").trim() || "56";
    
    if (!microareaMap.has(codeClean)) {
      microareaMap.set(codeClean, {
        code: codeClean,
        acsName: p.acsName || (role === "ACS" ? userProfile?.name : undefined) || "Sem ACS responsável",
        patients: [],
      });
    }
    microareaMap.get(codeClean)!.patients.push(p);
  });

  if (role === "ACS" && microareaMap.size === 0 && patients.length > 0) {
    const defaultCode = (userProfile?.assignedMicroareaCodes && userProfile.assignedMicroareaCodes[0]) || "56";
    microareaMap.set(defaultCode, {
      code: defaultCode,
      acsName: userProfile?.name || "ACS teste 01",
      patients,
    });
  }

  const computedMicroareas: MicroareaStats[] = Array.from(microareaMap.values()).map((item) => {
    const pList = item.patients;
    return {
      id: `ma-${item.code}`,
      code: item.code,
      acsName: item.acsName,
      population: pList.length,
      elderlyCount: pList.filter((p) => p.isElderly).length,
      hypertensionCount: pList.filter((p) => p.hasHypertension).length,
      diabetesCount: pList.filter((p) => p.hasDiabetes).length,
      obesityCount: pList.filter((p) => p.isObese).length,
      alteredPACount: pList.filter((p) => p.lastPA && (p.lastPA.systolic >= 140 || p.lastPA.diastolic >= 90)).length,
      activeSearchCount: pList.filter((p) => p.priority === "Alta").length,
      outdatedVisitCount: pList.filter((p) => !p.lastVisitDate || new Date(p.lastVisitDate) < new Date("2026-04-01")).length,
    };
  });

  computedMicroareas.sort((a, b) => parseInt(a.code || "0", 10) - parseInt(b.code || "0", 10));

  // Dados para o gráfico comparativo
  const chartData = computedMicroareas.map((m) => ({
    label: `MA ${m.code} (${(m.acsName || "ACS").split(" ")[0]})`,
    value: m.activeSearchCount,
    color: "bg-blue-600 dark:bg-blue-500",
  }));

  const handleOpenDetails = (microarea: MicroareaStats) => {
    setSelectedMicroarea(microarea);
    setIsModalOpen(true);
  };

  // Pacientes pertencentes à microárea selecionada no Modal
  const microareaPatients = selectedMicroarea
    ? patients.filter((p) => (p.microarea || "").replace(/\D/g, "").trim() === selectedMicroarea.code)
    : [];

  return (
    <AppLayout pageTitle="Análise Territorial por Microáreas">
      {/* Indicador de Atualização */}
      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
        <span>
          Fonte de Dados: {loading ? "Carregando..." : `Exibindo ${computedMicroareas.length} microárea(s) do escopo (${patients.length} pacientes)`}
        </span>
        <button
          onClick={loadData}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Gráfico Comparativo */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Volume de Busca Ativa Prioritária por Microárea
          </h2>
        </div>
        <BarChartSVG data={chartData} />
      </div>

      {/* Grid de Cards das Microáreas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {computedMicroareas.map((m) => (
          <div
            key={m.id}
            onClick={() => handleOpenDetails(m)}
            className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs hover:border-blue-500 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  Microárea {m.code}
                </span>
                <h3 className="mt-2 text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 transition-colors">
                  {m.acsName}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">ACS Responsável</p>
              </div>
              <div className="rounded-lg bg-zinc-100 p-2 text-zinc-400 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-zinc-800 dark:group-hover:bg-blue-950 dark:group-hover:text-blue-300 transition-colors">
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800 text-center text-xs">
              <div>
                <div className="text-zinc-400 text-[10px] uppercase font-semibold">População</div>
                <div className="font-extrabold text-zinc-900 dark:text-zinc-100">{m.population}</div>
              </div>
              <div>
                <div className="text-zinc-400 text-[10px] uppercase font-semibold">Hipertensos</div>
                <div className="font-extrabold text-blue-600 dark:text-blue-400">{m.hypertensionCount}</div>
              </div>
              <div>
                <div className="text-zinc-400 text-[10px] uppercase font-semibold">Busca Ativa</div>
                <div className="font-extrabold text-red-600 dark:text-red-400">{m.activeSearchCount}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela Comparativa Territorial */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3 p-5">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          Comparativo Territorial de Fatores DCNT
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50 uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400 font-bold">
              <tr>
                <th className="px-4 py-3">Microárea / ACS</th>
                <th className="px-4 py-3">População</th>
                <th className="px-4 py-3">Idosos</th>
                <th className="px-4 py-3">Hipertensão</th>
                <th className="px-4 py-3">Diabetes</th>
                <th className="px-4 py-3">Obesidade</th>
                <th className="px-4 py-3">PA Alterada</th>
                <th className="px-4 py-3">Busca Ativa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
              {computedMicroareas.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => handleOpenDetails(m)}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">
                    Microárea {m.code} ({m.acsName})
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{m.population}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{m.elderlyCount}</td>
                  <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">{m.hypertensionCount}</td>
                  <td className="px-4 py-3 font-semibold text-purple-600 dark:text-purple-400">{m.diabetesCount}</td>
                  <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">{m.obesityCount}</td>
                  <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{m.alteredPACount}</td>
                  <td className="px-4 py-3 font-extrabold text-red-600 dark:text-red-400">{m.activeSearchCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhamento da Microárea */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Detalhamento — Microárea ${selectedMicroarea?.code}`}
        subtitle={`ACS Responsável: ${selectedMicroarea?.acsName}`}
      >
        {selectedMicroarea && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <span className="text-zinc-500">População Total:</span>
                <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">{selectedMicroarea.population} pessoas</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <span className="text-zinc-500">Idosos (60+ anos):</span>
                <div className="text-base font-bold text-purple-600 dark:text-purple-400">{selectedMicroarea.elderlyCount} idosos</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <span className="text-zinc-500">Pacientes com Hipertensão:</span>
                <div className="text-base font-bold text-blue-600 dark:text-blue-400">{selectedMicroarea.hypertensionCount} casos</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <span className="text-zinc-500">Busca Ativa Pendente:</span>
                <div className="text-base font-bold text-red-600 dark:text-red-400">{selectedMicroarea.activeSearchCount} pessoas</div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Pacientes em Busca Ativa nesta Microárea:
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {microareaPatients.length === 0 ? (
                  <p className="text-xs text-zinc-500">Nenhum paciente prioritário cadastrado para esta microárea no momento.</p>
                ) : (
                  microareaPatients.map((p) => (
                    <div key={p.id} className="rounded-lg border border-zinc-100 p-2.5 text-xs dark:border-zinc-800 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{p.name}</span>
                        <span className="text-zinc-500 ml-2">({p.age} anos)</span>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{p.activeSearchReason}</p>
                      </div>
                      <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800 text-[10px] dark:bg-red-950 dark:text-red-300">
                        {p.priority}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
