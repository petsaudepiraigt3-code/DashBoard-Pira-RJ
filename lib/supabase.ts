import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const isSupabaseConfigured = Boolean(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
);

if (!isSupabaseConfigured) {
  console.warn("Aviso: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados. Supabase em modo fallback.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


export type TipoAtendimento = "Médico" | "Enfermagem" | "Odontológico" | "Visita Domiciliar";

export interface PacienteRow {
  id_paciente: number;
  cpf: string | null;
  cns: string | null;
  nome: string;
  data_nascimento: string | null;
  sexo: string | null;
  identidade_genero: string | null;
  raca_cor: string | null;
  beneficiario_bolsa_familia: boolean;
  vigencia_bolsa_familia: string | null;
  telefone_celular: string | null;
  telefone_residencial: string | null;
  telefone_contato: string | null;
  id_endereco: number | null;
  area: string | null;
  microarea: number | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
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
  created_at?: string;
}

export interface AfericaoPressaoRow {
  id_afericao: number;
  id_paciente: number;
  pressao_sistolica: number;
  pressao_diastolica: number;
  data_afericao: string;
  created_at?: string;
}

export interface AfericaoMedidasRow {
  id_afericao: number;
  id_paciente: number;
  peso: number | null;
  altura: number | null;
  data_afericao: string;
  created_at?: string;
}

export interface AreaRow {
  id_area: number;
  codigo: string;
  nome: string;
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
  codigo: string;
  nome: string;
  responsavel_nome: string;
  responsavel_id: number | null;
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
  perfil: "ADMIN" | "GERENTE" | "ACS" | string;
  id_area: number | null;
  id_microarea: number | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ControleCargaRow {
  id_carga: number;
  data_carga: string;
  hora_carga: string;
  data_hora: string;
  responsavel_carga: string;
  responsavel_id: string | null;
  responsavel_perfil: "GERENTE" | "ACS" | "ADMIN" | string;
  id_area: number | null;
  area_nome: string | null;
  arquivo_nome: string | null;
  tipo_carga: string;
  total_registros: number;
  novos_pacientes: number;
  pacientes_atualizados: number;
  novos_atendimentos: number;
  novos_pesos: number;
  status: string;
  detalhes: string | null;
  created_at?: string;
}
