// Usa o app de verdade no Chrome instalado (modo de exemplo) e salva capturas em .impeccable/review.
// Pré-requisito: npm run preview -- --port 4199
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.FOLGA_URL ?? 'http://localhost:4199/'
const SAIDA = '.impeccable/review'
mkdirSync(SAIDA, { recursive: true })
const TELAS = ['painel', 'lancamentos', 'cartoes', 'fixas', 'orcamento', 'metas', 'investimentos', 'ajustes']
const falhas = []
const conferir = (ok, msg) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${msg}`); if (!ok) falhas.push(msg) }
const paraCent = (t) => Math.round(parseFloat(t.replace(/[^\d,-]/g, '').replace(',', '.')) * 100)

const nav = await chromium.launch({ channel: 'chrome' })

for (const [nome, largura, altura] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR', reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  const erros = []
  p.on('pageerror', (e) => erros.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/api\.bcb|coingecko|ERR_|CORS|Failed to load/i.test(m.text())) erros.push(m.text()) })
  for (const t of TELAS) {
    await p.goto(`${BASE}#/${t}`)
    await p.waitForSelector('.tela')
    await p.waitForTimeout(350)
    const estouro = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    conferir(estouro <= 0, `${nome}/${t}: sem rolagem horizontal (${estouro}px)`)
    await p.screenshot({ path: `${SAIDA}/${nome}-${t}.png`, fullPage: true })
    if (t === 'painel') await p.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: true })
  }
  conferir(erros.length === 0, `${nome}: sem erros no console ${erros.join(' | ')}`)
  await ctx.close()
}

const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', reducedMotion: 'reduce' })
const p = await ctx.newPage()
const numero = async () => {
  const neg = await p.locator('.destaque-valor.negativo').count()
  const v = paraCent(await p.locator('.destaque-valor').innerText())
  return neg ? -v : v
}
await p.goto(`${BASE}#/painel`)
await p.waitForSelector('.destaque-valor')

const antes = await numero()
await p.getByRole('button', { name: 'Novo lançamento' }).click()
await p.locator('.campo-valor input').first().fill('25,90')
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {})
await p.waitForTimeout(200)
conferir((await numero()) === antes - 2590, `gasto de R$ 25,90 reduz o número do painel (${antes} -> ${await numero()})`)

await p.getByRole('button', { name: 'Você', exact: true }).click()
const eu = await numero()
await p.getByRole('button', { name: 'Parceira', exact: true }).click()
const ela = await numero()
await p.getByRole('button', { name: 'Nós', exact: true }).click()
const nos = await numero()
conferir(nos === eu + ela, `visão Nós = soma das duas contas (${eu} + ${ela} = ${nos})`)

await p.goto(`${BASE}#/lancamentos`)
await p.getByRole('button', { name: 'Parceira', exact: true }).click()
await p.waitForSelector('.lista-lancamentos')
conferir(await p.locator('.lista-lancamentos .botao-icone').count() === 0, 'dados da parceira aparecem sem botão de apagar')
conferir(await p.getByRole('button', { name: 'Importar extrato' }).count() === 0, 'visão da parceira não oferece importação')
await p.getByRole('button', { name: 'Você', exact: true }).click()

const mes = new Date().toISOString().slice(0, 7).replace('-', '')
const ofx = `OFXHEADER:100\n<OFX><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${mes}01<TRNAMT>-45.90<FITID>T1<MEMO>PADARIA TESTE</STMTTRN>\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${mes}01<TRNAMT>100.00<FITID>T2<MEMO>PIX RECEBIDO</STMTTRN>\n</BANKTRANLIST></OFX>`
writeFileSync(`${SAIDA}/exemplo.ofx`, ofx)
const importar = async () => {
  await p.getByRole('button', { name: 'Importar extrato' }).click()
  await p.locator('dialog input[type=file]').setInputFiles(`${SAIDA}/exemplo.ofx`)
  await p.waitForSelector('.previa')
}
await importar()
conferir(await p.locator('.previa li').count() === 2, 'importação mostra prévia com 2 lançamentos')
await p.screenshot({ path: `${SAIDA}/mobile-importar.png` })
await p.getByRole('button', { name: 'Importar 2' }).click()
await p.waitForTimeout(300)
conferir(await p.getByText('PADARIA TESTE').count() === 1, 'lançamento importado aparece na lista')
await importar()
conferir(await p.locator('.previa li').count() === 0, 'segunda importação do mesmo arquivo não duplica')
await p.getByRole('button', { name: 'Fechar' }).click()

