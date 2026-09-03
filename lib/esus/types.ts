import { ESUSParsedFile } from "./parser";

export type { ESUSParsedFile };

export interface ESUSRawRow {
  [key: string]: any;
}

export interface MappedESUSFields {
  nome?: string;
  dataNascimento?: string;
  idade?: number | string;
  identidadeGenero?: string;
  sexo?: string;
  cpf?: string;
  cns?: string;
  telefone?: string;
  microarea?: string;
  logradouro?: string;
  bairro?: string;
  acsName?: string;
  peso?: number | string;
  altura?: number | string;
  dataUltimaMedicao?: string;
  dataUltimaMedicaoAntropometrica?: string;
  pressaoArterial?: string;
  dataUltimaPA?: string;
  dataUltimoAtendimentoMedico?: string;
  dataUltimoAtendimentoEnfermagem?: string;
  dataUltimoAtendimentoOdontologico?: string;
  dataUltimaVisitaACS?: string;
  monthsSinceMedicalCare?: number | string;
  monthsSinceNursingCare?: number | string;
  monthsSinceDentalCare?: number | string;
  monthsSinceHomeVisit?: number | string;
  daysSinceHomeVisit?: number | string;
}

export interface NormalizedPatientRecord {
  nome: string;
  nomeNormalizado: string;
  dataNascimento: string; // YYYY-MM-DD
  idade: number;
  sexo: "Masculino" | "Feminino";
  identidadeGenero?: string;
  cpf: string; // 11 dígitos ou ""
  cns: string; // 15 dígitos ou ""
  telefoneOriginal: string;
  telefoneNormalizado: string;
  microarea: string;
  microareaId?: string;
  microareaCodigo?: string;
  microareaOriginal?: string;
  acsName: string;
  logradouro: string;
  bairro: string;
  
  // Medições
  peso?: number;
  altura?: number;
  imc?: number;
  dataMedicao?: string; // YYYY-MM-DD
  
  // Pressão Arterial
  systolic?: number;
  diastolic?: number;
  dataPA?: string; // YYYY-MM-DD
  paStatus?: "Normal" | "PA Alterada" | "PA Muito Elevada" | "Sem Informação";
  
  // Acompanhamentos e contagens de meses
  lastMedicalCare?: string;
  lastNursingCare?: string;
  lastDentalCare?: string;
  lastHomeVisit?: string;
  monthsSinceMedicalCare?: number;
  monthsSinceNursingCare?: number;
  monthsSinceDentalCare?: number;
  monthsSinceHomeVisit?: number;
  daysSinceHomeVisit?: number;
  
  // Fatores derivados e prioridade
  isElderly: boolean;
  isObese: boolean;
  isOverweight: boolean;
  priority: "Alta" | "Média" | "Atenção" | "Acompanhado";
  priorityScore: number;
  activeSearchReason?: string;
}

export type ESUSValidationStatus = "Válido" | "Aviso" | "Erro";

export interface ESUSRowValidation {
  rowNumber: number;
  patientName: string;
  status: ESUSValidationStatus;
  warnings: string[];
  errors: string[];
  normalizedData?: NormalizedPatientRecord;
  rawRow: ESUSRawRow;
}

export interface ESUSParseIntegrity {
  expectedColumnsCount: number;
  rowsWith34Fields: number;
  inconsistentRows: number;
  invalidMicroareas: number;
  interpretedPAs: number;
  calculatedBMIs: number;
}

export interface ESUSWarningBreakdown {
  semCpfCns: number;
  semPA: number;
  semPeso: number;
  semAltura: number;
  dataNascAtipica: number;
  semMicroarea: number;
  outrosAvisos: number;
  totalPatientsWithWarnings: number;
  totalWarningOccurrences: number;
}

export interface ESUSParseResult {
  headerRowIndex: number;
  headersFound: string[];
  mappedColumns: { [key: string]: string }; // columnaOriginal -> campoInterno
  unrecognizedColumns: string[];
  detectedAcsColumnName?: string; // Coluna opcional de ACS detectada no CSV
  totalRowsCount: number;
  validRowsCount: number;
  warningRowsCount: number;
  errorRowsCount: number;
  newPatientsCount: number;
  existingPatientsCount: number;
  
  // Auditoria de Regras de Negócio e Distribuição Multiunidade
  cpfCount: number;
  cnsCount: number;
  noDocCount: number;
  withPACount: number;
  noPACount: number;
  withBMICount: number;
  noBMICount: number;
  microareaBreakdown: { [microareaName: string]: number };
  warningBreakdown: ESUSWarningBreakdown;
  integrity: ESUSParseIntegrity;
  rows: ESUSRowValidation[];
}

export interface FirestoreImportRecord {
  id?: string;
  unidadeId: string;
  unidadeNome: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  uploadedBy: string;
  uploadedAt: string; // ISO String
  tipoImportacao: "TESTE" | "COMPLETA";
  totalRows: number;
  validRows: number;
  newPatients: number;
  updatedPatients: number;
  novosVinculos: number;
  vinculosAtualizados: number;
  paCount: number;
  weightCount: number;
  errorsCount: number;
  warningsCount: number;
  status: "Concluído" | "Concluído com avisos" | "Concluído com inconsistência" | "Falhou";
}

export interface FirestoreImportError {
  id?: string;
  importId: string;
  rowNumber: number;
  field: string;
  value: string;
  errorType: "Validação" | "Formatação" | "Firestore";
  message: string;
}
