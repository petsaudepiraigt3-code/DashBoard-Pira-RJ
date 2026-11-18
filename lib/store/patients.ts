import { supabase } from "@/lib/supabase";
import { collection, getDocs, doc, getDoc, updateDoc, writeBatch } from "@/lib/store/documents";
import { db } from "@/lib/store/documents";
import {
  BoaPraticaCode,
  BoaPraticaManualOverride,
  DcntParameters,
  Patient,
  PatientActionRecord,
  PatientBoasPraticasSummary,
  PriorityLevel,
  PatientCargaSnapshot,
  PAMeasurement,
  WeightMeasurement,
  ManagerObservationRecord,
  ManagerObservationRevision,
  ManagerObservationCategory,
} from "@/types/dcnt";
import { MOCK_UNIT_NAME } from "@/data/mock-data";
import { compareActionsChronological } from "@/lib/utils/returns";
import { normalizeUnitId, buildUnitAliasMap, resolveCanonicalUnitId } from "@/lib/store/units";
import { DEFAULT_DCNT_PARAMETERS, getDcntParametersFromStore } from "@/lib/store/parameters";
import { evaluatePatientBoasPraticas } from "@/lib/utils/boas-praticas";
import { calculateAdminPriorityScore } from "@/lib/utils/priority";

export interface StorePatientDoc {
  id: string;
  nome: string;
  cpf: string | null;
  cns: string | null;
  dataNascimento: string | null;
  idade: number | null;
  sexo: "Masculino" | "Feminino" | null;
  telefone?: string | null;
  telefoneOriginal?: string | null;
  telefone_celular?: string | null;
  telefoneCelular?: string | null;
  telefoneResidencial?: string | null;
  telefoneContato?: string | null;
  racaCor?: string | null;
  beneficiarioBolsaFamilia?: boolean | null;
  vigenciaBolsaFamilia?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  hasDiabetes?: boolean;
  hasHypertension?: boolean;
  isSmoker?: boolean;
  hasCardiovascularDisease?: boolean;
  identidadeGenero: string | null;
  microarea: string | null;

  pesoAtual: number | null;
  alturaAtual: number | null;
  imcAtual: number | null;
  dataUltimaAntropometria?: string | null;

  pressaoSistolicaAtual: number | null;
  pressaoDiastolicaAtual: number | null;
  dataUltimaPA: string | null;

  daysSinceMedicalCare?: number | null;
  monthsSinceMedicalCare: number | null;
  daysSinceNursingCare?: number | null;
  monthsSinceNursingCare: number | null;
  daysSinceDentalCare?: number | null;
  monthsSinceDentalCare: number | null;
  monthsSinceHomeVisit: number | null;
  daysSinceHomeVisit?: number | null;
  dataUltimaVisitaACS?: string | null;
  dataUltimaVisita?: string | null;
  dataUltimaConsulta?: string | null;
  dataUltimoAtendimentoEnfermagem?: string | null;
  dataUltimoAtendimentoOdontologico?: string | null;
  dataUltimaHemoglobinaGlicada?: string | null;
  hbA1cStatus?: boolean | null;
  dataUltimaAvaliacaoPes?: string | null;
  footExamStatus?: boolean | null;
  visitasDomiciliares12Meses?: number | null;
  dataPenultimaVisitaACS?: string | null;
  boasPraticasManuais?: Partial<Record<BoaPraticaCode, BoaPraticaManualOverride>> | null;
  dataReferenciaCarga?: string | null;

  prioridade: "Alta" | "Média" | "Atenção" | "Acompanhado";
  motivosPrioridade: string | null;

  identificacaoConfiavel: boolean;
  requerRevisao: boolean;

  historicoAcoes?: PatientActionRecord[];
  historicoCargas?: PatientCargaSnapshot[];
  observacaoGerenteAtual?: ManagerObservationRecord | null;
  observacoesGerente?: ManagerObservationRecord[];
  historicoObservacoesGerente?: ManagerObservationRevision[];
  createdAt?: any;
  updatedAt?: any;
  ultimaImportacaoId: string;
}

/**
 * Consolida a data da última visita domiciliar do paciente considerando:
 * A) Dados provenientes do e-SUS APS (dataUltimaVisitaACS / dataUltimaVisita ou derivados de dias/meses passados)
 * B) Ações do tipo "Visita Domiciliar" registradas no próprio DCNT Saúde
 * A informação mais recente prevalece. Se ambos forem ausentes, retorna "" ("Sem registro").
 */
export function computeConsolidatedLastVisitDate(data: {
  dataUltimaVisitaACS?: string | null;
  dataUltimaVisita?: string | null;
  daysSinceHomeVisit?: number | null;
  monthsSinceHomeVisit?: number | null;
  dataReferenciaCarga?: string | null;
  historicoAcoes?: PatientActionRecord[];
  historicoCargas?: PatientCargaSnapshot[];
}): string {
  const rawHistorico: PatientActionRecord[] = data.historicoAcoes || [];
  const lastVisitaDomiciliar = rawHistorico.find((act) => act.tipoAcao === "Visita Domiciliar");
  const dcntVisitDate = lastVisitaDomiciliar?.dataAcao || null;

  let esusVisitDate: string | null = data.dataUltimaVisitaACS || data.dataUltimaVisita || null;

  if (!esusVisitDate) {
    const baseIso =
      data.dataReferenciaCarga ||
      data.historicoCargas?.[0]?.dataReferencia ||
      data.historicoCargas?.[0]?.dataCarga?.substring(0, 10) ||
      new Date().toISOString().substring(0, 10);
    const [y, m, d] = baseIso.substring(0, 10).split("-").map(Number);

    if (data.daysSinceHomeVisit != null && data.daysSinceHomeVisit >= 0 && !isNaN(y)) {
      const refDate = new Date(Date.UTC(y, m - 1, d));
      refDate.setUTCDate(refDate.getUTCDate() - data.daysSinceHomeVisit);
      esusVisitDate = refDate.toISOString().substring(0, 10);
    } else if (data.monthsSinceHomeVisit != null && data.monthsSinceHomeVisit >= 0 && !isNaN(y)) {
      const refDate = new Date(Date.UTC(y, m - 1, d));
      refDate.setUTCDate(refDate.getUTCDate() - data.monthsSinceHomeVisit * 30);
      esusVisitDate = refDate.toISOString().substring(0, 10);
    }
  }

  if (dcntVisitDate && esusVisitDate) {
    return dcntVisitDate > esusVisitDate ? dcntVisitDate : esusVisitDate;
  }
  if (dcntVisitDate) return dcntVisitDate;
  if (esusVisitDate) return esusVisitDate;
  return ""; // Sem registro
}

