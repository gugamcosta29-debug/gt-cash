import { describe, expect, it } from 'vitest'
import {
  aliquotaIR, dividirParcelas, faturaDaCompra, faturasDoCartao, filtrarPorDono, gastoMedioMensal,
  patrimonio, previsaoMeta, reserva, resumoMes, valorInvestimento,
} from './calculos'
import { gerarAvisos, ordemDoDinheiro } from './regras'
import { dataParaISO, lerCSV, lerOFX, linhasDoCSV, separarNovas, decodificar, sugerirCategoria } from './importar'
import { paraCentavos } from './formato'
import type { Cartao, Cotacoes, Dados, Investimento, Lancamento, Perfil } from './tipos'

const vazio = (): Dados => ({
  contas: [], categorias: [], cartoes: [], contas_fixas: [], metas: [], lancamentos: [], orcamentos: [], investimentos: [],
})
const perfil = (id = 'a', renda = 0): Perfil => ({ id, nome: id, renda_prevista_cent: renda, meses_reserva: 6, teto_cripto_pct: 10 })
let seq = 0
const lanc = (x: Partial<Lancamento>): Lancamento => ({
  id: `l${seq++}`, dono: 'a', data: '2026-10-10', descricao: 'x', valor_cent: 100, tipo: 'despesa', entrada: false,
  categoria: 'Outros', conta_id: null, cartao_id: null, fatura_mes: null, parcela_grupo: null, parcela_num: null,
  parcela_total: null, fixa_id: null, fixa_mes: null, meta_id: null, import_hash: null, ...x,
})
const cartao = (x: Partial<Cartao> = {}): Cartao => ({
  id: 'c', dono: 'a', nome: 'Roxo', limite_cent: 100000, dia_fechamento: 20, dia_vencimento: 27, paga_ate: null, ...x,
})
const cot: Cotacoes = { cdi: 14, cdiData: '2026-10-30', precos: { bitcoin: 500000 }, precosData: '2026-10-30' }
const inv = (x: Partial<Investimento>): Investimento => ({
  id: 'i', dono: 'a', tipo: 'cdb', nome: 'x', data: '2026-01-01', valor_cent: 100000, pct_cdi: 100,
  vencimento: null, moeda_id: null, quantidade: null, e_reserva: false, ...x,
})

describe('fatura do cartão', () => {
  const c = { dia_fechamento: 20, dia_vencimento: 27 }
  it('compra antes do fechamento vai para a fatura do mês', () => {
    expect(faturaDaCompra('2026-10-19', c)).toBe('2026-10')
  })
  it('compra no dia do fechamento ou depois vai para a seguinte', () => {
    expect(faturaDaCompra('2026-10-20', c)).toBe('2026-11')
    expect(faturaDaCompra('2026-10-25', c)).toBe('2026-11')
  })
  it('vencimento menor que o fechamento cai no mês seguinte ao fechamento', () => {
    const v = { dia_fechamento: 28, dia_vencimento: 5 }
    expect(faturaDaCompra('2026-10-10', v)).toBe('2026-11')
    expect(faturaDaCompra('2026-10-28', v)).toBe('2026-12')
  })
  it('vira o ano', () => {
    expect(faturaDaCompra('2026-12-25', c)).toBe('2027-01')
  })
  it('fechamento 31 em fevereiro usa o último dia do mês', () => {
    expect(faturaDaCompra('2026-02-28', { dia_fechamento: 31, dia_vencimento: 5 })).toBe('2026-04')
    expect(faturaDaCompra('2026-02-27', { dia_fechamento: 31, dia_vencimento: 5 })).toBe('2026-03')
  })
  it('fatura paga é reconhecida por paga_ate', () => {
    const k = cartao({ paga_ate: '2026-10' })
    const lista = faturasDoCartao(k, [
      lanc({ cartao_id: 'c', fatura_mes: '2026-10', valor_cent: 500 }),
      lanc({ cartao_id: 'c', fatura_mes: '2026-11', valor_cent: 700 }),
    ])
    expect(lista.map((f) => [f.mes, f.total, f.paga])).toEqual([['2026-10', 500, true], ['2026-11', 700, false]])
  })
})

