// src/lib/calculos.ts
var mesDe = (data) => data.slice(0, 7);
function somarMeses(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function diasNoMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}
function faturaDaCompra(data, cartao) {
  const mes = mesDe(data);
  const dia = Number(data.slice(8, 10));
  const fechamentoNoMes = Math.min(cartao.dia_fechamento, diasNoMes(mes));
  const mesFechamento = dia >= fechamentoNoMes ? somarMeses(mes, 1) : mes;
  return cartao.dia_vencimento > cartao.dia_fechamento ? mesFechamento : somarMeses(mesFechamento, 1);
}
function dividirParcelas(totalCent, n) {
  const base = Math.floor(totalCent / n);
  return Array.from({ length: n }, (_, i) => i === 0 ? base + totalCent - base * n : base);
}

// src/lib/formato.ts
var moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
var moedaCurta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});
var reais = (cent) => moeda.format(cent / 100).replace(/ /g, " ");
var dataCurta = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// src/lib/importar.ts
var SUGESTOES = [
  [/mercado|supermerc|atacad|hortifr|padaria|acougue/, "Mercado"],
  [/uber|99 ?app|99 ?pop|posto|combust|gasolina|onibus|estacion|pedagio/, "Transporte"],
  [/ifood|restaurante|lanchonete|pizza|burger|bar /, "Restaurantes"],
  [/farmacia|drogaria|hospital|clinica|medic|academia/, "Sa\xFAde"],
  [/netflix|spotify|prime video|disney|youtube|hbo|max\b|apple\.com|google one/, "Assinaturas"],
  [/aluguel|condominio|iptu/, "Moradia"],
  [/energia|celesc|luz|agua|casan|internet|vivo|claro|tim\b|oi\b/, "Contas da casa"],
  [/escola|faculdade|curso|livraria/, "Educa\xE7\xE3o"],
  [/cinema|ingresso|show|steam|playstation/, "Lazer"],
  [/renner|riachuelo|c&a|zara|shein|calcado/, "Roupas"]
];
function sugerirCategoria(descricao, categorias) {
  const d = descricao.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const achada = SUGESTOES.find(([re, c]) => re.test(d) && categorias.includes(c));
  return achada?.[1] ?? "Outros";
}