// 1. Obter mapa de pacientes existentes no Store por CPF, CNS ou Secundário (Nome + Data Nasc)
export async function getExistingPatientsMap(): Promise<Map<string, StorePatientDoc>> {
  const patientMap = new Map<string, StorePatientDoc>();
  try {
    const querySnapshot = await getDocs(collection(db, "pacientes"));
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as StorePatientDoc;
      const docWithId = { ...data, id: docSnap.id };

      if (data.cpf) patientMap.set(data.cpf, docWithId);
      if (data.cns) patientMap.set(data.cns, docWithId);
      
      if (data.nome && data.dataNascimento) {
        const normName = data.nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, "");
        const secKey = `sec_${normName}_${data.dataNascimento}`;
        patientMap.set(secKey, docWithId);
      }
    });
  } catch (err) {
    throw err;
  }
  return patientMap;
}

export interface FetchPatientsOptions {
  role?: "ADMIN" | "GERENTE" | "ACS" | string;
  userUnitId?: string | null;
  assignedMicroareaCodes?: string[];
  acsName?: string;
  acsId?: string;
}

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Acompanhado: 0,
  "Atenção": 1,
  "Média": 2,
  Alta: 3,
};

function buildUnitAndMicroareaMaps(
  unitsSnap: Awaited<ReturnType<typeof getDocs>> | null,
  maSnap: Awaited<ReturnType<typeof getDocs>> | null
) {
  const unitEntries: Array<{ id?: string; codigo?: string; nome?: string; nomeNormalizado?: string }> = [];
  if (unitsSnap) {
    unitsSnap.forEach((uDoc) => {
      const uData = uDoc.data();
      unitEntries.push({
        id: uDoc.id,
        codigo: uData.codigo,
        nome: uData.nome,
        nomeNormalizado: uData.nomeNormalizado,
      });
    });
  }
  const unitAliasMap = buildUnitAliasMap(unitEntries);

  const microareaAcsMap = new Map<string, string>();
  if (maSnap) {
    maSnap.forEach((mDoc) => {
      const mData = mDoc.data();
      if (mData.unidadeId && mData.codigo && mData.acsNome) {
        const mUnit = resolveCanonicalUnitId(mData.unidadeId, unitAliasMap);
        const cleanCode = (mData.codigo || "").replace(/\D/g, "").trim();
        const paddedCode = cleanCode ? cleanCode.padStart(2, "0") : "";
        if (cleanCode) microareaAcsMap.set(`${mUnit}_${cleanCode}`, mData.acsNome);
        if (paddedCode) microareaAcsMap.set(`${mUnit}_${paddedCode}`, mData.acsNome);
        microareaAcsMap.set(`${mUnit}_${mData.codigo}`, mData.acsNome);
      }
    });
  }

  return { unitAliasMap, microareaAcsMap };
}

type RawStorePatientData = StorePatientDoc & {
  unidadeId?: string;
  unidadeNome?: string;
  acsId?: string;
  acsNome?: string;
  microareaCodigo?: string;
  dataUltimaVisita?: string | null;
  dataUltimaConsulta?: string | null;
};

