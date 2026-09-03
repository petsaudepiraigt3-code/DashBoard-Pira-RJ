import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Patient, PatientActionRecord, PatientActionType, PriorityLevel } from "@/types/dcnt";
import { NormalizedPatientRecord } from "../esus/types";
import { MOCK_UNIT_NAME } from "@/data/mock-data";
import { compareActionsChronological } from "@/lib/utils/returns";

export interface FirestorePatientDoc {
  id: string;
  nome: string;
  cpf: string | null;
  cns: string | null;
  dataNascimento: string | null;
  idade: number | null;
  sexo: "Masculino" | "Feminino" | null;
  identidadeGenero: string | null;
  microarea: string | null;

  pesoAtual: number | null;
  alturaAtual: number | null;
  imcAtual: number | null;

  pressaoSistolicaAtual: number | null;
  pressaoDiastolicaAtual: number | null;
  dataUltimaPA: string | null;

  monthsSinceMedicalCare: number | null;
  monthsSinceNursingCare: number | null;
  monthsSinceDentalCare: number | null;
  monthsSinceHomeVisit: number | null;
  daysSinceHomeVisit?: number | null;
  dataUltimaVisitaACS?: string | null;
  dataUltimaVisita?: string | null;

  prioridade: "Alta" | "Média" | "Atenção" | "Acompanhado";
  motivosPrioridade: string | null;

  identificacaoConfiavel: boolean;
  requerRevisao: boolean;

  historicoAcoes?: PatientActionRecord[];
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

// 1. Obter mapa de pacientes existentes no Firestore por CPF, CNS ou Secundário (Nome + Data Nasc)
export async function getExistingPatientsMap(): Promise<Map<string, FirestorePatientDoc>> {
  const patientMap = new Map<string, FirestorePatientDoc>();
  try {
    const querySnapshot = await getDocs(collection(db, "pacientes"));
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestorePatientDoc;
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
    // Busca silenciosa sem logar CPFs/nomes no console por privacidade
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

// 2. Buscar todos os pacientes da coleção 'pacientes' no Firestore com suporte a filtro de escopo
export async function getAllPatientsFromFirestore(options?: FetchPatientsOptions): Promise<Patient[]> {
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
          microareaAcsMap.set(`${mData.unidadeId}_${cleanCode}`, mData.acsNome);
          microareaAcsMap.set(`${mData.unidadeId}_${mData.codigo}`, mData.acsNome);
        }
      });
    } catch (maErr) {
      // Ignorar
    }

    const querySnapshot = await getDocs(collection(db, "pacientes"));
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestorePatientDoc & {
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
      const patMACode = (pMicroarea || "").replace(/\D/g, "").trim() || data.microareaCodigo || "";

      // Filtro de Escopo em nível de consulta Firestore
      if (options?.role === "ACS") {
        if (options.userUnitId && pUnitId !== options.userUnitId) {
          return;
        }
        if (options.assignedMicroareaCodes && options.assignedMicroareaCodes.length > 0) {
          if (!options.assignedMicroareaCodes.includes(patMACode)) {
            return;
          }
        }
      } else if (options?.role === "GERENTE" && options.userUnitId) {
        if (pUnitId !== options.userUnitId) {
          return;
        }
      }

      const maKey = `${pUnitId}_${patMACode}`;
      const assignedAcsFromMA = microareaAcsMap.get(maKey) || (data.microareaCodigo ? microareaAcsMap.get(`${pUnitId}_${data.microareaCodigo}`) : undefined);

      let resolvedACSName = "";
      if (data.acsNome && data.acsNome !== "Agente Comunitário") {
        resolvedACSName = data.acsNome;
      } else if (assignedAcsFromMA) {
        resolvedACSName = assignedAcsFromMA;
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

      list.push({
        id: docSnap.id,
        name: data.nome,
        cpf: data.cpf || "Sem CPF",
        cns: data.cns || "Sem CNS",
        age: data.idade || 0,
        sex: data.sexo || "Feminino",
        phone: "(11) 90000-0000",
        unit: data.unidadeNome || MOCK_UNIT_NAME,
        unidadeId: pUnitId,
        unidadeNome: data.unidadeNome || MOCK_UNIT_NAME,
        microarea: pMicroarea,
        acsName: resolvedACSName,
        isElderly: (data.idade || 0) >= 60,
        hasHypertension: (data.pressaoSistolicaAtual && data.pressaoSistolicaAtual >= 140) || false,
        hasDiabetes: false,
        isObese,
        isOverweight,
        isSmoker: false,
        hasCardiovascularDisease: false,
        lastPA: data.pressaoSistolicaAtual && data.pressaoDiastolicaAtual ? {
          id: `pa-${docSnap.id}`,
          date: data.dataUltimaPA || new Date().toISOString().substring(0, 10),
          systolic: data.pressaoSistolicaAtual,
          diastolic: data.pressaoDiastolicaAtual,
          location: "e-SUS APS",
        } : undefined,
        lastWeight: data.pesoAtual && data.alturaAtual ? {
          id: `w-${docSnap.id}`,
          date: new Date().toISOString().substring(0, 10),
          weight: data.pesoAtual,
          height: data.alturaAtual,
          imc: data.imcAtual || 0,
        } : undefined,
        lastVisitDate: lastVisitDate || "",
        lastMedicalApptDate: lastMedicalApptDate || "",
        priority: data.prioridade,
        activeSearchReason: data.motivosPrioridade || undefined,
        activeSearchStatus: data.prioridade === "Alta" ? "Pendente" : "Acompanhado",
        paHistory: [],
        weightHistory: [],
        timeline: computedTimeline,
        historicoAcoes: rawHistorico,
      });
    });
  } catch (err) {
    // Retorno de lista tratada
  }
  return list;
}