// supabase/functions/telegram/mensagem.ts
var EXEMPLO = 'Tenta assim: "mercado 45,90" ou "t\xEAnis 600 em 3x no Nubank".';
var limpar = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var CONECTIVOS = /* @__PURE__ */ new Set(["de", "do", "da", "no", "na", "em", "com", "o", "a", "um", "uma", "pra", "para", "pelo", "pela", "via", "e"]);
var VERBOS_GASTO = /* @__PURE__ */ new Set(["gastei", "paguei", "comprei", "compra", "gasto"]);
var VERBOS_RECEITA = /* @__PURE__ */ new Set(["recebi", "ganhei", "entrou", "caiu", "recebido"]);
function lerValor(token) {
  const m = /^(?:r\$)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/.exec(token);
  if (!m) return null;
  const cent = Math.round(Number(m[1].includes(",") || /\.\d{3}/.test(m[1]) ? m[1].replace(/\./g, "").replace(",", ".") : m[1]) * 100);
  return cent > 0 ? cent : null;
}
function somarDias(data, dias) {
  const d = /* @__PURE__ */ new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function lerData(token, hoje) {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
  if (!m) return null;
  const ano = m[3] ? m[3].length === 2 ? `20${m[3]}` : m[3] : hoje.slice(0, 4);
  const data = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = /* @__PURE__ */ new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) return null;
  return !m[3] && data > hoje ? `${Number(ano) - 1}${data.slice(4)}` : data;
}
function acharNome(tokens, itens) {
  const ordenados = [...itens].sort((a, b) => b.nome.length - a.nome.length);
  for (const item of ordenados) {
    const partes = limpar(item.nome).split(/\s+/).filter(Boolean);
    for (let i = 0; i + partes.length <= tokens.length; i++) {
      if (partes.every((p, j) => limpar(tokens[i + j]) === p)) {
        const inicio = i > 0 && CONECTIVOS.has(limpar(tokens[i - 1])) ? i - 1 : i;
        return { item, resto: [...tokens.slice(0, inicio), ...tokens.slice(i + partes.length)] };
      }
    }
  }
  return null;
}
function interpretar(texto, ctx) {
  const bruto = texto.trim();
  const simples = limpar(bruto).replace(/[.!?]+$/, "");
  if (!bruto || /^\/(start|ajuda|help)\b/.test(simples) || simples === "ajuda") return { acao: "ajuda" };
  if (/^(\/desfazer|desfazer|desfaz|apaga( o)? ultimo|apagar( o)? ultimo)$/.test(simples)) return { acao: "desfazer" };
  if (bruto.includes("\n")) return { acao: "duvida", motivo: "Manda um lan\xE7amento por mensagem." };
  const preparado = bruto.replace(/^\+\s*/, "").replace(/r\$\s+/gi, "R$").replace(/\b(\d{1,2})\s*(?:x|vezes)\b/gi, "$1x");
  let tokens = preparado.split(/\s+/).map((t) => t.replace(/[.,;:!?]+$/, "")).filter(Boolean);
  if (/^(transferi|transferencia|guardei)$/.test(limpar(tokens[0] ?? ""))) {
    return { acao: "duvida", motivo: "Transfer\xEAncia e dinheiro guardado eu ainda n\xE3o lan\xE7o. Usa o app para esses." };
  }
  let data = ctx.hoje;
  let parcelas = 1;
  let usaCartao = false;
  const valores = [];
  const resto = [];
  for (const t of tokens) {
    const n = limpar(t);
    const parcela = /^(\d{1,2})x$/.exec(n);
    const dataLida = lerData(t, ctx.hoje);
    if (n === "hoje") continue;
    if (n === "ontem") data = somarDias(ctx.hoje, -1);
    else if (n === "anteontem") data = somarDias(ctx.hoje, -2);
    else if (dataLida) data = dataLida;
    else if (/^\d{1,2}\/\d{1,2}/.test(t)) return { acao: "duvida", motivo: `N\xE3o entendi a data "${t}". Usa o formato 25/10.` };
    else if (parcela) {
      parcelas = Number(parcela[1]);
      if (resto.length && limpar(resto[resto.length - 1]) === "em") resto.pop();
    } else if (n === "cartao" || n === "credito") {
      usaCartao = true;
      while (resto.length && CONECTIVOS.has(limpar(resto[resto.length - 1]))) resto.pop();
    } else if (n === "reais" || n === "real" || n === "r$") continue;
    else {
      const v = lerValor(n);
      if (v) valores.push(v);
      else resto.push(t);
    }
  }
  if (valores.length === 0) return { acao: "duvida", motivo: `N\xE3o achei o valor. ${EXEMPLO}` };
  if (valores.length > 1) return { acao: "duvida", motivo: `Achei mais de um valor na mensagem. Manda um lan\xE7amento por vez. ${EXEMPLO}` };
  if (parcelas < 1 || parcelas > 24) return { acao: "duvida", motivo: "Parcelo de 1x at\xE9 24x." };
  tokens = resto;
  const cartao = acharNome(tokens, ctx.cartoes);
  if (cartao) tokens = cartao.resto;
  const conta = cartao ? null : acharNome(tokens, ctx.contas);
  if (conta) tokens = conta.resto;
  const primeira = limpar(tokens[0] ?? "");
  const receita = VERBOS_RECEITA.has(primeira) || bruto.startsWith("+") || /^(salario|pagamento recebido)/.test(limpar(tokens.join(" ")));
  if (VERBOS_GASTO.has(primeira) || VERBOS_RECEITA.has(primeira)) tokens = tokens.slice(1);
  while (tokens.length && CONECTIVOS.has(limpar(tokens[0]))) tokens = tokens.slice(1);
  while (tokens.length && CONECTIVOS.has(limpar(tokens[tokens.length - 1]))) tokens = tokens.slice(0, -1);
  const descricao = tokens.join(" ").slice(0, 120);
  if (!descricao) return { acao: "duvida", motivo: `Faltou dizer o que foi. ${EXEMPLO}` };
  let cartaoId = cartao?.item.id ?? null;
  if (!receita && !cartaoId && (usaCartao || parcelas > 1)) {
    if (ctx.cartoes.length !== 1) {
      const nomes = ctx.cartoes.map((c) => c.nome).join(", ");
      return { acao: "duvida", motivo: nomes ? `Em qual cart\xE3o? Tenho: ${nomes}.` : "Ainda n\xE3o tem cart\xE3o cadastrado no app." };
    }
    cartaoId = ctx.cartoes[0].id;
  }
  if (receita && cartaoId) return { acao: "duvida", motivo: "Entrada de dinheiro n\xE3o vai em cart\xE3o. Diz a conta ou tira o cart\xE3o da mensagem." };
  return {
    acao: "lancar",
    tipo: receita ? "receita" : "despesa",
    valor_cent: valores[0],
    descricao: descricao[0].toUpperCase() + descricao.slice(1),
    data,
    parcelas: cartaoId ? parcelas : 1,
    cartaoId,
    contaId: conta?.item.id ?? (cartaoId ? null : ctx.contas[0]?.id ?? null)
  };
}

