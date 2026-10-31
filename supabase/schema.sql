-- G&T Cash: rode este arquivo inteiro uma vez no SQL Editor do Supabase.
-- Regra de permissão: cada um lê e altera o que é seu; o parceiro vinculado só lê.

create table perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default 'Eu',
  renda_prevista_cent bigint not null default 0 check (renda_prevista_cent >= 0),
  meses_reserva int not null default 6 check (meses_reserva between 1 and 24),
  teto_cripto_pct int not null default 10 check (teto_cripto_pct between 0 and 100),
  criado_em timestamptz not null default now()
);

create table vinculos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  convidante uuid not null references auth.users (id) on delete cascade,
  convidado uuid references auth.users (id) on delete cascade,
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  encerrado_em timestamptz,
  check (convidante <> convidado)
);

create table contas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  tipo text not null default 'corrente' check (tipo in ('corrente', 'poupanca', 'carteira', 'outra')),
  saldo_inicial_cent bigint not null default 0
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('despesa', 'receita')),
  unique (dono, nome, tipo)
);

create table cartoes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  limite_cent bigint not null default 0 check (limite_cent >= 0),
  dia_fechamento int not null check (dia_fechamento between 1 and 31),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  paga_ate text check (paga_ate ~ '^\d{4}-\d{2}$')
);

create table contas_fixas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  valor_cent bigint not null check (valor_cent >= 0),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  categoria text not null,
  assinatura boolean not null default false,
  ativa boolean not null default true,
  conta_id uuid references contas (id) on delete set null
);

create table metas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  alvo_cent bigint not null check (alvo_cent > 0),
  guardado_inicial_cent bigint not null default 0 check (guardado_inicial_cent >= 0),
  prazo date
);

create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  descricao text not null,
  valor_cent bigint not null check (valor_cent > 0),
  tipo text not null check (tipo in ('despesa', 'receita', 'guardado', 'transferencia')),
  entrada boolean not null default false,
  categoria text,
  conta_id uuid references contas (id) on delete set null,
  cartao_id uuid references cartoes (id) on delete cascade,
  fatura_mes text check (fatura_mes ~ '^\d{4}-\d{2}$'),
  parcela_grupo uuid,
  parcela_num int,
  parcela_total int,
  fixa_id uuid references contas_fixas (id) on delete set null,
  fixa_mes text check (fixa_mes ~ '^\d{4}-\d{2}$'),
  meta_id uuid references metas (id) on delete set null,
  import_hash text,
  criado_em timestamptz not null default now(),
  unique (dono, import_hash)
);
create index lancamentos_dono_data on lancamentos (dono, data desc);

create table orcamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria text not null,
  limite_cent bigint not null check (limite_cent > 0),
  unique (dono, categoria)
);

create table investimentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('cdb', 'tesouro', 'caixinha', 'cripto', 'outro')),
  nome text not null,
  data date not null,
  valor_cent bigint not null check (valor_cent >= 0),
  pct_cdi numeric,
  vencimento date,
  moeda_id text,
  quantidade numeric,
  e_reserva boolean not null default false
);

-- A RLS abaixo decide quais linhas; aqui só garante o acesso às tabelas pela API.
grant select, insert, update, delete on contas, categorias, cartoes, contas_fixas, metas, lancamentos, orcamentos, investimentos to authenticated;
grant select, update on perfis to authenticated;
grant select on vinculos to authenticated;
-- O Supabase ainda concede estes por padrão, e TRUNCATE não passa pela RLS.
revoke all on perfis, vinculos, contas, categorias, cartoes, contas_fixas, metas, lancamentos, orcamentos, investimentos from anon;
revoke truncate, references, trigger on perfis, vinculos, contas, categorias, cartoes, contas_fixas, metas, lancamentos, orcamentos, investimentos from authenticated;