// 3. Salvar Acompanhamento/Ação real no Firestore
export async function savePatientActionInFirestore(
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

  try {
    const patientRef = doc(db, "pacientes", patientId);

    // 1. Salva documento na subcoleção pacientes/{patientId}/acoes/{actionId}
    const acaoDocRef = doc(db, "pacientes", patientId, "acoes", actionId);
    await setDoc(acaoDocRef, fullAction);

    // 2. Atualiza documento do paciente com o histórico de ações e nova prioridade/visita
    const patientSnap = await getDoc(patientRef);
    if (patientSnap.exists()) {
      const existingData = patientSnap.data();
      const currentHistorico: PatientActionRecord[] = existingData.historicoAcoes || [];
      const updatedHistorico = [fullAction, ...currentHistorico];

      const updates: any = {
        historicoAcoes: updatedHistorico,
        updatedAt: new Date().toISOString(),
      };

      if (newPriority) {
        updates.prioridade = newPriority;
        if (newPriority === "Acompanhado") {
          updates.motivosPrioridade = `Acompanhamento realizado em ${fullAction.dataAcao} (${fullAction.tipoAcao})`;
        }
      }

      if (actionData.tipoAcao === "Visita Domiciliar" || newLastVisitDate) {
        const visitDateToSave = newLastVisitDate || actionData.dataAcao;
        updates.dataUltimaVisita = visitDateToSave;
        updates.dataUltimaVisitaACS = visitDateToSave;
        updates.daysSinceHomeVisit = 0;
        updates.monthsSinceHomeVisit = 0;
      }

      await updateDoc(patientRef, updates);
    }
  } catch (err) {
    console.error("Erro ao salvar ação no Firestore:", err);
  }

  return fullAction;
}

// 4. Buscar Ações/Acompanhamentos reais de um paciente específico no Firestore
export async function getPatientActionsFromFirestore(patientId: string): Promise<PatientActionRecord[]> {
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
    console.error("Erro ao buscar ações do paciente no Firestore:", err);
  }

  const actions = Array.from(actionMap.values());
  // Ordenar do mais recente para o mais antigo por dataAcao DESC e createdAt DESC
  return actions.sort((a, b) => compareActionsChronological(b, a));
}
