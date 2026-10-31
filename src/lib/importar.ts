import { paraCentavos } from './formato'

export interface LinhaExtrato {
  data: string
  descricao: string
  valor_cent: number
  hash: string
}

// Bancos brasileiros costumam exportar em Windows-1252.
export function decodificar(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function hashTexto(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const tag = (bloco: string, nome: string) =>
  bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))?.[1].trim() ?? ''

export function lerOFX(texto: string): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = []
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? []
  for (const b of blocos) {
    const bruto = tag(b, 'DTPOSTED')
    const valor = paraCentavos(tag(b, 'TRNAMT'))
    if (bruto.length < 8 || valor === null || valor === 0) continue
    const data = `${bruto.slice(0, 4)}-${bruto.slice(4, 6)}-${bruto.slice(6, 8)}`
    const descricao = tag(b, 'MEMO') || tag(b, 'NAME') || 'Sem descrição'
    const fitid = tag(b, 'FITID')
    linhas.push({
      data, descricao, valor_cent: valor,
      hash: fitid ? `ofx:${fitid}` : `ofx:${hashTexto(`${data}|${valor}|${descricao}`)}`,
    })
  }
  return numerarRepetidos(linhas)
}

// Duas compras iguais no mesmo dia são reais: a segunda recebe um índice, em vez de sumir como duplicata.
function numerarRepetidos(linhas: LinhaExtrato[]) {
  const vistos = new Map<string, number>()
  return linhas.map((l) => {
    const n = vistos.get(l.hash) ?? 0
    vistos.set(l.hash, n + 1)
    return n ? { ...l, hash: `${l.hash}#${n}` } : l
  })
}

function separarCSV(linha: string, sep: string) {
  const campos: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++ } else aspas = !aspas
    } else if (c === sep && !aspas) {
      campos.push(atual.trim())
      atual = ''
    } else atual += c
  }
  campos.push(atual.trim())
  return campos
}

export interface TabelaCSV {
  cabecalho: string[]
  linhas: string[][]
  colData: number
  colDescricao: number
  colValor: number
}

export function lerCSV(texto: string): TabelaCSV | null {
  const crus = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (crus.length < 2) return null
  const contar = (ch: string) => crus[0].split(ch).length
  const sep = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0]
  const cabecalho = separarCSV(crus[0], sep)
  const linhas = crus.slice(1).map((l) => separarCSV(l, sep))
  const achar = (re: RegExp) => cabecalho.findIndex((c) => re.test(c.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  return {
    cabecalho, linhas,
    colData: achar(/data|date/i),
    colDescricao: achar(/descri|histor|memo|lancamento|title|estabelec/i),
    colValor: achar(/valor|amount|quantia/i),
  }
}

export function dataParaISO(texto: string): string | null {
  const t = texto.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

export function linhasDoCSV(t: TabelaCSV, colData: number, colDescricao: number, colValor: number): LinhaExtrato[] {
  const saida: LinhaExtrato[] = []
  for (const l of t.linhas) {
    const data = dataParaISO(l[colData] ?? '')
    const valor = paraCentavos(l[colValor] ?? '')
    if (!data || valor === null || valor === 0) continue
    const descricao = l[colDescricao] || 'Sem descrição'
    saida.push({ data, descricao, valor_cent: valor, hash: `csv:${hashTexto(`${data}|${valor}|${descricao}`)}` })
  }
  return numerarRepetidos(saida)
}

const SUGESTOES: [RegExp, string][] = [
  [/mercado|supermerc|atacad|hortifr|padaria|acougue/, 'Mercado'],
  [/uber|99 ?app|99 ?pop|posto|combust|gasolina|onibus|estacion|pedagio/, 'Transporte'],
  [/ifood|restaurante|lanchonete|pizza|burger|bar /, 'Restaurantes'],
  [/farmacia|drogaria|hospital|clinica|medic|academia/, 'Saúde'],
  [/netflix|spotify|prime video|disney|youtube|hbo|max\b|apple\.com|google one/, 'Assinaturas'],
  [/aluguel|condominio|iptu/, 'Moradia'],
  [/energia|celesc|luz|agua|casan|internet|vivo|claro|tim\b|oi\b/, 'Contas da casa'],
  [/escola|faculdade|curso|livraria/, 'Educação'],
  [/cinema|ingresso|show|steam|playstation/, 'Lazer'],
  [/renner|riachuelo|c&a|zara|shein|calcado/, 'Roupas'],
]

// Só palpite para adiantar: a pessoa confere e troca na prévia.
export function sugerirCategoria(descricao: string, categorias: string[]) {
  const d = descricao.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const achada = SUGESTOES.find(([re, c]) => re.test(d) && categorias.includes(c))
  return achada?.[1] ?? 'Outros'
}

export function separarNovas(linhas: LinhaExtrato[], hashesExistentes: Iterable<string | null>) {
  const existentes = new Set(hashesExistentes)
  return {
    novas: linhas.filter((l) => !existentes.has(l.hash)),
    repetidas: linhas.filter((l) => existentes.has(l.hash)).length,
  }
}
