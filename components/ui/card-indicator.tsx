"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface CardIndicatorProps {
  title: string;
  value: number | string;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "blue" | "emerald" | "amber" | "red" | "purple" | "zinc";
  icon?: LucideIcon;
  onClick?: () => void;
  isActive?: boolean;
}

export function CardIndicator({
  title,
  value,
  subtitle,
  badgeText,
  badgeVariant = "zinc",
  icon: Icon,
  onClick,
  isActive = false,
}: CardIndicatorProps) {
  const badgeStyles = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
    purple: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
    zinc: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  };

  return (
    <div
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? `${title}: ${value} ${badgeText || ""}`.trim() : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-200 ${
        onClick
          ? "cursor-pointer hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700"
          : ""
      } ${
        isActive
          ? "border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/20 dark:border-blue-500 dark:bg-blue-950/20"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            {title}
          </p>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {value}
            </span>
            {badgeText && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeStyles[badgeVariant]}`}
              >
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg bg-zinc-100 p-2.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
