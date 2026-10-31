import { useState } from 'react'
import { useApp } from '../dados/contexto'
import { BotaoApagar, Campo, CampoValor, centavosValidos, Gaveta, Tela, Vazio } from '../componentes/base'
import { BarraDivisao } from '../componentes/graficos'
import { reserva, valorInvestimento } from '../lib/calculos'
import { MOEDAS } from '../lib/cotacoes'
import { dataBr, reais } from '../lib/formato'
import type { TipoInvestimento } from '../lib/tipos'

const TIPOS: { id: TipoInvestimento; nome: string; cor: string }[] = [
  { id: 'caixinha', nome: 'Caixinha / liquidez', cor: 'var(--serie-1)' },
  { id: 'cdb', nome: 'CDB', cor: 'var(--serie-2)' },
  { id: 'tesouro', nome: 'Tesouro', cor: 'var(--serie-3)' },
  { id: 'cripto', nome: 'Cripto', cor: 'var(--serie-4)' },
  { id: 'outro', nome: 'Outro', cor: 'var(--serie-5)' },
]

function FormInvestimento({ aoFechar }: { aoFechar: () => void }) {
  const { salvar, repo, meus, eu, hoje, erro } = useApp()
  const [tipo, setTipo] = useState<TipoInvestimento>('caixinha')
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hoje)
  const [pct, setPct] = useState('100')
  const [venc, setVenc] = useState('')
  const [moeda, setMoeda] = useState('bitcoin')
  const [qtd, setQtd] = useState('')
  const [eReserva, setEReserva] = useState(true)
  const [saiuDoMes, setSaiuDoMes] = useState(true)
  const [problema, setProblema] = useState<string | null>(null)
  const cripto = tipo === 'cripto'
  const rendeCDI = tipo === 'cdb' || tipo === 'tesouro' || tipo === 'caixinha'

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(valor)
    if (!cent) { setProblema('Informe o valor aplicado.'); return }
    const quantidade = parseFloat(qtd.replace(',', '.'))
    if (cripto && !(quantidade > 0)) { setProblema('Informe a quantidade comprada, como 0,0006.'); return }
    const percentual = parseFloat(pct.replace(',', '.'))
    if (rendeCDI && !(percentual > 0)) { setProblema('Informe o percentual do CDI, como 100.'); return }
    const nomeFinal = nome.trim() || (cripto ? MOEDAS.find((m) => m.id === moeda)!.nome : TIPOS.find((t) => t.id === tipo)!.nome)
    const ok = await salvar(async () => {
      await repo.inserir('investimentos', [{
        dono: eu.id, tipo, nome: nomeFinal, data, valor_cent: cent,
        pct_cdi: rendeCDI ? percentual : null,
        vencimento: venc || null,
        moeda_id: cripto ? moeda : null,
        quantidade: cripto ? quantidade : null,
        e_reserva: !cripto && eReserva,
      }])
      if (saiuDoMes) {
        await repo.inserir('lancamentos', [{
          dono: eu.id, data, descricao: `Apliquei em ${nomeFinal}`, valor_cent: cent, tipo: 'guardado',
          conta_id: meus.contas[0]?.id ?? null, entrada: false,
        }])
      }
    })
    if (ok) aoFechar()
  }

  return (
    <form className="form" onSubmit={enviar}>
      <Campo rotulo="Tipo">
        <select value={tipo} onChange={(e) => { const t = e.target.value as TipoInvestimento; setTipo(t); setEReserva(t === 'caixinha') }}>
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </Campo>
      {cripto ? (
        <>
          <Campo rotulo="Moeda"><select value={moeda} onChange={(e) => setMoeda(e.target.value)}>{MOEDAS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Campo>
          <Campo rotulo="Quantidade comprada"><input inputMode="decimal" required placeholder="0,0006" value={qtd} onChange={(e) => setQtd(e.target.value)} /></Campo>
        </>
      ) : <Campo rotulo="Nome (opcional)"><input value={nome} maxLength={60} placeholder="Onde está aplicado" onChange={(e) => setNome(e.target.value)} /></Campo>}
      <Campo rotulo={cripto ? 'Quanto pagou no total' : 'Valor aplicado'}><CampoValor valor={valor} aoMudar={setValor} /></Campo>
      <Campo rotulo="Data da aplicação"><input type="date" required value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      {rendeCDI && <Campo rotulo="Rende quanto do CDI (%)"><input inputMode="decimal" required value={pct} onChange={(e) => setPct(e.target.value)} /></Campo>}
      {(tipo === 'cdb' || tipo === 'tesouro') && <Campo rotulo="Vencimento (opcional)"><input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Campo>}
      {!cripto && <label className="caixa"><input type="checkbox" checked={eReserva} onChange={(e) => setEReserva(e.target.checked)} />Faz parte da reserva de emergência</label>}
      <label className="caixa"><input type="checkbox" checked={saiuDoMes} onChange={(e) => setSaiuDoMes(e.target.checked)} />Saiu do dinheiro deste mês (desmarque para aplicação antiga)</label>
      {cripto && <p className="campo-dica">O preço pode cair muito em pouco tempo. Vale entrar só com dinheiro que pode ficar parado por anos.</p>}
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo">Salvar</button>
    </form>
  )
}

