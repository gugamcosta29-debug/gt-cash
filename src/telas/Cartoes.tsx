import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { useApp } from '../dados/contexto'
import { Barra, BotaoApagar, Campo, CampoValor, centavosValidos, Gaveta, SeloNivel, Tela, Vazio } from '../componentes/base'
import { GraficoFuturo } from '../componentes/graficos'
import { comprometimentoFuturo, faturasDoCartao, mesDe, resumoMes, somarMeses } from '../lib/calculos'
import { centavosParaCampo, dataCurta, mesCurto, reais } from '../lib/formato'
import type { Cartao } from '../lib/tipos'

function FormCartao({ cartao, aoFechar }: { cartao?: Cartao; aoFechar: () => void }) {
  const { inserir, atualizar, eu, erro } = useApp()
  const [nome, setNome] = useState(cartao?.nome ?? '')
  const [limite, setLimite] = useState(cartao ? centavosParaCampo(cartao.limite_cent) : '')
  const [fech, setFech] = useState(String(cartao?.dia_fechamento ?? ''))
  const [venc, setVenc] = useState(String(cartao?.dia_vencimento ?? ''))
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const campos = { nome: nome.trim(), limite_cent: centavosValidos(limite) ?? 0, dia_fechamento: Number(fech), dia_vencimento: Number(venc) }
    const ok = cartao ? await atualizar('cartoes', cartao.id, campos) : await inserir('cartoes', [{ ...campos, dono: eu.id }])
    if (ok) aoFechar()
  }
  return (
    <form className="form" onSubmit={enviar}>
      <Campo rotulo="Nome"><input required value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="Limite"><CampoValor valor={limite} aoMudar={setLimite} required={false} /></Campo>
      <div className="duas-colunas">
        <Campo rotulo="Dia de fechamento" dica="Compra a partir desse dia vai para a fatura seguinte."><input type="number" min={1} max={31} required value={fech} onChange={(e) => setFech(e.target.value)} /></Campo>
        <Campo rotulo="Dia de vencimento"><input type="number" min={1} max={31} required value={venc} onChange={(e) => setVenc(e.target.value)} /></Campo>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <button className="botao botao-largo">Salvar</button>
    </form>
  )
}

export function Cartoes() {
  const { dados, repo, atualizar, remover, somenteLeitura, perfisVisao, hoje, mes, nomeDono, visao } = useApp()
  const [form, setForm] = useState<{ cartao?: Cartao } | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const renda = resumoMes(dados, perfisVisao, mes, hoje).renda
  const futuro = comprometimentoFuturo(dados, hoje, renda)

  return (
    <Tela
      titulo="Cartões"
      descricao="Cada compra entra na fatura certa, conforme o dia de fechamento."
      acao={!somenteLeitura && <button className="botao" onClick={() => setForm({})}>Novo cartão</button>}
    >
      {dados.cartoes.length === 0 ? (
        <Vazio titulo="Nenhum cartão cadastrado" texto="Cadastre o cartão com os dias de fechamento e vencimento para acompanhar faturas e parcelas." />
      ) : (
        <div className="grade-cartoes">
          {dados.cartoes.map((c) => {
            const faturas = faturasDoCartao(c, dados.lancamentos)
            const emAberto = faturas.filter((f) => !f.paga)
            const usado = emAberto.reduce((t, f) => t + f.total, 0)
            const atual = emAberto[0]
            const meu = c.dono === repo.usuarioId
            return (
              <article key={c.id} className="bloco">
                <header className="bloco-topo">
                  <h2><CreditCard size={18} aria-hidden="true" />{c.nome}{visao === 'nos' && <small> · {nomeDono(c.dono)}</small>}</h2>
                  {meu && (
                    <span className="acoes">
                      <button className="link-p" onClick={() => setForm({ cartao: c })}>Editar</button>
                      <BotaoApagar rotulo="Apagar cartão e compras" aoConfirmar={() => remover('cartoes', c.id)} />
                    </span>
                  )}
                </header>
                {atual ? (
                  <>
                    <p className="numero-medio">{reais(atual.total)}</p>
                    {atual.vencimento < hoje && <SeloNivel nivel="critico" />}
                    <p className="texto-fraco">
                      Fatura de {mesCurto(atual.mes)}, {atual.vencimento < hoje
                        ? `venceu em ${dataCurta(atual.vencimento)}. Quite antes de guardar ou investir.`
                        : `vence em ${dataCurta(atual.vencimento)} e fecha em ${dataCurta(atual.fechamento)}`}
                    </p>
                    {meu && (
                      <button className="botao botao-secundario botao-p" onClick={() => atualizar('cartoes', c.id, { paga_ate: atual.mes })}>
                        Marcar esta fatura como paga
                      </button>
                    )}
                  </>
                ) : <p className="texto-fraco">Nenhuma fatura em aberto.</p>}
                {meu && c.paga_ate && mesDe(hoje) >= c.paga_ate && (
                  <button className="link-p" onClick={() => atualizar('cartoes', c.id, { paga_ate: somarMeses(c.paga_ate!, -1) })}>
                    Desfazer pagamento de {mesCurto(c.paga_ate)}
                  </button>
                )}
                {c.limite_cent > 0 && (
                  <div className="limite">
                    <Barra pct={usado / c.limite_cent} nivel={usado / c.limite_cent >= 0.9 ? 'atencao' : undefined} rotulo="Limite usado" />
                    <span className="texto-fraco">{reais(usado)} usados de {reais(c.limite_cent)}, contando parcelas futuras</span>
                  </div>
                )}
                {emAberto.length > 0 && (
                  <ul className="lista-faturas">
                    {emAberto.slice(0, 7).map((f) => {
                      const k = `${c.id}-${f.mes}`
                      return (
                        <li key={k}>
                          <button type="button" aria-expanded={aberta === k} onClick={() => setAberta(aberta === k ? null : k)}>
                            <span>{mesCurto(f.mes)}</span><b>{reais(f.total)}</b>
                          </button>
                          {aberta === k && (
                            <ul className="itens-fatura">
                              {f.itens.map((l) => (
                                <li key={l.id}>
                                  <span>{l.descricao}{l.parcela_total ? ` (${l.parcela_num}/${l.parcela_total})` : ''}</span>
                                  <span>{reais(l.valor_cent)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      )}
      {dados.cartoes.length > 0 && (
        <article className="bloco">
          <h2>Já comprometido nos próximos meses</h2>
          {renda > 0 && <p className="texto-fraco">Faturas futuras, para uma renda de {reais(renda)} por mês.</p>}
          <GraficoFuturo dados={futuro} renda={renda} />
        </article>
      )}
      <Gaveta titulo={form?.cartao ? 'Editar cartão' : 'Novo cartão'} aberta={!!form} aoFechar={() => setForm(null)}>
        {form && <FormCartao cartao={form.cartao} aoFechar={() => setForm(null)} />}
      </Gaveta>
    </Tela>
  )
}
