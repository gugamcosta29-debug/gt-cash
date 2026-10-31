// Entende mensagens curtas como "mercado 45,90" ou "tênis 600 em 3x no Nubank".
// Na dúvida devolve 'duvida': o bot pergunta em vez de lançar errado.
export type Interpretacao =
  | { acao: 'ajuda' }
  | { acao: 'desfazer' }
  | { acao: 'duvida'; motivo: string }
  | {
      acao: 'lancar'; tipo: 'despesa' | 'receita'; valor_cent: number; descricao: string; data: string
      parcelas: number; cartaoId: string | null; contaId: string | null
    }

interface Nomeado { id: string; nome: string }

const EXEMPLO = 'Tenta assim: "mercado 45,90" ou "tênis 600 em 3x no Nubank".'
const limpar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const CONECTIVOS = new Set(['de', 'do', 'da', 'no', 'na', 'em', 'com', 'o', 'a', 'um', 'uma', 'pra', 'para', 'pelo', 'pela', 'via', 'e'])
const VERBOS_GASTO = new Set(['gastei', 'paguei', 'comprei', 'compra', 'gasto'])
const VERBOS_RECEITA = new Set(['recebi', 'ganhei', 'entrou', 'caiu', 'recebido'])

function lerValor(token: string) {
  const m = /^(?:r\$)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/.exec(token)
  if (!m) return null
  const cent = Math.round(Number(m[1].includes(',') || /\.\d{3}/.test(m[1]) ? m[1].replace(/\./g, '').replace(',', '.') : m[1]) * 100)
  return cent > 0 ? cent : null
}

