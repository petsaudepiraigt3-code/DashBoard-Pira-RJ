/**
 * Utilitários centralizados para formatação de datas no padrão brasileiro (DD/MM/AAAA)
 */

/**
 * Formata qualquer data (string YYYY-MM-DD, ISO string, Date, Timestamp Supabase) para DD/MM/AAAA.
 * Evita shifts de fuso horário em strings "YYYY-MM-DD" puras.
 */
export function formatDateBR(
  dateValue?: string | Date | number | { toDate?: () => Date; seconds?: number } | null,
  fallback = "Sem registro"
): string {
  if (dateValue === null || dateValue === undefined || dateValue === "") {
    return fallback;
  }

  // 1. Trata string pura "YYYY-MM-DD" ou formato com hora "YYYY-MM-DD HH:mm:ss"
  if (typeof dateValue === "string") {
    const cleanStr = dateValue.trim();
    
    // Se já estiver em DD/MM/AAAA, retorna direto
    if (/^\d{2}\/\d{2}\/\d{4}/.test(cleanStr)) {
      return cleanStr.substring(0, 10);
    }

    // Padrão YYYY-MM-DD estrito (ex: 2026-08-21)
    const yyyymmddMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleanStr);
    if (yyyymmddMatch) {
      const [, year, month, day] = yyyymmddMatch;
      return `${day}/${month}/${year}`;
    }
  }

  // 2. Trata objeto Timestamp do Supabase ou Date
  let d: Date;
  if (typeof dateValue === "object" && dateValue !== null) {
    if ("toDate" in dateValue && typeof (dateValue as any).toDate === "function") {
      d = (dateValue as any).toDate();
    } else if ("seconds" in dateValue && typeof (dateValue as any).seconds === "number") {
      d = new Date((dateValue as any).seconds * 1000);
    } else if (dateValue instanceof Date) {
      d = dateValue;
    } else {
      d = new Date(dateValue as any);
    }
  } else {
    d = new Date(dateValue);
  }

  if (isNaN(d.getTime())) {
    return fallback;
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formata data e hora no padrão brasileiro (DD/MM/AAAA HH:mm)
 */
export function formatDateTimeBR(
  dateValue?: string | Date | number | { toDate?: () => Date; seconds?: number } | null,
  fallback = "Sem registro"
): string {
  if (dateValue === null || dateValue === undefined || dateValue === "") {
    return fallback;
  }

  let d: Date;
  if (typeof dateValue === "object" && dateValue !== null) {
    if ("toDate" in dateValue && typeof (dateValue as any).toDate === "function") {
      d = (dateValue as any).toDate();
    } else if ("seconds" in dateValue && typeof (dateValue as any).seconds === "number") {
      d = new Date((dateValue as any).seconds * 1000);
    } else if (dateValue instanceof Date) {
      d = dateValue;
    } else {
      d = new Date(dateValue as any);
    }
  } else {
    d = new Date(dateValue);
  }

  if (isNaN(d.getTime())) {
    return fallback;
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formata um número de telefone brasileiro para exibição: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
export function formatPhoneBR(phone?: string | null): string {
  if (!phone) return "";
  const raw = String(phone).trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "sem telefone") return "";

  let digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.substring(2);
  }

  if (digits.length === 11) {
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
  }
  if (digits.length === 9) {
    return `${digits.substring(0, 5)}-${digits.substring(5)}`;
  }
  if (digits.length === 8) {
    return `${digits.substring(0, 4)}-${digits.substring(4)}`;
  }
  return raw;
}

/**
 * Gera o link direto de conversa do WhatsApp (wa.me) a partir do campo "Telefone celular" do paciente.
 * Retorna null caso o número esteja vazio ou inválido.
 */
export function formatWhatsAppUrl(phoneCell?: string | null): string | null {
  if (!phoneCell) return null;
  const raw = String(phoneCell).trim();
  if (
    !raw ||
    raw === "-" ||
    raw === "--" ||
    raw.toLowerCase() === "null" ||
    raw.toLowerCase() === "undefined" ||
    raw.toLowerCase() === "sem telefone"
  ) {
    return null;
  }

  let digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8) {
    return null;
  }

  // Se vier apenas com 8 ou 9 dígitos (sem DDD), assume DDD 24 (Piraí/RJ)
  if (digits.length === 8 || digits.length === 9) {
    digits = `5524${digits}`;
  } else if (digits.length === 10 || digits.length === 11) {
    // Se vier com DDD (10 ou 11 dígitos), adiciona o DDI 55 (Brasil)
    digits = `55${digits}`;
  } else if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return `https://wa.me/${digits}`;
}