export function Investimentos() {
  const { dados, perfisVisao, eu, cot, hoje, repo, remover, somenteLeitura, nomeDono, visao } = useApp()
  const [novo, setNovo] = useState(false)
  const base = perfisVisao[0] ?? eu
  const itens = dados.investimentos.map((i) => ({ i, v: valorInvestimento(i, cot, hoje) }))
  const total = itens.reduce((t, x) => t + x.v.atual, 0)
  const aplicado = itens.reduce((t, x) => t + x.v.aplicado, 0)
  const res = reserva(dados, base.meses_reserva, cot, hoje)
  const carteira = itens.filter((x) => !x.i.e_reserva).reduce((t, x) => t + x.v.atual, 0)
  const cripto = itens.filter((x) => x.i.tipo === 'cripto').reduce((t, x) => t + x.v.atual, 0)
  const pctCripto = carteira > 0 ? cripto / carteira : 0
  const partes = TIPOS.map((t) => ({
    nome: t.nome, cor: t.cor,
    valor: itens.filter((x) => x.i.tipo === t.id).reduce((s, x) => s + x.v.atual, 0),
  }))
  const semCotacao = itens.some((x) => x.v.semCotacao)

  return (
    <Tela
      titulo="Investimentos"
      acao={!somenteLeitura && <button className="botao" onClick={() => setNovo(true)}>Nova aplicação</button>}
    >
      {itens.length === 0 ? (
        <Vazio titulo="Nada aplicado ainda" texto="O primeiro passo costuma ser a reserva de emergência, em aplicação com resgate imediato." />
      ) : (
        <>
          <article className="bloco">
            <h2>Valor estimado hoje</h2>
            <p className="numero-grande">{reais(total)}</p>
            <p className="texto-fraco">
              {reais(aplicado)} aplicados, {total >= aplicado ? 'rendimento' : 'variação'} de {total >= aplicado ? '' : '− '}{reais(Math.abs(total - aplicado))} já descontando IR estimado
            </p>
            <BarraDivisao partes={partes} />
          </article>
          {(dados.investimentos.some((i) => i.tipo === 'cripto') || res.faltam > 0) && (
            <article className="bloco nota-bloco">
              <h2>Cripto na carteira</h2>
              {res.faltam > 0 && <p>A reserva ainda não está pronta: faltam {reais(res.faltam)}. Vale completá-la antes de colocar mais em cripto, que pode cair muito.</p>}
              <p className="texto-fraco">Cripto é {Math.round(pctCripto * 100)}% da carteira fora da reserva; o teto definido é {base.teto_cripto_pct}%{pctCripto * 100 > base.teto_cripto_pct ? ', e já passou dele.' : '.'}</p>
            </article>
          )}
          <ul className="bloco lista-invest">
            {itens.map(({ i, v }) => (
              <li key={i.id}>
                <span className="lista-nome">
                  {i.nome}{i.e_reserva && <span className="etiqueta">Reserva</span>}
                  <small>
                    {TIPOS.find((t) => t.id === i.tipo)?.nome} · desde {dataBr(i.data)}
                    {i.pct_cdi ? ` · ${String(i.pct_cdi).replace('.', ',')}% do CDI` : ''}
                    {i.vencimento ? ` · vence ${dataBr(i.vencimento)}` : ''}
                    {i.quantidade ? ` · ${String(i.quantidade).replace('.', ',')} unid.` : ''}
                    {visao === 'nos' ? ` · ${nomeDono(i.dono)}` : ''}
                  </small>
                </span>
                <span className="valor-duplo">
                  <b>{reais(v.atual)}</b>
                  <small>{v.semCotacao ? 'sem cotação' : `${v.rendimento >= 0 ? '+' : '−'} ${reais(Math.abs(v.rendimento))}`}</small>
                </span>
                {i.dono === repo.usuarioId && <BotaoApagar aoConfirmar={() => remover('investimentos', i.id)} rotulo="Apagar aplicação" />}
              </li>
            ))}
          </ul>
          <p className="nota">
            Valores estimados, não são saldo do banco.{' '}
            {cot.cdi !== null ? `CDI de ${String(cot.cdi).replace('.', ',')}% ao ano (consulta de ${dataBr(cot.cdiData!)}), aplicado a todo o período.` : 'CDI indisponível no momento.'}{' '}
            {cot.precosData ? `Cripto cotada em ${dataBr(cot.precosData)}.` : ''}
            {semCotacao ? ' Sem cotação, mostramos o valor aplicado.' : ''}{' '}
            Orientação geral, não recomendação de investimento.
          </p>
        </>
      )}
      <Gaveta titulo="Nova aplicação" aberta={novo} aoFechar={() => setNovo(false)}>{novo && <FormInvestimento aoFechar={() => setNovo(false)} />}</Gaveta>
    </Tela>
  )
}
