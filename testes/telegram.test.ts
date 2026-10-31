import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { segredoDoWebhook, tratar } from '../supabase/functions/telegram/bot'
import { interpretar } from '../supabase/functions/telegram/mensagem'

const hoje = '2026-10-31'
const cartoes = [{ id: 'nu', nome: 'Nubank' }, { id: 'in', nome: 'Banco Inter' }]
const contas = [{ id: 'c1', nome: 'Itaú' }]
const ler = (t: string, ctx = { hoje, cartoes, contas }) => interpretar(t, ctx)

describe('entende a mensagem', () => {
  it.each([
    ['mercado 45,90', 4590, 'Mercado', 'despesa', hoje],
    ['gastei 45,90 no mercado', 4590, 'Mercado', 'despesa', hoje],
    ['uber 18 ontem', 1800, 'Uber', 'despesa', '2026-10-30'],
    ['padaria R$ 12,50 anteontem', 1250, 'Padaria', 'despesa', '2026-10-29'],
    ['recebi 3200 de salário', 320000, 'Salário', 'receita', hoje],
    ['+150 venda da bike', 15000, 'Venda da bike', 'receita', hoje],
    ['aluguel 1.200,00 em 05/10', 120000, 'Aluguel', 'despesa', '2026-10-05'],
    ['aluguel 1.200', 120000, 'Aluguel', 'despesa', hoje],
    ['café 7.5', 750, 'Café', 'despesa', hoje],
    ['presente 80 reais 28/12', 8000, 'Presente', 'despesa', '2025-12-28'],
  ])('%s', (t, valor_cent, descricao, tipo, data) => {
    expect(ler(t)).toMatchObject({ acao: 'lancar', valor_cent, descricao, tipo, data, parcelas: 1, cartaoId: null, contaId: 'c1' })
  })

  it('reconhece cartão e parcelas', () => {
    expect(ler('tênis 600 em 3x no Nubank')).toMatchObject({ descricao: 'Tênis', valor_cent: 60000, parcelas: 3, cartaoId: 'nu', contaId: null })
    expect(ler('livro 90 no banco inter')).toMatchObject({ descricao: 'Livro', parcelas: 1, cartaoId: 'in' })
    expect(ler('livro 90 no NUBANK 2 vezes')).toMatchObject({ parcelas: 2, cartaoId: 'nu' })
  })

  it('usa o único cartão quando não há outro', () => {
    expect(ler('livro 90 no cartão', { hoje, cartoes: [cartoes[0]], contas })).toMatchObject({ descricao: 'Livro', cartaoId: 'nu' })
  })

  it('reconhece a conta pelo nome', () => {
    const duas = [{ id: 'c1', nome: 'Itaú' }, { id: 'c2', nome: 'Caixa' }]
    expect(ler('luz 200 na caixa', { hoje, cartoes, contas: duas })).toMatchObject({ descricao: 'Luz', contaId: 'c2' })
  })

  it.each([
    ['mercado', /valor/],
    ['45,90', /o que foi/],
    ['mercado 45 padaria 10', /mais de um valor/],
    ['tênis 600 em 3x', /qual cartão/],
    ['livro 90 no cartão', /qual cartão/],
    ['uber 18 em 32/10', /data/],
    ['uber 18 em 29x no nubank', /24x/],
    ['transferi 50 pra ana', /app/],
    ['guardei 100', /app/],
    ['mercado 10\npadaria 5', /um lançamento por mensagem/],
  ])('pergunta em vez de lançar errado: %s', (t, motivo) => {
    const r = ler(t)
    expect(r.acao).toBe('duvida')
    expect(r.acao === 'duvida' && r.motivo).toMatch(new RegExp(motivo.source, 'i'))
  })

  it('reconhece os comandos', () => {
    expect(ler('/start').acao).toBe('ajuda')
    expect(ler('Desfazer').acao).toBe('desfazer')
    expect(ler('apaga o último').acao).toBe('desfazer')
  })
})

