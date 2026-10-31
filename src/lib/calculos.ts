import type { Cartao, Cotacoes, Dados, Fixa, Investimento, Lancamento, Perfil } from './tipos'

export const mesDe = (data: string) => data.slice(0, 7)

export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function diasNoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

// Dia 31 em fevereiro vira o último dia do mês.
export function dataNoMes(mes: string, dia: number) {
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, '0')}`
}

export function diferencaDias(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000)
}

// O mês em que o dinheiro sai: fatura para compra no cartão, data para o resto.
export const mesCaixa = (l: Lancamento) => l.fatura_mes ?? mesDe(l.data)

// Devolve o mês de vencimento da fatura em que a compra entra.
// Compra feita no dia do fechamento ou depois entra na fatura seguinte.
export function faturaDaCompra(data: string, cartao: Pick<Cartao, 'dia_fechamento' | 'dia_vencimento'>) {
  const mes = mesDe(data)
  const dia = Number(data.slice(8, 10))
  const fechamentoNoMes = Math.min(cartao.dia_fechamento, diasNoMes(mes))
  const mesFechamento = dia >= fechamentoNoMes ? somarMeses(mes, 1) : mes
  return cartao.dia_vencimento > cartao.dia_fechamento ? mesFechamento : somarMeses(mesFechamento, 1)
}

// Divide a compra em parcelas sem perder centavo: a sobra da divisão vai na primeira.
export function dividirParcelas(totalCent: number, n: number) {
  const base = Math.floor(totalCent / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + totalCent - base * n : base))
}

export function fixaPaga(f: Fixa, lancs: Lancamento[], mes: string) {
  return lancs.some((l) => l.fixa_id === f.id && l.fixa_mes === mes)
}

export interface ResumoMes {
  recebido: number
  previsto: number
  renda: number
  gastoAvista: number
  fatura: number
  fixasPendentes: number
  guardado: number
  disponivel: number
  diasRestantes: number
  porDia: number
}

export function resumoMes(dados: Dados, perfis: Perfil[], mes: string, hoje: string): ResumoMes {
  const doMes = dados.lancamentos.filter((l) => mesCaixa(l) === mes)
  const soma = (filtro: (l: Lancamento) => boolean) =>
    doMes.filter(filtro).reduce((t, l) => t + l.valor_cent, 0)
  const recebido = soma((l) => l.tipo === 'receita')
  const previsto = perfis.reduce((t, p) => t + p.renda_prevista_cent, 0)
  const renda = Math.max(recebido, previsto)
  const gastoAvista = soma((l) => l.tipo === 'despesa' && !l.cartao_id)
  const fatura = soma((l) => l.tipo === 'despesa' && !!l.cartao_id)
  const guardado = soma((l) => l.tipo === 'guardado')
  const fixasPendentes = dados.contas_fixas
    .filter((f) => f.ativa && !fixaPaga(f, dados.lancamentos, mes))
    .reduce((t, f) => t + f.valor_cent, 0)
  const disponivel = renda - gastoAvista - fatura - fixasPendentes - guardado
  const diasRestantes =
    mesDe(hoje) === mes ? diasNoMes(mes) - Number(hoje.slice(8, 10)) + 1 : diasNoMes(mes)
  return {
    recebido, previsto, renda, gastoAvista, fatura, fixasPendentes, guardado, disponivel, diasRestantes,
    porDia: Math.floor(Math.max(disponivel, 0) / diasRestantes),
  }
}

export function gastosPorCategoria(lancs: Lancamento[], mes: string) {
  const mapa = new Map<string, number>()
  for (const l of lancs) {
    if (l.tipo !== 'despesa' || mesCaixa(l) !== mes) continue
    const c = l.categoria ?? 'Outros'
    mapa.set(c, (mapa.get(c) ?? 0) + l.valor_cent)
  }
  return [...mapa].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
}

export function serieMensal(lancs: Lancamento[], mesFinal: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const mes = somarMeses(mesFinal, i - n + 1)
    let receitas = 0
    let despesas = 0
    for (const l of lancs) {
      if (mesCaixa(l) !== mes) continue
      if (l.tipo === 'receita') receitas += l.valor_cent
      if (l.tipo === 'despesa') despesas += l.valor_cent
    }
    return { mes, receitas, despesas }
  })
}

// Média dos últimos 3 meses completos com gasto. Sem histórico, usa o mês atual somado às fixas pendentes.
export function gastoMedioMensal(dados: Dados, hoje: string) {
  const mes = mesDe(hoje)
  const anteriores = serieMensal(dados.lancamentos, somarMeses(mes, -1), 3).filter((m) => m.despesas > 0)
  if (anteriores.length) {
    return Math.round(anteriores.reduce((t, m) => t + m.despesas, 0) / anteriores.length)
  }
  const atual = serieMensal(dados.lancamentos, mes, 1)[0].despesas
  const pendentes = dados.contas_fixas
    .filter((f) => f.ativa && !fixaPaga(f, dados.lancamentos, mes))
    .reduce((t, f) => t + f.valor_cent, 0)
  return atual + pendentes
}

export function aliquotaIR(dias: number) {
  if (dias <= 180) return 0.225
  if (dias <= 360) return 0.2
  if (dias <= 720) return 0.175
  return 0.15
}

export interface ValorInvestimento {
  aplicado: number
  atual: number
  rendimento: number
  ir: number
  semCotacao: boolean
}

// Estimativa: CDI atual aplicado a todo o período, em dias úteis aproximados (252/365).
export function valorInvestimento(inv: Investimento, cot: Cotacoes, hoje: string): ValorInvestimento {
  const aplicado = inv.valor_cent
  if (inv.tipo === 'cripto') {
    const preco = inv.moeda_id ? cot.precos[inv.moeda_id] : undefined
    if (preco === undefined || !inv.quantidade) {
      return { aplicado, atual: aplicado, rendimento: 0, ir: 0, semCotacao: true }
    }
    const atual = Math.round(preco * inv.quantidade * 100)
    return { aplicado, atual, rendimento: atual - aplicado, ir: 0, semCotacao: false }
  }
  if (inv.pct_cdi === null || inv.tipo === 'outro') {
    return { aplicado, atual: aplicado, rendimento: 0, ir: 0, semCotacao: false }
  }
  if (cot.cdi === null) return { aplicado, atual: aplicado, rendimento: 0, ir: 0, semCotacao: true }
  const dias = Math.max(diferencaDias(inv.data, hoje), 0)
  const taxaAno = (cot.cdi / 100) * (inv.pct_cdi / 100)
  const bruto = aplicado * Math.pow(1 + taxaAno, ((dias * 252) / 365) / 252)
  const rendimentoBruto = bruto - aplicado
  const ir = Math.round(rendimentoBruto * aliquotaIR(dias))
  const rendimento = Math.round(rendimentoBruto) - ir
  return { aplicado, atual: aplicado + rendimento, rendimento, ir, semCotacao: false }
}

export function totalInvestido(invs: Investimento[], cot: Cotacoes, hoje: string) {
  return invs.reduce((t, i) => t + valorInvestimento(i, cot, hoje).atual, 0)
}

export function reserva(dados: Dados, mesesReserva: number, cot: Cotacoes, hoje: string) {
  const gastoMedio = gastoMedioMensal(dados, hoje)
  const alvo = gastoMedio * mesesReserva
  const guardada = totalInvestido(dados.investimentos.filter((i) => i.e_reserva), cot, hoje)
  return { gastoMedio, alvo, guardada, pct: alvo > 0 ? guardada / alvo : 0, faltam: Math.max(alvo - guardada, 0) }
}

export function guardadoMeta(metaId: string, inicial: number, lancs: Lancamento[]) {
  return inicial + lancs.filter((l) => l.tipo === 'guardado' && l.meta_id === metaId).reduce((t, l) => t + l.valor_cent, 0)
}

// Ritmo = média guardada por mês desde o primeiro depósito da meta.
export function previsaoMeta(alvo: number, guardado: number, metaId: string, lancs: Lancamento[], hoje: string) {
  if (guardado >= alvo) return { meses: 0, mes: mesDe(hoje), ritmo: 0 }
  const aportes = lancs.filter((l) => l.tipo === 'guardado' && l.meta_id === metaId)
  if (!aportes.length) return null
  const primeiro = aportes.map((l) => mesDe(l.data)).sort()[0]
  let meses = 1
  while (somarMeses(primeiro, meses - 1) < mesDe(hoje)) meses++
  const ritmo = aportes.reduce((t, l) => t + l.valor_cent, 0) / meses
  const faltam = Math.ceil((alvo - guardado) / ritmo)
  return { meses: faltam, mes: somarMeses(mesDe(hoje), faltam), ritmo: Math.round(ritmo) }
}

export interface Fatura {
  cartaoId: string
  mes: string
  total: number
  paga: boolean
  vencimento: string
  fechamento: string
  itens: Lancamento[]
}

export function fechamentoDaFatura(cartao: Cartao, mesFatura: string) {
  const mesFechamento = cartao.dia_vencimento > cartao.dia_fechamento ? mesFatura : somarMeses(mesFatura, -1)
  return dataNoMes(mesFechamento, cartao.dia_fechamento)
}

export function faturasDoCartao(cartao: Cartao, lancs: Lancamento[]): Fatura[] {
  const porMes = new Map<string, Lancamento[]>()
  for (const l of lancs) {
    if (l.cartao_id !== cartao.id || !l.fatura_mes) continue
    porMes.set(l.fatura_mes, [...(porMes.get(l.fatura_mes) ?? []), l])
  }
  return [...porMes]
    .map(([mes, itens]) => ({
      cartaoId: cartao.id,
      mes,
      itens,
      total: itens.reduce((t, l) => t + l.valor_cent, 0),
      paga: !!cartao.paga_ate && mes <= cartao.paga_ate,
      vencimento: dataNoMes(mes, cartao.dia_vencimento),
      fechamento: fechamentoDaFatura(cartao, mes),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

// O que já está prometido nos próximos meses, por parcelas ou compras em faturas futuras.
export function comprometimentoFuturo(dados: Dados, hoje: string, renda: number, n = 6) {
  const mesAtual = mesDe(hoje)
  return Array.from({ length: n }, (_, i) => {
    const mes = somarMeses(mesAtual, i + 1)
    const valor = dados.lancamentos
      .filter((l) => l.tipo === 'despesa' && l.cartao_id && l.fatura_mes === mes)
      .reduce((t, l) => t + l.valor_cent, 0)
    return { mes, valor, pct: renda > 0 ? valor / renda : 0 }
  })
}

export function dividaCartao(dados: Dados, ate?: string) {
  let total = 0
  for (const c of dados.cartoes) {
    for (const l of dados.lancamentos) {
      if (l.cartao_id !== c.id || l.tipo !== 'despesa' || !l.fatura_mes) continue
      if (ate && mesDe(l.data) > ate) continue
      if (!c.paga_ate || l.fatura_mes > c.paga_ate) total += l.valor_cent
    }
  }
  return total
}

export function saldoContas(dados: Dados, ateMes?: string) {
  let saldo = dados.contas.reduce((t, c) => t + c.saldo_inicial_cent, 0)
  for (const l of dados.lancamentos) {
    if (l.cartao_id) continue
    if (ateMes && mesDe(l.data) > ateMes) continue
    if (l.tipo === 'receita' || (l.tipo === 'transferencia' && l.entrada)) saldo += l.valor_cent
    else saldo -= l.valor_cent
  }
  // Fatura paga sai das contas; a que está em aberto entra como dívida.
  for (const c of dados.cartoes) {
    if (!c.paga_ate) continue
    for (const l of dados.lancamentos) {
      if (l.cartao_id !== c.id || !l.fatura_mes || l.fatura_mes > c.paga_ate) continue
      if (ateMes && l.fatura_mes > ateMes) continue
      saldo -= l.valor_cent
    }
  }
  return saldo
}

export function totalMetas(dados: Dados, ateMes?: string) {
  const lancs = ateMes ? dados.lancamentos.filter((l) => mesDe(l.data) <= ateMes) : dados.lancamentos
  return dados.metas.reduce((t, m) => t + guardadoMeta(m.id, m.guardado_inicial_cent, lancs), 0)
}

export function patrimonio(dados: Dados, cot: Cotacoes, hoje: string) {
  const contas = saldoContas(dados)
  const metas = totalMetas(dados)
  const investido = totalInvestido(dados.investimentos, cot, hoje)
  const divida = dividaCartao(dados)
  return { contas, metas, investido, divida, total: contas + metas + investido - divida }
}

// Histórico usa o valor aplicado dos investimentos: não há cotação guardada de meses passados.
export function seriePatrimonio(dados: Dados, mesFinal: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const mes = somarMeses(mesFinal, i - n + 1)
    const investido = dados.investimentos
      .filter((v) => mesDe(v.data) <= mes)
      .reduce((t, v) => t + v.valor_cent, 0)
    return {
      mes,
      total: saldoContas(dados, mes) + totalMetas(dados, mes) + investido - dividaCartao(dados, mes),
    }
  })
}

export function filtrarPorDono(dados: Dados, donos: string[]): Dados {
  const f = <T extends { dono: string }>(lista: T[]) => lista.filter((x) => donos.includes(x.dono))
  return {
    contas: f(dados.contas),
    categorias: f(dados.categorias),
    cartoes: f(dados.cartoes),
    contas_fixas: f(dados.contas_fixas),
    metas: f(dados.metas),
    lancamentos: f(dados.lancamentos),
    orcamentos: f(dados.orcamentos),
    investimentos: f(dados.investimentos),
  }
}

// Em "Nós", orçamentos da mesma categoria somam.
export function orcamentosComGasto(dados: Dados, mes: string) {
  const limites = new Map<string, number>()
  for (const o of dados.orcamentos) limites.set(o.categoria, (limites.get(o.categoria) ?? 0) + o.limite_cent)
  const gastos = new Map(gastosPorCategoria(dados.lancamentos, mes).map((g) => [g.categoria, g.valor]))
  return [...limites]
    .map(([categoria, limite]) => ({ categoria, limite, gasto: gastos.get(categoria) ?? 0, pct: (gastos.get(categoria) ?? 0) / limite }))
    .sort((a, b) => b.pct - a.pct)
}
