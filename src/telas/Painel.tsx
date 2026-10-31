import { useState } from 'react'
import { CalendarClock, ChevronDown, CheckCircle2, Circle, CircleDot, ChevronRight } from 'lucide-react'
import { useApp } from '../dados/contexto'
import { BarraDivisao, GraficoCategorias, GraficoMeses, GraficoPatrimonio } from '../componentes/graficos'
import { SeloNivel, Vazio } from '../componentes/base'
import {
  dataNoMes, diferencaDias, faturasDoCartao, fixaPaga, gastosPorCategoria, orcamentosComGasto, patrimonio, resumoMes, serieMensal,
  seriePatrimonio, valorInvestimento,
} from '../lib/calculos'
import { dataCurta, mesLongo, plural, reais } from '../lib/formato'
import { gerarAvisos, ordemDoDinheiro, type EstadoPasso } from '../lib/regras'

const ICONE_PASSO: Record<EstadoPasso, typeof Circle> = { feito: CheckCircle2, agora: CircleDot, depois: Circle }
const NOME_PASSO: Record<EstadoPasso, string> = { feito: 'Feito', agora: 'Agora', depois: 'Depois' }

export function Painel({ irPara }: { irPara: (t: string) => void }) {
  const { dados, perfisVisao, eu, cot, hoje, mes } = useApp()
  // No computador há espaço ao lado do número, então a conta já abre visível.
  const [conta, setConta] = useState(() => matchMedia('(min-width: 1041px)').matches)
  const r = resumoMes(dados, perfisVisao, mes, hoje)
  const avisos = gerarAvisos(dados, perfisVisao, hoje)
  const passos = ordemDoDinheiro(dados, perfisVisao, perfisVisao[0] ?? eu, cot, hoje)
  const pat = patrimonio(dados, cot, hoje)
  const categorias = gastosPorCategoria(dados.lancamentos, mes)

  const contas = dados.contas_fixas
    .filter((f) => f.ativa && !fixaPaga(f, dados.lancamentos, mes))
    .map((f) => ({ id: f.id, nome: f.nome, valor: f.valor_cent, data: dataNoMes(mes, f.dia_vencimento), tela: 'fixas' }))
  const faturas = dados.cartoes.flatMap((c) => faturasDoCartao(c, dados.lancamentos)
    .filter((x) => !x.paga && x.mes <= mes)
    .map((x) => ({ id: `${c.id}-${x.mes}`, nome: `Fatura ${c.nome}`, valor: x.total, data: x.vencimento, tela: 'cartoes' })))
  const proximos = [...contas, ...faturas].sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5)

  const semDados = !dados.lancamentos.length && !dados.contas_fixas.length
  const negativo = r.disponivel < 0
  const semInicio = semDados && r.renda === 0
  const semCotacao = dados.investimentos.some((i) => valorInvestimento(i, cot, hoje).semCotacao)
  const noLimite = orcamentosComGasto(dados, mes).filter((o) => o.pct >= 0.8).map((o) => o.categoria)
  const meses = serieMensal(dados.lancamentos, mes, 6)
  const temHistorico = meses.some((m) => m.receitas || m.despesas)
  const historicoPat = seriePatrimonio(dados, mes, 6)
  const sobrou = (m: { receitas: number; despesas: number }) => m.receitas - m.despesas
  const atual = meses[5]
  const anterior = meses[4]

  return (
    <section className="tela painel">
      {!semInicio && (
        <div className="destaque">
          <div className="destaque-numero">
            <h1 className="destaque-titulo">{negativo ? `Faltam para fechar ${mesLongo(mes)}` : `Ainda dá para gastar em ${mesLongo(mes)}`}</h1>
            <p className={`destaque-valor ${negativo ? 'negativo' : ''}`}>{reais(Math.abs(r.disponivel))}</p>
            <p className="destaque-sub">
              {negativo
                ? 'Os gastos previstos passam da renda deste mês.'
                : `${reais(r.porDia)} por dia, nos próximos ${plural(r.diasRestantes, 'dia', 'dias')}`}
            </p>
            <button className="link-conta" type="button" aria-expanded={conta} onClick={() => setConta(!conta)}>
              Como cheguei nesse número <ChevronDown size={16} className={conta ? 'girado' : ''} />
            </button>
          </div>
          {conta && (
            <dl className="conta-numero">
              <div><dt>Renda {r.recebido < r.previsto ? 'prevista' : 'recebida'}</dt><dd>{reais(r.renda)}</dd></div>
              <div><dt>Gastos à vista e contas pagas</dt><dd>− {reais(r.gastoAvista)}</dd></div>
              <div><dt>Fatura do cartão deste mês</dt><dd>− {reais(r.fatura)}</dd></div>
              <div><dt>Contas fixas ainda por pagar</dt><dd>− {reais(r.fixasPendentes)}</dd></div>
              <div><dt>Guardado este mês</dt><dd>− {reais(r.guardado)}</dd></div>
              <div className="conta-total"><dt>{negativo ? 'Faltam' : 'Dá para gastar'}</dt><dd>{reais(Math.abs(r.disponivel))}</dd></div>
            </dl>
          )}
          <div className="destaque-divisao">
            <BarraDivisao partes={[
              { nome: 'Já gasto', valor: r.gastoAvista + r.fatura, cor: 'var(--serie-2)' },
              { nome: 'Contas por pagar', valor: r.fixasPendentes, cor: 'var(--serie-4)' },
              { nome: 'Guardado', valor: r.guardado, cor: 'var(--serie-3)' },
              { nome: 'Livre', valor: Math.max(r.disponivel, 0), cor: 'var(--serie-1)' },
            ]} />
          </div>
        </div>
      )}

      {semInicio && <h1>Bem-vindo ao G&T Cash</h1>}
      {semDados && (
        <Vazio
          titulo="Comece pela renda e pelas contas fixas"
          texto="Com a renda, o saldo e o aluguel cadastrados, o painel já mostra quanto dá para gastar. O resto entra aos poucos."
          acao={<div className="acoes"><button className="botao" onClick={() => irPara('ajustes')}>Informar renda e conta</button><button className="botao botao-secundario" onClick={() => irPara('fixas')}>Cadastrar contas fixas</button></div>}
        />
      )}

      <div className="grade-painel">
        <div className="coluna">
        <article className="bloco bloco-avisos" style={{ order: 1 }}>
          <h2>Avisos</h2>
          {avisos.length === 0 ? <p className="texto-fraco">Nada pedindo atenção agora.</p> : (
            <ul className="lista-avisos">
              {avisos.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => irPara(a.tela)}>
                    <span className="aviso-texto">
                      <span className="aviso-titulo"><strong>{a.titulo}</strong><SeloNivel nivel={a.nivel} /></span>
                      <span>{a.calculo}</span>
                      <span className="aviso-acao">{a.acao}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" className="seta" />
                  </button>
                </li>
              ))}
              {avisos.length > 6 && <li className="texto-fraco">E mais {plural(avisos.length - 6, 'aviso', 'avisos')}.</li>}
            </ul>
          )}
        </article>

        <article className="bloco" style={{ order: 3 }}>
          <h2>Para onde vai o que sobra</h2>
          <ol className="passos">
            {passos.map((p) => {
              const I = ICONE_PASSO[p.estado]
              return (
                <li key={p.id} className={`passo passo-${p.estado}`}>
                  <I size={20} aria-hidden="true" />
                  <div>
                    <strong>{p.titulo}</strong>
                    <span className="passo-estado">{NOME_PASSO[p.estado]}</span>
                    {p.estado !== 'feito' && <p>{p.detalhe}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="nota">Orientação geral, não recomendação de investimento. Nenhum ativo específico é indicado.</p>
        </article>
        </div>

        <div className="coluna">
        <article className="bloco" style={{ order: 2 }}>
          <h2>Próximos vencimentos</h2>
          {proximos.length === 0 ? <p className="texto-fraco">Nenhuma conta em aberto neste mês.</p> : (
            <ul className="lista-simples">
              {proximos.map((p) => {
                const dias = diferencaDias(hoje, p.data)
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => irPara(p.tela)}>
                      <CalendarClock size={18} aria-hidden="true" />
                      <span className="lista-nome">{p.nome}<small>{dias < 0 ? `venceu em ${dataCurta(p.data)}` : dias === 0 ? 'vence hoje' : `${dataCurta(p.data)}, em ${plural(dias, 'dia', 'dias')}`}</small></span>
                      <b>{reais(p.valor)}</b>
                      <ChevronRight size={16} aria-hidden="true" className="seta" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </article>

        <article className="bloco" style={{ order: 4 }}>
          <h2>Gastos de {mesLongo(mes).split(' ')[0]} por categoria</h2>
          {categorias.length ? <GraficoCategorias dados={categorias} destaques={noLimite} /> : <p className="texto-fraco">Sem gastos neste mês ainda.</p>}
        </article>

        <article className="bloco" style={{ order: 5 }}>
          <h2>Últimos 6 meses</h2>
          {temHistorico ? (
            <>
              <p className="texto-fraco">
                {sobrou(atual) >= 0 ? `Este mês sobraram ${reais(sobrou(atual))} até agora` : `Este mês saíram ${reais(-sobrou(atual))} a mais do que entrou`}
                {anterior.receitas || anterior.despesas ? `; no mês passado, ${sobrou(anterior) >= 0 ? 'sobraram' : 'faltaram'} ${reais(Math.abs(sobrou(anterior)))}.` : '.'}
              </p>
              <GraficoMeses dados={meses} />
            </>
          ) : <p className="texto-fraco">O gráfico aparece com os primeiros lançamentos.</p>}
        </article>

        </div>

        <article className="bloco bloco-largo" style={{ order: 6 }}>
          <h2>Patrimônio</h2>
          <p className="numero-medio">{reais(pat.total)}</p>
          <p className="texto-fraco patrimonio-partes">
            {reais(pat.contas)} em contas + {reais(pat.investido + pat.metas)} guardados − {reais(pat.divida)} no cartão
          </p>
          {semCotacao && <p className="nota">Cotação indisponível agora: os investimentos afetados aparecem pelo valor aplicado.</p>}
          {historicoPat.some((m) => m.total) && <GraficoPatrimonio dados={historicoPat} />}
        </article>
      </div>
    </section>
  )
}