describe('webhook', () => {
  const env = { supabaseUrl: 'https://x.supabase.co', chaveServico: 'servico', tokenBot: 'tok', urlFuncao: 'https://x/telegram' }
  const donoId = '00000000-0000-4000-8000-00000000000a'
  let enviados: string[]
  let inseridos: Record<string, unknown>[]
  let apagados: string[]
  let conflito: boolean
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status })

  beforeEach(() => {
    enviados = []; inseridos = []; apagados = []; conflito = false
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('api.telegram.org')) { enviados.push(JSON.parse(String(init.body)).text ?? 'webhook'); return json({ ok: true }) }
      if (init.method === 'POST') { if (conflito) return json({}, 409); inseridos.push(...JSON.parse(String(init.body))); return json({}, 201) }
      if (init.method === 'DELETE') { apagados.push(url); return json({}) }
      if (url.includes('telegram_usuarios')) return json(url.includes('telegram_id=eq.111') ? [{ dono: donoId }] : [])
      if (url.includes('/cartoes')) return json([{ id: 'nu', nome: 'Nubank', dia_fechamento: 10, dia_vencimento: 17 }])
      if (url.includes('/contas')) return json([{ id: 'c1', nome: 'Itaú' }])
      if (url.includes('/categorias')) return json([{ nome: 'Mercado', tipo: 'despesa' }, { nome: 'Outros', tipo: 'despesa' }, { nome: 'Salário', tipo: 'receita' }, { nome: 'Outros', tipo: 'receita' }])
      if (url.includes('import_hash=like')) return json([{ id: 'L1', descricao: 'Pão', parcela_grupo: null }])
      return json([])
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const agora = new Date('2026-10-31T15:00:00Z')
  async function enviar(text: unknown, de = 111, segredo?: string, tipo = 'private') {
    return tratar(new Request('https://x/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': segredo ?? await segredoDoWebhook(env.tokenBot) },
      body: JSON.stringify({ message: { message_id: 7, from: { id: de }, chat: { id: de, type: tipo }, text } }),
    }), env, agora)
  }

  it('recusa quem não tem o segredo, sem tocar no banco', async () => {
    const r = await enviar('mercado 10', 111, 'errado')
    expect(r.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('não lança para quem não está ligado a uma conta', async () => {
    await enviar('mercado 10', 999)
    expect(inseridos).toEqual([])
    expect(enviados[0]).toMatch(/privado/)
  })

  it('ignora grupos', async () => {
    await enviar('mercado 10', 111, undefined, 'group')
    expect(inseridos).toEqual([])
    expect(enviados).toEqual([])
  })

  it('lança na conta da pessoa e confirma', async () => {
    await enviar('mercado 45,90')
    expect(inseridos).toEqual([expect.objectContaining({ dono: donoId, valor_cent: 4590, categoria: 'Mercado', tipo: 'despesa', conta_id: 'c1', data: '2026-10-31', import_hash: 'tg:111:7:0' })])
    expect(enviados[0]).toMatch(/Mercado/)
    expect(enviados[0]).toMatch(/hoje/)
  })

  it('parcela na fatura certa sem perder centavo', async () => {
    await enviar('tênis 100 em 3x no nubank')
    expect(inseridos.map((l) => l.valor_cent)).toEqual([3334, 3333, 3333])
    expect(inseridos.map((l) => l.fatura_mes)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(inseridos[1]).toMatchObject({ cartao_id: 'nu', conta_id: null, parcela_num: 2, parcela_total: 3 })
  })

  it('mensagem reenviada pelo Telegram não duplica nem responde de novo', async () => {
    conflito = true
    await enviar('mercado 10')
    expect(enviados).toEqual([])
  })

  it('desfazer apaga só da própria conta', async () => {
    await enviar('desfazer')
    expect(apagados[0]).toContain(`dono=eq.${donoId}`)
    expect(apagados[0]).toContain('id=eq.L1')
    expect(enviados[0]).toMatch(/Apaguei: Pão/)
  })

  it('foto recebe resposta, sem lançar', async () => {
    await enviar(undefined)
    expect(inseridos).toEqual([])
    expect(enviados[0]).toMatch(/só entendo texto/)
  })

  it('usa a data de Brasília perto da meia-noite', async () => {
    await tratar(new Request('https://x/telegram', {
      method: 'POST', headers: { 'x-telegram-bot-api-secret-token': await segredoDoWebhook(env.tokenBot) },
      body: JSON.stringify({ message: { message_id: 8, from: { id: 111 }, chat: { id: 111, type: 'private' }, text: 'mercado 10' } }),
    }), env, new Date('2026-11-01T02:00:00Z'))
    expect(inseridos[0].data).toBe('2026-10-31')
  })
})
