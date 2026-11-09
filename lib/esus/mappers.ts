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
  "identidade de genero": "identidadeGenero",
  "identidade genero": "identidadeGenero",
  "raca cor": "racaCor",
  "raca": "racaCor",
  "cor": "racaCor",
  "beneficiario do programa bolsa familia": "beneficiarioBolsaFamilia",
  "beneficiario bolsa familia": "beneficiarioBolsaFamilia",
  "bolsa familia": "beneficiarioBolsaFamilia",
  "vigencia do programa bolsa familia": "vigenciaBolsaFamilia",
  "vigencia bolsa familia": "vigenciaBolsaFamilia",
  "cpf": "cpf",
  "num cpf": "cpf",
  "numero cpf": "cpf",
  "cns": "cns",
  "cartao sus": "cns",
  "num cns": "cns",
  "numero cns": "cns",

  // TELEFONES (Mapeamento separado das 3 colunas do e-SUS APS + coluna genérica)
  "telefone": "telefone",
  "telefone celular": "telefoneCelular",
  "celular": "telefoneCelular",
  "telefone residencial": "telefoneResidencial",
  "telefone de contato": "telefoneContato",
  "telefone contato": "telefoneContato",

  // MICROÁREA E ENDEREÇO (Apenas termos completos e explícitos - NUNCA usar 'ma')
  "microarea": "microarea",
  "microarea do cidadao": "microarea",
  "cod microarea": "microarea",
  "num microarea": "microarea",
  "codigo da microarea": "microarea",
  "numero da microarea": "microarea",
  "rua": "logradouro",
  "logradouro": "logradouro",
  "endereco": "logradouro",
  "numero": "numero",
  "num": "numero",
  "numero do endereco": "numero",
  "complemento": "complemento",
  "bairro": "bairro",
  "municipio": "municipio",
  "cidade": "municipio",
  "uf": "uf",
  "estado": "uf",
  "cep": "cep",

  // PROFISSIONAL / ACS (se presente na planilha)
  "acs": "acsName",
  "agente comunitario": "acsName",
  "agente comunitario de saude": "acsName",
  "profissional responsavel": "acsName",

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

  // ATENDIMENTOS E VISITAS (Dias, Meses e Datas do e-SUS APS)
  "dias desde o ultimo atendimento medico": "daysSinceMedicalCare",
  "meses desde o ultimo atendimento medico": "monthsSinceMedicalCare",
  "dias desde o ultimo atendimento de enfermagem": "daysSinceNursingCare",
  "meses desde o ultimo atendimento de enfermagem": "monthsSinceNursingCare",
  "dias desde o ultimo atendimento odontologico": "daysSinceDentalCare",
  "meses desde o ultimo atendimento odontologico": "monthsSinceDentalCare",
  "dias desde a ultima visita domiciliar": "daysSinceHomeVisit",
  "dias desde a ultima visita": "daysSinceHomeVisit",
  "meses desde a ultima visita domiciliar": "monthsSinceHomeVisit",
  "meses desde a ultima visita": "monthsSinceHomeVisit",
  "data ultimo atendimento medico": "dataUltimoAtendimentoMedico",
  "data do ultimo atendimento medico": "dataUltimoAtendimentoMedico",
  "data ultimo atendimento enfermagem": "dataUltimoAtendimentoEnfermagem",
  "data do ultimo atendimento de enfermagem": "dataUltimoAtendimentoEnfermagem",
  "data ultimo atendimento odontologico": "dataUltimoAtendimentoOdontologico",
  "data do ultimo atendimento odontologico": "dataUltimoAtendimentoOdontologico",
  "data da ultima visita domiciliar": "dataUltimaVisitaACS",
  "data ultima visita domiciliar": "dataUltimaVisitaACS",
  "ultima visita domiciliar": "dataUltimaVisitaACS",

  // CONDIÇÕES DCNT OPCIONAIS (Caso constem em relatórios customizados)
  "hipertensao": "hasHypertension",
  "hipertensao arterial": "hasHypertension",
  "possui hipertensao": "hasHypertension",
  "diabetes": "hasDiabetes",
  "diabetes mellitus": "hasDiabetes",
  "possui diabetes": "hasDiabetes",
  "tabagismo": "isSmoker",
  "fumante": "isSmoker",
  "doenca cardiovascular": "hasCardiovascularDisease",
};

