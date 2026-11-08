import { Patient, DcntParameters } from "@/types/dcnt";
import { DEFAULT_DCNT_PARAMETERS } from "@/lib/store/parameters";
import { monthsSinceDate } from "@/lib/utils/priority";

/**
 * Regras centralizadas de filtragem de pacientes para corresponder
 * exatamente aos indicadores calculados no Dashboard do DCNT Saúde.
 */

export function isIdoso(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  const cutoff = params.elderlyAgeCutoff ?? 60;
  return patient.isElderly || (patient.age || 0) >= cutoff;
}

export function isSobrepeso(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  const overweightCutoff = params.overweightImcCutoff ?? 25;
  const obesityCutoff = params.obesityImcCutoff ?? 30;
  const imc = patient.lastWeight?.imc ?? (patient as any).imcAtual;
  if (imc != null && typeof imc === "number" && !isNaN(imc) && imc > 0) {
    return imc >= overweightCutoff && imc < obesityCutoff;
  }
  return !!patient.isOverweight;
}

export function isObesidade(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  const obesityCutoff = params.obesityImcCutoff ?? 30;
  const imc = patient.lastWeight?.imc ?? (patient as any).imcAtual;
  if (imc != null && typeof imc === "number" && !isNaN(imc) && imc > 0) {
    return imc >= obesityCutoff;
  }
  return !!patient.isObese;
}

export function isPAAlterada(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  if (!patient.lastPA) return false;
  const sysCutoff = params.systolicAlteradaCutoff ?? 140;
  const diaCutoff = params.diastolicAlteradaCutoff ?? 90;
  return patient.lastPA.systolic >= sysCutoff || patient.lastPA.diastolic >= diaCutoff;
}

export function isSemPARecente(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  if (!patient.lastPA || !patient.lastPA.date) return true;
  const maxMonths = params.monthsWithoutPA ?? 6;
  return monthsSinceDate(patient.lastPA.date) > maxMonths;
}

export function isSemVisitaACS(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  if (!patient.lastVisitDate) return true;
  const maxMonths = params.monthsWithoutVisit ?? 3;
  return monthsSinceDate(patient.lastVisitDate) > maxMonths;
}

export function isSemConsultaMedicaRecente(
  patient: Patient,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): boolean {
  if (!patient.lastMedicalApptDate) return true;
  const maxMonths = params.monthsWithoutMedicalCare ?? 6;
  return monthsSinceDate(patient.lastMedicalApptDate) > maxMonths;
}

export function isBuscaAtivaPrioritaria(patient: Patient): boolean {
  return patient.priority === "Alta";
}
