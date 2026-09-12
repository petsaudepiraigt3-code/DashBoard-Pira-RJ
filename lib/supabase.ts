import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Aviso: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados.");
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
