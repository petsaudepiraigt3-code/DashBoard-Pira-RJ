-- Canonical storage for complete application records in Supabase PostgreSQL.
-- Does not delete or overwrite the existing relational tables.
begin;
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
          and (m.data->>'codigo' = coalesce(p->>'microareaCodigo', regexp_replace(p->>'microarea', '\D', '', 'g')))
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
create or replace function public.import_documents(documents jsonb) returns void
language plpgsql security invoker set search_path = public
as $$
begin
 if jsonb_typeof(documents) <> 'array' then raise exception 'Expected document array'; end if;
 insert into public.app_documents(path,data) select r->>'path', r->'data' from jsonb_array_elements(documents) r;
end $$;
revoke all on function public.import_documents(jsonb) from public, anon, authenticated;
grant execute on function public.import_documents(jsonb) to service_role;
-- Earlier schema granted anonymous access to legacy tables. Keep the records but
-- stop browsers bypassing the canonical store's scope rules through those tables.
do $$ declare t text; begin
 foreach t in array array['usuario','area','microarea','controle_carga','paciente','atendimento','afericao_pressao','afericao_medidas','comorbidade','paciente_comorbidade'] loop
  if to_regclass('public.' || t) is not null then
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on table public.%I to service_role', t);
  end if;
 end loop;
end $$;
commit;