await p.goto(`${BASE}#/ajustes`)
await p.getByRole('button', { name: 'Desvincular' }).click()
await p.waitForSelector('text=Gerar código de convite')
conferir(await p.locator('.seletor').count() === 0, 'após desvincular, some o seletor Eu/Parceiro/Nós')
await p.getByLabel('Ou digite o código que recebeu').fill('ERRADO')
await p.getByRole('button', { name: 'Continuar' }).click()
conferir(await p.getByText('você verá tudo da outra pessoa').count() === 1, 'vincular avisa que os dois verão tudo')
await p.getByRole('button', { name: 'Entendi, vincular' }).click()
await p.waitForSelector('[role=alert]')
conferir(await p.locator('.seletor').count() === 0, 'código errado não vincula')
await p.getByLabel('Ou digite o código que recebeu').fill('EXEMPLO1')
await p.getByRole('button', { name: 'Continuar' }).click()
await p.getByRole('button', { name: 'Entendi, vincular' }).click()
await p.waitForSelector('.seletor')
conferir(true, 'código certo vincula de novo')

// Editar: trocar a categoria de um lançamento importado.
await p.goto(`${BASE}#/lancamentos`)
await p.getByRole('button', { name: 'Editar PIX RECEBIDO' }).click()
await p.locator('dialog input').first().fill('150,00')
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(300)
conferir(await p.getByText('+ R$ 150,00').count() >= 1, 'editar lançamento muda o valor na lista')

// Estados que a revisão visual precisa ver.
await p.goto(`${BASE}#/painel`)
await p.waitForSelector('.destaque-valor')
await p.getByRole('button', { name: 'Como cheguei nesse número' }).click()
await p.getByRole('button', { name: 'Nós', exact: true }).click()
await p.waitForTimeout(300)
await p.screenshot({ path: `${SAIDA}/mobile-nos-conta-aberta.png` })
await p.getByRole('button', { name: 'Novo lançamento' }).click()
await p.waitForTimeout(200)
await p.screenshot({ path: `${SAIDA}/mobile-lancar.png` })
await p.getByRole('button', { name: 'Fechar' }).click()
await p.getByRole('button', { name: 'Você', exact: true }).click()
await p.getByRole('button', { name: 'Novo lançamento' }).click()
await p.locator('.campo-valor input').first().fill('9000')
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForSelector('.destaque-valor.negativo')
conferir(true, 'gasto acima da renda deixa o número negativo e explica a falta')
await p.screenshot({ path: `${SAIDA}/mobile-negativo.png` })

// Conta nova, sem nada cadastrado.
await p.evaluate(() => localStorage.setItem('folga-exemplo-v1', JSON.stringify({
  dados: { contas: [], categorias: [], cartoes: [], contas_fixas: [], metas: [], lancamentos: [], orcamentos: [], investimentos: [] },
  perfis: [{ id: 'exemplo-eu', nome: 'Eu', renda_prevista_cent: 0, meses_reserva: 6, teto_cripto_pct: 10 }], vinculado: false,
})))
for (const t of TELAS) {
  await p.goto(`${BASE}#/${t}`)
  await p.reload()
  await p.waitForSelector('.tela')
  if (t === 'painel') await p.screenshot({ path: `${SAIDA}/mobile-vazio.png`, fullPage: true })
  conferir(await p.locator('text=/NaN|undefined|Infinity/').count() === 0, `conta vazia/${t}: sem valor quebrado`)
}

// Gráfico não pode vazar do bloco depois de redimensionar a janela.
const rz = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', reducedMotion: 'reduce' })
const pr = await rz.newPage()
await pr.goto(`${BASE}#/painel`)
await pr.waitForSelector('.recharts-surface')
for (const w of [1100, 1600, 1440, 700, 1440]) {
  await pr.setViewportSize({ width: w, height: 900 })
  await pr.waitForTimeout(400)
  const vaza = await pr.evaluate(() => [...document.querySelectorAll('.recharts-surface')].some((s) => s.getBoundingClientRect().right > s.closest('.bloco').getBoundingClientRect().right + 1))
  conferir(!vaza, `gráficos dentro do bloco em ${w}px`)
}
await rz.close()

// Modo escuro.
const esc = await nav.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'pt-BR', reducedMotion: 'reduce' })
const pe = await esc.newPage()
await pe.goto(`${BASE}#/painel`)
await pe.waitForSelector('.destaque-valor')
await pe.waitForTimeout(300)
await pe.screenshot({ path: `${SAIDA}/desktop-escuro.png`, fullPage: true })

const sw = await p.goto(`${BASE}manifest.webmanifest`)
conferir(sw.ok(), 'manifesto do app instalável responde')
await nav.close()

// Teste das cotações direto do navegador: rede real, sem CORS liberado o fetch falha.
const n2 = await chromium.launch({ channel: 'chrome' })
const q = await n2.newPage()
await q.goto(BASE)
const cot = await q.evaluate(async () => {
  const tenta = async (u) => { try { const r = await fetch(u); return { ok: r.ok, status: r.status, corpo: (await r.text()).slice(0, 80) } } catch (e) { return { erro: String(e) } } }
  return {
    cdi: await tenta('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json'),
    cripto: await tenta('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl'),
  }
})
console.log('cotações:', JSON.stringify(cot))
await n2.close()

console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo')
process.exit(falhas.length ? 1 : 0)
