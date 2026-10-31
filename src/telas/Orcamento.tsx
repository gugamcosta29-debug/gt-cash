import { useState } from 'react'
import { useApp } from '../dados/contexto'
import { Barra, BotaoApagar, Campo, CampoValor, centavosValidos, Gaveta, Tela, Vazio } from '../componentes/base'
import { orcamentosComGasto } from '../lib/calculos'
import { mesLongo, reais } from '../lib/formato'

function FormOrcamento({ aoFechar }: { aoFechar: () => void }) {
  const { meus, inserir, eu, erro } = useApp()
  const usadas = new Set(meus.orcamentos.map((o) => o.categoria))
  const cats = meus.categorias.filter((c) => c.tipo === 'despesa' && !usadas.has(c.nome))
  const [categoria, setCategoria] = useState(cats[0]?.nome ?? '')
  const [valor, setValor] = useState('')
  const [problema, setProblema] = useState<string | null>(null)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(valor)
    if (!cent) { setProblema('Informe um limite maior que zero.'); return }
    if (await inserir('orcamentos', [{ dono: eu.id, categoria, limite_cent: cent }])) aoFechar()
  }
  if (!cats.length) return <p className="texto-fraco">Todas as categorias já têm limite.</p>
  return (
    <form className="form" onSubmit={enviar}>
      <Campo rotulo="Categoria"><select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{cats.map((c) => <option key={c.id}>{c.nome}</option>)}</select></Campo>
      <Campo rotulo="Limite por mês"><CampoValor valor={valor} aoMudar={setValor} /></Campo>
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo">Salvar</button>
    </form>
  )
}

export function Orcamento() {
  const { dados, meus, remover, somenteLeitura, mes, visao } = useApp()
  const [novo, setNovo] = useState(false)
  const itens = orcamentosComGasto(dados, mes)
  const totalLimite = itens.reduce((t, i) => t + i.limite, 0)
  const totalGasto = itens.reduce((t, i) => t + i.gasto, 0)
  return (
    <Tela
      titulo="Orçamento"
      descricao={`Limites de ${mesLongo(mes)}${visao === 'nos' ? ', somando os dois' : ''}`}
      acao={!somenteLeitura && <button className="botao" onClick={() => setNovo(true)}>Novo limite</button>}
    >
      {itens.length === 0 ? (
        <Vazio titulo="Nenhum limite definido" texto="Comece pelas categorias que mais pesam, como mercado e restaurantes." />
      ) : (
        <>
          <p className="resumo-filtro">{reais(totalGasto)} gastos de {reais(totalLimite)} planejados</p>
          <ul className="bloco lista-orcamento">
            {itens.map((i) => {
              const meu = meus.orcamentos.find((o) => o.categoria === i.categoria)
              const estourou = i.pct >= 1
              return (
                <li key={i.categoria}>
                  <div className="orc-linha">
                    <strong>{i.categoria}</strong>
                    <span>{reais(i.gasto)} de {reais(i.limite)}</span>
                    {meu && !somenteLeitura && <BotaoApagar rotulo={`Remover limite de ${i.categoria}`} aoConfirmar={() => remover('orcamentos', meu.id)} />}
                  </div>
                  <Barra pct={i.pct} nivel={estourou ? 'critico' : i.pct >= 0.8 ? 'atencao' : undefined} rotulo={`${i.categoria}: ${Math.round(i.pct * 100)}% do limite`} />
                  <small className="texto-fraco">
                    {estourou ? `Passou ${reais(i.gasto - i.limite)} do limite (${Math.round(i.pct * 100)}%)` : `Restam ${reais(i.limite - i.gasto)} (${Math.round(i.pct * 100)}% usado)`}
                  </small>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <Gaveta titulo="Novo limite" aberta={novo} aoFechar={() => setNovo(false)}>
        {novo && <FormOrcamento aoFechar={() => setNovo(false)} />}
      </Gaveta>
    </Tela>
  )
}
