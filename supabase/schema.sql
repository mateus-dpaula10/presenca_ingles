-- Presença: banco no Supabase (plano gratuito).
-- Rode este arquivo inteiro no SQL Editor do projeto (Database → SQL Editor → New query → Run).
-- Pode rodar de novo sem quebrar nada: tudo usa "if not exists" / "or replace" / "drop ... if exists".
--
-- Tudo fica no schema "presenca": o app divide o projeto "apps" do Supabase (vujhnbiohitufdjpdbvq) com a Caderneta
-- (schema "caderneta" + views-ponte no "public") e o Treinos (schema "treinos"). Nada aqui cria ou altera objeto
-- do public, do caderneta nem do treinos. Coisas fora do schema: as tabelas presenca.* entram na publicação
-- "supabase_realtime" (tempo real) e um gatilho em auth.users põe na lista do Presença quem se cadastra por ele.
-- As contas (auth.users) são do projeto inteiro, mas o Presença tem a PRÓPRIA lista de usuários (presenca.usuarios):
-- quem tem conta só na Caderneta/Treinos não usa o Presença. Limite do Supabase: o mesmo e-mail é a mesma conta
-- (mesma senha) em todos os apps do projeto, então para usar o Presença com outra senha é preciso outro e-mail.
-- O RLS é ligado aqui de forma explícita (o "ensure_rls" automático do Supabase só cobre o schema public).
-- Depois de rodar: Project Settings → Data API → Exposed schemas → adicionar "presenca" (senão o app não enxerga).
-- Para desfazer tudo: drop schema presenca cascade; (leva junto o gatilho e tira as tabelas da publicação; não toca
-- no resto).
--
-- Não há papéis: cada usuário do Presença só lê e grava as PRÓPRIAS linhas (dono = auth.uid()).

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

-- ---------- Usuários do Presença ----------
-- Só quem está aqui usa o app. Entra sozinho quem cria a conta pelo Presença (gatilho abaixo); conta que já existia
-- no projeto entra pelo SQL do fim deste arquivo. O app só lê a própria linha, para saber se a conta é do Presença.
create table if not exists presenca.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  criado_em timestamptz not null default now()
);

create or replace function presenca.eh_usuario() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from presenca.usuarios where id = (select auth.uid())) $$;
revoke all on function presenca.eh_usuario() from public, anon;
grant execute on function presenca.eh_usuario() to authenticated, service_role;

-- Cadastro feito pelo app (signUp com data.app = 'presenca'): entra na lista. Cadastro dos outros apps passa direto.
create or replace function presenca.novo_usuario() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'app' = 'presenca' then
    insert into presenca.usuarios (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  end if;
  return new;
end $$;
revoke all on function presenca.novo_usuario() from public, anon, authenticated;

drop trigger if exists presenca_novo_usuario on auth.users;
create trigger presenca_novo_usuario after insert on auth.users
  for each row execute function presenca.novo_usuario();

-- ---------- Acesso ----------
alter table presenca.usuarios enable row level security;
alter table presenca.dias enable row level security;
alter table presenca.ajustes enable row level security;

drop policy if exists "usuarios: a própria linha" on presenca.usuarios;
create policy "usuarios: a própria linha" on presenca.usuarios for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "dias: só o dono" on presenca.dias;
create policy "dias: só o dono" on presenca.dias for all to authenticated
  using (dono = (select auth.uid()) and (select presenca.eh_usuario()))
  with check (dono = (select auth.uid()) and (select presenca.eh_usuario()));

drop policy if exists "ajustes: só o dono" on presenca.ajustes;
create policy "ajustes: só o dono" on presenca.ajustes for all to authenticated
  using (dono = (select auth.uid()) and (select presenca.eh_usuario()))
  with check (dono = (select auth.uid()) and (select presenca.eh_usuario()));

-- Permissão explícita (funciona mesmo com "Automatically expose new tables" desligado no projeto).
revoke all on presenca.usuarios, presenca.dias, presenca.ajustes from anon;
revoke all on presenca.usuarios from authenticated;
grant select on presenca.usuarios to authenticated; -- a lista só muda pelo gatilho ou pelo SQL Editor
grant select, insert, update, delete on presenca.dias, presenca.ajustes to authenticated;
-- Manutenção com a chave de administrador (mesmo padrão do Treinos); o app nunca usa a service_role.
grant all on presenca.usuarios, presenca.dias, presenca.ajustes to service_role;

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

-- ---------- Contas que já existiam no projeto ----------
-- Quem já tinha conta (Caderneta/Treinos) não entra sozinho: para liberar o Presença a uma delas, rode a linha
-- abaixo trocando o e-mail. Para tirar alguém: delete from presenca.usuarios where email = '...';
insert into presenca.usuarios (id, email)
  select id, email from auth.users where email = 'mateus.dpaula10@gmail.com'
  on conflict (id) do nothing;
