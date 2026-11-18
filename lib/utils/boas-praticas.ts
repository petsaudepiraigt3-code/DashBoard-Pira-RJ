import {
  BoaPraticaCode,
  BoaPraticaItem,
  BoaPraticaManualOverride,
  DcntBoasPraticasParameters,
  DcntParameters,
  PatientActionRecord,
  PatientBoasPraticasSummary,
  PatientCargaSnapshot,
  PriorityLevel,
} from "@/types/dcnt";
import { DEFAULT_DCNT_PARAMETERS } from "@/lib/store/parameters";

export interface BoaPraticaCatalogMeta {
  code: BoaPraticaCode;
  shortTitle: string;
  description: string;
  defaultMonths: number;
  defaultPoints?: number;
}

export const BOAS_PRATICAS_CATALOG: Record<BoaPraticaCode, BoaPraticaCatalogMeta> = {
  A: {
    code: "A",
    shortTitle: "Consulta Médica / Enfermagem",
    description:
      "Ter pelo menos 01 (uma) consulta presencial ou remota realizadas por médica(o) ou enfermeira(o), nos últimos 06 (seis) meses",
    defaultMonths: 6,
  },
  B: {
    code: "B",
    shortTitle: "Aferição de Pressão Arterial",
    description:
      "Ter pelo menos 01 (um) registro de aferição de pressão arterial realizado nos últimos 06 (seis) meses",
    defaultMonths: 6,
  },
  C: {
    code: "C",
    shortTitle: "Peso e Altura Simultâneos",
    description:
      "Ter pelo menos 01 (um) registro simultâneos de peso e altura realizado nos últimos 12 (doze) meses",
    defaultMonths: 12,
  },
  D: {
    code: "D",
    shortTitle: "2 Visitas Domiciliares ACS/TACS",
    description:
      "Ter pelo menos 02 (duas) visitas domiciliares realizadas por ACS/TACS, com intervalo mínimo de 30 (trinta) dias, nos últimos 12 (doze) meses",
    defaultMonths: 12,
  },
  E: {
    code: "E",
    shortTitle: "Hemoglobina Glicada (HbA1c)",
    description:
      "Ter pelo menos 01 (um) registro de solicitação de hemoglobina glicada realizada ou avaliada, nos últimos 12 (doze) meses",
    defaultMonths: 12,
  },
  F: {
    code: "F",
    shortTitle: "Avaliação dos Pés",
    description:
      "Ter pelo menos 01 (uma) avaliação dos pés realizada nos últimos 12 (doze) meses",
    defaultMonths: 12,
  },
};

export interface BoasPraticasEvaluationInput {
  hasHypertension?: boolean;
  hasDiabetes?: boolean;

  // Boa Prática A - Consulta médica ou de enfermagem
  lastMedicalApptDate?: string | null;
  lastMedicalCare?: string | null;
  lastNursingApptDate?: string | null;
  lastNursingCare?: string | null;
  daysSinceMedicalCare?: number | null;
  monthsSinceMedicalCare?: number | null;
  daysSinceNursingCare?: number | null;
  monthsSinceNursingCare?: number | null;

  // Boa Prática B - Pressão Arterial
  lastPA?: { date?: string | null; systolic?: number; diastolic?: number } | null;
  dataPA?: string | null;

  // Boa Prática C - Peso e Altura simultâneos
  lastWeight?: { date?: string | null; weight?: number; height?: number; imc?: number } | null;
  peso?: number | null;
  altura?: number | null;
  dataMedicao?: string | null;

  // Boa Prática D - Visitas domiciliares
  lastVisitDate?: string | null;
  lastHomeVisit?: string | null;
  previousVisitDate?: string | null;
  daysSinceHomeVisit?: number | null;
  monthsSinceHomeVisit?: number | null;
  homeVisitsCount12m?: number | null;

  // Boa Prática E - Hemoglobina Glicada
  lastHbA1cDate?: string | null;
  hbA1cStatus?: boolean | null;

  // Boa Prática F - Avaliação dos Pés
  lastFootExamDate?: string | null;
  footExamStatus?: boolean | null;

