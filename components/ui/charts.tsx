"use client";

import React from "react";

// Componente de Gráfico de Barras Responsivo SVG
export function BarChartSVG({
  data,
  height = 200,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full space-y-3">
      {data.map((item, idx) => {
        const percentage = Math.round((item.value / maxValue) * 100);
        return (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>{item.label}</span>
              <span className="font-bold">{item.value}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  item.color || "bg-blue-600 dark:bg-blue-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Componente de Gráfico Donut / Distribuição
export function DonutChartSVG({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <path
            className="text-zinc-100 dark:text-zinc-800"
            strokeWidth="3.8"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          {(() => {
            let offset = 0;
            return data.map((item, i) => {
              const strokeDasharray = `${(item.value / total) * 100} ${
                100 - (item.value / total) * 100
              }`;
              const currentOffset = offset;
              offset += (item.value / total) * 100;
              return (
                <path
                  key={i}
                  className={item.color}
                  strokeWidth="3.8"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              );
            });
          })()}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">{total}</span>
          <span className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">Total</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${item.color.replace("text-", "bg-")}`} />
              <span className="text-zinc-600 dark:text-zinc-400">{item.label}</span>
            </div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Componente de Gráfico de Linha para Acompanhamento Histórico (PA, Peso, IMC)
export function LineChartSVG({
  data,
  yMin = 60,
  yMax = 180,
}: {
  data: { date: string; value1: number; value2?: number; label1?: string; label2?: string }[];
  yMin?: number;
  yMax?: number;
}) {
  if (!data || data.length === 0) return null;

  const width = 500;
  const height = 180;
  const padding = 30;

  const getX = (index: number) => {
    if (data.length <= 1) return padding + (width - 2 * padding) / 2;
    return padding + (index / (data.length - 1)) * (width - 2 * padding);
  };

  const getY = (val: number) => {
    return height - padding - ((val - yMin) / (yMax - yMin)) * (height - 2 * padding);
  };

  const points1 = data.map((d, i) => `${getX(i)},${getY(d.value1)}`).join(" ");
  const points2 = data[0].value2 !== undefined
    ? data.map((d, i) => `${getX(i)},${getY(d.value2!)}`).join(" ")
    : null;

  return (
    <div className="w-full space-y-2">
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[300px]">
          {/* Linhas de Grade de Fundo */}
          <line x1={padding} y1={getY(80)} x2={width - padding} y2={getY(80)} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeDasharray="3 3" />
          <line x1={padding} y1={getY(120)} x2={width - padding} y2={getY(120)} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeDasharray="3 3" />
          <line x1={padding} y1={getY(140)} x2={width - padding} y2={getY(140)} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeDasharray="3 3" />

          {/* Linha 1 */}
          <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={points1} strokeLinecap="round" strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={`c1-${i}`} cx={getX(i)} cy={getY(d.value1)} r="4" className="fill-blue-600 stroke-white stroke-2 dark:stroke-zinc-900" />
          ))}

          {/* Linha 2 se houver */}
          {points2 && (
            <>
              <polyline fill="none" stroke="#059669" strokeWidth="2.5" points={points2} strokeLinecap="round" strokeLinejoin="round" />
              {data.map((d, i) => (
                <circle key={`c2-${i}`} cx={getX(i)} cy={getY(d.value2!)} r="4" className="fill-emerald-600 stroke-white stroke-2 dark:stroke-zinc-900" />
              ))}
            </>
          )}
        </svg>
      </div>

      {/* Rótulos das datas */}
      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 px-2">
        {data.map((d, i) => (
          <span key={i}>{d.date}</span>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex justify-center gap-4 text-xs pt-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          <span className="text-zinc-600 dark:text-zinc-400">{data[0].label1 || "Sistólica"}</span>
        </div>
        {data[0].value2 !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <span className="text-zinc-600 dark:text-zinc-400">{data[0].label2 || "Diastólica"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
