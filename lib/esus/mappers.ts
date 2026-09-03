// Normalização rigorosa de cabeçalhos (trata BOM UTF-8, ISO-8859-1, acentos, aspas, quebras de linha e espaços)
export function normalizeHeader(raw: string): string {
  if (!raw) return "";
  return String(raw)
    .replace(/^\uFEFF/, "") // remove UTF-8 BOM
    .replace(/[\r\n]+/g, " ") // remove quebras de linha
    .replace(/["']/g, "") // remove aspas
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos combinados
    .toLowerCase()
    .replace(/[\uFFFD\u00FF]/g, "") // remove caracteres especiais de substituição/mojibake
    .replace(/[^a-z0-9\s]/g, " ") // substitui caracteres não-alfanuméricos restantes por espaço
    .replace(/\s+/g, " ") // reduz múltiplos espaços para um único espaço
    .trim();
}

// Mapa Direto e Estrito de Cabeçalhos Normalizados do e-SUS APS (SEM ALIASES AMBÍGUOS)
export const EXACT_ESUS_HEADER_MAP: { [normalizedHeader: string]: string } = {
  // DEMOGRÁFICOS E IDENTIFICAÇÃO
  "nome": "nome",
  "nome do cidadao": "nome",
  "nome do cidadao a": "nome",
  "nome do paciente": "nome",
  "paciente": "nome",
  "data de nascimento": "dataNascimento",
  "dt nascimento": "dataNascimento",
  "data nascimento": "dataNascimento",
  "nascimento": "dataNascimento",
  "idade": "idade",
  "idade anos": "idade",
  "idade em anos": "idade",
  "sexo": "sexo",
  "genero": "sexo",
  "cpf": "cpf",
  "num cpf": "cpf",
  "numero cpf": "cpf",
  "cns": "cns",
  "cartao sus": "cns",
  "num cns": "cns",
  "numero cns": "cns",
  "telefone": "telefone",
  "telefone de contato": "telefone",

  // MICROÁREA (Apenas termos completos e explícitos - NUNCA usar 'ma')
  "microarea": "microarea",
  "microarea do cidadao": "microarea",
  "cod microarea": "microarea",
  "num microarea": "microarea",
  "codigo da microarea": "microarea",
  "numero da microarea": "microarea",

  // ANTROPOMETRIA
  "ultima medicao de peso": "peso",
  "peso": "peso",
  "peso kg": "peso",
  "peso corporal": "peso",
  "ultima medicao de altura": "altura",
  "altura": "altura",
  "altura m": "altura",
  "altura cm": "altura",
  "estatura": "altura",
  "data da ultima medicao de peso e altura": "dataUltimaMedicaoAntropometrica",
  "data da ultima medicao de peso e de altura": "dataUltimaMedicaoAntropometrica",
  "data medicao peso e altura": "dataUltimaMedicaoAntropometrica",

  // PRESSÃO ARTERIAL (Mapeamento EXATO do e-SUS APS)
  "ultima medicao de pressao arterial": "pressaoArterial",
  "ultima medicao de pressao": "pressaoArterial",
  "pressao arterial": "pressaoArterial",
  "pa": "pressaoArterial",
  "data da ultima medicao de pressao arterial": "dataUltimaPA",
  "data da ultima medicao de pressao": "dataUltimaPA",
  "data ultima pa": "dataUltimaPA",

  // ATENDIMENTOS E VISITAS (Mapeamento EXATO do e-SUS APS)
  "dias desde a ultima visita domiciliar": "daysSinceHomeVisit",
  "dias desde a ultima visita": "daysSinceHomeVisit",
  "meses desde o ultimo atendimento medico": "monthsSinceMedicalCare",
  "meses desde o ultimo atendimento de enfermagem": "monthsSinceNursingCare",
  "meses desde o ultimo atendimento odontologico": "monthsSinceDentalCare",
  "meses desde a ultima visita domiciliar": "monthsSinceHomeVisit",
  "meses desde a ultima visita": "monthsSinceHomeVisit",
  "data ultimo atendimento medico": "dataUltimoAtendimentoMedico",
  "data ultimo atendimento enfermagem": "dataUltimoAtendimentoEnfermagem",
  "data ultimo atendimento odontologico": "dataUltimoAtendimentoOdontologico",
  "data da ultima visita domiciliar": "dataUltimaVisitaACS",
  "data ultima visita domiciliar": "dataUltimaVisitaACS",
  "ultima visita domiciliar": "dataUltimaVisitaACS",
};

// Dicionário estrito sem termos ambíguos como 'ma'
export const ESUS_COLUMN_SYNONYMS: { [internalKey: string]: string[] } = {
  nome: ["nome", "cidadao", "paciente"],
  dataNascimento: ["data de nascimento", "data nascimento", "dt nascimento"],
  idade: ["idade"],
  sexo: ["sexo"],
  cpf: ["cpf"],
  cns: ["cns", "cartao sus"],
  microarea: ["microarea", "microarea do cidadao"], // 'ma' removido completamente!
  peso: ["ultima medicao de peso", "peso"],
  altura: ["ultima medicao de altura", "altura"],
  dataUltimaMedicaoAntropometrica: ["data da ultima medicao de peso e altura"],
  pressaoArterial: ["ultima medicao de pressao arterial", "pressao arterial"],
  dataUltimaPA: ["data da ultima medicao de pressao arterial"],
  monthsSinceMedicalCare: ["meses desde o ultimo atendimento medico"],
  monthsSinceNursingCare: ["meses desde o ultimo atendimento de enfermagem"],
  monthsSinceDentalCare: ["meses desde o ultimo atendimento odontologico"],
  monthsSinceHomeVisit: ["meses desde a ultima visita domiciliar", "meses desde a ultima visita"],
  daysSinceHomeVisit: ["dias desde a ultima visita domiciliar", "dias desde a ultima visita"],
};

// Identificação rigorosa e direta de colunas (sem fuzzy matching)
export function matchHeaderToInternalKey(rawHeader: string): string | null {
  const normalized = normalizeHeader(rawHeader);
  if (!normalized) return null;

  // 1. TRAVA DE SEGURANÇA: Se contiver "identidade", NUNCA mapear para "idade"!
  if (normalized.includes("identidade")) {
    if (normalized.includes("genero")) return "identidadeGenero";
    return null;
  }

  // 2. BUSCA EXATA DIRETA NO MAPA DE CABEÇALHOS NORMALIZADOS
  if (EXACT_ESUS_HEADER_MAP[normalized]) {
    return EXACT_ESUS_HEADER_MAP[normalized];
  }

  // 3. REGRAS DE RETAGUARDA POR EXPRESSÕES COMPLETAS
  if (normalized.includes("data") && (normalized.includes("peso") || normalized.includes("altura"))) {
    return "dataUltimaMedicaoAntropometrica";
  }
  if (normalized.includes("data") && (normalized.includes("pressao") || normalized.includes("pa"))) {
    return "dataUltimaPA";
  }
  if (normalized.includes("medicao") && normalized.includes("pressao")) {
    return "pressaoArterial";
  }
  if (normalized.includes("medicao") && normalized.includes("peso")) {
    return "peso";
  }
  if (normalized.includes("medicao") && normalized.includes("altura")) {
    return "altura";
  }
  if (normalized.includes("microarea") || normalized.includes("micro area")) {
    return "microarea";
  }
  if (normalized.includes("meses")) {
    if (normalized.includes("medico")) return "monthsSinceMedicalCare";
    if (normalized.includes("enfermagem")) return "monthsSinceNursingCare";
    if (normalized.includes("odontologico")) return "monthsSinceDentalCare";
    if (normalized.includes("visita") || normalized.includes("domiciliar")) return "monthsSinceHomeVisit";
  }

  return null;
}
