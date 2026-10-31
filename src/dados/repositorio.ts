import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Dados, Perfil, Tabela } from '../lib/tipos'
import { criarDadosExemplo, ID_EU, ID_PARCEIRO, PERFIS_EXEMPLO } from './exemplo'

export interface Vinculo {
  parceiro: Perfil | null
  convitePendente: string | null
}

export interface Repositorio {
  modo: 'exemplo' | 'nuvem'
  usuarioId: string
  carregar(): Promise<{ dados: Dados; perfis: Perfil[]; vinculo: Vinculo }>
  inserir(tabela: Tabela, linhas: Record<string, unknown>[]): Promise<void>
  atualizar(tabela: Tabela, id: string, campos: Record<string, unknown>): Promise<void>
  remover(tabela: Tabela, id: string): Promise<void>
  atualizarPerfil(campos: Partial<Perfil>): Promise<void>
  gerarConvite(): Promise<string>
  aceitarConvite(codigo: string): Promise<void>
  desvincular(): Promise<void>
  sair(): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const temNuvem = !!url && !!chave
export const supabase: SupabaseClient | null = temNuvem ? createClient(url!, chave!) : null

const TABELAS: Tabela[] = ['contas', 'categorias', 'cartoes', 'contas_fixas', 'metas', 'lancamentos', 'orcamentos', 'investimentos']

export function repositorioNuvem(usuarioId: string): Repositorio {
  const db = supabase!
  const checar = <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
    return r.data
  }
  return {
    modo: 'nuvem',
    usuarioId,
    async carregar() {
      const [listas, perfis, vinculos] = await Promise.all([
        Promise.all(TABELAS.map(async (t) => {
          // A API devolve no máximo 1000 linhas por vez; o histórico pode passar disso.
          const tudo: unknown[] = []
          for (let de = 0; ; de += 1000) {
            const pagina = checar(await db.from(t).select('*').order('id').range(de, de + 999)) as unknown[]
            tudo.push(...pagina)
            if (pagina.length < 1000) return tudo
          }
        })),
        db.from('perfis').select('*'),
        db.from('vinculos').select('*').is('encerrado_em', null),
      ])
      const dados = Object.fromEntries(TABELAS.map((t, i) => [t, listas[i]])) as unknown as Dados
      const lista = (checar(perfis) ?? []) as Perfil[]
      const vs = (checar(vinculos) ?? []) as { codigo: string; convidante: string; aceito_em: string | null; expira_em: string }[]
      const pendente = vs.find((v) => !v.aceito_em && v.convidante === usuarioId && Date.parse(v.expira_em) > Date.now())
      return {
        dados,
        perfis: lista,
        vinculo: {
          parceiro: lista.find((p) => p.id !== usuarioId) ?? null,
          convitePendente: pendente?.codigo ?? null,
        },
      }
    },
    async inserir(tabela, linhas) {
      const q = db.from(tabela)
      const comHash = linhas.some((l) => l.import_hash)
      checar(comHash
        ? await q.upsert(linhas, { onConflict: 'dono,import_hash', ignoreDuplicates: true })
        : await q.insert(linhas))
    },
    async atualizar(tabela, id, campos) { checar(await db.from(tabela).update(campos).eq('id', id)) },
    async remover(tabela, id) { checar(await db.from(tabela).delete().eq('id', id)) },
    async atualizarPerfil(campos) { checar(await db.from('perfis').update(campos).eq('id', usuarioId)) },
    async gerarConvite() { return checar(await db.rpc('gerar_convite')) as string },
    async aceitarConvite(codigo) { checar(await db.rpc('aceitar_convite', { codigo_informado: codigo })) },
    async desvincular() { checar(await db.rpc('desvincular')) },
    async sair() { await db.auth.signOut() },
  }
}

const CHAVE_EXEMPLO = 'folga-exemplo-v1'

// Modo de exemplo: dados fictícios só neste navegador, com a mesma regra da nuvem (o parceiro não se edita).
export function repositorioExemplo(aoSair: () => void): Repositorio {
  type Estado = { dados: Dados; perfis: Perfil[]; vinculado: boolean }
  const ler = (): Estado => {
    try {
      const s = localStorage.getItem(CHAVE_EXEMPLO)
      if (s) return JSON.parse(s)
    } catch { /* armazenamento bloqueado: segue com dados novos */ }
    return { dados: criarDadosExemplo(), perfis: PERFIS_EXEMPLO, vinculado: true }
  }
  let estado = ler()
  const salvar = () => {
    try { localStorage.setItem(CHAVE_EXEMPLO, JSON.stringify(estado)) } catch { /* só perde a persistência */ }
  }
  return {
    modo: 'exemplo',
    usuarioId: ID_EU,
    async carregar() {
      const dados = estado.vinculado ? estado.dados : Object.fromEntries(
        TABELAS.map((t) => [t, (estado.dados[t] as { dono: string }[]).filter((x) => x.dono === ID_EU)]),
      ) as unknown as Dados
      return {
        dados,
        perfis: estado.vinculado ? estado.perfis : estado.perfis.filter((p) => p.id === ID_EU),
        vinculo: {
          parceiro: estado.vinculado ? estado.perfis.find((p) => p.id === ID_PARCEIRO)! : null,
          convitePendente: null,
        },
      }
    },
    async inserir(tabela, linhas) {
      const lista = estado.dados[tabela] as unknown as Record<string, unknown>[]
      for (const l of linhas) {
        if (l.import_hash && lista.some((x) => x.dono === ID_EU && x.import_hash === l.import_hash)) continue
        lista.push({ id: crypto.randomUUID(), dono: ID_EU, ...l })
      }
      salvar()
    },
    async atualizar(tabela, id, campos) {
      const lista = estado.dados[tabela] as unknown as Record<string, unknown>[]
      const alvo = lista.find((x) => x.id === id && x.dono === ID_EU)
      if (!alvo) throw new Error('Só dá para editar o que é seu.')
      Object.assign(alvo, campos)
      salvar()
    },
    async remover(tabela, id) {
      const lista = estado.dados[tabela] as unknown as Record<string, unknown>[]
      const i = lista.findIndex((x) => x.id === id && x.dono === ID_EU)
      if (i < 0) throw new Error('Só dá para apagar o que é seu.')
      lista.splice(i, 1)
      salvar()
    },
    async atualizarPerfil(campos) {
      estado.perfis = estado.perfis.map((p) => (p.id === ID_EU ? { ...p, ...campos } : p))
      salvar()
    },
    async gerarConvite() { return 'EXEMPLO1' },
    async aceitarConvite(codigo) {
      if (codigo.trim().toUpperCase() !== 'EXEMPLO1') throw new Error('Código inválido ou vencido. Peça um novo código.')
      estado.vinculado = true
      salvar()
    },
    async desvincular() { estado.vinculado = false; salvar() },
    async sair() {
      try { localStorage.removeItem(CHAVE_EXEMPLO) } catch { /* nada a limpar */ }
      estado = { dados: criarDadosExemplo(), perfis: PERFIS_EXEMPLO, vinculado: true }
      aoSair()
    },
  }
}
