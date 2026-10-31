// Roda supabase/schema.sql num Postgres real (PGlite) com auth e papéis imitando o Supabase.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const db = new PGlite()

async function como<T>(usuario: string | null, fn: () => Promise<T>) {
  await db.exec(`set role ${usuario ? 'authenticated' : 'anon'}; set app.uid = '${usuario ?? ''}';`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}
const nomes = async () => (await db.query<{ nome: string }>('select nome from contas order by nome')).rows.map((r) => r.nome)

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant select on auth.users to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await db.exec(`insert into auth.users (id, raw_user_meta_data) values
    ('${A}', '{"nome":"Ana"}'), ('${B}', '{"nome":"Beto"}'), ('${C}', '{"nome":"Caio"}');`)
  for (const [u, nome] of [[A, 'conta-a'], [B, 'conta-b'], [C, 'conta-c']]) {
    await como(u, () => db.query(`insert into contas (nome) values ($1)`, [nome]))
  }
})

describe('sem vínculo', () => {
  it('conta nova nasce com perfil e categorias', async () => {
    await como(A, async () => {
      const p = await db.query<{ nome: string }>('select nome from perfis')
      expect(p.rows).toEqual([{ nome: 'Ana' }])
      const c = await db.query('select 1 from categorias')
      expect(c.rows.length).toBe(15)
    })
  })
  it('cada um lê só o seu', async () => {
    expect(await como(A, nomes)).toEqual(['conta-a'])
    expect(await como(B, nomes)).toEqual(['conta-b'])
  })
  it('sem login não lê nada', async () => {
    await expect(como(null, nomes)).rejects.toThrow(/permission denied/)
  })
  it('não dá para gravar em nome de outro', async () => {
    await expect(como(A, () => db.query(`insert into contas (dono, nome) values ($1, 'falsa')`, [B]))).rejects.toThrow(/row-level security/)
  })
  it('não dá para forjar vínculo direto na tabela', async () => {
    await expect(como(A, () => db.query(
      `insert into vinculos (codigo, convidante, convidado, aceito_em) values ('X', $1, $2, now())`, [A, B],
    ))).rejects.toThrow(/row-level security/)
    expect(await como(A, nomes)).toEqual(['conta-a'])
  })
})

describe('convite e vínculo', () => {
  let codigo = ''
  it('quem gera o código não pode aceitar o próprio', async () => {
    codigo = await como(A, async () => (await db.query<{ c: string }>('select gerar_convite() c')).rows[0].c)
    await expect(como(A, () => db.query('select aceitar_convite($1)', [codigo]))).rejects.toThrow(/gerado por você/)
  })
  it('gerar o convite ainda não libera nada', async () => {
    expect(await como(B, nomes)).toEqual(['conta-b'])
  })
  it('código errado é recusado', async () => {
    await expect(como(B, () => db.query(`select aceitar_convite('NAOEXISTE')`))).rejects.toThrow(/inválido/)
  })
  it('com vínculo, os dois leem tudo; um terceiro continua fora', async () => {
    await como(B, () => db.query('select aceitar_convite($1)', [codigo.toLowerCase()]))
    expect(await como(A, nomes)).toEqual(['conta-a', 'conta-b'])
    expect(await como(B, nomes)).toEqual(['conta-a', 'conta-b'])
    expect(await como(C, nomes)).toEqual(['conta-c'])
    const perfis = await como(A, () => db.query('select nome from perfis order by nome'))
    expect(perfis.rows).toEqual([{ nome: 'Ana' }, { nome: 'Beto' }])
  })
  it('o parceiro lê mas não altera nem apaga', async () => {
    await como(A, async () => {
      const u = await db.query(`update contas set nome = 'hackeada' where nome = 'conta-b'`)
      expect(u.affectedRows).toBe(0)
      const d = await db.query(`delete from contas where nome = 'conta-b'`)
      expect(d.affectedRows).toBe(0)
      const p = await db.query(`update perfis set nome = 'x' where id = $1`, [B])
      expect(p.affectedRows).toBe(0)
    })
    expect(await como(B, nomes)).toContain('conta-b')
  })
  it('não dá para mudar o dono de uma linha para o parceiro', async () => {
    await expect(como(A, () => db.query(`update contas set dono = $1 where nome = 'conta-a'`, [B]))).rejects.toThrow(/row-level security/)
  })
  it('quem já tem vínculo não aceita outro convite', async () => {
    const novo = await como(C, async () => (await db.query<{ c: string }>('select gerar_convite() c')).rows[0].c)
    await expect(como(A, () => db.query('select aceitar_convite($1)', [novo]))).rejects.toThrow(/já tem um vínculo/)
  })
  it('depois de desvincular, o acesso acaba para os dois', async () => {
    await como(B, () => db.query('select desvincular()'))
    expect(await como(A, nomes)).toEqual(['conta-a'])
    expect(await como(B, nomes)).toEqual(['conta-b'])
  })
})
