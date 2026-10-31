import { hojeISO } from './formato'
import type { Cotacoes } from './tipos'

const CHAVE = 'folga-cotacoes'

export function cotacoesSalvas(): Cotacoes {
  try {
    const s = localStorage.getItem(CHAVE)
    if (s) return JSON.parse(s)
  } catch { /* sem armazenamento: começa vazio */ }
  return { cdi: null, cdiData: null, precos: {}, precosData: null }
}

function salvar(c: Cotacoes) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)) } catch { /* só perde o último valor */ }
}

// Falha de rede mantém o último valor salvo; a tela mostra a data dele.
export async function atualizarCotacoes(moedas: string[]): Promise<Cotacoes> {
  const atual = cotacoesSalvas()
  const hoje = hojeISO()
  if (atual.cdiData !== hoje) {
    try {
      const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json')
      if (r.ok) {
        const [ultimo] = (await r.json()) as { valor: string }[]
        const cdi = parseFloat(ultimo.valor.replace(',', '.'))
        if (Number.isFinite(cdi)) { atual.cdi = cdi; atual.cdiData = hoje }
      }
    } catch { /* mantém o último */ }
  }
  const faltando = moedas.some((m) => atual.precos[m] === undefined)
  if (moedas.length && (atual.precosData !== hoje || faltando)) {
    try {
      const ids = encodeURIComponent([...new Set(moedas)].join(','))
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl`)
      if (r.ok) {
        const j = (await r.json()) as Record<string, { brl?: number }>
        for (const [k, v] of Object.entries(j)) if (typeof v.brl === 'number') atual.precos[k] = v.brl
        atual.precosData = hoje
      }
    } catch { /* mantém o último */ }
  }
  salvar(atual)
  return atual
}

export const MOEDAS = [
  { id: 'bitcoin', nome: 'Bitcoin' },
  { id: 'ethereum', nome: 'Ethereum' },
  { id: 'solana', nome: 'Solana' },
  { id: 'binancecoin', nome: 'BNB' },
  { id: 'ripple', nome: 'XRP' },
  { id: 'cardano', nome: 'Cardano' },
  { id: 'tether', nome: 'Tether (USDT)' },
]
