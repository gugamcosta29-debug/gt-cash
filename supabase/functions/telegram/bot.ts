// Recebe as mensagens do Telegram e grava lançamentos só na conta ligada àquele usuário.
import { dividirParcelas, faturaDaCompra, somarMeses } from '../../../src/lib/calculos'
import { dataCurta, reais } from '../../../src/lib/formato'
import { sugerirCategoria } from '../../../src/lib/importar'
import { interpretar } from './mensagem'

export interface Ambiente { supabaseUrl: string; chaveServico: string; tokenBot: string; urlFuncao: string }

const AJUDA = `Manda assim que eu lanço:

mercado 45,90
uber 18 ontem
recebi 3200 de salário
tênis 600 em 3x no Nubank

Para apagar o último que lancei: desfazer`

const limpar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const hojeEmBrasilia = (agora: Date) => agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// O segredo do webhook sai do próprio token: só há um valor para guardar no Supabase.
export async function segredoDoWebhook(tokenBot: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`webhook:${tokenBot}`))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function escolherCategoria(descricao: string, categorias: string[]) {
  const texto = limpar(descricao)
  return categorias.find((c) => limpar(c) !== 'outros' && texto.includes(limpar(c))) ?? sugerirCategoria(descricao, categorias)
}

export async function tratar(req: Request, env: Ambiente, agora = new Date()): Promise<Response> {
  const banco = async (caminho: string, init: RequestInit = {}) => {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${caminho}`, {
      ...init,
      headers: { apikey: env.chaveServico, Authorization: `Bearer ${env.chaveServico}`, 'Content-Type': 'application/json', ...init.headers },
    })
    if (!r.ok && r.status !== 409) throw new Error(`banco ${r.status}`)
    return r
  }
  const lista = async <T>(caminho: string) => (await (await banco(caminho)).json()) as T[]
  const telegram = (metodo: string, corpo: unknown) => fetch(`https://api.telegram.org/bot${env.tokenBot}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  })

  const segredo = await segredoDoWebhook(env.tokenBot)
  // Abrir o endereço da função liga o bot. Repetir não muda nada, então não precisa de senha.
  if (req.method === 'GET') {
    const r = await telegram('setWebhook', { url: env.urlFuncao, secret_token: segredo, allowed_updates: ['message'] })
    return new Response(r.ok ? 'Bot ligado.' : 'Não consegui ligar o bot. Confira o token.', { status: r.ok ? 200 : 502 })
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== segredo) return new Response('Proibido', { status: 403 })

  const update = await req.json()
  const msg = update.message
  if (!msg?.from?.id || msg.chat?.type !== 'private') return new Response('ok')
  const responder = (text: string) => telegram('sendMessage', { chat_id: msg.chat.id, text })

  try {
    const [ligacao] = await lista<{ dono: string }>(`telegram_usuarios?telegram_id=eq.${Number(msg.from.id)}&select=dono`)
    if (!ligacao) {
      await responder(`Este bot é privado. Teu ID do Telegram é ${msg.from.id}.`)
      return new Response('ok')
    }
    if (typeof msg.text !== 'string') {
      await responder(`Por enquanto só entendo texto.\n\n${AJUDA}`)
      return new Response('ok')
    }
    const dono = `dono=eq.${ligacao.dono}`
    const [cartoes, contas, categorias] = await Promise.all([
      lista<{ id: string; nome: string; dia_fechamento: number; dia_vencimento: number }>(`cartoes?${dono}&select=id,nome,dia_fechamento,dia_vencimento`),
      lista<{ id: string; nome: string }>(`contas?${dono}&select=id,nome&order=nome`),
      lista<{ nome: string; tipo: string }>(`categorias?${dono}&select=nome,tipo`),
    ])
    const hoje = hojeEmBrasilia(agora)
    const pedido = interpretar(msg.text, { hoje, cartoes, contas })

    if (pedido.acao === 'ajuda') await responder(AJUDA)
    else if (pedido.acao === 'duvida') await responder(pedido.motivo)
    else if (pedido.acao === 'desfazer') {
      // Só alcança o que o próprio bot lançou, nunca o que foi digitado no app.
      const [ultimo] = await lista<{ id: string; descricao: string; parcela_grupo: string | null }>(
        `lancamentos?${dono}&import_hash=like.tg:*&select=id,descricao,parcela_grupo&order=criado_em.desc&limit=1`)
      if (!ultimo) await responder('Não há nada lançado por aqui para apagar.')
      else {
        const alvo = ultimo.parcela_grupo ? `parcela_grupo=eq.${ultimo.parcela_grupo}` : `id=eq.${ultimo.id}`
        await banco(`lancamentos?${dono}&${alvo}`, { method: 'DELETE' })
        await responder(`Apaguei: ${ultimo.descricao}.`)
      }
    } else {
      const nomes = categorias.filter((c) => c.tipo === pedido.tipo).map((c) => c.nome)
      const categoria = escolherCategoria(pedido.descricao, nomes)
      const cartao = cartoes.find((c) => c.id === pedido.cartaoId)
      const base = {
        dono: ligacao.dono, data: pedido.data, descricao: pedido.descricao, tipo: pedido.tipo, categoria,
        entrada: false, conta_id: pedido.contaId,
      }
      // O hash leva o id da mensagem: se o Telegram reenviar, o banco recusa a repetida.
      const hash = `tg:${msg.chat.id}:${msg.message_id}`
      let linhas: Record<string, unknown>[]
      if (cartao) {
        const primeira = faturaDaCompra(pedido.data, cartao)
        const grupo = pedido.parcelas > 1 ? crypto.randomUUID() : null
        linhas = dividirParcelas(pedido.valor_cent, pedido.parcelas).map((v, i) => ({
          ...base, valor_cent: v, cartao_id: cartao.id, fatura_mes: somarMeses(primeira, i), parcela_grupo: grupo,
          parcela_num: pedido.parcelas > 1 ? i + 1 : null, parcela_total: pedido.parcelas > 1 ? pedido.parcelas : null,
          import_hash: `${hash}:${i}`,
        }))
      } else {
        linhas = [{
          ...base, valor_cent: pedido.valor_cent, cartao_id: null, fatura_mes: null, parcela_grupo: null,
          parcela_num: null, parcela_total: null, import_hash: `${hash}:0`,
        }]
      }
      const r = await banco('lancamentos', { method: 'POST', body: JSON.stringify(linhas) })
      if (r.status === 409) return new Response('ok')
      const onde = cartao ? ` no ${cartao.nome}${pedido.parcelas > 1 ? ` em ${pedido.parcelas}x` : ''}` : ''
      const dia = pedido.data === hoje ? 'hoje' : dataCurta(pedido.data)
      await responder(`${pedido.tipo === 'receita' ? 'Entrada' : 'Gasto'} lançado: ${pedido.descricao}, ${reais(pedido.valor_cent)}${onde}, ${dia}, em ${categoria}.\n\nErrou? Manda "desfazer".`)
    }
  } catch (e) {
    console.error(e)
    await responder('Não consegui salvar agora. Tenta de novo em instantes.')
  }
  return new Response('ok')
}