-- Devolve o parceiro com vínculo ativo. security definer para não recair na RLS de vinculos.
create function parceiro_de(usuario uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when v.convidante = usuario then v.convidado else v.convidante end
  from vinculos v
  where (v.convidante = usuario or v.convidado = usuario)
    and v.aceito_em is not null and v.encerrado_em is null
  limit 1
$$;

create function pode_ler(dono_linha uuid) returns boolean
language sql stable as $$
  select dono_linha = auth.uid() or dono_linha = parceiro_de(auth.uid())
$$;

alter table perfis enable row level security;
create policy ler on perfis for select to authenticated using (pode_ler(id));
create policy editar on perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table vinculos enable row level security;
create policy ler on vinculos for select to authenticated
  using (convidante = auth.uid() or convidado = auth.uid());
-- Sem política de escrita: convites só mudam pelas funções abaixo.

do $$
declare t text;
begin
  foreach t in array array['contas', 'categorias', 'cartoes', 'contas_fixas', 'metas', 'lancamentos', 'orcamentos', 'investimentos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy ler on %I for select to authenticated using (pode_ler(dono))', t);
    execute format('create policy criar on %I for insert to authenticated with check (dono = auth.uid())', t);
    execute format('create policy editar on %I for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid())', t);
    execute format('create policy apagar on %I for delete to authenticated using (dono = auth.uid())', t);
  end loop;
end $$;

create function gerar_convite() returns text
language plpgsql security definer set search_path = public as $$
declare novo text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if parceiro_de(auth.uid()) is not null then raise exception 'Você já tem um vínculo ativo.'; end if;
  delete from vinculos where convidante = auth.uid() and aceito_em is null;
  novo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into vinculos (codigo, convidante) values (novo, auth.uid());
  return novo;
end $$;

create function aceitar_convite(codigo_informado text) returns void
language plpgsql security definer set search_path = public as $$
declare v vinculos;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if parceiro_de(auth.uid()) is not null then raise exception 'Você já tem um vínculo ativo.'; end if;
  select * into v from vinculos
    where codigo = upper(trim(codigo_informado)) and aceito_em is null and encerrado_em is null and expira_em > now()
    for update;
  if not found then raise exception 'Código inválido ou vencido. Peça um novo código.'; end if;
  if v.convidante = auth.uid() then raise exception 'Esse código foi gerado por você. Quem digita é a outra pessoa.'; end if;
  if parceiro_de(v.convidante) is not null then raise exception 'Quem gerou esse código já tem um vínculo ativo.'; end if;
  update vinculos set convidado = auth.uid(), aceito_em = now() where id = v.id;
end $$;

create function desvincular() returns void
language sql security definer set search_path = public as $$
  update vinculos set encerrado_em = now()
  where (convidante = auth.uid() or convidado = auth.uid())
    and aceito_em is not null and encerrado_em is null
$$;

revoke execute on function gerar_convite(), aceitar_convite(text), desvincular(), parceiro_de(uuid) from public, anon;
grant execute on function gerar_convite(), aceitar_convite(text), desvincular(), parceiro_de(uuid), pode_ler(uuid) to authenticated;

-- Conta nova já nasce com perfil e categorias padrão.
create function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome) values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', 'Eu'));
  insert into categorias (dono, nome, tipo)
    select new.id, c, 'despesa' from unnest(array[
      'Moradia', 'Mercado', 'Transporte', 'Contas da casa', 'Saúde', 'Lazer',
      'Restaurantes', 'Assinaturas', 'Educação', 'Roupas', 'Outros'
    ]) c;
  insert into categorias (dono, nome, tipo)
    select new.id, c, 'receita' from unnest(array['Salário', 'Trabalho extra', 'Vendas', 'Outros']) c;
  return new;
end $$;
revoke execute on function novo_usuario() from public, anon, authenticated;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function novo_usuario();

-- Bot do Telegram: liga cada ID do Telegram a uma conta. Só a função do bot acessa, com a chave de serviço.
create table telegram_usuarios (
  telegram_id bigint primary key,
  dono uuid not null unique references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table telegram_usuarios enable row level security;
revoke all on telegram_usuarios from anon, authenticated;
grant select on telegram_usuarios, cartoes, contas, categorias to service_role;
grant select, insert, delete on lancamentos to service_role;