function hydratePatientFromStoreDoc(
  docId: string,
  data: RawStorePatientData,
  ctx: {
    unitAliasMap: Map<string, string>;
    microareaAcsMap: Map<string, string>;
    options?: FetchPatientsOptions;
    dcntParams: DcntParameters;
  }
): Patient {
  const { unitAliasMap, microareaAcsMap, options, dcntParams } = ctx;
  const pUnitId = resolveCanonicalUnitId(data.unidadeId || data.unidadeNome, unitAliasMap);
  const pMicroarea = data.microarea || "Sem microárea";
  const rawDigits =
    (pMicroarea || "").replace(/\D/g, "").trim() ||
    (data.microareaCodigo || "").replace(/\D/g, "").trim();
  const patMACode = rawDigits ? rawDigits.padStart(2, "0") : data.microareaCodigo || "";

  const maKey = `${pUnitId}_${patMACode}`;
  const assignedAcsFromMA =
    microareaAcsMap.get(maKey) ||
    (rawDigits ? microareaAcsMap.get(`${pUnitId}_${rawDigits}`) : undefined) ||
    (data.microareaCodigo ? microareaAcsMap.get(`${pUnitId}_${data.microareaCodigo}`) : undefined);

  let resolvedACSName = "";
  if (assignedAcsFromMA) {
    resolvedACSName = assignedAcsFromMA;
  } else if (data.acsNome && data.acsNome !== "Agente Comunitário") {
    resolvedACSName = data.acsNome;
  } else if (options?.role === "ACS" && options?.acsName) {
    resolvedACSName = options.acsName;
  } else {
    resolvedACSName = "Sem ACS responsável";
  }

  const ageVal = data.idade || 0;
  const imcVal = data.imcAtual;
  const hasValidIMC = typeof imcVal === "number" && !isNaN(imcVal) && imcVal > 0;
  const isAdult = ageVal >= 20;
  const isObese = isAdult && hasValidIMC && imcVal >= 30;
  const isOverweight = isAdult && hasValidIMC && imcVal >= 25 && imcVal < 30;

  const rawHistorico: PatientActionRecord[] = (data as any).historicoAcoes || [];
  const computedTimeline = rawHistorico.map((act) => ({
    id: act.id,
    date: act.dataAcao,
    type: (act.tipoAcao === "Visita Domiciliar" ? "Visita ACS" : act.tipoAcao === "Contato Telefônico" ? "Contato Telefônico" : "Busca Ativa") as any,
    title: `Registro de ${act.tipoAcao}`,
    description: `${act.resultado}${act.observacoes ? `. OBS: ${act.observacoes}` : ""}`,
    professional: act.acsNome || "Profissional de Saúde",
  }));

  const lastVisitDate = computeConsolidatedLastVisitDate(data);
  const lastMedicalApptDate = data.dataUltimaConsulta || undefined;

  const historicoCargas = (data as any).historicoCargas || [];
  const extractedPAHistory: PAMeasurement[] = [];
  const extractedWeightHistory: WeightMeasurement[] = [];

  historicoCargas.forEach((c: PatientCargaSnapshot) => {
    if (c.pressaoSistolica && c.pressaoDiastolica) {
      extractedPAHistory.push({
        id: `pa-${c.id}`,
        date: c.dataPA || (c.dataCarga ? c.dataCarga.substring(0, 10) : ""),
        systolic: c.pressaoSistolica,
        diastolic: c.pressaoDiastolica,
        location: "e-SUS APS",
      });
    }
    if (c.peso && c.altura) {
      extractedWeightHistory.push({
        id: `w-${c.id}`,
        date: c.dataAntropometria || (c.dataCarga ? c.dataCarga.substring(0, 10) : ""),
        weight: c.peso,
        height: c.altura,
        imc: c.imc || Number((c.peso / (c.altura * c.altura)).toFixed(2)),
      });
    }
  });

  if (data.pressaoSistolicaAtual && data.pressaoDiastolicaAtual) {
    const currentDate = data.dataUltimaPA || new Date().toISOString().substring(0, 10);
    if (!extractedPAHistory.some((h) => h.date === currentDate)) {
      extractedPAHistory.push({
        id: `pa-current-${docId}`,
        date: currentDate,
        systolic: data.pressaoSistolicaAtual,
        diastolic: data.pressaoDiastolicaAtual,
        location: "e-SUS APS",
      });
    }
  }

  if (data.pesoAtual && data.alturaAtual) {
    const currentDate = data.dataUltimaAntropometria || new Date().toISOString().substring(0, 10);
    if (!extractedWeightHistory.some((h) => h.date === currentDate)) {
      extractedWeightHistory.push({
        id: `w-current-${docId}`,
        date: currentDate,
        weight: data.pesoAtual,
        height: data.alturaAtual,
        imc: data.imcAtual || Number((data.pesoAtual / (data.alturaAtual * data.alturaAtual)).toFixed(2)),
      });
    }
  }

  extractedPAHistory.sort((a, b) => a.date.localeCompare(b.date));
  extractedWeightHistory.sort((a, b) => a.date.localeCompare(b.date));

  const explicitCell =
    data.telefoneCelular ||
    data.telefone_celular ||
    (data as any)["Telefone celular"] ||
    "";
  const hasSplitPhoneFields =
    "telefoneCelular" in data ||
    "telefone_celular" in data ||
    "telefoneResidencial" in data ||
    "telefoneContato" in data;
  const legacyCellFallback = !hasSplitPhoneFields ? (data.telefone || "") : "";
  const resolvedPhoneCell = explicitCell || legacyCellFallback || undefined;

  const resolvedPhone =
    resolvedPhoneCell ||
    data.telefone ||
    data.telefoneContato ||
    data.telefoneResidencial ||
    data.telefoneOriginal ||
    "";

  const rawObservacoesGerente: ManagerObservationRecord[] = Array.isArray((data as any).observacoesGerente)
    ? [...(data as any).observacoesGerente].sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
    : [];
  const rawHistoricoObsGerente: ManagerObservationRevision[] = Array.isArray((data as any).historicoObservacoesGerente)
    ? [...(data as any).historicoObservacoesGerente].sort((a, b) => (b.dataRegistro || "").localeCompare(a.dataRegistro || ""))
    : [];
  const resolvedObservacaoAtual: ManagerObservationRecord | null =
    (data as any).observacaoGerenteAtual || rawObservacoesGerente[0] || null;

  const hasHypertension = Boolean(
    data.hasHypertension || (data.pressaoSistolicaAtual && data.pressaoSistolicaAtual >= 140)
  );
  const hasDiabetes = Boolean(data.hasDiabetes);

  const lastPAObj =
    data.pressaoSistolicaAtual && data.pressaoDiastolicaAtual
      ? {
          id: `pa-${docId}`,
          date: data.dataUltimaPA || new Date().toISOString().substring(0, 10),
          systolic: data.pressaoSistolicaAtual,
          diastolic: data.pressaoDiastolicaAtual,
          location: "e-SUS APS",
        }
      : undefined;

  const lastWeightObj =
    data.pesoAtual && data.alturaAtual
      ? {
          id: `w-${docId}`,
          date: data.dataUltimaAntropometria || new Date().toISOString().substring(0, 10),
          weight: data.pesoAtual,
          height: data.alturaAtual,
          imc: data.imcAtual || 0,
        }
      : undefined;

  const boasPraticas = evaluatePatientBoasPraticas(
    {
      hasHypertension,
      hasDiabetes,
      lastMedicalApptDate: lastMedicalApptDate || "",
      lastNursingApptDate: data.dataUltimoAtendimentoEnfermagem || "",
      daysSinceMedicalCare: data.daysSinceMedicalCare ?? undefined,
      monthsSinceMedicalCare: data.monthsSinceMedicalCare ?? undefined,
      daysSinceNursingCare: data.daysSinceNursingCare ?? undefined,
      monthsSinceNursingCare: data.monthsSinceNursingCare ?? undefined,
      lastPA: lastPAObj,
      dataPA: data.dataUltimaPA || undefined,
      lastWeight: lastWeightObj,
      peso: data.pesoAtual ?? undefined,
      altura: data.alturaAtual ?? undefined,
      dataMedicao: data.dataUltimaAntropometria || undefined,
      lastVisitDate: lastVisitDate || "",
      previousVisitDate: data.dataPenultimaVisitaACS || undefined,
      daysSinceHomeVisit: data.daysSinceHomeVisit ?? undefined,
      monthsSinceHomeVisit: data.monthsSinceHomeVisit ?? undefined,
      homeVisitsCount12m: data.visitasDomiciliares12Meses ?? undefined,
      lastHbA1cDate: data.dataUltimaHemoglobinaGlicada || undefined,
      hbA1cStatus: data.hbA1cStatus ?? undefined,
      lastFootExamDate: data.dataUltimaAvaliacaoPes || undefined,
      footExamStatus: data.footExamStatus ?? undefined,
      historicoAcoes: rawHistorico,
      historicoCargas,
      boasPraticasManuais: data.boasPraticasManuais || undefined,
    },
    dcntParams
  );

  let resolvedPriority: PriorityLevel = data.prioridade || "Acompanhado";
  let resolvedReason: string | undefined = data.motivosPrioridade || undefined;

  if (boasPraticas.isApplicable && boasPraticas.pendingCount > 0) {
    if (PRIORITY_RANK[boasPraticas.attentionLevel] > PRIORITY_RANK[resolvedPriority]) {
      resolvedPriority = boasPraticas.attentionLevel;
    }
    const pendingCodes = boasPraticas.items
      .filter((it) => it.applicable && !it.fulfilled)
      .map((it) => `${it.code} (${it.points} pts)`);
    const bpNote = `Boas Práticas HAS/DM (${boasPraticas.earnedPoints}/${boasPraticas.totalPossiblePoints} pts): pendência em ${pendingCodes.join(", ")}`;
    if (!resolvedReason) {
      resolvedReason = bpNote;
    } else if (!resolvedReason.includes("Boa Prática") && !resolvedReason.includes("Boas Práticas")) {
      resolvedReason = `${bpNote}. ${resolvedReason}`;
    }
  }

  return {
    id: docId,
    name: data.nome,
    cpf: data.cpf || "Sem CPF",
    cns: data.cns || "Sem CNS",
    birthDate: data.dataNascimento || undefined,
    age: data.idade || 0,
    sex: data.sexo || "Feminino",
    genderIdentity: data.identidadeGenero || undefined,
    raceColor: data.racaCor || undefined,
    bolsaFamilia: data.beneficiarioBolsaFamilia ?? undefined,
    bolsaFamiliaValidity: data.vigenciaBolsaFamilia || undefined,
    phone: resolvedPhone,
    phoneCell: resolvedPhoneCell,
    phoneHome: data.telefoneResidencial || undefined,
    phoneContact: data.telefoneContato || undefined,
    street: data.logradouro || undefined,
    number: data.numero || undefined,
    complement: data.complemento || undefined,
    neighborhood: data.bairro || undefined,
    city: data.municipio || undefined,
    state: data.uf || undefined,
    zipCode: data.cep || undefined,
    unit: data.unidadeNome || MOCK_UNIT_NAME,
    unidadeId: pUnitId,
    unidadeNome: data.unidadeNome || MOCK_UNIT_NAME,
    microarea: pMicroarea,
    microareaCodigo: patMACode || undefined,
    acsName: resolvedACSName,
    isElderly: (data.idade || 0) >= 60,
    isChildUnder2: data.idade !== null && data.idade !== undefined && data.idade >= 0 && data.idade <= 2,
    hasHypertension,
    hasDiabetes,
    isObese,
    isOverweight,
    isSmoker: data.isSmoker || false,
    hasCardiovascularDisease: data.hasCardiovascularDisease || false,
    lastPA: lastPAObj,
    lastWeight: lastWeightObj,
    lastVisitDate: lastVisitDate || "",
    lastMedicalApptDate: lastMedicalApptDate || "",
    lastNursingApptDate: data.dataUltimoAtendimentoEnfermagem || "",
    lastDentalApptDate: data.dataUltimoAtendimentoOdontologico || "",
    daysSinceMedicalCare: data.daysSinceMedicalCare ?? undefined,
    monthsSinceMedicalCare: data.monthsSinceMedicalCare ?? undefined,
    daysSinceNursingCare: data.daysSinceNursingCare ?? undefined,
    monthsSinceNursingCare: data.monthsSinceNursingCare ?? undefined,
    daysSinceDentalCare: data.daysSinceDentalCare ?? undefined,
    monthsSinceDentalCare: data.monthsSinceDentalCare ?? undefined,
    daysSinceHomeVisit: data.daysSinceHomeVisit ?? undefined,
    monthsSinceHomeVisit: data.monthsSinceHomeVisit ?? undefined,
    lastHbA1cDate: data.dataUltimaHemoglobinaGlicada || undefined,
    hbA1cStatus: data.hbA1cStatus ?? undefined,
    lastFootExamDate: data.dataUltimaAvaliacaoPes || undefined,
    footExamStatus: data.footExamStatus ?? undefined,
    homeVisitsCount12m: data.visitasDomiciliares12Meses ?? undefined,
    previousVisitDate: data.dataPenultimaVisitaACS || undefined,
    boasPraticasManuais: data.boasPraticasManuais || undefined,
    boasPraticas,
    priority: resolvedPriority,
    activeSearchReason: resolvedReason,
    activeSearchStatus: resolvedPriority === "Alta" ? "Pendente" : "Acompanhado",
    paHistory: extractedPAHistory,
    weightHistory: extractedWeightHistory,
    timeline: computedTimeline,
    historicoAcoes: rawHistorico,
    historicoCargas: historicoCargas,
    observacaoGerenteAtual: resolvedObservacaoAtual,
    observacoesGerente: rawObservacoesGerente,
    historicoObservacoesGerente: rawHistoricoObsGerente,
  };
}

