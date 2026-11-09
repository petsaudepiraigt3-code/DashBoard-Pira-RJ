-- Canonical and relational storage for complete application records in Supabase PostgreSQL.
-- Creates and synchronizes all relational domain tables (area, microarea, usuario, controle_carga,
-- paciente, comorbidade, paciente_comorbidade, atendimento, afericao_pressao, afericao_medidas,
-- acao_paciente, parametros_dcnt) with all 34 e-SUS APS fields and DCNT clinical parameters.
begin;

-- ==============================================================================
-- 1. DOCUMENT STORE & ACCESS CONTROL
-- ==============================================================================
create table if not exists public.app_documents (
  path text primary key check (path ~ '^[^/]+/[^/]+(/[^/]+/[^/]+)*$'),
  collection text generated always as (regexp_replace(path, '/[^/]+$', '')) stored,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists app_documents_collection_idx on public.app_documents(collection);
create index if not exists app_documents_data_idx on public.app_documents using gin(data);
create index if not exists app_documents_unit_idx on public.app_documents((data->>'unidadeId'));
create index if not exists app_documents_email_idx on public.app_documents((lower(data->>'email'))) where collection = 'usuarios';
alter table public.app_documents enable row level security;
revoke all on public.app_documents from anon;
grant select, insert, update, delete on public.app_documents to authenticated, service_role;

-- ==============================================================================
-- 2. RELATIONAL TABLES (MAPPED FIELDS FOR SUPABASE POSTGRESQL)
-- ==============================================================================

-- 2.1 TABELA DE ÁREAS (Unidades de Saúde)
create table if not exists public.area (
  id_area serial primary key,
  codigo varchar(50) unique not null,
  nome varchar(255) not null,
  nome_normalizado varchar(255),
  responsavel_nome varchar(255) not null default 'Gerente da Unidade',
  responsavel_cargo varchar(100) default 'Gerente da Unidade',
  responsavel_id integer null,
  cnes varchar(20) null,
  tipo varchar(50) default 'USF',
  ativa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.area add column if not exists nome_normalizado varchar(255);

-- 2.2 TABELA DE MICROÁREAS
create table if not exists public.microarea (
  id_microarea serial primary key,
  id_area integer not null references public.area(id_area) on delete cascade,
  unidade_id varchar(100),
  codigo varchar(50) not null,
  nome varchar(255) not null,
  responsavel_nome varchar(255) not null default 'Sem ACS responsável',
  responsavel_id integer null,
  acs_uid varchar(128) null,
  tipo varchar(50) default 'NORMAL',
  ativa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint uq_area_microarea unique (id_area, codigo)
);
alter table public.microarea add column if not exists unidade_id varchar(100);
alter table public.microarea add column if not exists acs_uid varchar(128);

-- 2.3 TABELA DE USUÁRIOS
create table if not exists public.usuario (
  id_usuario serial primary key,
  uid varchar(128) unique,
  nome varchar(255) not null,
  email varchar(255) unique not null,
  telefone varchar(30) null,
  senha_hash varchar(255) null,
  perfil varchar(50) not null,
  unidade_id varchar(100) null,
  id_area integer null references public.area(id_area) on delete set null,
  id_microarea integer null references public.microarea(id_microarea) on delete set null,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.usuario add column if not exists telefone varchar(30);
alter table public.usuario add column if not exists unidade_id varchar(100);

-- 2.4 TABELA DE CONTROLE DE CARGA (Importações e-SUS APS)
create table if not exists public.controle_carga (
  id_carga serial primary key,
  import_id varchar(128) unique,
  data_carga date not null default current_date,
  hora_carga time not null default current_time,
  data_hora timestamptz not null default now(),
  responsavel_carga varchar(255) not null,
  responsavel_id varchar(128) null,
  responsavel_perfil varchar(50) not null default 'GERENTE',
  id_area integer null references public.area(id_area) on delete set null,
  unidade_id varchar(100) null,
  area_nome varchar(255) null,
  arquivo_nome varchar(255) null,
  tipo_carga varchar(50) default 'COMPLETA',
  total_registros integer default 0,
  novos_pacientes integer default 0,
  pacientes_atualizados integer default 0,
  novos_vinculos integer default 0,
  vinculos_atualizados integer default 0,
  pa_importadas integer default 0,
  antropometrias_importadas integer default 0,
  novos_atendimentos integer default 0,
  novos_pesos integer default 0,
  registros_com_avisos integer default 0,
  erros integer default 0,
  status varchar(50) default 'Concluído',
  detalhes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.controle_carga add column if not exists import_id varchar(128) unique;
alter table public.controle_carga add column if not exists unidade_id varchar(100);
alter table public.controle_carga add column if not exists novos_vinculos integer default 0;
alter table public.controle_carga add column if not exists vinculos_atualizados integer default 0;
alter table public.controle_carga add column if not exists pa_importadas integer default 0;
alter table public.controle_carga add column if not exists antropometrias_importadas integer default 0;
alter table public.controle_carga add column if not exists registros_com_avisos integer default 0;
alter table public.controle_carga add column if not exists erros integer default 0;
alter table public.controle_carga add column if not exists updated_at timestamptz default now();

-- 2.5 TABELA DE PACIENTES (Todos os 34 campos do relatório e-SUS APS + estratificação DCNT)
create table if not exists public.paciente (
  id_paciente serial primary key,
  doc_id varchar(128) unique,
  cpf varchar(20) unique,
  cns varchar(30) unique,
  nome varchar(255) not null,
  data_nascimento date,
  idade integer,
  sexo varchar(20),
  identidade_genero varchar(50),
  raca_cor varchar(50),
  beneficiario_bolsa_familia boolean default false,
  vigencia_bolsa_familia varchar(50),
  telefone varchar(30),
  telefone_celular varchar(30),
  telefone_residencial varchar(30),
  telefone_contato varchar(30),
  id_endereco integer,
  id_area integer references public.area(id_area) on delete set null,
  unidade_id varchar(100),
  area varchar(100),
  id_microarea integer references public.microarea(id_microarea) on delete set null,
  microarea integer,
  microarea_codigo varchar(20),
  acs_nome varchar(255),
  rua varchar(255),
  numero varchar(50),
  complemento varchar(100),
  bairro varchar(100),
  municipio varchar(100) default 'Piraí',
  uf varchar(10) default 'RJ',
  cep varchar(20),
  dias_ultimo_atendimento_medico integer,
  meses_ultimo_atendimento_medico integer,
  data_ultimo_atendimento_medico date,
  dias_ultimo_atendimento_enfermagem integer,
  meses_ultimo_atendimento_enfermagem integer,
  data_ultimo_atendimento_enfermagem date,
  dias_ultimo_atendimento_odontologico integer,
  meses_ultimo_atendimento_odontologico integer,
  data_ultimo_atendimento_odontologico date,
  dias_ultima_visita_domiciliar integer,
  meses_ultima_visita_domiciliar integer,
  data_ultima_visita_domiciliar date,
  peso_atual numeric(6,2),
  altura_atual numeric(4,2),
  imc_atual numeric(6,2),
  data_ultima_antropometria date,
  pressao_sistolica_atual integer,
  pressao_diastolica_atual integer,
  data_ultima_pa date,
  possui_hipertensao boolean default false,
  possui_diabetes boolean default false,
  tabagista boolean default false,
  doenca_cardiovascular boolean default false,
  prioridade varchar(50),
  motivos_prioridade text,
  observacao_gerente text,
  observacao_gerente_autor varchar(255),
  observacao_gerente_data timestamptz,
  identificacao_confiavel boolean default true,
  requer_revisao boolean default false,
  ultima_importacao_id varchar(128),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.paciente add column if not exists doc_id varchar(128) unique;
alter table public.paciente add column if not exists idade integer;
alter table public.paciente add column if not exists identidade_genero varchar(50);
alter table public.paciente add column if not exists raca_cor varchar(50);
alter table public.paciente add column if not exists beneficiario_bolsa_familia boolean default false;
alter table public.paciente add column if not exists vigencia_bolsa_familia varchar(50);
alter table public.paciente add column if not exists telefone varchar(30);
alter table public.paciente add column if not exists telefone_celular varchar(30);
alter table public.paciente add column if not exists telefone_residencial varchar(30);
alter table public.paciente add column if not exists telefone_contato varchar(30);
alter table public.paciente add column if not exists id_area integer references public.area(id_area) on delete set null;
alter table public.paciente add column if not exists unidade_id varchar(100);
alter table public.paciente add column if not exists id_microarea integer references public.microarea(id_microarea) on delete set null;
alter table public.paciente add column if not exists microarea_codigo varchar(20);
alter table public.paciente add column if not exists acs_nome varchar(255);
alter table public.paciente add column if not exists numero varchar(50);
alter table public.paciente add column if not exists complemento varchar(100);
alter table public.paciente add column if not exists municipio varchar(100) default 'Piraí';
alter table public.paciente add column if not exists uf varchar(10) default 'RJ';
alter table public.paciente add column if not exists cep varchar(20);
alter table public.paciente add column if not exists dias_ultimo_atendimento_medico integer;
alter table public.paciente add column if not exists meses_ultimo_atendimento_medico integer;
alter table public.paciente add column if not exists data_ultimo_atendimento_medico date;
alter table public.paciente add column if not exists dias_ultimo_atendimento_enfermagem integer;
alter table public.paciente add column if not exists meses_ultimo_atendimento_enfermagem integer;
alter table public.paciente add column if not exists data_ultimo_atendimento_enfermagem date;
alter table public.paciente add column if not exists dias_ultimo_atendimento_odontologico integer;
alter table public.paciente add column if not exists meses_ultimo_atendimento_odontologico integer;
alter table public.paciente add column if not exists data_ultimo_atendimento_odontologico date;
alter table public.paciente add column if not exists dias_ultima_visita_domiciliar integer;
alter table public.paciente add column if not exists meses_ultima_visita_domiciliar integer;
alter table public.paciente add column if not exists data_ultima_visita_domiciliar date;
alter table public.paciente add column if not exists peso_atual numeric(6,2);
alter table public.paciente add column if not exists altura_atual numeric(4,2);
alter table public.paciente add column if not exists imc_atual numeric(6,2);
alter table public.paciente add column if not exists data_ultima_antropometria date;
alter table public.paciente add column if not exists pressao_sistolica_atual integer;
alter table public.paciente add column if not exists pressao_diastolica_atual integer;
alter table public.paciente add column if not exists data_ultima_pa date;
alter table public.paciente add column if not exists possui_hipertensao boolean default false;
alter table public.paciente add column if not exists possui_diabetes boolean default false;
alter table public.paciente add column if not exists tabagista boolean default false;
alter table public.paciente add column if not exists doenca_cardiovascular boolean default false;
alter table public.paciente add column if not exists prioridade varchar(50);
alter table public.paciente add column if not exists motivos_prioridade text;
alter table public.paciente add column if not exists observacao_gerente text;
alter table public.paciente add column if not exists observacao_gerente_autor varchar(255);
alter table public.paciente add column if not exists observacao_gerente_data timestamptz;
alter table public.paciente add column if not exists identificacao_confiavel boolean default true;
alter table public.paciente add column if not exists requer_revisao boolean default false;
alter table public.paciente add column if not exists ultima_importacao_id varchar(128);

-- 2.6 TABELAS DE COMORBIDADES (Relação N:N)
create table if not exists public.comorbidade (
  id_comorbidade serial primary key,
  tipo_comorbidade varchar(100) unique not null
);

create table if not exists public.paciente_comorbidade (
  id_paciente integer not null references public.paciente(id_paciente) on delete cascade,
  id_comorbidade integer not null references public.comorbidade(id_comorbidade) on delete cascade,
  primary key (id_paciente, id_comorbidade)
);

-- 2.7 TABELA DE ATENDIMENTOS (Médico, Enfermagem, Odontológico, Visita Domiciliar)
create table if not exists public.atendimento (
  id_atendimento serial primary key,
  id_paciente integer not null references public.paciente(id_paciente) on delete cascade,
  tipo_atendimento varchar(50) not null,
  data_ultimo_atendimento date not null,
  dias_desde_atendimento integer,
  meses_desde_atendimento integer,
  id_carga integer null references public.controle_carga(id_carga) on delete set null,
  created_at timestamptz default now()
);
alter table public.atendimento add column if not exists dias_desde_atendimento integer;
alter table public.atendimento add column if not exists meses_desde_atendimento integer;

-- 2.8 TABELA DE AFERIÇÃO DE PRESSÃO ARTERIAL
create table if not exists public.afericao_pressao (
  id_afericao serial primary key,
  id_paciente integer not null references public.paciente(id_paciente) on delete cascade,
  pressao_sistolica integer not null,
  pressao_diastolica integer not null,
  data_afericao date not null,
  id_carga integer null references public.controle_carga(id_carga) on delete set null,
  created_at timestamptz default now()
);

-- 2.9 TABELA DE AFERIÇÃO DE MEDIDAS ANTROPOMÉTRICAS (Peso, Altura e IMC)
create table if not exists public.afericao_medidas (
  id_afericao serial primary key,
  id_paciente integer not null references public.paciente(id_paciente) on delete cascade,
  peso numeric(6,2),
  altura numeric(4,2),
  imc numeric(6,2),
  data_afericao date not null,
  id_carga integer null references public.controle_carga(id_carga) on delete set null,
  created_at timestamptz default now()
);
alter table public.afericao_medidas add column if not exists imc numeric(6,2);

-- 2.10 TABELA DE AÇÕES OPERACIONAIS DO ACS
create table if not exists public.acao_paciente (
  id_acao varchar(128) primary key,
  id_paciente integer not null references public.paciente(id_paciente) on delete cascade,
  patient_doc_id varchar(128),
  unidade_id varchar(100),
  microarea varchar(50),
  acs_id varchar(128),
  acs_nome varchar(255),
  tipo_acao varchar(100) not null,
  data_acao date not null,
  resultado text,
  observacoes text,
  created_at timestamptz default now()
);

-- 2.10b TABELA DE OBSERVAÇÕES DA GERÊNCIA POR PACIENTE (COM HISTÓRICO DE EDIÇÕES)
create table if not exists public.observacao_gerente_paciente (
  id_registro varchar(128) primary key,
  id_observacao varchar(128) not null,
  id_paciente integer not null references public.paciente(id_paciente) on delete cascade,
  patient_doc_id varchar(128),
  unidade_id varchar(100),
  gerente_id varchar(128),
  gerente_nome varchar(255),
  gerente_perfil varchar(50) default 'GERENTE',
  tipo_evento varchar(30) not null default 'CRIACAO',
  categoria varchar(100),
  observacao text not null,
  observacao_anterior text,
  data_registro timestamptz not null default now(),
  created_at timestamptz default now()
);
create index if not exists idx_obs_gerente_paciente_data on public.observacao_gerente_paciente(id_paciente, data_registro desc);

-- 2.11 TABELA DE PARÂMETROS CLÍNICOS DCNT
create table if not exists public.parametros_dcnt (
  id varchar(50) primary key default 'dcnt',
  meses_sem_pa integer not null default 6,
  meses_sem_visita integer not null default 3,
  meses_sem_consulta_medica integer not null default 6,
  idade_corte_idoso integer not null default 60,
  imc_corte_obesidade numeric(5,2) not null default 30,
  imc_corte_sobrepeso numeric(5,2) not null default 25,
  pa_sistolica_alterada integer not null default 140,
  pa_diastolica_alterada integer not null default 90,
  peso_pa_alterada integer not null default 4,
  peso_pa_desatualizada integer not null default 2,
  peso_visita_desatualizada integer not null default 2,
  peso_idoso integer not null default 1,
  peso_obesidade integer not null default 1,
  peso_multiplas_condicoes integer not null default 2,
  corte_prioridade_alta integer not null default 6,
  corte_prioridade_media integer not null default 3,
  corte_prioridade_atencao integer not null default 1,
  updated_at timestamptz default now()
);

create index if not exists idx_atendimento_paciente_data on public.atendimento(id_paciente, data_ultimo_atendimento, tipo_atendimento);
create index if not exists idx_afericao_medidas_paciente_data on public.afericao_medidas(id_paciente, data_afericao);
create index if not exists idx_afericao_pressao_paciente_data on public.afericao_pressao(id_paciente, data_afericao);
create index if not exists idx_controle_carga_data on public.controle_carga(data_carga desc, hora_carga desc);
create index if not exists idx_paciente_unidade_microarea on public.paciente(unidade_id, microarea_codigo);

-- ==============================================================================
-- 3. HELPER CONVERSION FUNCTIONS & AUTOMATIC RELATIONAL SYNCHRONIZATION
-- ==============================================================================

create or replace function public.safe_date(val text) returns date
language plpgsql immutable
as $$
declare s text := trim(coalesce(val, ''));
begin
  if s = '' or s = '-' or lower(s) = 'null' then return null; end if;
  if s ~ '^\d{4}-\d{2}-\d{2}' then return substring(s from 1 for 10)::date; end if;
  if s ~ '^\d{2}/\d{2}/\d{4}' then return to_date(substring(s from 1 for 10), 'DD/MM/YYYY'); end if;
  return s::date;
exception when others then
  return null;
end $$;

create or replace function public.safe_int(val text) returns integer
language plpgsql immutable
as $$
declare s text := trim(coalesce(val, '')); digits text;
begin
  if s = '' or s = '-' or lower(s) = 'null' then return null; end if;
  if s ~ '^-?\d+$' then return s::integer; end if;
  digits := regexp_replace(s, '\D', '', 'g');
  if digits = '' then return null; end if;
  return substring(digits from 1 for 9)::integer;
exception when others then
  return null;
end $$;

create or replace function public.safe_numeric(val text) returns numeric
language plpgsql immutable
as $$
declare s text := replace(trim(coalesce(val, '')), ',', '.');
begin
  if s = '' or s = '-' or lower(s) = 'null' then return null; end if;
  return s::numeric;
exception when others then
  return null;
end $$;

create or replace function public.safe_bool(val text, default_val boolean default false) returns boolean
language plpgsql immutable
as $$
declare s text := lower(trim(coalesce(val, '')));
begin
  if s in ('true', 't', '1', 'sim', 's', 'yes', 'y') then return true; end if;
  if s in ('false', 'f', '0', 'nao', 'não', 'n', 'no') then return false; end if;
  return default_val;
end $$;

create or replace function public.ensure_area_id(p_codigo text, p_nome text default null, p_cnes text default null, p_tipo text default null, p_ativa boolean default true) returns integer
language plpgsql security definer set search_path = public
as $$
declare v_id integer; v_cod text := coalesce(nullif(trim(p_codigo), ''), 'USF-003'); v_nom text := coalesce(nullif(trim(p_nome), ''), v_cod);
begin
  select id_area into v_id from public.area where codigo = v_cod limit 1;
  if v_id is null then
    insert into public.area (codigo, nome, nome_normalizado, responsavel_nome, cnes, tipo, ativa, updated_at)
    values (v_cod, v_nom, upper(v_nom), 'Gerente da Unidade', nullif(trim(p_cnes), ''), coalesce(nullif(trim(p_tipo), ''), 'USF'), coalesce(p_ativa, true), now())
    on conflict (codigo) do update set
      nome = coalesce(nullif(excluded.nome, excluded.codigo), public.area.nome),
      cnes = coalesce(excluded.cnes, public.area.cnes),
      tipo = coalesce(excluded.tipo, public.area.tipo),
      ativa = excluded.ativa,
      updated_at = now()
    returning id_area into v_id;
  else
    update public.area set
      nome = case when p_nome is not null and trim(p_nome) <> '' then trim(p_nome) else nome end,
      cnes = coalesce(nullif(trim(p_cnes), ''), cnes),
      tipo = coalesce(nullif(trim(p_tipo), ''), tipo),
      ativa = coalesce(p_ativa, ativa),
      updated_at = now()
    where id_area = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.ensure_comorbidade_link(p_id_paciente integer, p_tipo text, p_active boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_id_comorb integer;
begin
  if p_id_paciente is null or coalesce(trim(p_tipo), '') = '' then return; end if;
  if coalesce(p_active, false) then
    insert into public.comorbidade (tipo_comorbidade) values (trim(p_tipo))
    on conflict (tipo_comorbidade) do update set tipo_comorbidade = excluded.tipo_comorbidade
    returning id_comorbidade into v_id_comorb;
    insert into public.paciente_comorbidade (id_paciente, id_comorbidade)
    values (p_id_paciente, v_id_comorb)
    on conflict (id_paciente, id_comorbidade) do nothing;
  else
    select id_comorbidade into v_id_comorb from public.comorbidade where tipo_comorbidade = trim(p_tipo);
    if v_id_comorb is not null then
      delete from public.paciente_comorbidade where id_paciente = p_id_paciente and id_comorbidade = v_id_comorb;
    end if;
  end if;
end $$;

create or replace function public.upsert_atendimento_rel(p_id_paciente integer, p_tipo text, p_data date, p_dias integer, p_meses integer, p_id_carga integer) returns void
language plpgsql security definer set search_path = public
as $$
declare v_id integer;
begin
  if p_id_paciente is null or p_data is null or coalesce(trim(p_tipo), '') = '' then return; end if;
  select id_atendimento into v_id from public.atendimento
   where id_paciente = p_id_paciente and tipo_atendimento = trim(p_tipo) and data_ultimo_atendimento = p_data
   limit 1;
  if v_id is null then
    insert into public.atendimento (id_paciente, tipo_atendimento, data_ultimo_atendimento, dias_desde_atendimento, meses_desde_atendimento, id_carga)
    values (p_id_paciente, trim(p_tipo), p_data, p_dias, p_meses, p_id_carga);
  else
    update public.atendimento set
      dias_desde_atendimento = coalesce(p_dias, dias_desde_atendimento),
      meses_desde_atendimento = coalesce(p_meses, meses_desde_atendimento),
      id_carga = coalesce(p_id_carga, id_carga)
    where id_atendimento = v_id;
  end if;
end $$;

create or replace function public.upsert_pa_rel(p_id_paciente integer, p_sis integer, p_dia integer, p_data date, p_id_carga integer) returns void
language plpgsql security definer set search_path = public
as $$
declare v_id integer; v_dt date := coalesce(p_data, current_date);
begin
  if p_id_paciente is null or p_sis is null or p_dia is null then return; end if;
  select id_afericao into v_id from public.afericao_pressao
   where id_paciente = p_id_paciente and data_afericao = v_dt and pressao_sistolica = p_sis and pressao_diastolica = p_dia
   limit 1;
  if v_id is null then
    insert into public.afericao_pressao (id_paciente, pressao_sistolica, pressao_diastolica, data_afericao, id_carga)
    values (p_id_paciente, p_sis, p_dia, v_dt, p_id_carga);
  else
    update public.afericao_pressao set id_carga = coalesce(p_id_carga, id_carga) where id_afericao = v_id;
  end if;
end $$;

create or replace function public.upsert_medidas_rel(p_id_paciente integer, p_peso numeric, p_altura numeric, p_imc numeric, p_data date, p_id_carga integer) returns void
language plpgsql security definer set search_path = public
as $$
declare v_id integer; v_dt date := coalesce(p_data, current_date); v_imc numeric := p_imc;
begin
  if p_id_paciente is null or (p_peso is null and p_altura is null) then return; end if;
  if v_imc is null and p_peso is not null and p_altura is not null and p_altura > 0 then
    v_imc := round(p_peso / (p_altura * p_altura), 2);
  end if;
  select id_afericao into v_id from public.afericao_medidas
   where id_paciente = p_id_paciente and data_afericao = v_dt
   limit 1;
  if v_id is null then
    insert into public.afericao_medidas (id_paciente, peso, altura, imc, data_afericao, id_carga)
    values (p_id_paciente, p_peso, p_altura, v_imc, v_dt, p_id_carga);
  else
    update public.afericao_medidas set
      peso = coalesce(p_peso, peso),
      altura = coalesce(p_altura, altura),
      imc = coalesce(v_imc, imc),
      id_carga = coalesce(p_id_carga, id_carga)
    where id_afericao = v_id;
  end if;
end $$;

create or replace function public.sync_document_to_relational() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_path text := coalesce(new.path, old.path);
  v_parts text[] := string_to_array(v_path, '/');
  v_kind text := v_parts[1];
  d jsonb := coalesce(new.data, '{}'::jsonb);
  v_id_area integer;
  v_id_microarea integer;
  v_id_usuario integer;
  v_id_paciente integer;
  v_id_carga integer;
  v_unit_code text;
  v_ma_code text;
  v_ma_digits text;
  v_ma_int integer;
  v_cpf text;
  v_cns text;
  v_email text;
  v_uid text;
  v_acs_uid text;
  v_acs_nome text;
  v_act jsonb;
begin
  if tg_op = 'DELETE' then
    if v_kind = 'usuarios' and array_length(v_parts, 1) = 2 then
      delete from public.usuario where uid = v_parts[2];
    elsif v_kind = 'pacientes' and array_length(v_parts, 1) = 2 then
      delete from public.paciente where doc_id = v_parts[2];
    end if;
    return old;
  end if;

  -- 1. UNIDADES -> public.area
  if v_kind = 'unidades' and array_length(v_parts, 1) = 2 then
    v_unit_code := coalesce(nullif(trim(d->>'codigo'), ''), v_parts[2]);
    perform public.ensure_area_id(
      v_parts[2],
      coalesce(nullif(trim(d->>'nome'), ''), v_unit_code),
      d->>'cnes',
      d->>'tipo',
      public.safe_bool(d->>'ativo', true)
    );
    return new;
  end if;

  -- 2. USUÁRIOS -> public.usuario
  if v_kind = 'usuarios' and array_length(v_parts, 1) = 2 then
    v_uid := coalesce(nullif(trim(d->>'uid'), ''), v_parts[2]);
    v_email := coalesce(nullif(lower(trim(d->>'email')), ''), v_uid || '@local.dcnt.saude');
    v_unit_code := nullif(trim(coalesce(d->>'unidadeId', '')), '');
    if v_unit_code is not null then
      v_id_area := public.ensure_area_id(v_unit_code, null, null, null, true);
    end if;

    select id_usuario into v_id_usuario from public.usuario
     where uid = v_uid or lower(email) = v_email
     order by coalesce(uid = v_uid, false) desc limit 1;

    if v_id_usuario is null then
      insert into public.usuario (uid, nome, email, telefone, perfil, unidade_id, id_area, ativo, updated_at)
      values (
        v_uid,
        coalesce(nullif(trim(d->>'nome'), ''), v_uid),
        v_email,
        nullif(trim(coalesce(d->>'telefone', '')), ''),
        coalesce(nullif(trim(d->>'perfil'), ''), 'ACS'),
        v_unit_code,
        v_id_area,
        public.safe_bool(d->>'ativo', true),
        now()
      );
    else
      update public.usuario set
        uid = v_uid,
        nome = coalesce(nullif(trim(d->>'nome'), ''), nome),
        email = v_email,
        telefone = coalesce(nullif(trim(d->>'telefone'), ''), telefone),
        perfil = coalesce(nullif(trim(d->>'perfil'), ''), perfil),
        unidade_id = v_unit_code,
        id_area = v_id_area,
        ativo = public.safe_bool(d->>'ativo', true),
        updated_at = now()
      where id_usuario = v_id_usuario;
    end if;
    return new;
  end if;

  -- 3. MICROÁREAS -> public.microarea
  if v_kind = 'microareas' and array_length(v_parts, 1) = 2 then
    v_unit_code := coalesce(nullif(trim(d->>'unidadeId'), ''), 'USF-003');
    v_id_area := public.ensure_area_id(v_unit_code, null, null, null, true);
    v_ma_digits := regexp_replace(coalesce(d->>'codigo', ''), '\D', '', 'g');
    v_ma_code := case
      when v_ma_digits <> '' then lpad(v_ma_digits, 2, '0')
      else coalesce(nullif(trim(d->>'codigo'), ''), v_parts[2])
    end;
    v_acs_uid := nullif(trim(coalesce(d->>'acsId', '')), '');
    if v_acs_uid is not null then
      select id_usuario, nome into v_id_usuario, v_acs_nome from public.usuario where uid = v_acs_uid limit 1;
    end if;
    v_acs_nome := coalesce(nullif(trim(d->>'acsNome'), ''), v_acs_nome, 'Sem ACS responsável');

    insert into public.microarea (id_area, unidade_id, codigo, nome, responsavel_nome, responsavel_id, acs_uid, tipo, ativa, updated_at)
    values (
      v_id_area,
      v_unit_code,
      v_ma_code,
      coalesce(nullif(trim(d->>'nome'), ''), 'Microárea ' || v_ma_code),
      v_acs_nome,
      v_id_usuario,
      v_acs_uid,
      coalesce(nullif(trim(d->>'tipoMicroarea'), ''), nullif(trim(d->>'tipo'), ''), 'NORMAL'),
      public.safe_bool(d->>'ativo', true),
      now()
    )
    on conflict (id_area, codigo) do update set
      unidade_id = excluded.unidade_id,
      nome = excluded.nome,
      responsavel_nome = excluded.responsavel_nome,
      responsavel_id = excluded.responsavel_id,
      acs_uid = excluded.acs_uid,
      tipo = excluded.tipo,
      ativa = excluded.ativa,
      updated_at = now()
    returning id_microarea into v_id_microarea;

    if v_id_usuario is not null then
      update public.usuario set id_microarea = v_id_microarea, updated_at = now() where id_usuario = v_id_usuario;
    end if;

    -- Atualiza vínculo de pacientes daquela unidade e microárea
    update public.paciente set
      id_microarea = v_id_microarea,
      acs_nome = case when v_acs_uid is not null then v_acs_nome else acs_nome end,
      updated_at = now()
    where (unidade_id = v_unit_code or id_area = v_id_area)
      and (microarea_codigo = v_ma_code or (v_ma_digits <> '' and microarea = public.safe_int(v_ma_digits)));

    return new;
  end if;

  -- 4. IMPORTS -> public.controle_carga
  if v_kind = 'imports' and array_length(v_parts, 1) = 2 then
    v_unit_code := coalesce(nullif(trim(d->>'unidadeId'), ''), 'USF-003');
    v_id_area := public.ensure_area_id(v_unit_code, nullif(trim(d->>'unidadeNome'), ''), null, null, true);

    insert into public.controle_carga (
      import_id, data_carga, responsavel_carga, id_area, unidade_id, area_nome, arquivo_nome,
      tipo_carga, total_registros, novos_pacientes, pacientes_atualizados, novos_vinculos,
      vinculos_atualizados, pa_importadas, antropometrias_importadas, novos_atendimentos,
      novos_pesos, registros_com_avisos, erros, status, updated_at
    )
    values (
      v_parts[2],
      coalesce(public.safe_date(d->>'dataImportacao'), current_date),
      coalesce(nullif(trim(d->>'usuarioId'), ''), 'Sistema'),
      v_id_area,
      v_unit_code,
      coalesce(nullif(trim(d->>'unidadeNome'), ''), v_unit_code),
      nullif(trim(coalesce(d->>'arquivo', '')), ''),
      coalesce(nullif(trim(d->>'tipoImportacao'), ''), 'COMPLETA'),
      coalesce(public.safe_int(d->>'totalRegistros'), 0),
      coalesce(public.safe_int(d->>'novosPacientes'), 0),
      coalesce(public.safe_int(d->>'pacientesAtualizados'), 0),
      coalesce(public.safe_int(d->>'novosVinculos'), 0),
      coalesce(public.safe_int(d->>'vinculosAtualizados'), 0),
      coalesce(public.safe_int(d->>'paImportadas'), 0),
      coalesce(public.safe_int(d->>'antropometriasImportadas'), 0),
      coalesce(public.safe_int(d->>'novosAtendimentos'), 0),
      coalesce(public.safe_int(d->>'novosPesos'), 0),
      coalesce(public.safe_int(d->>'registrosComAvisos'), 0),
      coalesce(public.safe_int(d->>'erros'), 0),
      coalesce(nullif(trim(d->>'status'), ''), 'Concluído'),
      now()
    )
    on conflict (import_id) do update set
      total_registros = excluded.total_registros,
      novos_pacientes = excluded.novos_pacientes,
      pacientes_atualizados = excluded.pacientes_atualizados,
      novos_vinculos = excluded.novos_vinculos,
      vinculos_atualizados = excluded.vinculos_atualizados,
      pa_importadas = excluded.pa_importadas,
      antropometrias_importadas = excluded.antropometrias_importadas,
      novos_atendimentos = excluded.novos_atendimentos,
      novos_pesos = excluded.novos_pesos,
      registros_com_avisos = excluded.registros_com_avisos,
      erros = excluded.erros,
      status = excluded.status,
      updated_at = now();
    return new;
  end if;

  -- 5. PARÂMETROS DCNT -> public.parametros_dcnt
  if (v_kind = 'parametros' and v_parts[2] = 'dcnt') or (v_kind = 'diagnostico' and v_parts[2] = 'parametros-dcnt') then
    insert into public.parametros_dcnt (
      id, meses_sem_pa, meses_sem_visita, meses_sem_consulta_medica, idade_corte_idoso,
      imc_corte_obesidade, imc_corte_sobrepeso, pa_sistolica_alterada, pa_diastolica_alterada,
      peso_pa_alterada, peso_pa_desatualizada, peso_visita_desatualizada, peso_idoso,
      peso_obesidade, peso_multiplas_condicoes, corte_prioridade_alta, corte_prioridade_media,
      corte_prioridade_atencao, updated_at
    )
    values (
      'dcnt',
      coalesce(public.safe_int(d->>'monthsWithoutPA'), 6),
      coalesce(public.safe_int(d->>'monthsWithoutVisit'), 3),
      coalesce(public.safe_int(d->>'monthsWithoutMedicalCare'), 6),
      coalesce(public.safe_int(d->>'elderlyAgeCutoff'), 60),
      coalesce(public.safe_numeric(d->>'obesityImcCutoff'), 30),
      coalesce(public.safe_numeric(d->>'overweightImcCutoff'), 25),
      coalesce(public.safe_int(d->>'systolicAlteradaCutoff'), 140),
      coalesce(public.safe_int(d->>'diastolicAlteradaCutoff'), 90),
      coalesce(public.safe_int(d #>> '{priorityWeights,alteredPA}'), 4),
      coalesce(public.safe_int(d #>> '{priorityWeights,outdatedPA}'), 2),
      coalesce(public.safe_int(d #>> '{priorityWeights,outdatedVisit}'), 2),
      coalesce(public.safe_int(d #>> '{priorityWeights,elderly}'), 1),
      coalesce(public.safe_int(d #>> '{priorityWeights,obesity}'), 1),
      coalesce(public.safe_int(d #>> '{priorityWeights,multipleConditions}'), 2),
      coalesce(public.safe_int(d #>> '{priorityCutoffs,high}'), 6),
      coalesce(public.safe_int(d #>> '{priorityCutoffs,medium}'), 3),
      coalesce(public.safe_int(d #>> '{priorityCutoffs,attention}'), 1),
      now()
    )
    on conflict (id) do update set
      meses_sem_pa = excluded.meses_sem_pa,
      meses_sem_visita = excluded.meses_sem_visita,
      meses_sem_consulta_medica = excluded.meses_sem_consulta_medica,
      idade_corte_idoso = excluded.idade_corte_idoso,
      imc_corte_obesidade = excluded.imc_corte_obesidade,
      imc_corte_sobrepeso = excluded.imc_corte_sobrepeso,
      pa_sistolica_alterada = excluded.pa_sistolica_alterada,
      pa_diastolica_alterada = excluded.pa_diastolica_alterada,
      peso_pa_alterada = excluded.peso_pa_alterada,
      peso_pa_desatualizada = excluded.peso_pa_desatualizada,
      peso_visita_desatualizada = excluded.peso_visita_desatualizada,
      peso_idoso = excluded.peso_idoso,
      peso_obesidade = excluded.peso_obesidade,
      peso_multiplas_condicoes = excluded.peso_multiplas_condicoes,
      corte_prioridade_alta = excluded.corte_prioridade_alta,
      corte_prioridade_media = excluded.corte_prioridade_media,
      corte_prioridade_atencao = excluded.corte_prioridade_atencao,
      updated_at = now();
    return new;
  end if;

  -- 6. PACIENTES E SUBCOLEÇÕES CLÍNICAS
  if v_kind = 'pacientes' then
    if array_length(v_parts, 1) = 2 then
      v_unit_code := coalesce(nullif(trim(d->>'unidadeId'), ''), 'USF-003');
      v_id_area := public.ensure_area_id(v_unit_code, nullif(trim(d->>'unidadeNome'), ''), null, null, true);

      v_ma_digits := regexp_replace(coalesce(nullif(trim(d->>'microareaCodigo'), ''), nullif(trim(d->>'microarea'), ''), ''), '\D', '', 'g');
      v_ma_int := public.safe_int(v_ma_digits);
      v_ma_code := case when v_ma_digits <> '' then lpad(v_ma_digits, 2, '0') else coalesce(nullif(trim(d->>'microareaCodigo'), ''), 'NAO_INFORMADA') end;

      insert into public.microarea (id_area, unidade_id, codigo, nome, responsavel_nome, tipo, ativa)
      values (v_id_area, v_unit_code, v_ma_code, case when v_ma_digits <> '' then 'Microárea ' || v_ma_code else v_ma_code end, 'Sem ACS responsável', case when v_ma_digits <> '' then 'NORMAL' else 'NAO_INFORMADA' end, true)
      on conflict (id_area, codigo) do update set updated_at = now()
      returning id_microarea, responsavel_nome into v_id_microarea, v_acs_nome;

      v_cpf := nullif(regexp_replace(coalesce(d->>'cpf', ''), '\D', '', 'g'), '');
      v_cns := nullif(regexp_replace(coalesce(d->>'cns', ''), '\D', '', 'g'), '');

      select id_paciente into v_id_paciente from public.paciente where doc_id = v_parts[2] limit 1;
      if v_id_paciente is null and v_cpf is not null then
        select id_paciente into v_id_paciente from public.paciente where cpf = v_cpf limit 1;
      end if;
      if v_id_paciente is null and v_cns is not null then
        select id_paciente into v_id_paciente from public.paciente where cns = v_cns limit 1;
      end if;

      if v_cpf is not null and exists (select 1 from public.paciente where cpf = v_cpf and id_paciente is distinct from v_id_paciente) then
        v_cpf := null;
      end if;
      if v_cns is not null and exists (select 1 from public.paciente where cns = v_cns and id_paciente is distinct from v_id_paciente) then
        v_cns := null;
      end if;

      if v_id_paciente is null then
        insert into public.paciente (
          doc_id, cpf, cns, nome, data_nascimento, idade, sexo, identidade_genero, raca_cor,
          beneficiario_bolsa_familia, vigencia_bolsa_familia, telefone, telefone_celular,
          telefone_residencial, telefone_contato, id_area, unidade_id, area, id_microarea,
          microarea, microarea_codigo, acs_nome, rua, numero, complemento, bairro, municipio,
          uf, cep, dias_ultimo_atendimento_medico, meses_ultimo_atendimento_medico,
          data_ultimo_atendimento_medico, dias_ultimo_atendimento_enfermagem,
          meses_ultimo_atendimento_enfermagem, data_ultimo_atendimento_enfermagem,
          dias_ultimo_atendimento_odontologico, meses_ultimo_atendimento_odontologico,
          data_ultimo_atendimento_odontologico, dias_ultima_visita_domiciliar,
          meses_ultima_visita_domiciliar, data_ultima_visita_domiciliar, peso_atual,
          altura_atual, imc_atual, data_ultima_antropometria, pressao_sistolica_atual,
          pressao_diastolica_atual, data_ultima_pa, possui_hipertensao, possui_diabetes,
          tabagista, doenca_cardiovascular, prioridade, motivos_prioridade,
          identificacao_confiavel, requer_revisao, ultima_importacao_id, updated_at
        )
        values (
          v_parts[2],
          v_cpf,
          v_cns,
          coalesce(nullif(trim(d->>'nome'), ''), v_parts[2]),
          public.safe_date(d->>'dataNascimento'),
          public.safe_int(d->>'idade'),
          nullif(trim(coalesce(d->>'sexo', '')), ''),
          nullif(trim(coalesce(d->>'identidadeGenero', '')), ''),
          nullif(trim(coalesce(d->>'racaCor', '')), ''),
          public.safe_bool(d->>'beneficiarioBolsaFamilia', false),
          nullif(trim(coalesce(d->>'vigenciaBolsaFamilia', '')), ''),
          nullif(trim(coalesce(d->>'telefone', d->>'telefoneCelular', d->>'telefone_celular', '')), ''),
          nullif(trim(coalesce(d->>'telefoneCelular', d->>'telefone_celular', d->>'telefone', '')), ''),
          nullif(trim(coalesce(d->>'telefoneResidencial', '')), ''),
          nullif(trim(coalesce(d->>'telefoneContato', '')), ''),
          v_id_area,
          v_unit_code,
          coalesce(nullif(trim(d->>'unidadeNome'), ''), v_unit_code),
          v_id_microarea,
          v_ma_int,
          v_ma_code,
          coalesce(nullif(trim(d->>'acsNome'), ''), v_acs_nome),
          nullif(trim(coalesce(d->>'logradouro', d->>'rua', '')), ''),
          nullif(trim(coalesce(d->>'numero', '')), ''),
          nullif(trim(coalesce(d->>'complemento', '')), ''),
          nullif(trim(coalesce(d->>'bairro', '')), ''),
          coalesce(nullif(trim(d->>'municipio'), ''), 'Piraí'),
          coalesce(nullif(trim(d->>'uf'), ''), 'RJ'),
          nullif(trim(coalesce(d->>'cep', '')), ''),
          public.safe_int(d->>'daysSinceMedicalCare'),
          public.safe_int(d->>'monthsSinceMedicalCare'),
          public.safe_date(d->>'dataUltimaConsulta'),
          public.safe_int(d->>'daysSinceNursingCare'),
          public.safe_int(d->>'monthsSinceNursingCare'),
          public.safe_date(d->>'dataUltimoAtendimentoEnfermagem'),
          public.safe_int(d->>'daysSinceDentalCare'),
          public.safe_int(d->>'monthsSinceDentalCare'),
          public.safe_date(d->>'dataUltimoAtendimentoOdontologico'),
          public.safe_int(d->>'daysSinceHomeVisit'),
          public.safe_int(d->>'monthsSinceHomeVisit'),
          public.safe_date(coalesce(d->>'dataUltimaVisitaACS', d->>'dataUltimaVisita')),
          public.safe_numeric(d->>'pesoAtual'),
          public.safe_numeric(d->>'alturaAtual'),
          public.safe_numeric(d->>'imcAtual'),
          public.safe_date(d->>'dataUltimaAntropometria'),
          public.safe_int(d->>'pressaoSistolicaAtual'),
          public.safe_int(d->>'pressaoDiastolicaAtual'),
          public.safe_date(d->>'dataUltimaPA'),
          public.safe_bool(d->>'hasHypertension', false) or coalesce(public.safe_int(d->>'pressaoSistolicaAtual'), 0) >= 140 or coalesce(public.safe_int(d->>'pressaoDiastolicaAtual'), 0) >= 90,
          public.safe_bool(d->>'hasDiabetes', false),
          public.safe_bool(d->>'isSmoker', false),
          public.safe_bool(d->>'hasCardiovascularDisease', false),
          coalesce(nullif(trim(d->>'prioridade'), ''), 'Atenção'),
          nullif(trim(coalesce(d->>'motivosPrioridade', '')), ''),
          public.safe_bool(d->>'identificacaoConfiavel', true),
          public.safe_bool(d->>'requerRevisao', false),
          nullif(trim(coalesce(d->>'ultimaImportacaoId', '')), ''),
          now()
        )
        returning id_paciente into v_id_paciente;
      else
        update public.paciente set
          doc_id = v_parts[2],
          cpf = coalesce(v_cpf, cpf),
          cns = coalesce(v_cns, cns),
          nome = coalesce(nullif(trim(d->>'nome'), ''), nome),
          data_nascimento = coalesce(public.safe_date(d->>'dataNascimento'), data_nascimento),
          idade = coalesce(public.safe_int(d->>'idade'), idade),
          sexo = coalesce(nullif(trim(d->>'sexo'), ''), sexo),
          identidade_genero = coalesce(nullif(trim(d->>'identidadeGenero'), ''), identidade_genero),
          raca_cor = coalesce(nullif(trim(d->>'racaCor'), ''), raca_cor),
          beneficiario_bolsa_familia = case when d ? 'beneficiarioBolsaFamilia' then public.safe_bool(d->>'beneficiarioBolsaFamilia', false) else beneficiario_bolsa_familia end,
          vigencia_bolsa_familia = coalesce(nullif(trim(d->>'vigenciaBolsaFamilia'), ''), vigencia_bolsa_familia),
          telefone = coalesce(nullif(trim(coalesce(d->>'telefone', d->>'telefoneCelular', d->>'telefone_celular', '')), ''), telefone),
          telefone_celular = coalesce(nullif(trim(coalesce(d->>'telefoneCelular', d->>'telefone_celular', d->>'telefone', '')), ''), telefone_celular),
          telefone_residencial = coalesce(nullif(trim(d->>'telefoneResidencial'), ''), telefone_residencial),
          telefone_contato = coalesce(nullif(trim(d->>'telefoneContato'), ''), telefone_contato),
          id_area = v_id_area,
          unidade_id = v_unit_code,
          area = coalesce(nullif(trim(d->>'unidadeNome'), ''), area, v_unit_code),
          id_microarea = v_id_microarea,
          microarea = coalesce(v_ma_int, microarea),
          microarea_codigo = coalesce(v_ma_code, microarea_codigo),
          acs_nome = coalesce(nullif(trim(d->>'acsNome'), ''), nullif(v_acs_nome, 'Sem ACS responsável'), acs_nome),
          rua = coalesce(nullif(trim(coalesce(d->>'logradouro', d->>'rua', '')), ''), rua),
          numero = coalesce(nullif(trim(d->>'numero'), ''), numero),
          complemento = coalesce(nullif(trim(d->>'complemento'), ''), complemento),
          bairro = coalesce(nullif(trim(d->>'bairro'), ''), bairro),
          municipio = coalesce(nullif(trim(d->>'municipio'), ''), municipio),
          uf = coalesce(nullif(trim(d->>'uf'), ''), uf),
          cep = coalesce(nullif(trim(d->>'cep'), ''), cep),
          dias_ultimo_atendimento_medico = coalesce(public.safe_int(d->>'daysSinceMedicalCare'), dias_ultimo_atendimento_medico),
          meses_ultimo_atendimento_medico = coalesce(public.safe_int(d->>'monthsSinceMedicalCare'), meses_ultimo_atendimento_medico),
          data_ultimo_atendimento_medico = coalesce(public.safe_date(d->>'dataUltimaConsulta'), data_ultimo_atendimento_medico),
          dias_ultimo_atendimento_enfermagem = coalesce(public.safe_int(d->>'daysSinceNursingCare'), dias_ultimo_atendimento_enfermagem),
          meses_ultimo_atendimento_enfermagem = coalesce(public.safe_int(d->>'monthsSinceNursingCare'), meses_ultimo_atendimento_enfermagem),
          data_ultimo_atendimento_enfermagem = coalesce(public.safe_date(d->>'dataUltimoAtendimentoEnfermagem'), data_ultimo_atendimento_enfermagem),
          dias_ultimo_atendimento_odontologico = coalesce(public.safe_int(d->>'daysSinceDentalCare'), dias_ultimo_atendimento_odontologico),
          meses_ultimo_atendimento_odontologico = coalesce(public.safe_int(d->>'monthsSinceDentalCare'), meses_ultimo_atendimento_odontologico),
          data_ultimo_atendimento_odontologico = coalesce(public.safe_date(d->>'dataUltimoAtendimentoOdontologico'), data_ultimo_atendimento_odontologico),
          dias_ultima_visita_domiciliar = coalesce(public.safe_int(d->>'daysSinceHomeVisit'), dias_ultima_visita_domiciliar),
          meses_ultima_visita_domiciliar = coalesce(public.safe_int(d->>'monthsSinceHomeVisit'), meses_ultima_visita_domiciliar),
          data_ultima_visita_domiciliar = coalesce(public.safe_date(coalesce(d->>'dataUltimaVisitaACS', d->>'dataUltimaVisita')), data_ultima_visita_domiciliar),
          peso_atual = coalesce(public.safe_numeric(d->>'pesoAtual'), peso_atual),
          altura_atual = coalesce(public.safe_numeric(d->>'alturaAtual'), altura_atual),
          imc_atual = coalesce(public.safe_numeric(d->>'imcAtual'), imc_atual),
          data_ultima_antropometria = coalesce(public.safe_date(d->>'dataUltimaAntropometria'), data_ultima_antropometria),
          pressao_sistolica_atual = coalesce(public.safe_int(d->>'pressaoSistolicaAtual'), pressao_sistolica_atual),
          pressao_diastolica_atual = coalesce(public.safe_int(d->>'pressaoDiastolicaAtual'), pressao_diastolica_atual),
          data_ultima_pa = coalesce(public.safe_date(d->>'dataUltimaPA'), data_ultima_pa),
          possui_hipertensao = public.safe_bool(d->>'hasHypertension', possui_hipertensao) or coalesce(public.safe_int(d->>'pressaoSistolicaAtual'), 0) >= 140 or coalesce(public.safe_int(d->>'pressaoDiastolicaAtual'), 0) >= 90,
          possui_diabetes = public.safe_bool(d->>'hasDiabetes', possui_diabetes),
          tabagista = public.safe_bool(d->>'isSmoker', tabagista),
          doenca_cardiovascular = public.safe_bool(d->>'hasCardiovascularDisease', doenca_cardiovascular),
          prioridade = coalesce(nullif(trim(d->>'prioridade'), ''), prioridade),
          motivos_prioridade = coalesce(nullif(trim(d->>'motivosPrioridade'), ''), motivos_prioridade),
          identificacao_confiavel = public.safe_bool(d->>'identificacaoConfiavel', identificacao_confiavel),
          requer_revisao = public.safe_bool(d->>'requerRevisao', requer_revisao),
          ultima_importacao_id = coalesce(nullif(trim(d->>'ultimaImportacaoId'), ''), ultima_importacao_id),
          updated_at = now()
        where id_paciente = v_id_paciente;
      end if;

      select id_carga into v_id_carga from public.controle_carga where import_id = d->>'ultimaImportacaoId' limit 1;

      -- Sincroniza aferição de pressão atual na tabela afericao_pressao
      if d->>'pressaoSistolicaAtual' is not null and d->>'pressaoDiastolicaAtual' is not null then
        perform public.upsert_pa_rel(
          v_id_paciente,
          public.safe_int(d->>'pressaoSistolicaAtual'),
          public.safe_int(d->>'pressaoDiastolicaAtual'),
          public.safe_date(d->>'dataUltimaPA'),
          v_id_carga
        );
      end if;

      -- Sincroniza peso e altura atuais na tabela afericao_medidas
      if d->>'pesoAtual' is not null or d->>'alturaAtual' is not null then
        perform public.upsert_medidas_rel(
          v_id_paciente,
          public.safe_numeric(d->>'pesoAtual'),
          public.safe_numeric(d->>'alturaAtual'),
          public.safe_numeric(d->>'imcAtual'),
          public.safe_date(d->>'dataUltimaAntropometria'),
          v_id_carga
        );
      end if;

      -- Sincroniza os 4 tipos de atendimento na tabela atendimento
      perform public.upsert_atendimento_rel(v_id_paciente, 'Médico', public.safe_date(d->>'dataUltimaConsulta'), public.safe_int(d->>'daysSinceMedicalCare'), public.safe_int(d->>'monthsSinceMedicalCare'), v_id_carga);
      perform public.upsert_atendimento_rel(v_id_paciente, 'Enfermagem', public.safe_date(d->>'dataUltimoAtendimentoEnfermagem'), public.safe_int(d->>'daysSinceNursingCare'), public.safe_int(d->>'monthsSinceNursingCare'), v_id_carga);
      perform public.upsert_atendimento_rel(v_id_paciente, 'Odontológico', public.safe_date(d->>'dataUltimoAtendimentoOdontologico'), public.safe_int(d->>'daysSinceDentalCare'), public.safe_int(d->>'monthsSinceDentalCare'), v_id_carga);
      perform public.upsert_atendimento_rel(v_id_paciente, 'Visita Domiciliar', public.safe_date(coalesce(d->>'dataUltimaVisitaACS', d->>'dataUltimaVisita')), public.safe_int(d->>'daysSinceHomeVisit'), public.safe_int(d->>'monthsSinceHomeVisit'), v_id_carga);

      -- Sincroniza comorbidades na tabela comorbidade / paciente_comorbidade
      perform public.ensure_comorbidade_link(v_id_paciente, 'Hipertensão Arterial Sistêmica', public.safe_bool(d->>'hasHypertension', false) or coalesce(public.safe_int(d->>'pressaoSistolicaAtual'), 0) >= 140 or coalesce(public.safe_int(d->>'pressaoDiastolicaAtual'), 0) >= 90);
      perform public.ensure_comorbidade_link(v_id_paciente, 'Diabetes Mellitus', public.safe_bool(d->>'hasDiabetes', false));
      perform public.ensure_comorbidade_link(v_id_paciente, 'Obesidade', coalesce(public.safe_int(d->>'idade'), 0) >= 20 and coalesce(public.safe_numeric(d->>'imcAtual'), 0) >= 30);
      perform public.ensure_comorbidade_link(v_id_paciente, 'Tabagismo', public.safe_bool(d->>'isSmoker', false));
      perform public.ensure_comorbidade_link(v_id_paciente, 'Doença Cardiovascular', public.safe_bool(d->>'hasCardiovascularDisease', false));

      -- Sincroniza ações contidas em historicoAcoes (se presentes)
      if jsonb_typeof(d->'historicoAcoes') = 'array' then
        for v_act in select * from jsonb_array_elements(d->'historicoAcoes') loop
          if coalesce(v_act->>'id', '') <> '' then
            insert into public.acao_paciente (id_acao, id_paciente, patient_doc_id, unidade_id, microarea, acs_id, acs_nome, tipo_acao, data_acao, resultado, observacoes)
            values (
              v_act->>'id',
              v_id_paciente,
              v_parts[2],
              coalesce(v_act->>'unidadeId', v_unit_code),
              coalesce(v_act->>'microarea', v_ma_code),
              v_act->>'acsId',
              v_act->>'acsNome',
              coalesce(v_act->>'tipoAcao', 'Visita Domiciliar'),
              coalesce(public.safe_date(v_act->>'dataAcao'), current_date),
              v_act->>'resultado',
              v_act->>'observacoes'
            )
            on conflict (id_acao) do nothing;
          end if;
        end loop;
      end if;

      -- Sincroniza observação atual da gerência no registro do paciente (se presente)
      if d ? 'observacaoGerenteAtual' and jsonb_typeof(d->'observacaoGerenteAtual') = 'object' then
        update public.paciente set
          observacao_gerente = d #>> '{observacaoGerenteAtual,texto}',
          observacao_gerente_autor = d #>> '{observacaoGerenteAtual,autorNome}',
          observacao_gerente_data = now()
        where id_paciente = v_id_paciente;
      end if;

      -- Sincroniza histórico de observações da gerência (se presente)
      if jsonb_typeof(d->'historicoObservacoesGerente') = 'array' then
        for v_act in select * from jsonb_array_elements(d->'historicoObservacoesGerente') loop
          if coalesce(v_act->>'id', '') <> '' and coalesce(v_act->>'textoNovo', '') <> '' then
            insert into public.observacao_gerente_paciente (
              id_registro, id_observacao, id_paciente, patient_doc_id, unidade_id,
              gerente_id, gerente_nome, gerente_perfil, tipo_evento, categoria,
              observacao, observacao_anterior, data_registro
            )
            values (
              v_act->>'id',
              coalesce(nullif(trim(v_act->>'observacaoId'), ''), v_act->>'id'),
              v_id_paciente,
              v_parts[2],
              v_unit_code,
              v_act->>'autorId',
              v_act->>'autorNome',
              coalesce(nullif(trim(v_act->>'autorPerfil'), ''), 'GERENTE'),
              coalesce(nullif(trim(v_act->>'tipoEvento'), ''), 'CRIACAO'),
              coalesce(nullif(trim(v_act->>'categoriaNova'), ''), 'Observação Geral'),
              v_act->>'textoNovo',
              nullif(v_act->>'textoAnterior', ''),
              now()
            )
            on conflict (id_registro) do nothing;
          end if;
        end loop;
      end if;

      return new;
    elsif array_length(v_parts, 1) = 4 then
      select id_paciente into v_id_paciente from public.paciente where doc_id = v_parts[2] limit 1;
      if v_id_paciente is null then
        insert into public.paciente (doc_id, nome) values (v_parts[2], v_parts[2])
        on conflict (doc_id) do update set updated_at = now()
        returning id_paciente into v_id_paciente;
      end if;
      select id_carga into v_id_carga from public.controle_carga where import_id = coalesce(d->>'importacaoId', d->>'importId') limit 1;

      if v_parts[3] = 'pressaoArterial' then
        perform public.upsert_pa_rel(
          v_id_paciente,
          public.safe_int(coalesce(d->>'sistolica', d->>'pressaoSistolica')),
          public.safe_int(coalesce(d->>'diastolica', d->>'pressaoDiastolica')),
          public.safe_date(coalesce(d->>'dataMedicao', d->>'dataPA')),
          v_id_carga
        );
      elsif v_parts[3] = 'antropometria' then
        perform public.upsert_medidas_rel(
          v_id_paciente,
          public.safe_numeric(d->>'peso'),
          public.safe_numeric(d->>'altura'),
          public.safe_numeric(d->>'imc'),
          public.safe_date(coalesce(d->>'dataMedicao', d->>'dataAntropometria')),
          v_id_carga
        );
      elsif v_parts[3] = 'atendimentos' then
        perform public.upsert_atendimento_rel(
          v_id_paciente,
          coalesce(d->>'tipo', d->>'tipoAtendimento', 'Médico'),
          public.safe_date(coalesce(d->>'data', d->>'dataAtendimento')),
          public.safe_int(d->>'dias'),
          public.safe_int(d->>'meses'),
          v_id_carga
        );
      elsif v_parts[3] = 'acoes' then
        insert into public.acao_paciente (id_acao, id_paciente, patient_doc_id, unidade_id, microarea, acs_id, acs_nome, tipo_acao, data_acao, resultado, observacoes)
        values (
          coalesce(nullif(trim(d->>'id'), ''), v_parts[4]),
          v_id_paciente,
          v_parts[2],
          d->>'unidadeId',
          d->>'microarea',
          d->>'acsId',
          d->>'acsNome',
          coalesce(nullif(trim(d->>'tipoAcao'), ''), 'Visita Domiciliar'),
          coalesce(public.safe_date(d->>'dataAcao'), current_date),
          d->>'resultado',
          d->>'observacoes'
        )
        on conflict (id_acao) do update set
          resultado = excluded.resultado,
          observacoes = excluded.observacoes;
      elsif v_parts[3] = 'observacoesGerente' then
        if coalesce(trim(d->>'texto'), '') <> '' then
          update public.paciente set
            observacao_gerente = d->>'texto',
            observacao_gerente_autor = d->>'autorNome',
            observacao_gerente_data = now()
          where id_paciente = v_id_paciente;
        end if;
      end if;
      return new;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_sync_app_documents_relational on public.app_documents;
create trigger trg_sync_app_documents_relational
after insert or update or delete on public.app_documents
for each row execute function public.sync_document_to_relational();

-- Backfill existing documents into relational tables in dependency order
do $$
declare r record;
begin
  for r in select path from public.app_documents
   order by case split_part(path, '/', 1)
     when 'unidades' then 1
     when 'usuarios' then 2
     when 'microareas' then 3
     when 'imports' then 4
     when 'parametros' then 5
     when 'diagnostico' then 5
     when 'pacientes' then 6
     else 7
   end, array_length(string_to_array(path, '/'), 1), path
  loop
    update public.app_documents set updated_at = updated_at where path = r.path;
  end loop;
end $$;

-- ==============================================================================
-- 4. RLS POLICIES & TRANSACTIONAL RPC FUNCTIONS
-- ==============================================================================

create or replace function public.current_profile() returns jsonb
language sql stable security definer set search_path = public
as $$ select data from public.app_documents where path = 'usuarios/' || auth.uid()::text and data->>'ativo' = 'true' $$;

create or replace function public.patient_scope(p jsonb) returns boolean
language sql stable security definer set search_path = public
as $$
 select coalesce(
   public.current_profile()->>'perfil' = 'ADMIN' or (
    p->>'unidadeId' = public.current_profile()->>'unidadeId' and (
      public.current_profile()->>'perfil' = 'GERENTE' or (
        public.current_profile()->>'perfil' = 'ACS' and exists (
          select 1 from public.app_documents m where m.collection = 'microareas'
          and m.data->>'unidadeId' = p->>'unidadeId' and m.data->>'acsId' = auth.uid()::text
          and m.data->>'ativo' = 'true'
          and (
            m.data->>'codigo' = coalesce(p->>'microareaCodigo', regexp_replace(p->>'microarea', '\D', '', 'g'))
            or lpad(regexp_replace(coalesce(m.data->>'codigo', ''), '\D', '', 'g'), 2, '0') =
               lpad(coalesce(nullif(regexp_replace(coalesce(p->>'microareaCodigo', ''), '\D', '', 'g'), ''), regexp_replace(coalesce(p->>'microarea', ''), '\D', '', 'g')), 2, '0')
          )
        )
      )
    )
   ), false)
$$;

create or replace function public.document_access(p_path text, p_data jsonb, writing boolean) returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare actor jsonb := public.current_profile(); kind text := split_part(p_path, '/', 1); patient jsonb;
begin
 if actor is null then return false; end if;
 if actor->>'perfil' = 'ADMIN' then return true; end if;
 if kind = 'usuarios' then
   return (not writing and p_path = 'usuarios/' || auth.uid()::text) or
    (actor->>'perfil' = 'GERENTE' and p_data->>'perfil' = 'ACS' and p_data->>'unidadeId' = actor->>'unidadeId');
 elsif kind = 'unidades' then
   return not writing and p_path = 'unidades/' || (actor->>'unidadeId');
 elsif kind = 'microareas' then
   return p_data->>'unidadeId' = actor->>'unidadeId' and
     (actor->>'perfil' = 'GERENTE' or (not writing and p_data->>'acsId' = auth.uid()::text));
 elsif kind = 'pacientes' then
   if array_length(string_to_array(p_path, '/'), 1) = 2 then return public.patient_scope(p_data); end if;
   select data into patient from public.app_documents where path = 'pacientes/' || split_part(p_path, '/', 2);
   return public.patient_scope(patient) and (not writing or actor->>'perfil' = 'GERENTE' or split_part(p_path, '/', 3) = 'acoes');
 elsif kind = 'mensagens_whatsapp' then
   select data into patient from public.app_documents where path = 'pacientes/' || (p_data->>'patientId');
   return public.patient_scope(patient);
 elsif kind in ('imports', 'auditLogs') then
   return p_data->>'unidadeId' = actor->>'unidadeId' and (actor->>'perfil' = 'GERENTE' or kind = 'auditLogs');
 elsif kind = 'diagnostico' then return actor->>'perfil' = 'GERENTE';
 elsif kind = 'parametros' then return not writing or actor->>'perfil' = 'GERENTE';
 end if;
 return false;
end $$;

drop policy if exists documents_read on public.app_documents;
create policy documents_read on public.app_documents for select to authenticated using (public.document_access(path, data, false));
drop policy if exists documents_insert on public.app_documents;
create policy documents_insert on public.app_documents for insert to authenticated with check (
 public.document_access(path, data, true) and
 not (collection = 'pacientes' and public.current_profile()->>'perfil' = 'ACS')
);
drop policy if exists documents_update on public.app_documents;
create policy documents_update on public.app_documents for update to authenticated
 using (public.document_access(path, data, true)) with check (public.document_access(path, data, true));
drop policy if exists documents_delete on public.app_documents;
create policy documents_delete on public.app_documents for delete to authenticated using (public.current_profile()->>'perfil' = 'ADMIN');

-- Invoker rights preserve RLS. Each batch is a single PostgreSQL transaction.
create or replace function public.write_documents(operations jsonb) returns void
language plpgsql security invoker set search_path = public
as $$
declare op jsonb; previous jsonb;
begin
 if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 500 then raise exception 'Invalid batch'; end if;
 for op in select * from jsonb_array_elements(operations) loop
   if split_part(op->>'path', '/', 1) = 'pacientes' and public.current_profile()->>'perfil' = 'ACS' then
     if array_length(string_to_array(op->>'path', '/'), 1) = 2 and ((op->'data') ? 'observacoesGerente' or (op->'data') ? 'observacaoGerenteAtual' or (op->'data') ? 'historicoObservacoesGerente') then
       raise exception 'Only GERENTE or ADMIN can modify manager observations';
     end if;
   end if;
   previous := null;
   select data into previous from public.app_documents where path = op->>'path' for update;
   if previous is not null then
     update public.app_documents set data = case when (op->>'merge')::boolean then previous || (op->'data') else op->'data' end,
       updated_at = now() where path = op->>'path';
     if not found then raise exception 'Write denied'; end if;
   else
     if coalesce((op->>'must_exist')::boolean, false) then raise exception 'Document not found'; end if;
     insert into public.app_documents(path, data) values (op->>'path', op->'data');
   end if;
 end loop;
end $$;
revoke all on function public.write_documents(jsonb) from public, anon;
grant execute on function public.write_documents(jsonb) to authenticated, service_role;

create or replace function public.reconcile_user_profile(old_path text, new_uid text, profile jsonb) returns void
language plpgsql security invoker set search_path = public
as $$
begin
 if old_path not like 'usuarios/%' or profile->>'uid' <> new_uid then raise exception 'Invalid profile'; end if;
 insert into public.app_documents(path, data) values ('usuarios/' || new_uid, profile)
 on conflict(path) do update set data = excluded.data, updated_at = now();
 if old_path <> 'usuarios/' || new_uid then
  update public.app_documents set data = jsonb_set(data, '{acsId}', to_jsonb(new_uid)), updated_at = now()
   where data->>'acsId' = substring(old_path from 10);
  delete from public.app_documents where path = old_path;
 end if;
end $$;
revoke all on function public.reconcile_user_profile(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_user_profile(text,text,jsonb) to service_role;
revoke all on function public.current_profile() from public, anon;
revoke all on function public.patient_scope(jsonb) from public, anon;
revoke all on function public.document_access(text,jsonb,boolean) from public, anon;
grant execute on function public.current_profile(), public.patient_scope(jsonb), public.document_access(text,jsonb,boolean) to authenticated, service_role;

-- Lock the parent row to avoid losing simultaneous visits; both writes roll back together.
create or replace function public.append_patient_action(patient_id text, action jsonb, priority text default null, visit_date text default null) returns void
language plpgsql security invoker set search_path = public
as $$
declare previous jsonb; changes jsonb;
begin
 if public.current_profile()->>'perfil' <> 'ACS' or public.current_profile() is null then raise exception 'Only ACS can register actions'; end if;
 if action->>'acsId' is distinct from auth.uid()::text or action->>'patientId' is distinct from patient_id or coalesce(action->>'id','') = '' then raise exception 'Invalid action'; end if;
 if priority is not null and priority not in ('Alta','Média','Atenção','Acompanhado') then raise exception 'Invalid priority'; end if;
 select data into previous from public.app_documents where path = 'pacientes/' || patient_id for update;
 if previous is null then raise exception 'Patient not found or access denied'; end if;
 changes := jsonb_build_object('historicoAcoes', jsonb_build_array(action) || coalesce(previous->'historicoAcoes', '[]'::jsonb), 'updatedAt', now());
 if priority is not null then changes := changes || jsonb_build_object('prioridade', priority); end if;
 if priority = 'Acompanhado' then changes := changes || jsonb_build_object('motivosPrioridade', 'Acompanhamento realizado em ' || coalesce(action->>'dataAcao','') || ' (' || coalesce(action->>'tipoAcao','') || ')'); end if;
 if visit_date is not null then changes := changes || jsonb_build_object('dataUltimaVisita', visit_date, 'dataUltimaVisitaACS', visit_date, 'daysSinceHomeVisit', 0, 'monthsSinceHomeVisit', 0); end if;
 insert into public.app_documents(path,data) values ('pacientes/' || patient_id || '/acoes/' || (action->>'id'), action);
 update public.app_documents set data = previous || changes, updated_at = now() where path = 'pacientes/' || patient_id;
 if not found then raise exception 'Write denied'; end if;
end $$;
revoke all on function public.append_patient_action(text,jsonb,text,text) from public, anon;
grant execute on function public.append_patient_action(text,jsonb,text,text) to authenticated;

-- Transactional creation and edition of Manager Observations on a patient with full history log.
create or replace function public.save_manager_patient_observation(patient_id text, observation jsonb, history_entry jsonb) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  actor jsonb := public.current_profile();
  previous jsonb;
  existing_obs jsonb;
  updated_obs_list jsonb := '[]'::jsonb;
  updated_hist_list jsonb;
  obs_item jsonb;
  found_existing boolean := false;
  changes jsonb;
begin
  if actor is null or coalesce(actor->>'perfil', '') not in ('GERENTE', 'ADMIN') then
    raise exception 'Only GERENTE or ADMIN can add or edit patient observations';
  end if;
  if coalesce(observation->>'id', '') = '' or observation->>'patientId' is distinct from patient_id or coalesce(trim(observation->>'texto'), '') = '' then
    raise exception 'Invalid observation payload';
  end if;
  if coalesce(history_entry->>'id', '') = '' then
    raise exception 'Invalid observation history entry';
  end if;

  select data into previous from public.app_documents where path = 'pacientes/' || patient_id for update;
  if previous is null or not public.patient_scope(previous) then
    raise exception 'Patient not found or access denied';
  end if;

  existing_obs := coalesce(previous->'observacoesGerente', '[]'::jsonb);
  if jsonb_typeof(existing_obs) = 'array' then
    for obs_item in select * from jsonb_array_elements(existing_obs) loop
      if obs_item->>'id' = observation->>'id' then
        updated_obs_list := updated_obs_list || jsonb_build_array(observation);
        found_existing := true;
      else
        updated_obs_list := updated_obs_list || jsonb_build_array(obs_item);
      end if;
    end loop;
  end if;

  if not found_existing then
    updated_obs_list := jsonb_build_array(observation) || updated_obs_list;
  end if;

  updated_hist_list := jsonb_build_array(history_entry) || coalesce(previous->'historicoObservacoesGerente', '[]'::jsonb);

  changes := jsonb_build_object(
    'observacaoGerenteAtual', observation,
    'observacoesGerente', updated_obs_list,
    'historicoObservacoesGerente', updated_hist_list,
    'updatedAt', now()
  );

  insert into public.app_documents(path, data, updated_at)
  values ('pacientes/' || patient_id || '/observacoesGerente/' || (observation->>'id'), observation, now())
  on conflict (path) do update set data = excluded.data, updated_at = now();

  update public.app_documents set data = previous || changes, updated_at = now() where path = 'pacientes/' || patient_id;
  if not found then raise exception 'Write denied'; end if;
end $$;
revoke all on function public.save_manager_patient_observation(text,jsonb,jsonb) from public, anon;
grant execute on function public.save_manager_patient_observation(text,jsonb,jsonb) to authenticated;

create or replace function public.import_documents(documents jsonb) returns void
language plpgsql security invoker set search_path = public
as $$
begin
 if jsonb_typeof(documents) <> 'array' then raise exception 'Expected document array'; end if;
 insert into public.app_documents(path,data) select r->>'path', r->'data' from jsonb_array_elements(documents) r;
end $$;
revoke all on function public.import_documents(jsonb) from public, anon, authenticated;
grant execute on function public.import_documents(jsonb) to service_role;

-- Protect relational tables from anonymous access while allowing authenticated and service_role access
do $$ declare t text; begin
 foreach t in array array['usuario','area','microarea','controle_carga','paciente','atendimento','afericao_pressao','afericao_medidas','comorbidade','paciente_comorbidade','acao_paciente','observacao_gerente_paciente','parametros_dcnt'] loop
  if to_regclass('public.' || t) is not null then
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', t);
  end if;
 end loop;
 grant usage, select on all sequences in schema public to authenticated, service_role;
end $$;

-- ==============================================================================
-- 5. CONTAS DE ACESSO RÁPIDO PARA HOMOLOGAÇÃO / TESTES (SUPABASE AUTH + PERFIS)
-- ==============================================================================
do $$
declare
  r record;
  v_uid uuid;
  v_encrypted_pw text;
begin
  if to_regclass('auth.users') is not null and to_regclass('auth.identities') is not null then
    create extension if not exists pgcrypto with schema extensions;
    v_encrypted_pw := extensions.crypt('Admin@123456', extensions.gen_salt('bf'));

    insert into public.app_documents (path, data, updated_at)
    values (
      'unidades/USF-003',
      jsonb_build_object(
        'id', 'USF-003',
        'codigo', 'USF-003',
        'nome', 'USF Arrozal 3',
        'nomeNormalizado', 'usf arrozal 3',
        'cnes', '2270986',
        'tipo', 'USF',
        'ativo', true
      ),
      now()
    )
    on conflict (path) do update
      set data = public.app_documents.data || excluded.data,
          updated_at = now();

    for r in
      select * from (values
        ('11111111-1111-1111-1111-111111111111'::uuid, 'admin@dcntsaude.gov.br',   'Administrador Sistema',   'ADMIN',   null),
        ('22222222-2222-2222-2222-222222222222'::uuid, 'gerente@dcntsaude.gov.br', 'Gerente USF Arrozal 3',   'GERENTE', 'USF-003'),
        ('33333333-3333-3333-3333-333333333333'::uuid, 'acs@dcntsaude.gov.br',     'Ana Maria Souza (ACS)',   'ACS',     'USF-003')
      ) as t(default_uid, email, nome, perfil, unidade_id)
    loop
      select id into v_uid from auth.users where lower(email) = lower(r.email) limit 1;

      if v_uid is null then
        v_uid := r.default_uid;
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, email_change,
          email_change_token_new, recovery_token
        ) values (
          '00000000-0000-0000-0000-000000000000',
          v_uid,
          'authenticated',
          'authenticated',
          r.email,
          v_encrypted_pw,
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('nome', r.nome),
          now(),
          now(),
          '', '', '', ''
        );
      else
        update auth.users
           set encrypted_password = v_encrypted_pw,
               email_confirmed_at = coalesce(email_confirmed_at, now()),
               raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb,
               raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', r.nome),
               confirmation_token = coalesce(confirmation_token, ''),
               email_change = coalesce(email_change, ''),
               email_change_token_new = coalesce(email_change_token_new, ''),
               recovery_token = coalesce(recovery_token, ''),
               updated_at = now()
         where id = v_uid;
      end if;

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        v_uid,
        v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', r.email, 'email_verified', true, 'phone_verified', false),
        'email',
        now(),
        now(),
        now()
      )
      on conflict (provider_id, provider) do update
        set user_id = excluded.user_id,
            identity_data = excluded.identity_data,
            updated_at = now();

      insert into public.app_documents (path, data, updated_at)
      values (
        'usuarios/' || v_uid::text,
        jsonb_build_object(
          'uid', v_uid::text,
          'authUid', v_uid::text,
          'authAtiva', true,
          'nome', r.nome,
          'email', r.email,
          'perfil', r.perfil,
          'unidadeId', r.unidade_id,
          'ativo', true,
          'updatedAt', now()
        ),
        now()
      )
      on conflict (path) do update
        set data = public.app_documents.data || excluded.data,
            updated_at = now();

      if r.perfil = 'ACS' then
        insert into public.app_documents (path, data, updated_at)
        values
          (
            'microareas/USF-003_56',
            jsonb_build_object(
              'id', 'USF-003_56',
              'unidadeId', 'USF-003',
              'codigo', '56',
              'nome', 'Microárea 56',
              'acsId', v_uid::text,
              'acsNome', r.nome,
              'tipoMicroarea', 'NORMAL',
              'ativo', true
            ),
            now()
          ),
          (
            'microareas/USF-003_01',
            jsonb_build_object(
              'id', 'USF-003_01',
              'unidadeId', 'USF-003',
              'codigo', '01',
              'nome', 'Microárea 01',
              'acsId', v_uid::text,
              'acsNome', r.nome,
              'tipoMicroarea', 'NORMAL',
              'ativo', true
            ),
            now()
          )
        on conflict (path) do update
          set data = public.app_documents.data || excluded.data,
              updated_at = now();
      end if;
    end loop;
  end if;
end $$;
commit;
