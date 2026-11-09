import { supabase } from "@/lib/supabase";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch } from "@/lib/store/documents";
import { db } from "@/lib/store/documents";
import {
  Patient,
  PatientActionRecord,
  PatientActionType,
  PriorityLevel,
  PatientCargaSnapshot,
  PAMeasurement,
  WeightMeasurement,
  ManagerObservationRecord,
  ManagerObservationRevision,
  ManagerObservationCategory,
} from "@/types/dcnt";
import { NormalizedPatientRecord } from "../esus/types";
import { MOCK_UNIT_NAME } from "@/data/mock-data";
import { compareActionsChronological } from "@/lib/utils/returns";

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
  historicoAcoes?: PatientActionRecord[];
}): string {
  const rawHistorico: PatientActionRecord[] = data.historicoAcoes || [];
  const lastVisitaDomiciliar = rawHistorico.find((act) => act.tipoAcao === "Visita Domiciliar");
  const dcntVisitDate = lastVisitaDomiciliar?.dataAcao || null;

  let esusVisitDate: string | null = data.dataUltimaVisitaACS || data.dataUltimaVisita || null;

  if (!esusVisitDate) {
    if (data.daysSinceHomeVisit != null && data.daysSinceHomeVisit >= 0) {
      const refDate = new Date();
      refDate.setDate(refDate.getDate() - data.daysSinceHomeVisit);
      esusVisitDate = refDate.toISOString().substring(0, 10);
    } else if (data.monthsSinceHomeVisit != null && data.monthsSinceHomeVisit >= 0) {
      const refDate = new Date();
      refDate.setDate(refDate.getDate() - data.monthsSinceHomeVisit * 30);
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

// 2. Buscar todos os pacientes da coleção 'pacientes' no Store com suporte a filtro de escopo
export async function getAllPatientsFromStore(options?: FetchPatientsOptions): Promise<Patient[]> {
  const list: Patient[] = [];
  try {
    // Mapeamento de Microárea -> ACS responsável a partir da coleção 'microareas'
    const microareaAcsMap = new Map<string, string>();
    try {
      const maSnap = await getDocs(collection(db, "microareas"));
      maSnap.forEach((mDoc) => {
        const mData = mDoc.data();
        if (mData.unidadeId && mData.codigo && mData.acsNome) {
          const cleanCode = (mData.codigo || "").replace(/\D/g, "").trim();
          const paddedCode = cleanCode ? cleanCode.padStart(2, "0") : "";
          if (cleanCode) microareaAcsMap.set(`${mData.unidadeId}_${cleanCode}`, mData.acsNome);
          if (paddedCode) microareaAcsMap.set(`${mData.unidadeId}_${paddedCode}`, mData.acsNome);
          microareaAcsMap.set(`${mData.unidadeId}_${mData.codigo}`, mData.acsNome);
        }
      });
    } catch (maErr) {
      // Ignorar
    }

    const normalizedAssignedCodes = Array.isArray(options?.assignedMicroareaCodes)
      ? options!.assignedMicroareaCodes.map((c) => {
          const digits = String(c || "").replace(/\D/g, "").trim();
          return digits ? digits.padStart(2, "0") : String(c || "").trim();
        })
      : undefined;

    const querySnapshot = await getDocs(collection(db, "pacientes"));
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as StorePatientDoc & {
        unidadeId?: string;
        unidadeNome?: string;
        acsId?: string;
        acsNome?: string;
        microareaCodigo?: string;
        dataUltimaVisita?: string;
        dataUltimaConsulta?: string;
      };

      const pUnitId = data.unidadeId || "USF-003";
      const pMicroarea = data.microarea || "Sem microárea";
      const rawDigits =
        (pMicroarea || "").replace(/\D/g, "").trim() ||
        (data.microareaCodigo || "").replace(/\D/g, "").trim();
      const patMACode = rawDigits ? rawDigits.padStart(2, "0") : data.microareaCodigo || "";

      // Filtro de Escopo em nível de consulta Store
      if (options?.role === "ACS") {
        if (options.userUnitId && pUnitId !== options.userUnitId) {
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
      } else if (options?.role === "GERENTE" && options.userUnitId) {
        if (pUnitId !== options.userUnitId) {
          return;
        }
      }

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
      const isOverweight = isAdult && hasValidIMC && imcVal >= 25 && imcVal < 30; // Apenas para adultos (>= 20 anos)

      const rawHistorico: PatientActionRecord[] = (data as any).historicoAcoes || [];
      const computedTimeline = rawHistorico.map((act) => ({
        id: act.id,
        date: act.dataAcao,
        type: (act.tipoAcao === "Visita Domiciliar" ? "Visita ACS" : act.tipoAcao === "Contato Telefônico" ? "Contato Telefônico" : "Busca Ativa") as any,
        title: `Registro de ${act.tipoAcao}`,
        description: `${act.resultado}${act.observacoes ? `. OBS: ${act.observacoes}` : ""}`,
        professional: act.acsNome || "Profissional de Saúde",
      }));

      // Consolidação estrita da Última Visita ACS (e-SUS + Ações DCNT Saúde)
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

      // Se a última medição atual não estiver em historicoCargas, adicionar
      if (data.pressaoSistolicaAtual && data.pressaoDiastolicaAtual) {
        const currentDate = data.dataUltimaPA || new Date().toISOString().substring(0, 10);
        if (!extractedPAHistory.some((h) => h.date === currentDate)) {
          extractedPAHistory.push({
            id: `pa-current-${docSnap.id}`,
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
            id: `w-current-${docSnap.id}`,
            date: currentDate,
            weight: data.pesoAtual,
            height: data.alturaAtual,
            imc: data.imcAtual || Number((data.pesoAtual / (data.alturaAtual * data.alturaAtual)).toFixed(2)),
          });
        }
      }

      extractedPAHistory.sort((a, b) => a.date.localeCompare(b.date));
      extractedWeightHistory.sort((a, b) => a.date.localeCompare(b.date));

      const resolvedPhone =
        data.telefone ||
        data.telefoneCelular ||
        data.telefone_celular ||
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

      list.push({
        id: docSnap.id,
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
        phoneCell: data.telefoneCelular || data.telefone_celular || undefined,
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
        hasHypertension: data.hasHypertension || (data.pressaoSistolicaAtual && data.pressaoSistolicaAtual >= 140) || false,
        hasDiabetes: data.hasDiabetes || false,
        isObese,
        isOverweight,
        isSmoker: data.isSmoker || false,
        hasCardiovascularDisease: data.hasCardiovascularDisease || false,
        lastPA: data.pressaoSistolicaAtual && data.pressaoDiastolicaAtual ? {
          id: `pa-${docSnap.id}`,
          date: data.dataUltimaPA || new Date().toISOString().substring(0, 10),
          systolic: data.pressaoSistolicaAtual,
          diastolic: data.pressaoDiastolicaAtual,
          location: "e-SUS APS",
        } : undefined,
        lastWeight: data.pesoAtual && data.alturaAtual ? {
          id: `w-${docSnap.id}`,
          date: data.dataUltimaAntropometria || new Date().toISOString().substring(0, 10),
          weight: data.pesoAtual,
          height: data.alturaAtual,
          imc: data.imcAtual || 0,
        } : undefined,
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
        priority: data.prioridade,
        activeSearchReason: data.motivosPrioridade || undefined,
        activeSearchStatus: data.prioridade === "Alta" ? "Pendente" : "Acompanhado",
        paHistory: extractedPAHistory,
        weightHistory: extractedWeightHistory,
        timeline: computedTimeline,
        historicoAcoes: rawHistorico,
        historicoCargas: historicoCargas,
        observacaoGerenteAtual: resolvedObservacaoAtual,
        observacoesGerente: rawObservacoesGerente,
        historicoObservacoesGerente: rawHistoricoObsGerente,
      });
    });
  } catch (err) {
    // Retorno de lista tratada
  }
  return list;
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
export async function updatePatientConditionsInStore(
  patientId: string,
  conditions: {
    hasHypertension?: boolean;
    hasDiabetes?: boolean;
    isSmoker?: boolean;
    hasCardiovascularDisease?: boolean;
  }
): Promise<void> {
  const patientRef = doc(db, "pacientes", patientId);
  await updateDoc(patientRef, {
    ...conditions,
    updatedAt: new Date().toISOString(),
  });
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
    unidadeId: params.unidadeId || "USF-003",
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