describe('parcelas', () => {
  it('não perde centavo', () => {
    const p = dividirParcelas(10000, 3)
    expect(p).toEqual([3334, 3333, 3333])
    expect(p.reduce((a, b) => a + b)).toBe(10000)
  })
})

describe('resumo do mês', () => {
  it('desconta gasto, fatura, fixa pendente e guardado da renda', () => {
    const d = vazio()
    d.contas_fixas = [
      { id: 'f1', dono: 'a', nome: 'Luz', valor_cent: 20000, dia_vencimento: 10, categoria: 'x', assinatura: false, ativa: true, conta_id: null },
      { id: 'f2', dono: 'a', nome: 'Aluguel', valor_cent: 90000, dia_vencimento: 5, categoria: 'x', assinatura: false, ativa: true, conta_id: null },
    ]
    d.lancamentos = [
      lanc({ tipo: 'receita', valor_cent: 300000 }),
      lanc({ valor_cent: 90000, fixa_id: 'f2', fixa_mes: '2026-10' }),
      lanc({ valor_cent: 5000 }),
      lanc({ valor_cent: 15000, cartao_id: 'c', fatura_mes: '2026-10' }),
      lanc({ valor_cent: 99900, cartao_id: 'c', fatura_mes: '2026-11' }),
      lanc({ valor_cent: 10000, tipo: 'guardado' }),
      lanc({ valor_cent: 77700, tipo: 'transferencia' }),
    ]
    const r = resumoMes(d, [perfil()], '2026-10', '2026-10-21')
    expect(r.disponivel).toBe(300000 - 95000 - 15000 - 20000 - 10000)
    expect(r.diasRestantes).toBe(11)
    expect(r.porDia).toBe(Math.floor(160000 / 11))
  })
  it('usa a renda prevista enquanto o salário não entrou', () => {
    expect(resumoMes(vazio(), [perfil('a', 200000)], '2026-10', '2026-10-01').renda).toBe(200000)
  })
})

describe('investimentos', () => {
  it('IR regressivo', () => {
    expect([180, 181, 360, 361, 720, 721].map(aliquotaIR)).toEqual([0.225, 0.2, 0.2, 0.175, 0.175, 0.15])
  })
  it('CDB rende um ano de CDI com IR de 17,5%', () => {
    const v = valorInvestimento(inv({ data: '2025-10-30' }), cot, '2026-10-30')
    expect(v.rendimento).toBe(Math.round(14000) - Math.round(14000 * 0.175))
    expect(v.atual).toBe(100000 + v.rendimento)
  })
  it('sem CDI, mostra o aplicado e sinaliza', () => {
    const v = valorInvestimento(inv({}), { ...cot, cdi: null }, '2026-10-30')
    expect(v).toMatchObject({ atual: 100000, semCotacao: true })
  })
  it('cripto usa preço atual e quantidade', () => {
    const v = valorInvestimento(inv({ tipo: 'cripto', pct_cdi: null, moeda_id: 'bitcoin', quantidade: 0.01 }), cot, '2026-10-30')
    expect(v.atual).toBe(500000)
    expect(v.rendimento).toBe(400000)
  })
  it('patrimônio desconta a dívida do cartão e não duplica', () => {
    const d = vazio()
    d.contas = [{ id: 'k', dono: 'a', nome: 'x', tipo: 'corrente', saldo_inicial_cent: 100000 }]
    d.cartoes = [cartao({ paga_ate: '2026-10' })]
    d.lancamentos = [
      lanc({ cartao_id: 'c', fatura_mes: '2026-10', valor_cent: 20000 }),
      lanc({ cartao_id: 'c', fatura_mes: '2026-11', valor_cent: 30000 }),
    ]
    const p = patrimonio(d, cot, '2026-10-30')
    expect(p.contas).toBe(80000)
    expect(p.divida).toBe(30000)
    expect(p.total).toBe(50000)
  })
})

