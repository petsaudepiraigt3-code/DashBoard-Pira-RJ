export type UserRole = "Admin" | "Gerente" | "ACS";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  unit: string;
  microarea?: string;
}

export type PriorityLevel = "Alta" | "Média" | "Atenção" | "Acompanhado";

export interface PAMeasurement {
  id: string;
  date: string;
  systolic: number;
  diastolic: number;
  location: string;
}

export interface WeightMeasurement {
  id: string;
  date: string;
  weight: number;
  height: number; // em metros
  imc: number;
}

export interface PatientTimelineEvent {
  id: string;
  date: string;
  type: "Aferição PA" | "Atendimento Médico" | "Visita ACS" | "Contato Telefônico" | "Busca Ativa";
  title: string;
  description: string;
  professional: string;
}

export interface PatientCargaSnapshot {
  id: string;
  importId: string;
  fileName: string;
  dataCarga: string; // ISO string do momento da importação
  dataReferencia?: string;
  tipoImportacao?: "COMPLETA" | "TESTE" | "MANUAL";
  usuarioUpload?: string;

  // Dados clínicos e territoriais capturados na carga
  pressaoSistolica?: number | null;
  pressaoDiastolica?: number | null;
  dataPA?: string | null;

  peso?: number | null;
  altura?: number | null;
  imc?: number | null;
  dataAntropometria?: string | null;

  dataUltimaVisitaACS?: string | null;
  diasSemVisitaACS?: number | null;
  mesesSemVisitaACS?: number | null;

  dataUltimoAtendimentoMedico?: string | null;
  dataUltimoAtendimentoEnfermagem?: string | null;
  dataUltimoAtendimentoOdontologico?: string | null;

  prioridade: PriorityLevel;
  motivosPrioridade?: string | null;

  microarea?: string | null;
  acsName?: string | null;

  // Comparativos calculados em relação à carga imediatamente anterior
  comparativo?: {
    statusPA?: "Melhorou" | "Piorou" | "Estável" | "Sem Dado Anterior" | "Novo Registro";
    deltaSistolica?: number; // ex: -10 (sistólica reduziu 10 mmHg) ou +12
    deltaDiastolica?: number; // ex: -5 ou +8
    statusPeso?: "Reduziu" | "Aumentou" | "Estável" | "Sem Dado Anterior";
    deltaPeso?: number; // ex: -1.5 (kg) ou +2.0
    deltaIMC?: number;
    statusVisita?: "Atualizada" | "Inalterada" | "Sem Registro";
    mudancaPrioridade?: {
      anterior: PriorityLevel;
      atual: PriorityLevel;
    };
  };
}

export interface Patient {
  id: string;
  name: string;
  cpf: string;
  cns: string;
  age: number;
  sex: "Masculino" | "Feminino";
  phone: string;
  unit: string;
  unidadeId?: string;
  unidadeNome?: string;
  microarea: string; // ex: "Microárea 01"
  acsName: string;
  
  // Condições e Fatores de Risco
  isElderly: boolean; // age >= 60
  hasHypertension: boolean;
  hasDiabetes: boolean;
  isObese: boolean;
  isOverweight: boolean;
  isSmoker: boolean;
  hasCardiovascularDisease: boolean;
  
  // Dados de acompanhamento
  lastPA?: PAMeasurement;
  lastWeight?: WeightMeasurement;
  lastVisitDate: string; // ISO date
  lastMedicalApptDate: string;
  
  // Status de Busca Ativa
  priority: PriorityLevel;
  activeSearchReason?: string;
  activeSearchStatus: "Pendente" | "Em Contato" | "Agendado" | "Acompanhado";
  
  // Histórico
  paHistory: PAMeasurement[];
  weightHistory: WeightMeasurement[];
  timeline: PatientTimelineEvent[];
  historicoAcoes?: PatientActionRecord[];
  historicoCargas?: PatientCargaSnapshot[];
}

export type PatientActionType =
  | "Visita Domiciliar"
  | "Contato Telefônico"
  | "Tentativa Sem Sucesso"
  | "Encaminhamento para Consulta"
  | "Retorno Agendado"
  | "Atendimento/Comparecimento na UBS";

export interface PatientActionRecord {
  id: string;
  patientId: string;
  unidadeId: string;
  microarea: string;
  microareaCodigo?: string;
  acsId: string;
  acsNome: string;
  tipoAcao: PatientActionType;
  dataAcao: string;
  resultado: string;
  observacoes?: string;
  proximoRetorno?: string;
  createdAt: string;
}

export interface ActiveSearchRecord {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  action: PatientActionType;
  result: string;
  notes: string;
  nextReturnDate?: string;
  registeredBy: string;
}

export interface MicroareaStats {
  id: string;
  code: string; // ex: "01"
  acsName: string;
  population: number;
  elderlyCount: number;
  hypertensionCount: number;
  diabetesCount: number;
  obesityCount: number;
  alteredPACount: number;
  activeSearchCount: number;
  outdatedVisitCount: number;
}

export interface ImportHistoryItem {
  id: string;
  date: string;
  fileName: string;
  fileSize: string;
  userName: string;
  totalRows: number;
  newPatients: number;
  updatedPatients: number;
  errorsCount: number;
  status: "Concluído" | "Com Inconsistências" | "Erro";
}

export interface DcntParameters {
  monthsWithoutPA: number;
  monthsWithoutVisit: number;
  elderlyAgeCutoff: number;
  obesityImcCutoff: number;
  overweightImcCutoff: number;
  priorityWeights: {
    alteredPA: number;
    outdatedVisit: number;
    elderly: number;
    multipleConditions: number;
  };
}