  // Históricos e registros manuais
  historicoAcoes?: PatientActionRecord[];
  historicoCargas?: PatientCargaSnapshot[];
  boasPraticasManuais?: Partial<Record<BoaPraticaCode, BoaPraticaManualOverride>>;
}

function normalizeIsoDate(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const dt = new Date(trimmed);
  if (!isNaN(dt.getTime())) {
    return dt.toISOString().substring(0, 10);
  }
  return null;
}

function formatDatePtBR(isoDate?: string | null): string {
  if (!isoDate) return "";
  const parts = isoDate.substring(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function parseUtcDate(isoDate: string): Date | null {
  const parts = isoDate.substring(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return isNaN(dt.getTime()) ? null : dt;
}

function getReferenceDateIso(referenceDateIso?: string | null): string {
  return normalizeIsoDate(referenceDateIso) || new Date().toISOString().substring(0, 10);
}

function isDateWithinMonths(
  dateIso: string | null | undefined,
  maxMonths: number,
  refIso: string
): boolean {
  const cleanDate = normalizeIsoDate(dateIso);
  if (!cleanDate) return false;

  const target = parseUtcDate(cleanDate);
  const ref = parseUtcDate(refIso);
  if (!target || !ref) return false;

  const cutoff = new Date(ref.getTime());
  const originalDay = cutoff.getUTCDate();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - maxMonths);
  if (cutoff.getUTCDate() !== originalDay) {
    cutoff.setUTCDate(0);
  }

  return target.getTime() >= cutoff.getTime();
}

function daysBetweenIsoDates(olderIso: string, newerIso: string): number {
  const older = parseUtcDate(olderIso);
  const newer = parseUtcDate(newerIso);
  if (!older || !newer) return 0;
  return Math.round((newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24));
}

function pickMostRecentDate(dates: Array<string | null | undefined>): string | null {
  const normalized = dates
    .map((d) => normalizeIsoDate(d))
    .filter((d): d is string => Boolean(d));
  if (normalized.length === 0) return null;
  normalized.sort((a, b) => b.localeCompare(a));
  return normalized[0];
}

function deriveDateFromOffset(
  refIso: string,
  days?: number | null,
  months?: number | null
): string | null {
  const ref = parseUtcDate(refIso);
  if (!ref) return null;
  if (days !== undefined && days !== null && !isNaN(days) && days >= 0) {
    const dt = new Date(ref.getTime());
    dt.setUTCDate(dt.getUTCDate() - Math.round(days));
    return dt.toISOString().substring(0, 10);
  }
  if (months !== undefined && months !== null && !isNaN(months) && months >= 0) {
    const dt = new Date(ref.getTime());
    dt.setUTCDate(dt.getUTCDate() - Math.round(months) * 30);
    return dt.toISOString().substring(0, 10);
  }
  return null;
}

export function getEffectiveBoasPraticasParams(
  params?: DcntParameters
): DcntBoasPraticasParameters {
  const defaults = DEFAULT_DCNT_PARAMETERS.boasPraticas!;
  const custom = params?.boasPraticas;
  return {
    monthsA: Number(custom?.monthsA ?? defaults.monthsA),
    monthsB: Number(custom?.monthsB ?? defaults.monthsB),
    monthsC: Number(custom?.monthsC ?? defaults.monthsC),
    monthsD: Number(custom?.monthsD ?? defaults.monthsD),
    minVisitsD: Number(custom?.minVisitsD ?? defaults.minVisitsD),
    minIntervalDaysD: Number(custom?.minIntervalDaysD ?? defaults.minIntervalDaysD),
    monthsE: Number(custom?.monthsE ?? defaults.monthsE),
    monthsF: Number(custom?.monthsF ?? defaults.monthsF),
    applyEFOnlyToDiabetes: Boolean(
      custom?.applyEFOnlyToDiabetes ?? defaults.applyEFOnlyToDiabetes
    ),
    highAttentionMinPending: Number(
      custom?.highAttentionMinPending ?? defaults.highAttentionMinPending ?? 3
    ),
    mediumAttentionMinPending: Number(
      custom?.mediumAttentionMinPending ?? defaults.mediumAttentionMinPending ?? 2
    ),
  };
}

export function evaluatePatientBoasPraticas(
  input: BoasPraticasEvaluationInput,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS,
  referenceDateIso?: string | null
): PatientBoasPraticasSummary {
  const bp = getEffectiveBoasPraticasParams(params);
  const refIso = getReferenceDateIso(referenceDateIso);

  const hasHypertension = Boolean(input.hasHypertension);
  const hasDiabetes = Boolean(input.hasDiabetes);
  const isApplicable = hasHypertension || hasDiabetes;

  const manuais = input.boasPraticasManuais || {};
  const acoes = input.historicoAcoes || [];
  const cargas = input.historicoCargas || [];

  // ------------------------------------------------------------------
  // A: Pelo menos 01 consulta presencial ou remota por médico/enfermeiro nos últimos 6 meses
  // ------------------------------------------------------------------
  const manualA = manuais.A;
  const ubsActionDates = acoes
    .filter((a) => a.tipoAcao === "Atendimento/Comparecimento na UBS" && a.dataAcao)
    .map((a) => a.dataAcao);
  const cargaConsultDates = cargas.flatMap((c) => [
    c.dataUltimoAtendimentoMedico,
    c.dataUltimoAtendimentoEnfermagem,
  ]);
  const lastConsultDate = pickMostRecentDate([
    input.lastMedicalApptDate,
    input.lastMedicalCare,
    input.lastNursingApptDate,
    input.lastNursingCare,
    ...ubsActionDates,
    ...cargaConsultDates,
    manualA?.cumprida ? manualA.data : null,
  ]);

  const consultByDaysOrMonths =
    (input.daysSinceMedicalCare != null && input.daysSinceMedicalCare <= bp.monthsA * 30) ||
    (input.monthsSinceMedicalCare != null && input.monthsSinceMedicalCare <= bp.monthsA) ||
    (input.daysSinceNursingCare != null && input.daysSinceNursingCare <= bp.monthsA * 30) ||
    (input.monthsSinceNursingCare != null && input.monthsSinceNursingCare <= bp.monthsA);

  const fulfilledA =
    isApplicable &&
    ((lastConsultDate !== null && isDateWithinMonths(lastConsultDate, bp.monthsA, refIso)) ||
      consultByDaysOrMonths ||
      Boolean(manualA?.cumprida && !manualA.data));

  let detailA = "";
  if (!isApplicable) {
    detailA = "Aplicável a pacientes com Hipertensão ou Diabetes";
  } else if (fulfilledA) {
    if (lastConsultDate) {
      detailA = `Última consulta em ${formatDatePtBR(lastConsultDate)} (dentro de ${bp.monthsA} meses)`;
    } else if (consultByDaysOrMonths) {
      const m = input.monthsSinceMedicalCare ?? input.monthsSinceNursingCare;
      const d = input.daysSinceMedicalCare ?? input.daysSinceNursingCare;
      detailA =
        m != null
          ? `Consulta realizada há ${m} mês(es) (prazo: ${bp.monthsA} meses)`
          : `Consulta realizada há ${d} dia(s) (prazo: ${bp.monthsA} meses)`;
    } else {
      detailA = "Confirmada pela equipe";
    }
  } else if (lastConsultDate) {
    detailA = `Última consulta em ${formatDatePtBR(lastConsultDate)} (acima de ${bp.monthsA} meses)`;
  } else {
    detailA = `Sem registro de consulta médica ou de enfermagem nos últimos ${bp.monthsA} meses`;
  }

  const itemA: BoaPraticaItem = {
    code: "A",
    title: `Boa Prática A — ${BOAS_PRATICAS_CATALOG.A.shortTitle}`,
    shortTitle: BOAS_PRATICAS_CATALOG.A.shortTitle,
    description: BOAS_PRATICAS_CATALOG.A.description,
    maxMonths: bp.monthsA,
    applicable: isApplicable,
    fulfilled: fulfilledA,
    status: !isApplicable ? "Não aplicável" : fulfilledA ? "Em dia" : "Pendente",
    lastDate: lastConsultDate,
    detailText: detailA,
  };

  // ------------------------------------------------------------------
  // B: Pelo menos 01 registro de aferição de PA nos últimos 6 meses
  // ------------------------------------------------------------------
  const manualB = manuais.B;
  const cargaPADates = cargas
    .filter((c) => c.pressaoSistolica && c.pressaoDiastolica && c.dataPA)
    .map((c) => c.dataPA);
  const lastPADate = pickMostRecentDate([
    input.lastPA?.date,
    input.dataPA,
    ...cargaPADates,
    manualB?.cumprida ? manualB.data : null,
  ]);

  const fulfilledB =
    isApplicable &&
    ((lastPADate !== null && isDateWithinMonths(lastPADate, bp.monthsB, refIso)) ||
      Boolean(manualB?.cumprida && !manualB.data));

  let detailB = "";
  if (!isApplicable) {
    detailB = "Aplicável a pacientes com Hipertensão ou Diabetes";
  } else if (fulfilledB) {
    detailB = lastPADate
      ? `Última aferição em ${formatDatePtBR(lastPADate)} (dentro de ${bp.monthsB} meses)`
      : "Aferição confirmada pela equipe";
  } else if (lastPADate) {
    detailB = `Última aferição em ${formatDatePtBR(lastPADate)} (acima de ${bp.monthsB} meses)`;
  } else {
    detailB = `Sem registro de aferição de PA nos últimos ${bp.monthsB} meses`;
  }

  const itemB: BoaPraticaItem = {
    code: "B",
    title: `Boa Prática B — ${BOAS_PRATICAS_CATALOG.B.shortTitle}`,
    shortTitle: BOAS_PRATICAS_CATALOG.B.shortTitle,
    description: BOAS_PRATICAS_CATALOG.B.description,
    maxMonths: bp.monthsB,
    applicable: isApplicable,
    fulfilled: fulfilledB,
    status: !isApplicable ? "Não aplicável" : fulfilledB ? "Em dia" : "Pendente",
    lastDate: lastPADate,
    detailText: detailB,
  };

  // ------------------------------------------------------------------
  // C: Pelo menos 01 registro simultâneo de peso e altura nos últimos 12 meses
  // ------------------------------------------------------------------
  const manualC = manuais.C;
  const hasCurrentSimultaneous =
    Boolean(input.lastWeight?.weight && input.lastWeight?.height) ||
    Boolean(input.peso && input.altura);
  const cargaAnthroDates = cargas
    .filter((c) => c.peso && c.altura && c.dataAntropometria)
    .map((c) => c.dataAntropometria);

  const lastAnthroDate = pickMostRecentDate([
    hasCurrentSimultaneous ? input.lastWeight?.date || input.dataMedicao : null,
    ...cargaAnthroDates,
    manualC?.cumprida ? manualC.data : null,
  ]);

  const fulfilledC =
    isApplicable &&
    ((lastAnthroDate !== null && isDateWithinMonths(lastAnthroDate, bp.monthsC, refIso)) ||
      Boolean(manualC?.cumprida && !manualC.data));

  let detailC = "";
  if (!isApplicable) {
    detailC = "Aplicável a pacientes com Hipertensão ou Diabetes";
  } else if (fulfilledC) {
    detailC = lastAnthroDate
      ? `Peso e altura registrados em ${formatDatePtBR(lastAnthroDate)} (dentro de ${bp.monthsC} meses)`
      : "Peso e altura confirmados pela equipe";
  } else if (lastAnthroDate) {
    detailC = `Último registro simultâneo em ${formatDatePtBR(lastAnthroDate)} (acima de ${bp.monthsC} meses)`;
  } else if ((input.peso && !input.altura) || (!input.peso && input.altura)) {
    detailC = "Registro incompleto: peso e altura devem constar simultaneamente nos últimos 12 meses";
  } else {
    detailC = `Sem registro simultâneo de peso e altura nos últimos ${bp.monthsC} meses`;
  }

  const itemC: BoaPraticaItem = {
    code: "C",
    title: `Boa Prática C — ${BOAS_PRATICAS_CATALOG.C.shortTitle}`,
    shortTitle: BOAS_PRATICAS_CATALOG.C.shortTitle,
    description: BOAS_PRATICAS_CATALOG.C.description,
    maxMonths: bp.monthsC,
    applicable: isApplicable,
    fulfilled: fulfilledC,
    status: !isApplicable ? "Não aplicável" : fulfilledC ? "Em dia" : "Pendente",
    lastDate: lastAnthroDate,
    detailText: detailC,
  };

  // ------------------------------------------------------------------
  // D: Pelo menos 02 visitas domiciliares por ACS/TACS, intervalo mín. 30 dias, últimos 12 meses
  // ------------------------------------------------------------------
  const manualD = manuais.D;
  const acaoVisitDates = acoes
    .filter((a) => a.tipoAcao === "Visita Domiciliar" && a.dataAcao)
    .map((a) => a.dataAcao);
  const cargaVisitDates = cargas
    .filter((c) => c.dataUltimaVisitaACS)
    .map((c) => c.dataUltimaVisitaACS);
  const derivedVisitDate =
    !input.lastVisitDate && !input.lastHomeVisit
      ? deriveDateFromOffset(refIso, input.daysSinceHomeVisit, input.monthsSinceHomeVisit)
      : null;

  const rawAllVisitDates = [
    input.lastVisitDate,
    input.lastHomeVisit,
    input.previousVisitDate,
    derivedVisitDate,
    ...acaoVisitDates,
    ...cargaVisitDates,
    manualD?.cumprida ? manualD.data : null,
  ]
    .map((d) => normalizeIsoDate(d))
    .filter((d): d is string => Boolean(d));

  const uniqueVisitDates = Array.from(new Set(rawAllVisitDates)).sort((a, b) =>
    a.localeCompare(b)
  );
  const visitsIn12m = uniqueVisitDates.filter((d) =>
    isDateWithinMonths(d, bp.monthsD, refIso)
  );

  // Contar visitas com intervalo mínimo de bp.minIntervalDaysD (30 dias)
  let validSpacedVisits = 0;
  if (visitsIn12m.length > 0) {
    validSpacedVisits = 1;
    let lastAccepted = visitsIn12m[0];
    for (let i = 1; i < visitsIn12m.length; i++) {
      if (daysBetweenIsoDates(lastAccepted, visitsIn12m[i]) >= bp.minIntervalDaysD) {
        validSpacedVisits++;
        lastAccepted = visitsIn12m[i];
      }
    }
  }

  const effectiveVisitCount12m = Math.max(
    validSpacedVisits,
    input.homeVisitsCount12m != null ? Number(input.homeVisitsCount12m) : 0
  );
  const lastVisitAny = uniqueVisitDates.length > 0 ? uniqueVisitDates[uniqueVisitDates.length - 1] : null;

  const fulfilledD =
    isApplicable &&
    (effectiveVisitCount12m >= bp.minVisitsD || Boolean(manualD?.cumprida && !manualD.data));

  let detailD = "";
  if (!isApplicable) {
    detailD = "Aplicável a pacientes com Hipertensão ou Diabetes";
  } else if (fulfilledD) {
    if (effectiveVisitCount12m >= bp.minVisitsD) {
      detailD = `${effectiveVisitCount12m} visita(s) válida(s) nos últimos ${bp.monthsD} meses com intervalo ≥ ${bp.minIntervalDaysD} dias${lastVisitAny ? ` (última em ${formatDatePtBR(lastVisitAny)})` : ""}`;
    } else {
      detailD = "2 visitas domiciliares confirmadas pela equipe";
    }
  } else if (visitsIn12m.length >= bp.minVisitsD && validSpacedVisits < bp.minVisitsD) {
    const gap = daysBetweenIsoDates(visitsIn12m[0], visitsIn12m[visitsIn12m.length - 1]);
    detailD = `${visitsIn12m.length} visitas em ${bp.monthsD} meses, mas intervalo de ${gap} dia(s) (mín. exigido: ${bp.minIntervalDaysD} dias)`;
  } else if (effectiveVisitCount12m === 1) {
    detailD = `1/${bp.minVisitsD} visita em ${bp.monthsD} meses (${lastVisitAny ? formatDatePtBR(lastVisitAny) : "recente"}) — falta 1 visita com intervalo ≥ ${bp.minIntervalDaysD} dias`;
  } else if (lastVisitAny) {
    detailD = `0/${bp.minVisitsD} visitas nos últimos ${bp.monthsD} meses (última em ${formatDatePtBR(lastVisitAny)})`;
  } else {
    detailD = `0/${bp.minVisitsD} visitas domiciliares registradas nos últimos ${bp.monthsD} meses`;
  }

  const itemD: BoaPraticaItem = {
    code: "D",
    title: `Boa Prática D — ${BOAS_PRATICAS_CATALOG.D.shortTitle}`,
    shortTitle: BOAS_PRATICAS_CATALOG.D.shortTitle,
    description: BOAS_PRATICAS_CATALOG.D.description,
    maxMonths: bp.monthsD,
    applicable: isApplicable,
    fulfilled: fulfilledD,
    status: !isApplicable ? "Não aplicável" : fulfilledD ? "Em dia" : "Pendente",
    lastDate: lastVisitAny,
    detailText: detailD,
  };

  // ------------------------------------------------------------------
  // E: Pelo menos 01 registro de solicitação de hemoglobina glicada realizada ou avaliada nos últimos 12 meses
  // ------------------------------------------------------------------
  const applicableEF = isApplicable && (bp.applyEFOnlyToDiabetes ? hasDiabetes : true);
  const manualE = manuais.E;
  const cargaHbA1cDates = cargas
    .filter((c) => c.dataUltimaHemoglobinaGlicada)
    .map((c) => c.dataUltimaHemoglobinaGlicada);
  const lastHbA1cDate = pickMostRecentDate([
    input.lastHbA1cDate,
    ...cargaHbA1cDates,
    manualE?.cumprida ? manualE.data : null,
  ]);

  const fulfilledE =
    applicableEF &&
    ((lastHbA1cDate !== null && isDateWithinMonths(lastHbA1cDate, bp.monthsE, refIso)) ||
      Boolean(input.hbA1cStatus) ||
      Boolean(manualE?.cumprida && !manualE.data));

  let detailE = "";
  if (!applicableEF) {
    detailE = isApplicable
      ? "Configurado apenas para pacientes com Diabetes"
      : "Aplicável a pacientes com Hipertensão ou Diabetes";
  } else if (fulfilledE) {
    detailE = lastHbA1cDate
      ? `Hemoglobina glicada registrada em ${formatDatePtBR(lastHbA1cDate)} (dentro de ${bp.monthsE} meses)`
      : "Solicitação/avaliação de HbA1c confirmada";
  } else if (lastHbA1cDate) {
    detailE = `Último registro em ${formatDatePtBR(lastHbA1cDate)} (acima de ${bp.monthsE} meses)`;
  } else {
    detailE = `Sem registro de hemoglobina glicada nos últimos ${bp.monthsE} meses`;
  }

  const itemE: BoaPraticaItem = {
    code: "E",
    title: `Boa Prática E — ${BOAS_PRATICAS_CATALOG.E.shortTitle}`,
    shortTitle: BOAS_PRATICAS_CATALOG.E.shortTitle,
    description: BOAS_PRATICAS_CATALOG.E.description,
    maxMonths: bp.monthsE,
    applicable: applicableEF,
    fulfilled: fulfilledE,
    status: !applicableEF ? "Não aplicável" : fulfilledE ? "Em dia" : "Pendente",
    lastDate: lastHbA1cDate,
    detailText: detailE,
  };

  // ------------------------------------------------------------------
  // F: Pelo menos 01 avaliação dos pés realizada nos últimos 12 meses
  // ------------------------------------------------------------------
  const manualF = manuais.F;
  const cargaFootDates = cargas
    .filter((c) => c.dataUltimaAvaliacaoPes)
    .map((c) => c.dataUltimaAvaliacaoPes);
  const lastFootDate = pickMostRecentDate([
    input.lastFootExamDate,
    ...cargaFootDates,
    manualF?.cumprida ? manualF.data : null,
  ]);

  const fulfilledF =
    applicableEF &&
    ((lastFootDate !== null && isDateWithinMonths(lastFootDate, bp.monthsF, refIso)) ||
      Boolean(input.footExamStatus) ||
      Boolean(manualF?.cumprida && !manualF.data));

  let detailF = "";
  if (!applicableEF) {
    detailF = isApplicable
      ? "Configurado apenas para pacientes com Diabetes"
      : "Aplicável a pacientes com Hipertensão ou Diabetes";
  } else if (fulfilledF) {
    detailF = lastFootDate
      ? `Avaliação dos pés em ${formatDatePtBR(lastFootDate)} (dentro de ${bp.monthsF} meses)`
      : "Avaliação dos pés confirmada";
  } else if (lastFootDate) {
    detailF = `Última avaliação em ${formatDatePtBR(lastFootDate)} (acima de ${bp.monthsF} meses)`;
  } else {
    detailF = `Sem registro de avaliação dos pés nos últimos ${bp.monthsF} meses`;
  }

  const itemF: BoaPraticaItem = {
    code: "F",
    title: `Boa Prática F — ${BOAS_PRATICAS_CATALOG.F.shortTitle}`,
    shortTitle: BOAS_PRATICAS_CATALOG.F.shortTitle,
    description: BOAS_PRATICAS_CATALOG.F.description,
    maxMonths: bp.monthsF,
    applicable: applicableEF,
    fulfilled: fulfilledF,
    status: !applicableEF ? "Não aplicável" : fulfilledF ? "Em dia" : "Pendente",
    lastDate: lastFootDate,
    detailText: detailF,
  };

  const items: BoaPraticaItem[] = [itemA, itemB, itemC, itemD, itemE, itemF];
  const applicableItems = items.filter((it) => it.applicable);

  if (!isApplicable || applicableItems.length === 0) {
    return {
      isApplicable: false,
      items,
      completedCount: 0,
      pendingCount: 0,
      totalApplicableCount: 0,
      complianceRate: 100,
      attentionLevel: "Acompanhado",
      attentionLabel: "Sem comorbidade HAS/DM ativa",
      homeVisitsValidCount12m: effectiveVisitCount12m,
    };
  }

  const totalApplicableCount = applicableItems.length;
  const completedCount = applicableItems.filter((it) => it.fulfilled).length;
  const pendingCount = applicableItems.filter((it) => !it.fulfilled).length;
  const complianceRate =
    totalApplicableCount > 0 ? Math.round((completedCount / totalApplicableCount) * 100) : 100;

  let attentionLevel: PriorityLevel = "Acompanhado";
  let attentionLabel = `Boas Práticas em Dia (${completedCount}/${totalApplicableCount})`;

  if (pendingCount === 0) {
    attentionLevel = "Acompanhado";
    attentionLabel = `Boas Práticas em Dia (${completedCount}/${totalApplicableCount})`;
  } else if (pendingCount >= (bp.highAttentionMinPending ?? 3)) {
    attentionLevel = "Alta";
    attentionLabel = `Grau de Atenção Alto (${pendingCount} prática(s) pendente(s))`;
  } else if (pendingCount === (bp.mediumAttentionMinPending ?? 2)) {
    attentionLevel = "Média";
    attentionLabel = `Grau de Atenção Moderado (${pendingCount} prática(s) pendente(s))`;
  } else {
    attentionLevel = "Atenção";
    attentionLabel = `Grau de Atenção Preventivo (1 prática pendente)`;
  }

  return {
    isApplicable: true,
    items,
    completedCount,
    pendingCount,
    totalApplicableCount,
    complianceRate,
    attentionLevel,
    attentionLabel,
    homeVisitsValidCount12m: effectiveVisitCount12m,
  };
}
