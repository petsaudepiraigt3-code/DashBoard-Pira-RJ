import { createClient } from '@supabase/supabase-js';
import type { DcntParameters, PatientActionRecord } from '@/types/dcnt';
import type { NormalizedPatientRecord } from '@/lib/esus/types';

export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// Build-time placeholders allow prerendering. Login reports missing configuration.
// The browser always uses the public key; the service role is isolated on the server.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
);

export type TipoAtendimento = 'Médico' | 'Enfermagem' | 'Odontológico' | 'Visita Domiciliar';

export interface AreaRow {
  id_area: number;
  codigo: string;
  nome: string;
  nome_normalizado?: string | null;
  responsavel_nome: string;
  responsavel_cargo: string;
  responsavel_id: number | null;
  cnes: string | null;
  tipo: string;
  ativa: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MicroareaRow {
  id_microarea: number;
  id_area: number;
  unidade_id?: string | null;
  codigo: string;
  nome: string;
  responsavel_nome: string;
  responsavel_id: number | null;
  acs_uid?: string | null;
  tipo: string;
  ativa: boolean;
  created_at?: string;
  updated_at?: string;
  area?: AreaRow;
}

export interface UsuarioRow {
  id_usuario: number;
  uid: string | null;
  nome: string;
  email: string;
  telefone?: string | null;
  perfil: 'ADMIN' | 'GERENTE' | 'ACS' | string;
  unidade_id?: string | null;
  id_area: number | null;
  id_microarea: number | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ControleCargaRow {
  id_carga: number;
  import_id?: string | null;
  data_carga: string;
  hora_carga: string;
  data_hora: string;
  responsavel_carga: string;
  responsavel_id: string | null;
  responsavel_perfil: 'GERENTE' | 'ACS' | 'ADMIN' | string;
  id_area: number | null;
  unidade_id?: string | null;
  area_nome: string | null;
  arquivo_nome: string | null;
  tipo_carga: string;
  total_registros: number;
  novos_pacientes: number;
  pacientes_atualizados: number;
  novos_vinculos?: number;
  vinculos_atualizados?: number;
  pa_importadas?: number;
  antropometrias_importadas?: number;
  novos_atendimentos: number;
  novos_pesos: number;
  registros_com_avisos?: number;
  erros?: number;
  status: string;
  detalhes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PacienteRow {
  id_paciente: number;
  doc_id?: string | null;
  cpf: string | null;
  cns: string | null;
  nome: string;
  data_nascimento: string | null;
  idade: number | null;
  sexo: string | null;
  identidade_genero: string | null;
  raca_cor: string | null;
  beneficiario_bolsa_familia: boolean;
  vigencia_bolsa_familia: string | null;
  telefone?: string | null;
  telefone_celular: string | null;
  telefone_residencial: string | null;
  telefone_contato: string | null;
  id_endereco: number | null;
  id_area?: number | null;
  unidade_id?: string | null;
  area: string | null;
  id_microarea?: number | null;
  microarea: number | null;
  microarea_codigo?: string | null;
  acs_nome?: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  dias_ultimo_atendimento_medico?: number | null;
  meses_ultimo_atendimento_medico?: number | null;
  data_ultimo_atendimento_medico?: string | null;
  dias_ultimo_atendimento_enfermagem?: number | null;
  meses_ultimo_atendimento_enfermagem?: number | null;
  data_ultimo_atendimento_enfermagem?: string | null;
  dias_ultimo_atendimento_odontologico?: number | null;
  meses_ultimo_atendimento_odontologico?: number | null;
  data_ultimo_atendimento_odontologico?: string | null;
  dias_ultima_visita_domiciliar?: number | null;
  meses_ultima_visita_domiciliar?: number | null;
  data_ultima_visita_domiciliar?: string | null;
  peso_atual?: number | null;
  altura_atual?: number | null;
  imc_atual?: number | null;
  data_ultima_antropometria?: string | null;
  pressao_sistolica_atual?: number | null;
  pressao_diastolica_atual?: number | null;
  data_ultima_pa?: string | null;
  possui_hipertensao?: boolean;
  possui_diabetes?: boolean;
  tabagista?: boolean;
  doenca_cardiovascular?: boolean;
  prioridade?: string | null;
  motivos_prioridade?: string | null;
  identificacao_confiavel?: boolean;
  requer_revisao?: boolean;
  ultima_importacao_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ComorbidadeRow {
  id_comorbidade: number;
  tipo_comorbidade: string;
}

export interface PacienteComorbidadeRow {
  id_paciente: number;
  id_comorbidade: number;
}

export interface AtendimentoRow {
  id_atendimento: number;
  id_paciente: number;
  tipo_atendimento: TipoAtendimento;
  data_ultimo_atendimento: string;
  dias_desde_atendimento?: number | null;
  meses_desde_atendimento?: number | null;
  id_carga?: number | null;
  created_at?: string;
}

export interface AfericaoPressaoRow {
  id_afericao: number;
  id_paciente: number;
  pressao_sistolica: number;
  pressao_diastolica: number;
  data_afericao: string;
  id_carga?: number | null;
  created_at?: string;
}

export interface AfericaoMedidasRow {
  id_afericao: number;
  id_paciente: number;
  peso: number | null;
  altura: number | null;
  imc?: number | null;
  data_afericao: string;
  id_carga?: number | null;
  created_at?: string;
}

export interface AcaoPacienteRow {
  id_acao: string;
  id_paciente: number;
  patient_doc_id?: string | null;
  unidade_id?: string | null;
  microarea?: string | null;
  acs_id?: string | null;
  acs_nome?: string | null;
  tipo_acao: string;
  data_acao: string;
  resultado?: string | null;
  observacoes?: string | null;
  created_at?: string;
}

export interface ParametrosDcntRow {
  id: string;
  meses_sem_pa: number;
  meses_sem_visita: number;
  meses_sem_consulta_medica: number;
  idade_corte_idoso: number;
  imc_corte_obesidade: number;
  imc_corte_sobrepeso: number;
  pa_sistolica_alterada: number;
  pa_diastolica_alterada: number;
  peso_pa_alterada: number;
  peso_pa_desatualizada: number;
  peso_visita_desatualizada: number;
  peso_idoso: number;
  peso_obesidade: number;
  peso_multiplas_condicoes: number;
  corte_prioridade_alta: number;
  corte_prioridade_media: number;
  corte_prioridade_atencao: number;
  updated_at?: string;
}

/**
 * Mapeia os 34 campos normalizados do relatório e-SUS APS para as respectivas tabelas
 * relacionais do Supabase (paciente, atendimento, afericao_pressao, afericao_medidas e comorbidade).
 */
export function mapNormalizedPatientToRelationalTables(
  norm: NormalizedPatientRecord,
  options: {
    docId: string;
    unidadeId: string;
    unidadeNome: string;
    microareaCodigo: string;
    importId?: string;
  }
) {
  const digits = (options.microareaCodigo || norm.microarea || '').replace(/\D/g, '').trim();
  const microareaNum = digits ? parseInt(digits, 10) : null;

  const paciente: Omit<PacienteRow, 'id_paciente'> = {
    doc_id: options.docId,
    cpf: norm.cpf || null,
    cns: norm.cns || null,
    nome: norm.nome,
    data_nascimento: norm.dataNascimento || null,
    idade: norm.idade ?? null,
    sexo: norm.sexo || null,
    identidade_genero: norm.identidadeGenero || null,
    raca_cor: norm.racaCor || null,
    beneficiario_bolsa_familia: norm.beneficiarioBolsaFamilia ?? false,
    vigencia_bolsa_familia: norm.vigenciaBolsaFamilia || null,
    telefone: norm.telefoneNormalizado || null,
    telefone_celular: norm.telefoneCelular || norm.telefoneNormalizado || null,
    telefone_residencial: norm.telefoneResidencial || null,
    telefone_contato: norm.telefoneContato || null,
    id_endereco: null,
    unidade_id: options.unidadeId,
    area: options.unidadeNome,
    microarea: microareaNum,
    microarea_codigo: options.microareaCodigo,
    acs_nome: norm.acsName && norm.acsName !== 'Agente Comunitário' ? norm.acsName : null,
    rua: norm.logradouro || null,
    numero: norm.numero || null,
    complemento: norm.complemento || null,
    bairro: norm.bairro || null,
    municipio: norm.municipio || 'Piraí',
    uf: norm.uf || 'RJ',
    cep: norm.cep || null,
    dias_ultimo_atendimento_medico: norm.daysSinceMedicalCare ?? null,
    meses_ultimo_atendimento_medico: norm.monthsSinceMedicalCare ?? null,
    data_ultimo_atendimento_medico: norm.lastMedicalCare || null,
    dias_ultimo_atendimento_enfermagem: norm.daysSinceNursingCare ?? null,
    meses_ultimo_atendimento_enfermagem: norm.monthsSinceNursingCare ?? null,
    data_ultimo_atendimento_enfermagem: norm.lastNursingCare || null,
    dias_ultimo_atendimento_odontologico: norm.daysSinceDentalCare ?? null,
    meses_ultimo_atendimento_odontologico: norm.monthsSinceDentalCare ?? null,
    data_ultimo_atendimento_odontologico: norm.lastDentalCare || null,
    dias_ultima_visita_domiciliar: norm.daysSinceHomeVisit ?? null,
    meses_ultima_visita_domiciliar: norm.monthsSinceHomeVisit ?? null,
    data_ultima_visita_domiciliar: norm.lastHomeVisit || null,
    peso_atual: norm.peso ?? null,
    altura_atual: norm.altura ?? null,
    imc_atual: norm.imc ?? null,
    data_ultima_antropometria: norm.dataMedicao || null,
    pressao_sistolica_atual: norm.systolic ?? null,
    pressao_diastolica_atual: norm.diastolic ?? null,
    data_ultima_pa: norm.dataPA || null,
    possui_hipertensao: Boolean(norm.hasHypertension || (norm.systolic && norm.systolic >= 140) || (norm.diastolic && norm.diastolic >= 90)),
    possui_diabetes: Boolean(norm.hasDiabetes),
    tabagista: Boolean(norm.isSmoker),
    doenca_cardiovascular: Boolean(norm.hasCardiovascularDisease),
    prioridade: norm.priority,
    motivos_prioridade: norm.activeSearchReason || null,
    identificacao_confiavel: Boolean(norm.cpf || norm.cns),
    requer_revisao: !Boolean(norm.cpf || norm.cns),
    ultima_importacao_id: options.importId || null,
  };

  const atendimentos: Omit<AtendimentoRow, 'id_atendimento' | 'id_paciente'>[] = [
    norm.lastMedicalCare
      ? {
          tipo_atendimento: 'Médico' as const,
          data_ultimo_atendimento: norm.lastMedicalCare,
          dias_desde_atendimento: norm.daysSinceMedicalCare ?? null,
          meses_desde_atendimento: norm.monthsSinceMedicalCare ?? null,
        }
      : null,
    norm.lastNursingCare
      ? {
          tipo_atendimento: 'Enfermagem' as const,
          data_ultimo_atendimento: norm.lastNursingCare,
          dias_desde_atendimento: norm.daysSinceNursingCare ?? null,
          meses_desde_atendimento: norm.monthsSinceNursingCare ?? null,
        }
      : null,
    norm.lastDentalCare
      ? {
          tipo_atendimento: 'Odontológico' as const,
          data_ultimo_atendimento: norm.lastDentalCare,
          dias_desde_atendimento: norm.daysSinceDentalCare ?? null,
          meses_desde_atendimento: norm.monthsSinceDentalCare ?? null,
        }
      : null,
    norm.lastHomeVisit
      ? {
          tipo_atendimento: 'Visita Domiciliar' as const,
          data_ultimo_atendimento: norm.lastHomeVisit,
          dias_desde_atendimento: norm.daysSinceHomeVisit ?? null,
          meses_desde_atendimento: norm.monthsSinceHomeVisit ?? null,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const afericaoPressao: Omit<AfericaoPressaoRow, 'id_afericao' | 'id_paciente'> | null =
    norm.systolic && norm.diastolic
      ? {
          pressao_sistolica: norm.systolic,
          pressao_diastolica: norm.diastolic,
          data_afericao: norm.dataPA || new Date().toISOString().substring(0, 10),
        }
      : null;

  const afericaoMedidas: Omit<AfericaoMedidasRow, 'id_afericao' | 'id_paciente'> | null =
    norm.peso || norm.altura
      ? {
          peso: norm.peso ?? null,
          altura: norm.altura ?? null,
          imc: norm.imc ?? null,
          data_afericao: norm.dataMedicao || new Date().toISOString().substring(0, 10),
        }
      : null;

  const comorbidades: string[] = [];
  if (paciente.possui_hipertensao) comorbidades.push('Hipertensão Arterial Sistêmica');
  if (paciente.possui_diabetes) comorbidades.push('Diabetes Mellitus');
  if (norm.isObese) comorbidades.push('Obesidade');
  if (paciente.tabagista) comorbidades.push('Tabagismo');
  if (paciente.doenca_cardiovascular) comorbidades.push('Doença Cardiovascular');

  return {
    paciente,
    atendimentos,
    afericaoPressao,
    afericaoMedidas,
    comorbidades,
  };
}

export function mapDcntParametersToRelationalRow(params: DcntParameters): ParametrosDcntRow {
  return {
    id: 'dcnt',
    meses_sem_pa: params.monthsWithoutPA,
    meses_sem_visita: params.monthsWithoutVisit,
    meses_sem_consulta_medica: params.monthsWithoutMedicalCare,
    idade_corte_idoso: params.elderlyAgeCutoff,
    imc_corte_obesidade: params.obesityImcCutoff,
    imc_corte_sobrepeso: params.overweightImcCutoff,
    pa_sistolica_alterada: params.systolicAlteradaCutoff,
    pa_diastolica_alterada: params.diastolicAlteradaCutoff,
    peso_pa_alterada: params.priorityWeights.alteredPA,
    peso_pa_desatualizada: params.priorityWeights.outdatedPA,
    peso_visita_desatualizada: params.priorityWeights.outdatedVisit,
    peso_idoso: params.priorityWeights.elderly,
    peso_obesidade: params.priorityWeights.obesity,
    peso_multiplas_condicoes: params.priorityWeights.multipleConditions,
    corte_prioridade_alta: params.priorityCutoffs?.high ?? 6,
    corte_prioridade_media: params.priorityCutoffs?.medium ?? 3,
    corte_prioridade_atencao: params.priorityCutoffs?.attention ?? 1,
  };
}

export function mapActionToRelationalRow(action: PatientActionRecord, idPaciente: number = 0): AcaoPacienteRow {
  return {
    id_acao: action.id,
    id_paciente: idPaciente,
    patient_doc_id: action.patientId,
    unidade_id: action.unidadeId,
    microarea: action.microarea,
    acs_id: action.acsId,
    acs_nome: action.acsNome,
    tipo_acao: action.tipoAcao,
    data_acao: action.dataAcao,
    resultado: action.resultado,
    observacoes: action.observacoes || null,
    created_at: action.createdAt,
  };
}
