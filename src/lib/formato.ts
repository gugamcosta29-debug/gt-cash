const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moedaCurta = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

export const reais = (cent: number) => moeda.format(cent / 100).replace(/ /g, ' ')
export const reaisCurto = (cent: number) => moedaCurta.format(cent / 100).replace(/ /g, ' ')

// Aceita "1.234,56", "1234.56", "R$ 12,5" e negativos. Devolve null se não for número.
export function paraCentavos(texto: string): number | null {
  let t = texto.replace(/[R$\s ]/g, '')
  if (!t) return null
  const negativo = /^-|-$|^\(.*\)$/.test(t)
  t = t.replace(/[-()]/g, '')
  const virgula = t.lastIndexOf(',')
  const ponto = t.lastIndexOf('.')
  if (virgula > ponto) t = t.replace(/\./g, '').replace(',', '.')
  else if (ponto > virgula && virgula >= 0) t = t.replace(/,/g, '')
  else if (ponto >= 0 && virgula < 0 && t.split('.').length > 2) t = t.replace(/\./g, '')
  else if (ponto >= 0 && virgula < 0 && /^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '')
  if (!/^\d*\.?\d*$/.test(t) || t === '.' || !t) return null
  const cent = Math.round(parseFloat(t) * 100)
  return negativo ? -cent : cent
}

export const centavosParaCampo = (cent: number) => (cent / 100).toFixed(2).replace('.', ',')

export const hojeISO = (agora = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export const mesCurto = (mes: string) => {
  const [a, m] = mes.split('-')
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`
}
export const mesLongo = (mes: string) => {
  const [a, m] = mes.split('-')
  return `${MESES_LONGOS[Number(m) - 1]} de ${a}`
}
export const dataCurta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
export const dataBr = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
