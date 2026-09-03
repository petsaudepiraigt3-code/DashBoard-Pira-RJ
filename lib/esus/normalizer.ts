import { NormalizedPatientRecord } from "./types";

// 1. Normalização de CPF
export function normalizeCPF(cpfRaw: any): string {
  if (!cpfRaw) return "";
  const cleaned = String(cpfRaw).replace(/\D/g, "");
  if (cleaned.length === 11) {
    return cleaned;
  }
  return cleaned;
}

// 2. Mascarar CPF para privacidade na interface (ex: ***.456.789-**)
export function maskCPF(cpf: string): string {
  if (!cpf || cpf.length !== 11) return cpf || "Sem CPF";
  return `***.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-**`;
}

// 3. Normalização de CNS
export function normalizeCNS(cnsRaw: any): string {
  if (!cnsRaw) return "";
  const cleaned = String(cnsRaw).replace(/\D/g, "");
  if (cleaned.length === 15) {
    return cleaned;
  }
  return cleaned;
}

// 4. Mascarar CNS para privacidade na interface (ex: 700.****.****.061)
export function maskCNS(cns: string): string {
  if (!cns || cns.length !== 15) return cns || "Sem CNS";
  return `${cns.substring(0, 3)}.****.****.${cns.substring(12, 15)}`;
}

// 5. Normalização de Telefone
export function normalizePhone(phoneRaw: any): { original: string; normalized: string } {
  if (!phoneRaw) return { original: "", normalized: "" };
  const original = String(phoneRaw).trim().replace(/^["']|["']$/g, "");
  const digits = original.replace(/\D/g, "");
  return {
    original,
    normalized: digits,
  };
}

// 6. Tratamento de Datas Brasileiras (DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD)
export function parseBRDate(dateRaw: any): string | null {
  if (!dateRaw) return null;
  const str = String(dateRaw).trim();
  if (!str) return null;

  // Formato ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Formato BR DD/MM/YYYY ou DD/MM/YY
  const match = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (match) {
    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);

    if (year < 100) {
      year = year > 30 ? 1900 + year : 2000 + year;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const yyyy = String(year);
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

// 7. Normalização de Peso (ex: 80 -> 80, 80,5 -> 80.5)
export function parseWeight(weightRaw: any): number | undefined {
  if (!weightRaw && weightRaw !== 0) return undefined;
  const str = String(weightRaw).replace(",", ".").replace(/[^\d.]/g, "");
  const val = parseFloat(str);
  if (!isNaN(val) && val > 1.0 && val < 400.0) {
    return Math.round(val * 100) / 100;
  }
  return undefined;
}

// 8. Normalização de Altura (conversão automática de cm para m: 170 -> 1.70, 1,70 -> 1.70, 1.70 -> 1.70)
export function parseHeight(heightRaw: any): number | undefined {
  if (!heightRaw && heightRaw !== 0) return undefined;
  const str = String(heightRaw).replace(",", ".").replace(/[^\d.]/g, "");
  let val = parseFloat(str);
  if (isNaN(val)) return undefined;

  // Se altura > 3, converter de cm para metros (ex: 170 -> 1.70)
  if (val > 3.0 && val < 250.0) {
    val = val / 100.0;
  }

  if (val >= 0.4 && val <= 2.5) {
    return Math.round(val * 100) / 100;
  }
  return undefined;
}

// 9. Cálculo de IMC = peso / altura² (max 2 casas decimais)
export function calculateBMI(weight?: number, height?: number): number | undefined {
  if (!weight || !height || height <= 0) return undefined;
  const bmi = weight / (height * height);
  if (bmi >= 10 && bmi <= 90) {
    return Math.round(bmi * 100) / 100;
  }
  return undefined;
}

// 10. Parser de Pressão Arterial (ex: "120/80", "120 / 80", "140/90", "158/96")
export function parseBloodPressure(paRaw: any): { systolic?: number; diastolic?: number; rawFormatted?: string } | undefined {
  if (!paRaw) return undefined;
  const str = String(paRaw).trim();
  const match = str.match(/(\d{2,3})\s*[\/xX\.-]\s*(\d{2,3})/);
  if (match) {
    const sys = parseInt(match[1], 10);
    const dia = parseInt(match[2], 10);
    if (sys >= 50 && sys <= 260 && dia >= 30 && dia <= 180) {
      return { systolic: sys, diastolic: dia, rawFormatted: `${sys}/${dia}` };
    }
  }
  return undefined;
}

// 11. Cálculo de Meses entre Datas
export function monthsSinceDate(dateIsoStr?: string | null): number {
  if (!dateIsoStr) return 999;
  const past = new Date(dateIsoStr);
  const now = new Date();
  if (isNaN(past.getTime())) return 999;
  const diffTime = Math.abs(now.getTime() - past.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 30);
}

// 12. Pontuação Administrativa de Prioridade para Busca Ativa (SEM diagnósticos médicos automáticos)
export function calculatePriorityScore(record: Partial<NormalizedPatientRecord>): {
  score: number;
  priority: "Alta" | "Média" | "Atenção" | "Acompanhado";
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  if (record.systolic && record.diastolic) {
    if (record.systolic >= 180 || record.diastolic >= 120) {
      score += 4;
      reasons.push(`PA elevada (${record.systolic}/${record.diastolic} mmHg) — Sinalização para acompanhamento`);
    } else if (record.systolic >= 140 || record.diastolic >= 90) {
      score += 2;
      reasons.push(`PA alterada (${record.systolic}/${record.diastolic} mmHg) — Sinalização para acompanhamento`);
    }
  }

  const monthsPA = record.dataPA ? monthsSinceDate(record.dataPA) : 999;
  if (monthsPA > 6 && monthsPA !== 999) {
    score += 2;
    reasons.push(`Aferição de PA desatualizada (há ${monthsPA} meses)`);
  }

  const monthsVisit = record.monthsSinceHomeVisit !== undefined ? record.monthsSinceHomeVisit : monthsSinceDate(record.lastHomeVisit);
  if (monthsVisit > 3 && monthsVisit !== 999) {
    score += 2;
    reasons.push(`Visita domiciliar desatualizada (há ${monthsVisit} meses)`);
  }

  if (record.isElderly) {
    score += 1;
    reasons.push("Idoso (60+ anos)");
  }

  let priority: "Alta" | "Média" | "Atenção" | "Acompanhado" = "Acompanhado";
  if (score >= 4) priority = "Alta";
  else if (score >= 2) priority = "Média";
  else if (score >= 1) priority = "Atenção";

  return {
    score,
    priority,
    reason: reasons.join(". ") || "Sinalização para acompanhamento regular.",
  };
}

// 13. Normalização do Nome para Busca
export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z\s]/g, "")
    .trim();
}
