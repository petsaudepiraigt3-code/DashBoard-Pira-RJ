-- ==============================================================================
-- DCNTSAUDE - ESTRUTURA DO BANCO DE DADOS (PostgreSQL / Supabase)
-- Tabelas: usuario, area, microarea, controle_carga, paciente, atendimento, 
--          afericao_pressao, afericao_medidas, comorbidade, paciente_comorbidade
-- ==============================================================================

-- 1. TABELA DE ÁREAS (Unidades de Saúde da Família e Territórios)
-- O Responsável pela área é o Gerente da Unidade, mas permite também outro responsável
CREATE TABLE IF NOT EXISTS public.area (
  id_area SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nome VARCHAR(255) NOT NULL,
  responsavel_nome VARCHAR(255) NOT NULL,
  responsavel_cargo VARCHAR(100) DEFAULT 'Gerente da Unidade',
  responsavel_id INTEGER NULL,
  cnes VARCHAR(20) NULL,
  tipo VARCHAR(50) DEFAULT 'USF',
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABELA DE MICROÁREAS
-- Pertence a uma Área e o Responsável é o ACS (Agente Comunitário de Saúde)
CREATE TABLE IF NOT EXISTS public.microarea (
  id_microarea SERIAL PRIMARY KEY,
  id_area INTEGER NOT NULL REFERENCES public.area(id_area) ON DELETE CASCADE,
  codigo VARCHAR(50) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  responsavel_nome VARCHAR(255) NOT NULL, -- ACS Responsável
  responsavel_id INTEGER NULL,
  tipo VARCHAR(50) DEFAULT 'NORMAL',
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_area_microarea UNIQUE (id_area, codigo)
);

-- 3. TABELA DE USUÁRIOS (Controle de Acesso e Perfis)
CREATE TABLE IF NOT EXISTS public.usuario (
  id_usuario SERIAL PRIMARY KEY,
  uid VARCHAR(128) UNIQUE,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NULL,
  perfil VARCHAR(50) NOT NULL, -- 'ADMIN', 'GERENTE', 'ACS', 'OUTRO'
  id_area INTEGER NULL REFERENCES public.area(id_area) ON DELETE SET NULL,
  id_microarea INTEGER NULL REFERENCES public.microarea(id_microarea) ON DELETE SET NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABELA DE CONTROLE DE CARGA (Uploads e Importações e-SUS)
-- Armazena data, hora, responsável pela carga e resumo de atendimentos e pesos gerados
CREATE TABLE IF NOT EXISTS public.controle_carga (
  id_carga SERIAL PRIMARY KEY,
  data_carga DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_carga TIME NOT NULL DEFAULT CURRENT_TIME,
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  responsavel_carga VARCHAR(255) NOT NULL,
  responsavel_id VARCHAR(128) NULL,
  responsavel_perfil VARCHAR(50) NOT NULL DEFAULT 'GERENTE', -- 'GERENTE' | 'ACS' | 'ADMIN'
  id_area INTEGER NULL REFERENCES public.area(id_area) ON DELETE SET NULL,
  area_nome VARCHAR(255) NULL,
  arquivo_nome VARCHAR(255) NULL,
  tipo_carga VARCHAR(50) DEFAULT 'COMPLETA',
  total_registros INTEGER DEFAULT 0,
  novos_pacientes INTEGER DEFAULT 0,
  pacientes_atualizados INTEGER DEFAULT 0,
  novos_atendimentos INTEGER DEFAULT 0, -- Registros de atendimento clínico/visita adicionados
  novos_pesos INTEGER DEFAULT 0,        -- Registros de medição de peso/antropometria adicionados
  status VARCHAR(50) DEFAULT 'Concluído',
  detalhes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABELAS CLÍNICAS EXISTENTES (Caso ainda não criadas)
CREATE TABLE IF NOT EXISTS public.paciente (
  id_paciente SERIAL PRIMARY KEY,
  cpf VARCHAR(20) UNIQUE,
  cns VARCHAR(30) UNIQUE,
  nome VARCHAR(255) NOT NULL,
  data_nascimento DATE,
  sexo VARCHAR(20),
  identidade_genero VARCHAR(50),
  raca_cor VARCHAR(50),
  beneficiario_bolsa_familia BOOLEAN DEFAULT FALSE,
  vigencia_bolsa_familia VARCHAR(50),
  telefone_celular VARCHAR(30),
  telefone_residencial VARCHAR(30),
  telefone_contato VARCHAR(30),
  id_endereco INTEGER,
  area VARCHAR(100),
  microarea INTEGER,
  rua VARCHAR(255),
  numero VARCHAR(50),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  municipio VARCHAR(100) DEFAULT 'Piraí',
  uf VARCHAR(10) DEFAULT 'RJ',
  cep VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comorbidade (
  id_comorbidade SERIAL PRIMARY KEY,
  tipo_comorbidade VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.paciente_comorbidade (
  id_paciente INTEGER NOT NULL REFERENCES public.paciente(id_paciente) ON DELETE CASCADE,
  id_comorbidade INTEGER NOT NULL REFERENCES public.comorbidade(id_comorbidade) ON DELETE CASCADE,
  PRIMARY KEY (id_paciente, id_comorbidade)
);

CREATE TABLE IF NOT EXISTS public.atendimento (
  id_atendimento SERIAL PRIMARY KEY,
  id_paciente INTEGER NOT NULL REFERENCES public.paciente(id_paciente) ON DELETE CASCADE,
  tipo_atendimento VARCHAR(50) NOT NULL, -- 'Médico', 'Enfermagem', 'Odontológico', 'Visita Domiciliar'
  data_ultimo_atendimento DATE NOT NULL,
  id_carga INTEGER NULL REFERENCES public.controle_carga(id_carga) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.afericao_pressao (
  id_afericao SERIAL PRIMARY KEY,
  id_paciente INTEGER NOT NULL REFERENCES public.paciente(id_paciente) ON DELETE CASCADE,
  pressao_sistolica INTEGER NOT NULL,
  pressao_diastolica INTEGER NOT NULL,
  data_afericao DATE NOT NULL,
  id_carga INTEGER NULL REFERENCES public.controle_carga(id_carga) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.afericao_medidas (
  id_afericao SERIAL PRIMARY KEY,
  id_paciente INTEGER NOT NULL REFERENCES public.paciente(id_paciente) ON DELETE CASCADE,
  peso NUMERIC(6,2),
  altura NUMERIC(4,2),
  data_afericao DATE NOT NULL,
  id_carga INTEGER NULL REFERENCES public.controle_carga(id_carga) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- ÍNDICES PARA BUSCA RÁPIDA E EVITAR DUPLICIDADES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_atendimento_paciente_data ON public.atendimento(id_paciente, data_ultimo_atendimento, tipo_atendimento);
CREATE INDEX IF NOT EXISTS idx_afericao_medidas_paciente_data ON public.afericao_medidas(id_paciente, data_afericao);
CREATE INDEX IF NOT EXISTS idx_afericao_pressao_paciente_data ON public.afericao_pressao(id_paciente, data_afericao);
CREATE INDEX IF NOT EXISTS idx_controle_carga_data ON public.controle_carga(data_carga DESC, hora_carga DESC);

-- ==============================================================================
-- PERMISSÕES PÚBLICAS (Supabase anon / authenticated / service_role)
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

ALTER TABLE public.area DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.microarea DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_carga DISABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- POVOAMENTO INICIAL (SEED)
-- ==============================================================================

-- 1. Inserir Área Padrão
INSERT INTO public.area (codigo, nome, responsavel_nome, responsavel_cargo, cnes, tipo, ativa)
VALUES 
  ('USF-003', 'USF Arrozal 3', 'Carlos Alberto (Gerente Unidade)', 'Gerente da Unidade', '1234567', 'USF', true),
  ('USF-001', 'USF Central', 'Dra. Márcia Regina', 'Responsável Técnico / Coordenação', '7654321', 'USF', true)
ON CONFLICT (codigo) DO UPDATE 
SET 
  nome = EXCLUDED.nome,
  responsavel_nome = EXCLUDED.responsavel_nome,
  responsavel_cargo = EXCLUDED.responsavel_cargo;

-- 2. Inserir Microáreas da USF-003 vinculadas ao ACS
DO $$
DECLARE
  v_area_id INTEGER;
BEGIN
  SELECT id_area INTO v_area_id FROM public.area WHERE codigo = 'USF-003' LIMIT 1;

  IF v_area_id IS NOT NULL THEN
    INSERT INTO public.microarea (id_area, codigo, nome, responsavel_nome, tipo, ativa)
    VALUES
      (v_area_id, '01', 'Microárea 01', 'Ana Maria Souza (ACS)', 'NORMAL', true),
      (v_area_id, '02', 'Microárea 02', 'Carlos Eduardo Silva (ACS)', 'NORMAL', true),
      (v_area_id, '03', 'Microárea 03', 'Fernanda Oliveira (ACS)', 'NORMAL', true),
      (v_area_id, '04', 'Microárea 04', 'João Pedro Santos (ACS)', 'NORMAL', true),
      (v_area_id, '05', 'Microárea 05', 'Mariana Costa (ACS)', 'NORMAL', true),
      (v_area_id, '06', 'Microárea 06', 'Roberto Lima (ACS)', 'NORMAL', true),
      (v_area_id, '56', 'Microárea 56', 'Ana Maria Souza (ACS)', 'NORMAL', true)
    ON CONFLICT (id_area, codigo) DO UPDATE
    SET 
      responsavel_nome = EXCLUDED.responsavel_nome,
      nome = EXCLUDED.nome;
  END IF;
END $$;

-- 3. Inserir Usuários Iniciais de Controle de Acesso
INSERT INTO public.usuario (uid, nome, email, perfil, ativo)
VALUES
  ('admin-dev-id', 'Administrador DCNT Saúde', 'admin@dcntsaude.gov.br', 'ADMIN', true),
  ('gerente-arrozal-3', 'Gerente USF Arrozal 3', 'gerente.arrozal3@usf.gov.br', 'GERENTE', true),
  ('acs-ana-souza', 'Ana Maria Souza (ACS)', 'ana.souza@usf.gov.br', 'ACS', true)
ON CONFLICT (email) DO UPDATE
SET
  nome = EXCLUDED.nome,
  perfil = EXCLUDED.perfil,
  ativo = EXCLUDED.ativo;
