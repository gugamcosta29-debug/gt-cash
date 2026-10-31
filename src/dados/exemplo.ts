import { dataNoMes, dividirParcelas, faturaDaCompra, mesDe, somarMeses } from '../lib/calculos'
import { hojeISO } from '../lib/formato'
import type { Cartao, Dados, Fixa, Lancamento, Perfil } from '../lib/tipos'

export const ID_EU = 'exemplo-eu'
export const ID_PARCEIRO = 'exemplo-parceiro'

export const PERFIS_EXEMPLO: Perfil[] = [
  { id: ID_EU, nome: 'Você', renda_prevista_cent: 320000, meses_reserva: 6, teto_cripto_pct: 10 },
  { id: ID_PARCEIRO, nome: 'Parceira', renda_prevista_cent: 280000, meses_reserva: 6, teto_cripto_pct: 10 },
]

const DESPESAS = ['Moradia', 'Mercado', 'Transporte', 'Contas da casa', 'Saúde', 'Lazer', 'Restaurantes', 'Assinaturas', 'Educação', 'Roupas', 'Outros']
const RECEITAS = ['Salário', 'Trabalho extra', 'Vendas', 'Outros']

// Dados fictícios montados em volta da data de hoje, para o exemplo nunca parecer vencido.
export function criarDadosExemplo(hoje = hojeISO()): Dados {
  const mes = mesDe(hoje)
  let seq = 0
  const id = (p: string) => `${p}-${++seq}`
  const lancs: Lancamento[] = []
  const add = (dono: string, x: Partial<Lancamento> & { data: string; descricao: string; valor_cent: number }) => {
    lancs.push({
      id: id('l'), dono, tipo: 'despesa', entrada: false, categoria: 'Outros', conta_id: null, cartao_id: null,
      fatura_mes: null, parcela_grupo: null, parcela_num: null, parcela_total: null, fixa_id: null, fixa_mes: null,
      meta_id: null, import_hash: null, ...x,
    })
  }

  const contaEu = 'conta-eu'
  const contaPar = 'conta-par'
  const cartaoEu: Cartao = { id: 'cartao-eu', dono: ID_EU, nome: 'Cartão roxo', limite_cent: 300000, dia_fechamento: 20, dia_vencimento: 27, paga_ate: somarMeses(mes, -1) }
  const cartaoPar: Cartao = { id: 'cartao-par', dono: ID_PARCEIRO, nome: 'Cartão azul', limite_cent: 250000, dia_fechamento: 8, dia_vencimento: 15, paga_ate: somarMeses(mes, -1) }

  const fixa = (dono: string, nome: string, valor: number, dia: number, categoria: string, assinatura = false): Fixa => ({
    id: id('f'), dono, nome, valor_cent: valor, dia_vencimento: dia, categoria, assinatura, ativa: true,
    conta_id: dono === ID_EU ? contaEu : contaPar,
  })
  const fixas = [
    fixa(ID_EU, 'Aluguel', 110000, 5, 'Moradia'),
    fixa(ID_EU, 'Internet', 11000, 10, 'Contas da casa'),
    fixa(ID_EU, 'Música', 2390, 12, 'Assinaturas', true),
    fixa(ID_PARCEIRO, 'Luz', 18500, 28, 'Contas da casa'),
    fixa(ID_PARCEIRO, 'Academia', 8900, 7, 'Saúde'),
    fixa(ID_PARCEIRO, 'Filmes', 3990, 18, 'Assinaturas', true),
  ]

  const compra = (dono: string, data: string, descricao: string, valor: number, categoria: string, cartao: Cartao, parcelas = 1) => {
    const grupo = parcelas > 1 ? id('g') : null
    const primeira = faturaDaCompra(data, cartao)
    dividirParcelas(valor, parcelas).forEach((v, i) => add(dono, {
      data, descricao, valor_cent: v, categoria, cartao_id: cartao.id, fatura_mes: somarMeses(primeira, i),
      parcela_grupo: grupo, parcela_num: parcelas > 1 ? i + 1 : null, parcela_total: parcelas > 1 ? parcelas : null,
    }))
  }

  // Quatro meses completos de histórico, mais o mês atual.
  for (let i = -4; i <= 0; i++) {
    const m = somarMeses(mes, i)
    const passado = i < 0
    const d = (dia: number) => {
      const data = dataNoMes(m, dia)
      return data <= hoje ? data : null
    }
    const var1 = 1 + ((i + 4) % 3) * 0.12
    const lista: [string, string, number, string][] = [
      [ID_EU, 'Mercado da semana', 28000, 'Mercado'],
      [ID_EU, 'Gasolina', 18000, 'Transporte'],
      [ID_EU, 'Pizza com amigos', 9500, 'Restaurantes'],
      [ID_PARCEIRO, 'Feira e mercado', 31000, 'Mercado'],
      [ID_PARCEIRO, 'Ônibus', 12000, 'Transporte'],
      [ID_PARCEIRO, 'Cinema', 7000, 'Lazer'],
    ]
    if (d(2)) {
      add(ID_EU, { data: d(2)!, descricao: 'Salário', valor_cent: 320000, tipo: 'receita', categoria: 'Salário', conta_id: contaEu })
      add(ID_PARCEIRO, { data: d(2)!, descricao: 'Salário', valor_cent: 280000, tipo: 'receita', categoria: 'Salário', conta_id: contaPar })
    }
    lista.forEach(([dono, descricao, valor, categoria], n) => {
      const data = d(6 + n * 3)
      if (data) add(dono, { data, descricao, valor_cent: Math.round(valor * var1), categoria, conta_id: dono === ID_EU ? contaEu : contaPar })
    })
    for (const f of fixas) {
      const data = d(f.dia_vencimento)
      if (!data) continue
      const atrasada = !passado && f.nome === 'Academia'
      if (atrasada) continue
      add(f.dono, { data, descricao: f.nome, valor_cent: f.valor_cent, categoria: f.categoria, conta_id: f.conta_id, fixa_id: f.id, fixa_mes: m })
    }
    if (d(14)) compra(ID_EU, d(14)!, 'Farmácia', 8700 + (i + 4) * 500, 'Saúde', cartaoEu)
    if (d(16)) compra(ID_PARCEIRO, d(16)!, 'Restaurante', 11200, 'Restaurantes', cartaoPar)
    if (i < 0 && d(4)) add(ID_EU, { data: d(4)!, descricao: 'Guardei para a viagem', valor_cent: 15000, tipo: 'guardado', meta_id: 'meta-viagem', conta_id: contaEu })
  }
  compra(ID_EU, dataNoMes(somarMeses(mes, -1), 22), 'Geladeira', 240000, 'Moradia', cartaoEu, 6)
  compra(ID_EU, dataNoMes(mes, 3), 'Tênis', 32000, 'Roupas', cartaoEu, 3)

  return {
    contas: [
      { id: contaEu, dono: ID_EU, nome: 'Conta do dia a dia', tipo: 'corrente', saldo_inicial_cent: 150000 },
      { id: contaPar, dono: ID_PARCEIRO, nome: 'Conta principal', tipo: 'corrente', saldo_inicial_cent: 90000 },
    ],
    categorias: [ID_EU, ID_PARCEIRO].flatMap((dono) => [
      ...DESPESAS.map((nome) => ({ id: id('c'), dono, nome, tipo: 'despesa' as const })),
      ...RECEITAS.map((nome) => ({ id: id('c'), dono, nome, tipo: 'receita' as const })),
    ]),
    cartoes: [cartaoEu, cartaoPar],
    contas_fixas: fixas,
    metas: [
      { id: 'meta-viagem', dono: ID_EU, nome: 'Viagem de fim de ano', alvo_cent: 250000, guardado_inicial_cent: 20000, prazo: dataNoMes(somarMeses(mes, 8), 15) },
    ],
    lancamentos: lancs,
    orcamentos: [
      { id: 'o1', dono: ID_EU, categoria: 'Mercado', limite_cent: 35000 },
      { id: 'o2', dono: ID_EU, categoria: 'Restaurantes', limite_cent: 10000 },
      { id: 'o3', dono: ID_EU, categoria: 'Transporte', limite_cent: 30000 },
      { id: 'o4', dono: ID_PARCEIRO, categoria: 'Mercado', limite_cent: 40000 },
      { id: 'o5', dono: ID_PARCEIRO, categoria: 'Lazer', limite_cent: 7000 },
    ],
    investimentos: [
      { id: 'i1', dono: ID_EU, tipo: 'caixinha', nome: 'Reserva no banco', data: `${somarMeses(mes, -5)}-10`, valor_cent: 180000, pct_cdi: 100, vencimento: null, moeda_id: null, quantidade: null, e_reserva: true },
      { id: 'i2', dono: ID_PARCEIRO, tipo: 'caixinha', nome: 'Reserva', data: `${somarMeses(mes, -3)}-05`, valor_cent: 120000, pct_cdi: 100, vencimento: null, moeda_id: null, quantidade: null, e_reserva: true },
      { id: 'i3', dono: ID_EU, tipo: 'cdb', nome: 'CDB exemplo', data: `${somarMeses(mes, -8)}-12`, valor_cent: 100000, pct_cdi: 105, vencimento: `${somarMeses(mes, 16)}-12`, moeda_id: null, quantidade: null, e_reserva: false },
      { id: 'i4', dono: ID_EU, tipo: 'cripto', nome: 'Bitcoin', data: `${somarMeses(mes, -6)}-20`, valor_cent: 30000, pct_cdi: null, vencimento: null, moeda_id: 'bitcoin', quantidade: 0.0006, e_reserva: false },
    ],
  }
}
