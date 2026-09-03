/**
 * Utilitários centralizados para formatação de datas no padrão brasileiro (DD/MM/AAAA)
 */

/**
 * Formata qualquer data (string YYYY-MM-DD, ISO string, Date, Timestamp Firebase) para DD/MM/AAAA.
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

  // 2. Trata objeto Timestamp do Firebase ou Date
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
