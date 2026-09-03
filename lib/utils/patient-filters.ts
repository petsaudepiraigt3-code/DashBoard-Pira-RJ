import { Patient } from "@/types/dcnt";

/**
 * Regras centralizadas de filtragem de pacientes para corresponder
 * exatamente aos indicadores calculados no Dashboard do DCNT Saúde.
 */

export function isIdoso(patient: Patient): boolean {
  return patient.isElderly || (patient.age || 0) >= 60;
}

export function isSobrepeso(patient: Patient): boolean {
  const imc = patient.lastWeight?.imc ?? (patient as any).imcAtual;
  if (imc != null && typeof imc === "number" && !isNaN(imc) && imc > 0) {
    return imc >= 25 && imc < 30;
  }
  return !!patient.isOverweight;
}

export function isObesidade(patient: Patient): boolean {
  const imc = patient.lastWeight?.imc ?? (patient as any).imcAtual;
  if (imc != null && typeof imc === "number" && !isNaN(imc) && imc > 0) {
    return imc >= 30;
  }
  return !!patient.isObese;
}

export function isPAAlterada(patient: Patient): boolean {
  if (!patient.lastPA) return false;
  return patient.lastPA.systolic >= 140 || patient.lastPA.diastolic >= 90;
}

export function isSemPARecente(patient: Patient): boolean {
  if (!patient.lastPA) return true;
  return new Date(patient.lastPA.date) < new Date("2026-01-01");
}

export function isSemVisitaACS(patient: Patient): boolean {
  if (!patient.lastVisitDate) return true;
  return new Date(patient.lastVisitDate) < new Date("2026-04-01");
}

export function isBuscaAtivaPrioritaria(patient: Patient): boolean {
  return patient.priority === "Alta";
}