function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function lerData(token: string, hoje: string) {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token)
  if (!m) return null
  const ano = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : hoje.slice(0, 4)
  const data = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(`${data}T12:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) return null
  // "28/12" mandado em janeiro é do ano passado: gasto no futuro quase sempre é engano.
  return !m[3] && data > hoje ? `${Number(ano) - 1}${data.slice(4)}` : data
}

// Tira do texto o nome de um cartão ou conta, junto com o "no" que vier antes.
function acharNome(tokens: string[], itens: Nomeado[]) {
  const ordenados = [...itens].sort((a, b) => b.nome.length - a.nome.length)
  for (const item of ordenados) {
    const partes = limpar(item.nome).split(/\s+/).filter(Boolean)
    for (let i = 0; i + partes.length <= tokens.length; i++) {
      if (partes.every((p, j) => limpar(tokens[i + j]) === p)) {
        const inicio = i > 0 && CONECTIVOS.has(limpar(tokens[i - 1])) ? i - 1 : i
        return { item, resto: [...tokens.slice(0, inicio), ...tokens.slice(i + partes.length)] }
      }
    }
  }
  return null
}

export function interpretar(texto: string, ctx: { hoje: string; cartoes: Nomeado[]; contas: Nomeado[] }): Interpretacao {
  const bruto = texto.trim()
  const simples = limpar(bruto).replace(/[.!?]+$/, '')
  if (!bruto || /^\/(start|ajuda|help)\b/.test(simples) || simples === 'ajuda') return { acao: 'ajuda' }
  if (/^(\/desfazer|desfazer|desfaz|apaga( o)? ultimo|apagar( o)? ultimo)$/.test(simples)) return { acao: 'desfazer' }
  if (bruto.includes('\n')) return { acao: 'duvida', motivo: 'Manda um lançamento por mensagem.' }

  const preparado = bruto.replace(/^\+\s*/, '').replace(/r\$\s+/gi, 'R$').replace(/\b(\d{1,2})\s*(?:x|vezes)\b/gi, '$1x')
  let tokens = preparado.split(/\s+/).map((t) => t.replace(/[.,;:!?]+$/, '')).filter(Boolean)
  if (/^(transferi|transferencia|guardei)$/.test(limpar(tokens[0] ?? ''))) {
    return { acao: 'duvida', motivo: 'Transferência e dinheiro guardado eu ainda não lanço. Usa o app para esses.' }
  }

  let data = ctx.hoje
  let parcelas = 1
  let usaCartao = false
  const valores: number[] = []
  const resto: string[] = []
  for (const t of tokens) {
    const n = limpar(t)
    const parcela = /^(\d{1,2})x$/.exec(n)
    const dataLida = lerData(t, ctx.hoje)
    if (n === 'hoje') continue
    if (n === 'ontem') data = somarDias(ctx.hoje, -1)
    else if (n === 'anteontem') data = somarDias(ctx.hoje, -2)
    else if (dataLida) data = dataLida
    else if (/^\d{1,2}\/\d{1,2}/.test(t)) return { acao: 'duvida', motivo: `Não entendi a data "${t}". Usa o formato 25/10.` }
    else if (parcela) {
      parcelas = Number(parcela[1])
      if (resto.length && limpar(resto[resto.length - 1]) === 'em') resto.pop()
    } else if (n === 'cartao' || n === 'credito') {
      usaCartao = true
      while (resto.length && CONECTIVOS.has(limpar(resto[resto.length - 1]))) resto.pop()
    } else if (n === 'reais' || n === 'real' || n === 'r$') continue
    else {
      const v = lerValor(n)
      if (v) valores.push(v)
      else resto.push(t)
    }
  }
  if (valores.length === 0) return { acao: 'duvida', motivo: `Não achei o valor. ${EXEMPLO}` }
  if (valores.length > 1) return { acao: 'duvida', motivo: `Achei mais de um valor na mensagem. Manda um lançamento por vez. ${EXEMPLO}` }
  if (parcelas < 1 || parcelas > 24) return { acao: 'duvida', motivo: 'Parcelo de 1x até 24x.' }

  tokens = resto
  const cartao = acharNome(tokens, ctx.cartoes)
  if (cartao) tokens = cartao.resto
  const conta = cartao ? null : acharNome(tokens, ctx.contas)
  if (conta) tokens = conta.resto

  const primeira = limpar(tokens[0] ?? '')
  const receita = VERBOS_RECEITA.has(primeira) || bruto.startsWith('+') || /^(salario|pagamento recebido)/.test(limpar(tokens.join(' ')))
  if (VERBOS_GASTO.has(primeira) || VERBOS_RECEITA.has(primeira)) tokens = tokens.slice(1)
  while (tokens.length && CONECTIVOS.has(limpar(tokens[0]))) tokens = tokens.slice(1)
  while (tokens.length && CONECTIVOS.has(limpar(tokens[tokens.length - 1]))) tokens = tokens.slice(0, -1)
  const descricao = tokens.join(' ').slice(0, 120)
  if (!descricao) return { acao: 'duvida', motivo: `Faltou dizer o que foi. ${EXEMPLO}` }

  let cartaoId = cartao?.item.id ?? null
  if (!receita && !cartaoId && (usaCartao || parcelas > 1)) {
    if (ctx.cartoes.length !== 1) {
      const nomes = ctx.cartoes.map((c) => c.nome).join(', ')
      return { acao: 'duvida', motivo: nomes ? `Em qual cartão? Tenho: ${nomes}.` : 'Ainda não tem cartão cadastrado no app.' }
    }
    cartaoId = ctx.cartoes[0].id
  }
  if (receita && cartaoId) return { acao: 'duvida', motivo: 'Entrada de dinheiro não vai em cartão. Diz a conta ou tira o cartão da mensagem.' }

  return {
    acao: 'lancar', tipo: receita ? 'receita' : 'despesa', valor_cent: valores[0],
    descricao: descricao[0].toUpperCase() + descricao.slice(1), data,
    parcelas: cartaoId ? parcelas : 1, cartaoId, contaId: conta?.item.id ?? (cartaoId ? null : ctx.contas[0]?.id ?? null),
  }
}