describe('reserva e metas', () => {
  it('alvo vem do gasto real dos últimos meses', () => {
    const d = vazio()
    d.lancamentos = [
      lanc({ data: '2026-09-05', valor_cent: 100000 }),
      lanc({ data: '2026-08-05', valor_cent: 200000 }),
      lanc({ data: '2026-10-05', valor_cent: 900000 }),
    ]
    expect(gastoMedioMensal(d, '2026-10-30')).toBe(150000)
    d.investimentos = [inv({ e_reserva: true, pct_cdi: null, tipo: 'outro', valor_cent: 300000 })]
    expect(reserva(d, 6, cot, '2026-10-30')).toMatchObject({ alvo: 900000, guardada: 300000, faltam: 600000 })
  })
  it('previsão usa o ritmo de depósitos', () => {
    const l = [lanc({ tipo: 'guardado', meta_id: 'm', data: '2026-09-10', valor_cent: 10000 }), lanc({ tipo: 'guardado', meta_id: 'm', data: '2026-10-10', valor_cent: 10000 })]
    expect(previsaoMeta(50000, 20000, 'm', l, '2026-10-30')).toEqual({ meses: 3, mes: '2027-01', ritmo: 10000 })
    expect(previsaoMeta(50000, 0, 'outra', l, '2026-10-30')).toBeNull()
  })
})

describe('visão Nós', () => {
  it('soma os dois sem contar em dobro e ignora transferência', () => {
    const d = vazio()
    d.lancamentos = [
      lanc({ dono: 'a', tipo: 'receita', valor_cent: 300000 }),
      lanc({ dono: 'b', tipo: 'receita', valor_cent: 200000 }),
      lanc({ dono: 'a', valor_cent: 100000, categoria: 'Moradia' }),
      lanc({ dono: 'b', valor_cent: 50000, categoria: 'Mercado' }),
      lanc({ dono: 'a', tipo: 'transferencia', valor_cent: 30000 }),
      lanc({ dono: 'b', tipo: 'transferencia', entrada: true, valor_cent: 30000 }),
    ]
    const perfis = [perfil('a'), perfil('b')]
    const a = resumoMes(filtrarPorDono(d, ['a']), [perfis[0]], '2026-10', '2026-10-30')
    const b = resumoMes(filtrarPorDono(d, ['b']), [perfis[1]], '2026-10', '2026-10-30')
    const nos = resumoMes(filtrarPorDono(d, ['a', 'b']), perfis, '2026-10', '2026-10-30')
    expect(nos.disponivel).toBe(a.disponivel + b.disponivel)
    expect(nos.disponivel).toBe(350000)
  })
})

describe('avisos e ordem do dinheiro', () => {
  it('conta atrasada vira crítico e trava a reserva como passo seguinte', () => {
    const d = vazio()
    d.contas_fixas = [{ id: 'f', dono: 'a', nome: 'Luz', valor_cent: 100, dia_vencimento: 5, categoria: 'x', assinatura: false, ativa: true, conta_id: null }]
    const avisos = gerarAvisos(d, [perfil()], '2026-10-10')
    expect(avisos.find((a) => a.id === 'fixa-atraso-f')?.nivel).toBe('critico')
    const passos = ordemDoDinheiro(d, [perfil()], perfil(), cot, '2026-10-10')
    expect(passos.map((p) => p.estado)).toEqual(['agora', 'depois', 'depois', 'depois'])
  })
  it('sem nada atrasado, a reserva é o passo atual', () => {
    const d = vazio()
    d.lancamentos = [lanc({ data: '2026-09-05', valor_cent: 100000 })]
    const passos = ordemDoDinheiro(d, [perfil()], perfil(), cot, '2026-10-10')
    expect(passos.map((p) => p.estado)).toEqual(['feito', 'agora', 'depois', 'depois'])
  })
  it('reserva pronta libera renda fixa e cripto', () => {
    const d = vazio()
    d.lancamentos = [lanc({ data: '2026-09-05', valor_cent: 10000 })]
    d.investimentos = [inv({ e_reserva: true, tipo: 'outro', pct_cdi: null, valor_cent: 60000 })]
    const passos = ordemDoDinheiro(d, [perfil()], perfil(), cot, '2026-10-10')
    expect(passos.map((p) => p.estado)).toEqual(['feito', 'feito', 'agora', 'agora'])
  })
  it('categoria a 80% e a 100% do limite', () => {
    const d = vazio()
    d.orcamentos = [
      { id: '1', dono: 'a', categoria: 'Lazer', limite_cent: 100 },
      { id: '2', dono: 'a', categoria: 'Mercado', limite_cent: 1000 },
    ]
    d.lancamentos = [lanc({ categoria: 'Lazer', valor_cent: 100 }), lanc({ categoria: 'Mercado', valor_cent: 850 })]
    const ids = gerarAvisos(d, [perfil('a', 100000)], '2026-10-02').map((a) => a.id)
    expect(ids).toContain('orc-100-Lazer')
    expect(ids).toContain('orc-80-Mercado')
  })
  it('parcelas acima de 30% da renda', () => {
    const d = vazio()
    d.lancamentos = [lanc({ cartao_id: 'c', fatura_mes: '2026-11', valor_cent: 40000 })]
    expect(gerarAvisos(d, [perfil('a', 100000)], '2026-10-02').map((a) => a.id)).toContain('parcelas-30')
    d.lancamentos[0].valor_cent = 30000
    expect(gerarAvisos(d, [perfil('a', 100000)], '2026-10-02').map((a) => a.id)).not.toContain('parcelas-30')
  })
})

