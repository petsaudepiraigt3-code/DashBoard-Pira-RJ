"use client";

import React from "react";
import { formatPhoneBR, formatWhatsAppUrl } from "@/lib/utils/formatters";

interface WhatsAppButtonProps {
  phoneCell?: string | null;
  patientName?: string;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

export function WhatsAppButton({
  phoneCell,
  patientName,
  size = "md",
  showLabel = false,
  className = "",
}: WhatsAppButtonProps) {
  const whatsappUrl = formatWhatsAppUrl(phoneCell);
  if (!whatsappUrl) return null;

  const formattedPhone = formatPhoneBR(phoneCell);
  const titleText = patientName
    ? `Iniciar conversa no WhatsApp com ${patientName}${formattedPhone ? ` (${formattedPhone})` : ""}`
    : `Iniciar conversa no WhatsApp${formattedPhone ? ` (${formattedPhone})` : ""}`;

  const sizeClasses =
    size === "sm"
      ? showLabel
        ? "px-2 py-0.5 text-[11px] gap-1 rounded-md"
        : "h-6 w-6 rounded-full"
      : showLabel
      ? "px-2.5 py-1 text-xs gap-1.5 rounded-lg"
      : "h-8 w-8 rounded-full";

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={titleText}
      aria-label={titleText}
      className={`inline-flex items-center justify-center bg-[#25D366] text-white font-bold shadow-2xs hover:bg-[#1ebe5d] active:scale-95 transition-all shrink-0 cursor-pointer ${sizeClasses} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={iconSize}
        aria-hidden="true"
      >
        <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.758.459 3.474 1.332 4.988L2 22l5.168-1.356a9.927 9.927 0 0 0 4.863 1.263h.004c5.515 0 9.965-4.452 9.965-9.969 0-2.663-1.037-5.168-2.92-7.051C17.197 3.037 14.693 2 12.031 2Zm5.823 14.273c-.246.693-1.432 1.326-1.988 1.411-.51.078-1.174.111-1.896-.119-.438-.139-.999-.324-1.716-.634-3.021-1.304-4.994-4.346-5.145-4.547-.15-.201-1.229-1.635-1.229-3.119 0-1.484.777-2.213 1.053-2.515.276-.302.602-.377.803-.377.2 0 .401.002.577.011.185.009.433-.07.678.518.251.603.853 2.086.928 2.237.075.151.125.327.025.528-.1.201-.15.327-.301.503-.151.176-.317.393-.452.528-.151.15-.308.314-.132.616.176.301.781 1.288 1.677 2.087 1.153 1.028 2.124 1.347 2.425 1.498.301.151.477.125.653-.076.176-.201.753-.879.954-1.181.201-.301.402-.251.678-.151.276.1 1.757.829 2.058.98.301.151.502.226.577.352.075.125.075.729-.171 1.422Z" />
      </svg>
      {showLabel && <span>WhatsApp</span>}
    </a>
  );
}