// 2. Buscar todos os pacientes da coleção 'pacientes' no Store com suporte a filtro de escopo
export async function getAllPatientsFromStore(options?: FetchPatientsOptions): Promise<Patient[]> {
  const list: Patient[] = [];
  try {
    // Executar consultas independentes em paralelo para reduzir drasticamente a latência de carregamento
    const [unitsSnap, maSnap, querySnapshot, dcntParams] = await Promise.all([
      getDocs(collection(db, "unidades")).catch(() => null),
      getDocs(collection(db, "microareas")).catch(() => null),
      getDocs(collection(db, "pacientes")),
      getDcntParametersFromStore().catch(() => DEFAULT_DCNT_PARAMETERS),
    ]);

    const { unitAliasMap, microareaAcsMap } = buildUnitAndMicroareaMaps(unitsSnap, maSnap);

    const normalizedAssignedCodes = Array.isArray(options?.assignedMicroareaCodes)
      ? options!.assignedMicroareaCodes.map((c) => {
          const digits = String(c || "").replace(/\D/g, "").trim();
          return digits ? digits.padStart(2, "0") : String(c || "").trim();
        })
      : undefined;

    let targetUnitId = options?.userUnitId ? resolveCanonicalUnitId(options.userUnitId, unitAliasMap) : null;
    const isGerente = String(options?.role || "").toUpperCase() === "GERENTE";
    const isAcs = String(options?.role || "").toUpperCase() === "ACS";

    let rawDocs: Array<{ id: string; data: () => Record<string, any> }> = querySnapshot.docs;

    // Se o GERENTE recebeu 0 pacientes via RLS do cliente (ex.: divergência de unidadeId no perfil), reconciliar via servidor
    if (isGerente && rawDocs.length === 0 && typeof window !== "undefined") {
      try {
        const sessionRes = await supabase.auth?.getSession?.();
        const token = sessionRes?.data?.session?.access_token;
        if (token) {
          const recRes = await fetch("/api/admin/reconcile-manager", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (recRes.ok) {
            const recData = await recRes.json();
            if (recData?.unitId) {
              targetUnitId = resolveCanonicalUnitId(recData.unitId, unitAliasMap);
            }
            if (Array.isArray(recData?.patients) && recData.patients.length > 0) {
              rawDocs = recData.patients.map((item: { id: string; data: Record<string, any> }) => ({
                id: item.id,
                data: () => item.data || {},
              }));
            }
          }
        }
      } catch {
        // Ignorar caso rota de reconciliação não esteja disponível
      }
    }

    const gerenteHasDirectUnitMatch =
      isGerente && targetUnitId
        ? rawDocs.some((d) => {
            const dData = d.data();
            const dUnit = resolveCanonicalUnitId(dData.unidadeId || dData.unidadeNome, unitAliasMap);
            return dUnit.toUpperCase() === targetUnitId!.toUpperCase();
          })
        : false;

    rawDocs.forEach((docSnap) => {
      const data = docSnap.data() as RawStorePatientData;
      const pUnitId = resolveCanonicalUnitId(data.unidadeId || data.unidadeNome, unitAliasMap);
      const pMicroarea = data.microarea || "Sem microárea";
      const rawDigits =
        (pMicroarea || "").replace(/\D/g, "").trim() ||
        (data.microareaCodigo || "").replace(/\D/g, "").trim();
      const patMACode = rawDigits ? rawDigits.padStart(2, "0") : data.microareaCodigo || "";

      // Filtro de Escopo em nível de consulta Store:
      if (isAcs) {
        if (targetUnitId && pUnitId.toUpperCase() !== targetUnitId.toUpperCase()) {
          return;
        }
        if (normalizedAssignedCodes !== undefined) {
          if (
            normalizedAssignedCodes.length === 0 ||
            (!normalizedAssignedCodes.includes(patMACode) &&
              !(rawDigits && normalizedAssignedCodes.includes(rawDigits)))
          ) {
            return;
          }
        }
      } else if (isGerente) {
        if (targetUnitId && gerenteHasDirectUnitMatch && pUnitId.toUpperCase() !== targetUnitId.toUpperCase()) {
          return;
        }
      }

      list.push(
        hydratePatientFromStoreDoc(docSnap.id, data, {
          unitAliasMap,
          microareaAcsMap,
          options,
          dcntParams,
        })
      );
    });
  } catch (err) {
    console.error("Erro ao buscar pacientes no Store:", err);
  }
  return list;
}

export async function getPatientByIdFromStore(
  patientId: string,
  options?: FetchPatientsOptions
): Promise<Patient | null> {
  if (!patientId) return null;
  try {
    const [unitsSnap, maSnap, patSnap, dcntParams] = await Promise.all([
      getDocs(collection(db, "unidades")).catch(() => null),
      getDocs(collection(db, "microareas")).catch(() => null),
      getDoc(doc(db, "pacientes", patientId)),
      getDcntParametersFromStore().catch(() => DEFAULT_DCNT_PARAMETERS),
    ]);

    if (!patSnap.exists()) return null;

    const { unitAliasMap, microareaAcsMap } = buildUnitAndMicroareaMaps(unitsSnap, maSnap);
    const data = patSnap.data() as RawStorePatientData;

    return hydratePatientFromStoreDoc(patSnap.id, data, {
      unitAliasMap,
      microareaAcsMap,
      options,
      dcntParams,
    });
  } catch {
    return null;
  }
}

// 3. Salvar Acompanhamento/Ação real no Store
export async function savePatientActionInStore(
  patientId: string,
  actionData: Omit<PatientActionRecord, "id" | "createdAt">,
  newPriority?: PriorityLevel,
  newLastVisitDate?: string,
  userRole?: string
): Promise<PatientActionRecord> {
  if (userRole && userRole !== "ACS") {
    throw new Error("Acesso Negado: Apenas o perfil ACS possui permissão para registrar ações operacionais.");
  }

  const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullAction: PatientActionRecord = {
    ...actionData,
    id: actionId,
    createdAt: new Date().toISOString(),
  };

  const { error } = await supabase.rpc('append_patient_action', {
    patient_id: patientId, action: fullAction, priority: newPriority || null,
    visit_date: newLastVisitDate || (actionData.tipoAcao === 'Visita Domiciliar' ? actionData.dataAcao : null),
  });
  if (error) throw error;

  return fullAction;
}

// 4. Buscar Ações/Acompanhamentos reais de um paciente específico no Store
export async function getPatientActionsFromStore(patientId: string): Promise<PatientActionRecord[]> {
  if (!patientId) return [];
  const actionMap = new Map<string, PatientActionRecord>();

  try {
    // 1. Ler o histórico no documento principal do paciente
    const patientRef = doc(db, "pacientes", patientId);
    const patientSnap = await getDoc(patientRef);
    if (patientSnap.exists()) {
      const data = patientSnap.data();
      const rawHistorico: PatientActionRecord[] = data.historicoAcoes || [];
      rawHistorico.forEach((act) => {
        if (act.id) actionMap.set(act.id, act);
      });
    }

    // 2. Ler documentos na subcoleção pacientes/{patientId}/acoes
    const acoesRef = collection(db, "pacientes", patientId, "acoes");
    const acoesSnap = await getDocs(acoesRef);
    acoesSnap.forEach((dSnap) => {
      const act = dSnap.data() as PatientActionRecord;
      if (act && act.id) {
        actionMap.set(act.id, act);
      }
    });
  } catch (err) {
    console.error("Erro ao buscar ações do paciente no Store:", err);
  }

  const actions = Array.from(actionMap.values());
  // Ordenar do mais recente para o mais antigo por dataAcao DESC e createdAt DESC
  return actions.sort((a, b) => compareActionsChronological(b, a));
}

// 5. Buscar Snapshots de Carga de um paciente específico no Store
export async function getPatientHistorySnapshotsFromStore(patientId: string): Promise<PatientCargaSnapshot[]> {
  if (!patientId) return [];
  const snapshotMap = new Map<string, PatientCargaSnapshot>();

  try {
    // 1. Ler o array no documento principal do paciente
    const patientRef = doc(db, "pacientes", patientId);
    const patientSnap = await getDoc(patientRef);
    if (patientSnap.exists()) {
      const data = patientSnap.data() as StorePatientDoc;
      const rawCargas: PatientCargaSnapshot[] = data.historicoCargas || [];
      rawCargas.forEach((c) => {
        if (c.id) snapshotMap.set(c.id, c);
      });
    }

    // 2. Ler documentos na subcoleção pacientes/{patientId}/historicoCargas
    const cargasRef = collection(db, "pacientes", patientId, "historicoCargas");
    const cargasSnap = await getDocs(cargasRef);
    cargasSnap.forEach((dSnap) => {
      const c = dSnap.data() as PatientCargaSnapshot;
      if (c && (c.id || dSnap.id)) {
        snapshotMap.set(c.id || dSnap.id, { ...c, id: c.id || dSnap.id });
      }
    });
  } catch (err) {
    console.error("Erro ao buscar histórico de cargas do paciente no Store:", err);
  }

  const list = Array.from(snapshotMap.values());
  // Ordenar do mais recente para o mais antigo por dataCarga DESC
  return list.sort((a, b) => (b.dataCarga || "").localeCompare(a.dataCarga || ""));
}

// 6. Atualizar condições crônicas manualmente no prontuário (GERENTE / ADMIN)
function computeRecalculatedPriorityForDoc(
  mergedData: RawStorePatientData,
  dcntParams: DcntParameters
): {
  priority: PriorityLevel;
  reason: string;
  boasPraticas: PatientBoasPraticasSummary;
} {
  const ageVal = mergedData.idade || 0;
  const imcVal = mergedData.imcAtual;
  const hasValidIMC = typeof imcVal === "number" && !isNaN(imcVal) && imcVal > 0;
  const elderlyCutoff = dcntParams.elderlyAgeCutoff ?? 60;
  const childCutoff = dcntParams.childUnder2AgeCutoff ?? 2;
  const obesityCutoff = dcntParams.obesityImcCutoff ?? 30;

  const isElderly = ageVal >= elderlyCutoff;
  const isChildUnder2 = ageVal >= 0 && ageVal <= childCutoff;
  const isObese = ageVal >= 20 && hasValidIMC && imcVal >= obesityCutoff;
  const hasHypertension = Boolean(
    mergedData.hasHypertension ||
      (mergedData.pressaoSistolicaAtual && mergedData.pressaoSistolicaAtual >= 140)
  );
  const hasDiabetes = Boolean(mergedData.hasDiabetes);

  const lastVisitDate = computeConsolidatedLastVisitDate(mergedData);
  const rawHistorico: PatientActionRecord[] = mergedData.historicoAcoes || [];
  const historicoCargas: PatientCargaSnapshot[] = mergedData.historicoCargas || [];

  const boasPraticas = evaluatePatientBoasPraticas(
    {
      hasHypertension,
      hasDiabetes,
      lastMedicalApptDate: mergedData.dataUltimaConsulta || "",
      lastNursingApptDate: mergedData.dataUltimoAtendimentoEnfermagem || "",
      daysSinceMedicalCare: mergedData.daysSinceMedicalCare ?? undefined,
      monthsSinceMedicalCare: mergedData.monthsSinceMedicalCare ?? undefined,
      daysSinceNursingCare: mergedData.daysSinceNursingCare ?? undefined,
      monthsSinceNursingCare: mergedData.monthsSinceNursingCare ?? undefined,
      lastPA:
        mergedData.pressaoSistolicaAtual && mergedData.pressaoDiastolicaAtual
          ? {
              date: mergedData.dataUltimaPA,
              systolic: mergedData.pressaoSistolicaAtual,
              diastolic: mergedData.pressaoDiastolicaAtual,
            }
          : undefined,
      dataPA: mergedData.dataUltimaPA,
      lastWeight:
        mergedData.pesoAtual && mergedData.alturaAtual
          ? {
              date: mergedData.dataUltimaAntropometria,
              weight: mergedData.pesoAtual,
              height: mergedData.alturaAtual,
              imc: mergedData.imcAtual ?? undefined,
            }
          : undefined,
      peso: mergedData.pesoAtual,
      altura: mergedData.alturaAtual,
      dataMedicao: mergedData.dataUltimaAntropometria,
      lastVisitDate,
      previousVisitDate: mergedData.dataPenultimaVisitaACS,
      daysSinceHomeVisit: mergedData.daysSinceHomeVisit,
      monthsSinceHomeVisit: mergedData.monthsSinceHomeVisit,
      homeVisitsCount12m: mergedData.visitasDomiciliares12Meses,
      lastHbA1cDate: mergedData.dataUltimaHemoglobinaGlicada,
      hbA1cStatus: mergedData.hbA1cStatus,
      lastFootExamDate: mergedData.dataUltimaAvaliacaoPes,
      footExamStatus: mergedData.footExamStatus,
      historicoAcoes: rawHistorico,
      historicoCargas,
      boasPraticasManuais: mergedData.boasPraticasManuais || undefined,
    },
    dcntParams
  );

  const priorityResult = calculateAdminPriorityScore(
    {
      systolic: mergedData.pressaoSistolicaAtual,
      diastolic: mergedData.pressaoDiastolicaAtual,
      dataPA: mergedData.dataUltimaPA,
      monthsSinceHomeVisit: mergedData.monthsSinceHomeVisit,
      lastHomeVisit: lastVisitDate || null,
      isElderly,
      isObese,
      isChildUnder2,
      age: ageVal,
      hasHypertension,
      hasDiabetes,
      lastMedicalCare: mergedData.dataUltimaConsulta,
      lastNursingCare: mergedData.dataUltimoAtendimentoEnfermagem,
      daysSinceMedicalCare: mergedData.daysSinceMedicalCare,
      monthsSinceMedicalCare: mergedData.monthsSinceMedicalCare,
      daysSinceNursingCare: mergedData.daysSinceNursingCare,
      monthsSinceNursingCare: mergedData.monthsSinceNursingCare,
      peso: mergedData.pesoAtual,
      altura: mergedData.alturaAtual,
      dataMedicao: mergedData.dataUltimaAntropometria,
      lastHbA1cDate: mergedData.dataUltimaHemoglobinaGlicada,
      hbA1cStatus: mergedData.hbA1cStatus,
      lastFootExamDate: mergedData.dataUltimaAvaliacaoPes,
      footExamStatus: mergedData.footExamStatus,
      homeVisitsCount12m: mergedData.visitasDomiciliares12Meses,
      previousVisitDate: mergedData.dataPenultimaVisitaACS,
      historicoAcoes: rawHistorico,
      historicoCargas,
      boasPraticasManuais: mergedData.boasPraticasManuais || undefined,
    },
    dcntParams
  );

  return {
    priority: priorityResult.priority,
    reason: priorityResult.reason,
    boasPraticas,
  };
}

export async function updatePatientConditionsInStore(
  patientId: string,
  conditions: {
    hasHypertension?: boolean;
    hasDiabetes?: boolean;
    isSmoker?: boolean;
    hasCardiovascularDisease?: boolean;
  }
): Promise<{
  priority?: PriorityLevel;
  activeSearchReason?: string;
  boasPraticas?: PatientBoasPraticasSummary;
} | void> {
  const patientRef = doc(db, "pacientes", patientId);
  const [snap, dcntParams] = await Promise.all([
    getDoc(patientRef),
    getDcntParametersFromStore().catch(() => DEFAULT_DCNT_PARAMETERS),
  ]);

  if (!snap.exists()) {
    await updateDoc(patientRef, {
      ...conditions,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const prevData = snap.data() as RawStorePatientData;
  const mergedData: RawStorePatientData = {
    ...prevData,
    ...conditions,
  };

  const recalc = computeRecalculatedPriorityForDoc(mergedData, dcntParams);

  await updateDoc(patientRef, {
    ...conditions,
    prioridade: recalc.priority,
    motivosPrioridade: recalc.reason,
    updatedAt: new Date().toISOString(),
  });

  return {
    priority: recalc.priority,
    activeSearchReason: recalc.reason,
    boasPraticas: recalc.boasPraticas,
  };
}

export interface UpdateBoasPraticasPayload {
  boasPraticasManuais?: Partial<Record<BoaPraticaCode, BoaPraticaManualOverride>>;
  dataUltimaConsulta?: string | null;
  dataUltimaPA?: string | null;
  pressaoSistolicaAtual?: number | null;
  pressaoDiastolicaAtual?: number | null;
  pesoAtual?: number | null;
  alturaAtual?: number | null;
  imcAtual?: number | null;
  dataUltimaAntropometria?: string | null;
  dataUltimaVisitaACS?: string | null;
  dataPenultimaVisitaACS?: string | null;
  visitasDomiciliares12Meses?: number | null;
  dataUltimaHemoglobinaGlicada?: string | null;
  hbA1cStatus?: boolean | null;
  dataUltimaAvaliacaoPes?: string | null;
  footExamStatus?: boolean | null;
}

export async function updatePatientBoasPraticasInStore(
  patientId: string,
  updates: UpdateBoasPraticasPayload
): Promise<{
  priority: PriorityLevel;
  activeSearchReason: string;
  boasPraticas: PatientBoasPraticasSummary;
  boasPraticasManuais: Partial<Record<BoaPraticaCode, BoaPraticaManualOverride>>;
}> {
  const patientRef = doc(db, "pacientes", patientId);
  const [snap, dcntParams] = await Promise.all([
    getDoc(patientRef),
    getDcntParametersFromStore().catch(() => DEFAULT_DCNT_PARAMETERS),
  ]);

  if (!snap.exists()) {
    throw new Error("Paciente não encontrado ou acesso negado.");
  }

  const prevData = snap.data() as RawStorePatientData;
  const mergedManuais: Partial<Record<BoaPraticaCode, BoaPraticaManualOverride>> = {
    ...(prevData.boasPraticasManuais || {}),
    ...(updates.boasPraticasManuais || {}),
  };

  const fieldUpdates = { ...updates };
  delete fieldUpdates.boasPraticasManuais;
  const mergedData: RawStorePatientData = {
    ...prevData,
    ...fieldUpdates,
    boasPraticasManuais: mergedManuais,
  };

  const recalc = computeRecalculatedPriorityForDoc(mergedData, dcntParams);

  await updateDoc(patientRef, {
    ...fieldUpdates,
    boasPraticasManuais: mergedManuais,
    prioridade: recalc.priority,
    motivosPrioridade: recalc.reason,
    updatedAt: new Date().toISOString(),
  });

  return {
    priority: recalc.priority,
    activeSearchReason: recalc.reason,
    boasPraticas: recalc.boasPraticas,
    boasPraticasManuais: mergedManuais,
  };
}

async function persistManagerObservationToStore(
  patientId: string,
  observation: ManagerObservationRecord,
  historyEntry: ManagerObservationRevision
): Promise<void> {
  const { error } = await supabase.rpc("save_manager_patient_observation", {
    patient_id: patientId,
    observation,
    history_entry: historyEntry,
  });

  if (!error) return;

  const errMsg = String(error?.message || error || "");
  const isMissingRpc =
    (error as any)?.code === "PGRST202" ||
    /save_manager_patient_observation.*does not exist|Could not find the function/i.test(errMsg);

  if (!isMissingRpc) {
    throw error;
  }

  // Fallback transacional via writeBatch caso a função RPC ainda não tenha sido aplicada no banco remoto
  const patientRef = doc(db, "pacientes", patientId);
  const patientSnap = await getDoc(patientRef);
  if (!patientSnap.exists()) {
    throw new Error("Paciente não encontrado ou acesso negado.");
  }

  const prevData = patientSnap.data();
  const prevObsList: ManagerObservationRecord[] = Array.isArray(prevData.observacoesGerente)
    ? prevData.observacoesGerente
    : [];
  const prevHistList: ManagerObservationRevision[] = Array.isArray(prevData.historicoObservacoesGerente)
    ? prevData.historicoObservacoesGerente
    : [];

  const existsIdx = prevObsList.findIndex((o) => o.id === observation.id);
  const updatedObsList =
    existsIdx >= 0
      ? prevObsList.map((o) => (o.id === observation.id ? observation : o))
      : [observation, ...prevObsList];
  const updatedHistList = [historyEntry, ...prevHistList];

  const batch = writeBatch(db);
  const obsRef = doc(collection(db, "pacientes", patientId, "observacoesGerente"), observation.id);
  batch.set(obsRef, observation, { merge: true });
  batch.update(patientRef, {
    observacaoGerenteAtual: observation,
    observacoesGerente: updatedObsList,
    historicoObservacoesGerente: updatedHistList,
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
}

// 7. Acrescentar nova observação da Gerência da Unidade em um paciente (GERENTE / ADMIN)
export async function addManagerObservationInStore(
  patientId: string,
  params: {
    unidadeId: string;
    texto: string;
    categoria?: ManagerObservationCategory | string;
    autorId: string;
    autorNome: string;
    autorPerfil: string;
  }
): Promise<{
  observation: ManagerObservationRecord;
  historyEntry: ManagerObservationRevision;
}> {
  if (params.autorPerfil !== "GERENTE" && params.autorPerfil !== "ADMIN") {
    throw new Error(
      "Acesso Negado: Apenas o Gerente de Unidade (ou Administrador) possui permissão para acrescentar observações ao paciente."
    );
  }

  const cleanText = (params.texto || "").trim();
  if (!cleanText) {
    throw new Error("O texto da observação não pode estar vazio.");
  }

  const now = new Date().toISOString();
  const obsId = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const revId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const resolvedCategory = params.categoria || "Observação Geral";

  const historyEntry: ManagerObservationRevision = {
    id: revId,
    observacaoId: obsId,
    patientId,
    textoAnterior: "",
    textoNovo: cleanText,
    categoriaNova: resolvedCategory,
    autorId: params.autorId,
    autorNome: params.autorNome || "Gerente da Unidade",
    autorPerfil: params.autorPerfil,
    dataRegistro: now,
    tipoEvento: "CRIACAO",
  };

  const observation: ManagerObservationRecord = {
    id: obsId,
    patientId,
    unidadeId: normalizeUnitId(params.unidadeId || "USF-003"),
    texto: cleanText,
    categoria: resolvedCategory,
    autorId: params.autorId,
    autorNome: params.autorNome || "Gerente da Unidade",
    autorPerfil: params.autorPerfil,
    createdAt: now,
    updatedAt: now,
    editado: false,
    historicoEdicoes: [historyEntry],
  };

  await persistManagerObservationToStore(patientId, observation, historyEntry);
  return { observation, historyEntry };
}

// 8. Editar observação existente da Gerência da Unidade mantendo histórico completo (GERENTE / ADMIN)
export async function updateManagerObservationInStore(
  patientId: string,
  observationId: string,
  params: {
    texto: string;
    categoria?: ManagerObservationCategory | string;
    autorId: string;
    autorNome: string;
    autorPerfil: string;
  },
  existingObservation?: ManagerObservationRecord
): Promise<{
  observation: ManagerObservationRecord;
  historyEntry: ManagerObservationRevision;
}> {
  if (params.autorPerfil !== "GERENTE" && params.autorPerfil !== "ADMIN") {
    throw new Error(
      "Acesso Negado: Apenas o Gerente de Unidade (ou Administrador) possui permissão para editar observações do paciente."
    );
  }

  const cleanText = (params.texto || "").trim();
  if (!cleanText) {
    throw new Error("O texto da observação não pode estar vazio.");
  }

  let currentObs = existingObservation;
  if (!currentObs) {
    const obsDoc = await getDoc(doc(db, "pacientes", patientId, "observacoesGerente", observationId));
    if (obsDoc.exists()) {
      currentObs = obsDoc.data() as ManagerObservationRecord;
    } else {
      const patDoc = await getDoc(doc(db, "pacientes", patientId));
      if (patDoc.exists()) {
        const list: ManagerObservationRecord[] = patDoc.data().observacoesGerente || [];
        currentObs = list.find((o) => o.id === observationId) || patDoc.data().observacaoGerenteAtual;
      }
    }
  }

  if (!currentObs) {
    throw new Error("Observação não encontrada para edição.");
  }

  const now = new Date().toISOString();
  const revId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const resolvedCategory = params.categoria || currentObs.categoria || "Observação Geral";

  const historyEntry: ManagerObservationRevision = {
    id: revId,
    observacaoId: currentObs.id,
    patientId,
    textoAnterior: currentObs.texto,
    textoNovo: cleanText,
    categoriaAnterior: currentObs.categoria,
    categoriaNova: resolvedCategory,
    autorId: params.autorId,
    autorNome: params.autorNome || "Gerente da Unidade",
    autorPerfil: params.autorPerfil,
    dataRegistro: now,
    tipoEvento: "EDICAO",
  };

  const updatedObservation: ManagerObservationRecord = {
    ...currentObs,
    texto: cleanText,
    categoria: resolvedCategory,
    updatedAt: now,
    editado: true,
    historicoEdicoes: [historyEntry, ...(currentObs.historicoEdicoes || [])],
  };

  await persistManagerObservationToStore(patientId, updatedObservation, historyEntry);
  return { observation: updatedObservation, historyEntry };
}

// 9. Buscar observações e histórico completo de edições da Gerência para visualização (GERENTE, ACS e ADMIN)
export async function getPatientManagerObservationsFromStore(patientId: string): Promise<{
  observations: ManagerObservationRecord[];
  history: ManagerObservationRevision[];
}> {
  if (!patientId) return { observations: [], history: [] };

  const obsMap = new Map<string, ManagerObservationRecord>();
  const histMap = new Map<string, ManagerObservationRevision>();

  try {
    // 1. Ler do documento principal do paciente
    const patientRef = doc(db, "pacientes", patientId);
    const patientSnap = await getDoc(patientRef);
    if (patientSnap.exists()) {
      const data = patientSnap.data();
      const rawObs: ManagerObservationRecord[] = data.observacoesGerente || [];
      rawObs.forEach((o) => {
        if (o && o.id) {
          obsMap.set(o.id, o);
          (o.historicoEdicoes || []).forEach((rev) => {
            if (rev && rev.id) histMap.set(rev.id, rev);
          });
        }
      });
      if (data.observacaoGerenteAtual?.id && !obsMap.has(data.observacaoGerenteAtual.id)) {
        obsMap.set(data.observacaoGerenteAtual.id, data.observacaoGerenteAtual);
      }
      const rawHist: ManagerObservationRevision[] = data.historicoObservacoesGerente || [];
      rawHist.forEach((rev) => {
        if (rev && rev.id) histMap.set(rev.id, rev);
      });
    }

    // 2. Ler da subcoleção pacientes/{patientId}/observacoesGerente
    const obsColRef = collection(db, "pacientes", patientId, "observacoesGerente");
    const obsSnap = await getDocs(obsColRef);
    obsSnap.forEach((dSnap) => {
      const o = dSnap.data() as ManagerObservationRecord;
      if (o && (o.id || dSnap.id)) {
        const resolvedId = o.id || dSnap.id;
        obsMap.set(resolvedId, { ...o, id: resolvedId });
        (o.historicoEdicoes || []).forEach((rev) => {
          if (rev && rev.id) histMap.set(rev.id, rev);
        });
      }
    });
  } catch (err) {
    console.error("Erro ao buscar observações da gerência no Store:", err);
  }

  const observations = Array.from(obsMap.values()).sort((a, b) =>
    (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "")
  );
  const history = Array.from(histMap.values()).sort((a, b) =>
    (b.dataRegistro || "").localeCompare(a.dataRegistro || "")
  );

  return { observations, history };
}
