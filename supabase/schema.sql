-- Presença: banco no Supabase (plano gratuito).
-- Rode este arquivo inteiro no SQL Editor do projeto (Database → SQL Editor → New query → Run).
-- Pode rodar de novo sem quebrar nada: tudo usa "if not exists" / "or replace" / "drop ... if exists".
--
-- Tudo fica no schema "presenca": o app divide o projeto "apps" do Supabase (vujhnbiohitufdjpdbvq) com a Caderneta
-- (schema "caderneta" + views-ponte no "public") e o Treinos (schema "treinos"). Nada aqui cria ou altera objeto
-- do public, do caderneta nem do treinos. Única coisa fora do schema: as tabelas presenca.* entram na publicação
-- "supabase_realtime" (tempo real).
-- O login (auth.users) é o mesmo do projeto: quem já tem conta na Caderneta/Treinos entra com a mesma senha.
-- O RLS é ligado aqui de forma explícita (o "ensure_rls" automático do Supabase só cobre o schema public).
-- Depois de rodar: Project Settings → Data API → Exposed schemas → adicionar "presenca" (senão o app não enxerga).
-- Para desfazer tudo: drop schema presenca cascade; (tira as tabelas da publicação junto; não toca no resto).
--
-- Não há papéis: cada conta só lê e grava as PRÓPRIAS linhas (dono = auth.uid()).

create schema if not exists presenca;
grant usage on schema presenca to authenticated, service_role;
revoke all on schema presenca from anon;

-- ---------- Dias marcados ----------
-- Uma linha por dia: presença na aula ou evento da empresa (o evento sai da conta da porcentagem).
-- Dia sem linha: se for dia de aula e já passou, é falta; senão, não conta.
create table if not exists presenca.dias (
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('presenca', 'evento')),
  nota text not null default '' check (length(nota) <= 80),
  atualizado_em timestamptz not null default now(),
  primary key (dono, data)
);

-- ---------- Ajustes (um por pessoa) ----------
create table if not exists presenca.ajustes (
  dono uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dias_aula smallint[] not null default '{1,2,3,4,5}' check (dias_aula <@ '{0,1,2,3,4,5,6}'::smallint[]),
  meta smallint not null default 75 check (meta between 0 and 100),
  inicio date,
  atualizado_em timestamptz not null default now()
);

-- ---------- Acesso ----------
alter table presenca.dias enable row level security;
alter table presenca.ajustes enable row level security;

drop policy if exists "dias: só o dono" on presenca.dias;
create policy "dias: só o dono" on presenca.dias for all to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

drop policy if exists "ajustes: só o dono" on presenca.ajustes;
create policy "ajustes: só o dono" on presenca.ajustes for all to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

-- Permissão explícita (funciona mesmo com "Automatically expose new tables" desligado no projeto).
revoke all on presenca.dias, presenca.ajustes from anon;
grant select, insert, update, delete on presenca.dias, presenca.ajustes to authenticated;
-- Manutenção com a chave de administrador (mesmo padrão do Treinos); o app nunca usa a service_role.
grant all on presenca.dias, presenca.ajustes to service_role;

-- ---------- Tempo real (outro aparelho marcou um dia: este atualiza sozinho) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'presenca' and tablename = 'dias') then
    alter publication supabase_realtime add table presenca.dias;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'presenca' and tablename = 'ajustes') then
    alter publication supabase_realtime add table presenca.ajustes;
  end if;
end $$;