describe('valores digitados', () => {
  it.each([
    ['1.234,56', 123456], ['12,5', 1250], ['1234.56', 123456], ['R$ 50', 5000], ['-20,00', -2000],
    ['1,234.56', 123456], ['1.000', 100000], ['abc', null], ['', null],
  ])('%s', (t, esperado) => expect(paraCentavos(t)).toBe(esperado))
})

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-45.90<FITID>A1<MEMO>PADARIA
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>3200.00<FITID>A2<MEMO>SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-10.00<MEMO>CAFE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-10.00<MEMO>CAFE</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

describe('importação de extrato', () => {
  it('lê OFX sem fechar tags', () => {
    const l = lerOFX(OFX)
    expect(l.slice(0, 2)).toEqual([
      { data: '2026-10-05', descricao: 'PADARIA', valor_cent: -4590, hash: 'ofx:A1' },
      { data: '2026-10-01', descricao: 'SALARIO', valor_cent: 320000, hash: 'ofx:A2' },
    ])
  })
  it('duas compras iguais no mesmo dia continuam sendo duas', () => {
    const l = lerOFX(OFX).filter((x) => x.descricao === 'CAFE')
    expect(l).toHaveLength(2)
    expect(l[0].hash).not.toBe(l[1].hash)
  })
  it('não importa de novo o que já entrou', () => {
    const l = lerOFX(OFX)
    const primeira = separarNovas(l, [])
    expect(primeira.novas).toHaveLength(4)
    const segunda = separarNovas(l, l.map((x) => x.hash))
    expect(segunda).toEqual({ novas: [], repetidas: 4 })
  })
  it('lê CSV brasileiro com ponto e vírgula e aspas', () => {
    const t = lerCSV('Data;Histórico;Valor\n05/10/2026;"Mercado; Central";"-1.234,56"\n06/10/26;Pix;50,00\ninválida;x;y\n')!
    expect([t.colData, t.colDescricao, t.colValor]).toEqual([0, 1, 2])
    const l = linhasDoCSV(t, 0, 1, 2)
    expect(l.map((x) => [x.data, x.descricao, x.valor_cent])).toEqual([
      ['2026-10-05', 'Mercado; Central', -123456],
      ['2026-10-06', 'Pix', 5000],
    ])
  })
  it('sugere categoria só se ela existir na conta', () => {
    expect(sugerirCategoria('SUPERMERCADO ANGELONI', ['Mercado', 'Outros'])).toBe('Mercado')
    expect(sugerirCategoria('Farmácia São João', ['Saúde'])).toBe('Saúde')
    expect(sugerirCategoria('SUPERMERCADO', ['Outros'])).toBe('Outros')
    expect(sugerirCategoria('PIX JOAO', ['Mercado'])).toBe('Outros')
  })
  it('datas', () => {
    expect(dataParaISO('2026-10-05')).toBe('2026-10-05')
    expect(dataParaISO('5/10/2026')).toBe('2026-10-05')
    expect(dataParaISO('xx')).toBeNull()
  })
  it('acentos de arquivo Windows-1252 não quebram', () => {
    const bytes = new Uint8Array([0x50, 0x61, 0x67, 0x61, 0x6d, 0x65, 0x6e, 0x74, 0x6f, 0x20, 0x70, 0xe3, 0x6f])
    expect(decodificar(bytes)).toBe('Pagamento pão')
  })
})