// Dicionário estrito sem termos ambíguos como 'ma'
export const ESUS_COLUMN_SYNONYMS: { [internalKey: string]: string[] } = {
  nome: ["nome", "cidadao", "paciente"],
  dataNascimento: ["data de nascimento", "data nascimento", "dt nascimento"],
  idade: ["idade"],
  sexo: ["sexo"],
  identidadeGenero: ["identidade de genero"],
  racaCor: ["raca cor", "raca"],
  beneficiarioBolsaFamilia: ["beneficiario do programa bolsa familia"],
  vigenciaBolsaFamilia: ["vigencia do programa bolsa familia"],
  cpf: ["cpf"],
  cns: ["cns", "cartao sus"],
  telefoneCelular: ["telefone celular", "celular"],
  telefoneResidencial: ["telefone residencial"],
  telefoneContato: ["telefone de contato", "telefone contato"],
  microarea: ["microarea", "microarea do cidadao"], // 'ma' removido completamente!
  logradouro: ["rua", "logradouro"],
  numero: ["numero"],
  complemento: ["complemento"],
  bairro: ["bairro"],
  municipio: ["municipio"],
  uf: ["uf"],
  cep: ["cep"],
  peso: ["ultima medicao de peso", "peso"],
  altura: ["ultima medicao de altura", "altura"],
  dataUltimaMedicaoAntropometrica: ["data da ultima medicao de peso e altura"],
  pressaoArterial: ["ultima medicao de pressao arterial", "pressao arterial"],
  dataUltimaPA: ["data da ultima medicao de pressao arterial"],
  daysSinceMedicalCare: ["dias desde o ultimo atendimento medico"],
  monthsSinceMedicalCare: ["meses desde o ultimo atendimento medico"],
  daysSinceNursingCare: ["dias desde o ultimo atendimento de enfermagem"],
  monthsSinceNursingCare: ["meses desde o ultimo atendimento de enfermagem"],
  daysSinceDentalCare: ["dias desde o ultimo atendimento odontologico"],
  monthsSinceDentalCare: ["meses desde o ultimo atendimento odontologico"],
  daysSinceHomeVisit: ["dias desde a ultima visita domiciliar", "dias desde a ultima visita"],
  monthsSinceHomeVisit: ["meses desde a ultima visita domiciliar", "meses desde a ultima visita"],
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
  if (normalized.includes("bolsa familia")) {
    if (normalized.includes("vigencia")) return "vigenciaBolsaFamilia";
    return "beneficiarioBolsaFamilia";
  }
  if (normalized.includes("celular")) {
    return "telefoneCelular";
  }
  if (normalized.includes("telefone") && normalized.includes("residencial")) {
    return "telefoneResidencial";
  }
  if (normalized.includes("telefone") && normalized.includes("contato")) {
    return "telefoneContato";
  }
  if (normalized.includes("dias")) {
    if (normalized.includes("medico")) return "daysSinceMedicalCare";
    if (normalized.includes("enfermagem")) return "daysSinceNursingCare";
    if (normalized.includes("odontologico")) return "daysSinceDentalCare";
    if (normalized.includes("visita") || normalized.includes("domiciliar")) return "daysSinceHomeVisit";
  }
  if (normalized.includes("meses")) {
    if (normalized.includes("medico")) return "monthsSinceMedicalCare";
    if (normalized.includes("enfermagem")) return "monthsSinceNursingCare";
    if (normalized.includes("odontologico")) return "monthsSinceDentalCare";
    if (normalized.includes("visita") || normalized.includes("domiciliar")) return "monthsSinceHomeVisit";
  }

  return null;
}

export function mapHeaders(headers: string[]): {
  mappedColumns: { [col: string]: string };
  unrecognizedColumns: string[];
} {
  const mappedColumns: { [col: string]: string } = {};
  const unrecognizedColumns: string[] = [];

  headers.forEach((h) => {
    if (!h) return;
    const mappedKey = matchHeaderToInternalKey(h);
    if (mappedKey) {
      mappedColumns[h] = mappedKey;
    } else {
      unrecognizedColumns.push(h);
    }
  });

  return { mappedColumns, unrecognizedColumns };
}