// supabase/functions/telegram/bot.ts
var AJUDA = `Manda assim que eu lan\xE7o:

mercado 45,90
uber 18 ontem
recebi 3200 de sal\xE1rio
t\xEAnis 600 em 3x no Nubank

Para apagar o \xFAltimo que lancei: desfazer`;
var limpar2 = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var hojeEmBrasilia = (agora) => agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
async function segredoDoWebhook(tokenBot) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`webhook:${tokenBot}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function escolherCategoria(descricao, categorias) {
  const texto = limpar2(descricao);
  return categorias.find((c) => limpar2(c) !== "outros" && texto.includes(limpar2(c))) ?? sugerirCategoria(descricao, categorias);
}
async function tratar(req, env, agora = /* @__PURE__ */ new Date()) {
  const banco = async (caminho, init = {}) => {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${caminho}`, {
      ...init,
      headers: { apikey: env.chaveServico, Authorization: `Bearer ${env.chaveServico}`, "Content-Type": "application/json", ...init.headers }
    });
    if (!r.ok && r.status !== 409) throw new Error(`banco ${r.status}`);
    return r;
  };
  const lista = async (caminho) => await (await banco(caminho)).json();
  const telegram = (metodo, corpo) => fetch(`https://api.telegram.org/bot${env.tokenBot}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });
  const segredo = await segredoDoWebhook(env.tokenBot);
  if (req.method === "GET") {
    const r = await telegram("setWebhook", { url: env.urlFuncao, secret_token: segredo, allowed_updates: ["message"] });
    return new Response(r.ok ? "Bot ligado." : "N\xE3o consegui ligar o bot. Confira o token.", { status: r.ok ? 200 : 502 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== segredo) return new Response("Proibido", { status: 403 });
  const update = await req.json();
  const msg = update.message;
  if (!msg?.from?.id || msg.chat?.type !== "private") return new Response("ok");
  const responder = (text) => telegram("sendMessage", { chat_id: msg.chat.id, text });
  try {
    const [ligacao] = await lista(`telegram_usuarios?telegram_id=eq.${Number(msg.from.id)}&select=dono`);
    if (!ligacao) {
      await responder(`Este bot \xE9 privado. Teu ID do Telegram \xE9 ${msg.from.id}.`);
      return new Response("ok");
    }
    if (typeof msg.text !== "string") {
      await responder(`Por enquanto s\xF3 entendo texto.

${AJUDA}`);
      return new Response("ok");
    }
    const dono = `dono=eq.${ligacao.dono}`;
    const [cartoes, contas, categorias] = await Promise.all([
      lista(`cartoes?${dono}&select=id,nome,dia_fechamento,dia_vencimento`),
      lista(`contas?${dono}&select=id,nome&order=nome`),
      lista(`categorias?${dono}&select=nome,tipo`)
    ]);
    const hoje = hojeEmBrasilia(agora);
    const pedido = interpretar(msg.text, { hoje, cartoes, contas });
    if (pedido.acao === "ajuda") await responder(AJUDA);
    else if (pedido.acao === "duvida") await responder(pedido.motivo);
    else if (pedido.acao === "desfazer") {
      const [ultimo] = await lista(
        `lancamentos?${dono}&import_hash=like.tg:*&select=id,descricao,parcela_grupo&order=criado_em.desc&limit=1`
      );
      if (!ultimo) await responder("N\xE3o h\xE1 nada lan\xE7ado por aqui para apagar.");
      else {
        const alvo = ultimo.parcela_grupo ? `parcela_grupo=eq.${ultimo.parcela_grupo}` : `id=eq.${ultimo.id}`;
        await banco(`lancamentos?${dono}&${alvo}`, { method: "DELETE" });
        await responder(`Apaguei: ${ultimo.descricao}.`);
      }
    } else {
      const nomes = categorias.filter((c) => c.tipo === pedido.tipo).map((c) => c.nome);
      const categoria = escolherCategoria(pedido.descricao, nomes);
      const cartao = cartoes.find((c) => c.id === pedido.cartaoId);
      const base = {
        dono: ligacao.dono,
        data: pedido.data,
        descricao: pedido.descricao,
        tipo: pedido.tipo,
        categoria,
        entrada: false,
        conta_id: pedido.contaId
      };
      const hash = `tg:${msg.chat.id}:${msg.message_id}`;
      let linhas;
      if (cartao) {
        const primeira = faturaDaCompra(pedido.data, cartao);
        const grupo = pedido.parcelas > 1 ? crypto.randomUUID() : null;
        linhas = dividirParcelas(pedido.valor_cent, pedido.parcelas).map((v, i) => ({
          ...base,
          valor_cent: v,
          cartao_id: cartao.id,
          fatura_mes: somarMeses(primeira, i),
          parcela_grupo: grupo,
          parcela_num: pedido.parcelas > 1 ? i + 1 : null,
          parcela_total: pedido.parcelas > 1 ? pedido.parcelas : null,
          import_hash: `${hash}:${i}`
        }));
      } else {
        linhas = [{
          ...base,
          valor_cent: pedido.valor_cent,
          cartao_id: null,
          fatura_mes: null,
          parcela_grupo: null,
          parcela_num: null,
          parcela_total: null,
          import_hash: `${hash}:0`
        }];
      }
      const r = await banco("lancamentos", { method: "POST", body: JSON.stringify(linhas) });
      if (r.status === 409) return new Response("ok");
      const onde = cartao ? ` no ${cartao.nome}${pedido.parcelas > 1 ? ` em ${pedido.parcelas}x` : ""}` : "";
      const dia = pedido.data === hoje ? "hoje" : dataCurta(pedido.data);
      await responder(`${pedido.tipo === "receita" ? "Entrada" : "Gasto"} lan\xE7ado: ${pedido.descricao}, ${reais(pedido.valor_cent)}${onde}, ${dia}, em ${categoria}.

Errou? Manda "desfazer".`);
    }
  } catch (e) {
    console.error(e);
    await responder("N\xE3o consegui salvar agora. Tenta de novo em instantes.");
  }
  return new Response("ok");
}

// supabase/functions/telegram/index.ts
var supabaseUrl = Deno.env.get("SUPABASE_URL");
Deno.serve((req) => tratar(req, {
  supabaseUrl,
  chaveServico: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  tokenBot: Deno.env.get("TELEGRAM_BOT_TOKEN"),
  urlFuncao: `${supabaseUrl}/functions/v1/telegram`
}));
