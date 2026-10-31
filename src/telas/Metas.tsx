import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useApp } from '../dados/contexto'
import { Barra, BotaoApagar, Campo, CampoValor, centavosValidos, Gaveta, Tela, Vazio } from '../componentes/base'
import { guardadoMeta, previsaoMeta, reserva } from '../lib/calculos'
import { dataBr, mesLongo, plural, reais } from '../lib/formato'
import type { Meta } from '../lib/tipos'

function FormMeta({ aoFechar }: { aoFechar: () => void }) {
  const { inserir, eu, erro } = useApp()
  const [nome, setNome] = useState('')
  const [alvo, setAlvo] = useState('')
  const [inicial, setInicial] = useState('')
  const [prazo, setPrazo] = useState('')
  const [problema, setProblema] = useState<string | null>(null)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(alvo)
    if (!cent) { setProblema('Informe um valor de meta maior que zero.'); return }
    const ok = await inserir('metas', [{ dono: eu.id, nome: nome.trim(), alvo_cent: cent, guardado_inicial_cent: centavosValidos(inicial) ?? 0, prazo: prazo || null }])
    if (ok) aoFechar()
  }
  return (
    <form className="form" onSubmit={enviar}>
      <Campo rotulo="Nome"><input required value={nome} maxLength={60} placeholder="Viagem, carro, casamento…" onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="Quanto quer juntar"><CampoValor valor={alvo} aoMudar={setAlvo} /></Campo>
      <Campo rotulo="Já tem guardado (opcional)"><CampoValor valor={inicial} aoMudar={setInicial} required={false} /></Campo>
      <Campo rotulo="Prazo (opcional)"><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo>
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo">Salvar</button>
    </form>
  )
}

function FormGuardar({ meta, aoFechar }: { meta: Meta; aoFechar: () => void }) {
  const { inserir, meus, eu, hoje, erro } = useApp()
  const [valor, setValor] = useState('')
  const [problema, setProblema] = useState<string | null>(null)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(valor)
    if (!cent) { setProblema('Informe um valor maior que zero.'); return }
    const ok = await inserir('lancamentos', [{
      dono: eu.id, data: hoje, descricao: `Guardei para ${meta.nome}`, valor_cent: cent, tipo: 'guardado', meta_id: meta.id,
      conta_id: meus.contas[0]?.id ?? null, entrada: false,
    }])
    if (ok) aoFechar()
  }
  return (
    <form className="form" onSubmit={enviar}>
      <Campo rotulo="Quanto guardou" dica="Sai do que dá para gastar neste mês."><CampoValor valor={valor} aoMudar={setValor} autoFocus /></Campo>
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo">Guardar</button>
    </form>
  )
}

export function Metas({ irPara }: { irPara: (t: string) => void }) {
  const { dados, perfisVisao, eu, cot, hoje, remover, repo, somenteLeitura, nomeDono, visao } = useApp()
  const [nova, setNova] = useState(false)
  const [guardar, setGuardar] = useState<Meta | null>(null)
  const meses = (perfisVisao[0] ?? eu).meses_reserva
  const r = reserva(dados, meses, cot, hoje)

  return (
    <Tela
      titulo="Metas e reserva"
      acao={!somenteLeitura && <button className="botao" onClick={() => setNova(true)}>Nova meta</button>}
    >
      <article className="bloco reserva">
        <h2><ShieldCheck size={20} aria-hidden="true" />Reserva de emergência</h2>
        {r.alvo === 0 ? (
          <p className="texto-fraco">Lance seus gastos por um mês para o app calcular o tamanho da reserva.</p>
        ) : (
          <>
            <p className="numero-grande">{reais(r.guardada)} <small>de {reais(r.alvo)}</small></p>
            <Barra pct={r.pct} nivel={r.pct >= 1 ? 'bom' : undefined} rotulo={`Reserva: ${Math.round(r.pct * 100)}%`} />
            <p>
              {r.faltam > 0
                ? `Faltam ${reais(r.faltam)}. O alvo é ${meses} × ${reais(r.gastoMedio)}, o gasto médio mensal real.`
                : `Completa: cobre ${meses} meses de gastos de ${reais(r.gastoMedio)}.`}
              {r.gastoMedio > 0 && (() => {
                // Arredonda para baixo: não afirmar um mês inteiro quando a reserva não cobre.
                const cobre = Math.floor((r.guardada / r.gastoMedio) * 10) / 10
                return ` Hoje cobre ${cobre.toLocaleString('pt-BR')} ${cobre < 2 ? 'mês' : 'meses'}.`
              })()}
            </p>
            <p className="texto-fraco">Conta tudo que estiver marcado como reserva em Investimentos. Guarde onde dá para sacar no mesmo dia.</p>
            {!somenteLeitura && <button className="botao botao-secundario botao-p" onClick={() => irPara('investimentos')}>Registrar valor na reserva</button>}
          </>
        )}
      </article>

      {dados.metas.length === 0 ? (
        <Vazio titulo="Nenhuma outra meta" texto="Crie uma meta para acompanhar quanto falta e quando deve chegar lá." />
      ) : (
        <ul className="grade-metas">
          {dados.metas.map((m) => {
            const guardado = guardadoMeta(m.id, m.guardado_inicial_cent, dados.lancamentos)
            const prev = previsaoMeta(m.alvo_cent, guardado, m.id, dados.lancamentos, hoje)
            const meu = m.dono === repo.usuarioId
            return (
              <li key={m.id} className="bloco">
                <header className="bloco-topo">
                  <h2>{m.nome}{visao === 'nos' && <small> · {nomeDono(m.dono)}</small>}</h2>
                  {meu && <BotaoApagar rotulo="Apagar meta" aoConfirmar={() => remover('metas', m.id)} />}
                </header>
                <p className="numero-medio">{reais(guardado)} <small>de {reais(m.alvo_cent)}</small></p>
                <Barra pct={guardado / m.alvo_cent} nivel={guardado >= m.alvo_cent ? 'bom' : undefined} rotulo={`${m.nome}: ${Math.round((guardado / m.alvo_cent) * 100)}%`} />
                <p className="texto-fraco">
                  {guardado >= m.alvo_cent ? 'Meta alcançada.'
                    : prev ? `No ritmo de ${reais(prev.ritmo)} por mês, chega em ${mesLongo(prev.mes)} (${plural(prev.meses, 'mês', 'meses')}).`
                    : 'Guarde a primeira parte para ver a previsão.'}
                  {m.prazo ? ` Prazo: ${dataBr(m.prazo)}.` : ''}
                </p>
                {meu && guardado < m.alvo_cent && <button className="botao botao-secundario botao-p" onClick={() => setGuardar(m)}>Guardar</button>}
              </li>
            )
          })}
        </ul>
      )}
      <Gaveta titulo="Nova meta" aberta={nova} aoFechar={() => setNova(false)}>{nova && <FormMeta aoFechar={() => setNova(false)} />}</Gaveta>
      <Gaveta titulo={guardar ? `Guardar para ${guardar.nome}` : ''} aberta={!!guardar} aoFechar={() => setGuardar(null)}>
        {guardar && <FormGuardar meta={guardar} aoFechar={() => setGuardar(null)} />}
      </Gaveta>
    </Tela>
  )
}
