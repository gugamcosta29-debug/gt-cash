import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { filtrarPorDono, mesDe } from '../lib/calculos'
import { atualizarCotacoes, cotacoesSalvas } from '../lib/cotacoes'
import { hojeISO } from '../lib/formato'
import type { Cotacoes, Dados, Perfil, Tabela } from '../lib/tipos'
import type { Repositorio, Vinculo } from './repositorio'

export type Visao = 'eu' | 'parceiro' | 'nos'

interface Valor {
  repo: Repositorio
  dados: Dados
  meus: Dados
  todos: Dados
  perfis: Perfil[]
  perfisVisao: Perfil[]
  eu: Perfil
  vinculo: Vinculo
  visao: Visao
  setVisao: (v: Visao) => void
  somenteLeitura: boolean
  nomeDono: (dono: string) => string
  cot: Cotacoes
  hoje: string
  mes: string
  salvar: (fn: () => Promise<unknown>) => Promise<boolean>
  inserir: (t: Tabela, linhas: Record<string, unknown>[]) => Promise<boolean>
  atualizar: (t: Tabela, id: string, campos: Record<string, unknown>) => Promise<boolean>
  remover: (t: Tabela, id: string) => Promise<boolean>
  erro: string | null
  limparErro: () => void
  recarregar: () => Promise<void>
}

const Ctx = createContext<Valor | null>(null)
export const useApp = () => useContext(Ctx)!

const vazio: Dados = { contas: [], categorias: [], cartoes: [], contas_fixas: [], metas: [], lancamentos: [], orcamentos: [], investimentos: [] }

function traduzirErro(e: unknown) {
  const m = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo; nada foi salvo.'
  return m
}

export function ProvedorApp({ repo, children, carregando, falha }: {
  repo: Repositorio
  children: ReactNode
  carregando: ReactNode
  falha: (msg: string, tentar: () => void) => ReactNode
}) {
  const [estado, setEstado] = useState<{ dados: Dados; perfis: Perfil[]; vinculo: Vinculo } | null>(null)
  const [falhaCarga, setFalhaCarga] = useState<string | null>(null)
  const [visao, setVisao] = useState<Visao>('eu')
  const [cot, setCot] = useState<Cotacoes>(cotacoesSalvas)
  const [erro, setErro] = useState<string | null>(null)
  const hoje = hojeISO()

  const recarregar = useCallback(async () => {
    const r = await repo.carregar()
    setEstado(r)
    setFalhaCarga(null)
    if (!r.vinculo.parceiro) setVisao('eu')
    const moedas = r.dados.investimentos.flatMap((i) => (i.moeda_id ? [i.moeda_id] : []))
    atualizarCotacoes(moedas).then(setCot)
  }, [repo])

  useEffect(() => {
    recarregar().catch((e) => setFalhaCarga(traduzirErro(e)))
  }, [recarregar])

  const salvar = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await recarregar()
      setErro(null)
      return true
    } catch (e) {
      setErro(traduzirErro(e))
      return false
    }
  }, [recarregar])

  const valor = useMemo<Valor | null>(() => {
    if (!estado) return null
    const eu = estado.perfis.find((p) => p.id === repo.usuarioId)
      ?? { id: repo.usuarioId, nome: 'Eu', renda_prevista_cent: 0, meses_reserva: 6, teto_cripto_pct: 10 }
    const parceiro = estado.vinculo.parceiro
    const donos = visao === 'nos' && parceiro ? [eu.id, parceiro.id] : visao === 'parceiro' && parceiro ? [parceiro.id] : [eu.id]
    return {
      repo, eu, cot, hoje, erro, visao, setVisao, salvar, recarregar,
      mes: mesDe(hoje),
      dados: filtrarPorDono(estado.dados, donos),
      meus: filtrarPorDono(estado.dados, [eu.id]),
      todos: estado.dados ?? vazio,
      perfis: estado.perfis,
      perfisVisao: estado.perfis.filter((p) => donos.includes(p.id)),
      vinculo: estado.vinculo,
      somenteLeitura: visao === 'parceiro',
      nomeDono: (dono) => (dono === eu.id ? 'Você' : parceiro?.nome ?? 'Parceiro(a)'),
      inserir: (t, linhas) => salvar(() => repo.inserir(t, linhas)),
      atualizar: (t, id, campos) => salvar(() => repo.atualizar(t, id, campos)),
      remover: (t, id) => salvar(() => repo.remover(t, id)),
      limparErro: () => setErro(null),
    }
  }, [estado, visao, cot, hoje, erro, repo, salvar, recarregar])

  if (falhaCarga) return <>{falha(falhaCarga, () => { setFalhaCarga(null); recarregar().catch((e) => setFalhaCarga(traduzirErro(e))) })}</>
  if (!valor) return <>{carregando}</>
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
