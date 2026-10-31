import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { useApp } from '../dados/contexto'
import { BotaoApagar, Campo, CampoValor, centavosValidos, Gaveta, Tela, Vazio } from '../componentes/base'
import { dataNoMes, diferencaDias, fixaPaga } from '../lib/calculos'
import { centavosParaCampo, dataCurta, mesLongo, plural, reais } from '../lib/formato'
import type { Fixa } from '../lib/tipos'

function FormFixa({ fixa, aoFechar }: { fixa?: Fixa; aoFechar: () => void }) {
  const { meus, inserir, atualizar, eu, erro } = useApp()
  const cats = meus.categorias.filter((c) => c.tipo === 'despesa')
  const [nome, setNome] = useState(fixa?.nome ?? '')
  const [valor, setValor] = useState(fixa ? centavosParaCampo(fixa.valor_cent) : '')
  const [dia, setDia] = useState(String(fixa?.dia_vencimento ?? ''))
  const [categoria, setCategoria] = useState(fixa?.categoria ?? cats[0]?.nome ?? 'Outros')
  const [assinatura, setAssinatura] = useState(fixa?.assinatura ?? false)
  const [problema, setProblema] = useState<string | null>(null)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(valor)
    if (!cent) { setProblema('Informe um valor maior que zero.'); return }
    const campos = { nome: nome.trim(), valor_cent: cent, dia_vencimento: Number(dia), categoria, assinatura, conta_id: fixa?.conta_id ?? meus.contas[0]?.id ?? null }
    const ok = fixa ? await atualizar('contas_fixas', fixa.id, campos) : await inserir('contas_fixas', [{ ...campos, dono: eu.id, ativa: true }])
    if (ok) aoFechar()
  }
  return (
    <form className="form" onSubmit={enviar}>
      <Campo rotulo="Nome"><input required value={nome} maxLength={60} placeholder="Aluguel, luz, internet…" onChange={(e) => setNome(e.target.value)} /></Campo>
      <div className="duas-colunas">
        <Campo rotulo="Valor"><CampoValor valor={valor} aoMudar={setValor} /></Campo>
        <Campo rotulo="Dia de vencimento"><input type="number" min={1} max={31} required value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Categoria">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{cats.map((c) => <option key={c.id}>{c.nome}</option>)}</select>
      </Campo>
      <label className="caixa"><input type="checkbox" checked={assinatura} onChange={(e) => setAssinatura(e.target.checked)} />É uma assinatura (streaming, app, clube…)</label>
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo">Salvar</button>
    </form>
  )
}

export function Fixas() {
  const { dados, repo, inserir, remover, somenteLeitura, hoje, mes, nomeDono, visao } = useApp()
  const [form, setForm] = useState<{ fixa?: Fixa } | null>(null)
  const ativas = dados.contas_fixas.filter((f) => f.ativa).sort((a, b) => a.dia_vencimento - b.dia_vencimento)
  const total = ativas.reduce((t, f) => t + f.valor_cent, 0)
  const assinaturas = ativas.filter((f) => f.assinatura)
  const totalAssinaturas = assinaturas.reduce((t, f) => t + f.valor_cent, 0)
  const pendente = ativas.filter((f) => !fixaPaga(f, dados.lancamentos, mes)).reduce((t, f) => t + f.valor_cent, 0)

  function pagar(f: Fixa) {
    inserir('lancamentos', [{
      dono: f.dono, data: hoje, descricao: f.nome, valor_cent: f.valor_cent, tipo: 'despesa', categoria: f.categoria,
      conta_id: f.conta_id, fixa_id: f.id, fixa_mes: mes, entrada: false,
    }])
  }
  function desfazer(f: Fixa) {
    const l = dados.lancamentos.find((x) => x.fixa_id === f.id && x.fixa_mes === mes)
    if (l) remover('lancamentos', l.id)
  }

  return (
    <Tela
      titulo="Contas fixas"
      descricao={`Situação de ${mesLongo(mes)}`}
      acao={!somenteLeitura && <button className="botao" onClick={() => setForm({})}>Nova conta</button>}
    >
      <div className="faixa-numeros">
        <div><span>Total por mês</span><b>{reais(total)}</b></div>
        <div><span>Falta pagar</span><b>{reais(pendente)}</b></div>
        <div><span>Assinaturas ({assinaturas.length})</span><b>{reais(totalAssinaturas)}</b><small>{reais(totalAssinaturas * 12)} por ano</small></div>
      </div>
      {ativas.length === 0 ? (
        <Vazio titulo="Nenhuma conta fixa" texto="Cadastre aluguel, luz, internet e assinaturas para receber aviso antes de vencer." />
      ) : (
        <ul className="bloco lista-fixas">
          {ativas.map((f) => {
            const paga = fixaPaga(f, dados.lancamentos, mes)
            const vence = dataNoMes(mes, f.dia_vencimento)
            const dias = diferencaDias(hoje, vence)
            const meu = f.dono === repo.usuarioId
            return (
              <li key={f.id} className={paga ? 'paga' : ''}>
                {meu ? (
                  <button
                    type="button" className={`marca ${paga ? 'marcada' : ''}`} aria-pressed={paga}
                    aria-label={paga ? `Desfazer pagamento de ${f.nome}` : `Marcar ${f.nome} como paga`}
                    onClick={() => (paga ? desfazer(f) : pagar(f))}
                  >{paga && <Check size={16} />}</button>
                ) : <span className={`marca ${paga ? 'marcada' : ''}`} aria-hidden="true">{paga && <Check size={16} />}</span>}
                <button type="button" className="lista-nome linha-editar" disabled={!meu} onClick={() => setForm({ fixa: f })} aria-label={meu ? `Editar ${f.nome}` : undefined}>
                  <span>{f.nome}{meu && <Pencil size={13} aria-hidden="true" className="lapis" />}</span>
                  <small>
                    {paga ? 'Paga' : dias < 0 ? `Atrasada ${plural(-dias, 'dia', 'dias')}` : dias === 0 ? 'Vence hoje' : `Vence em ${dataCurta(vence)}`}
                    {f.assinatura ? ' · Assinatura' : ''}{visao === 'nos' ? ` · ${nomeDono(f.dono)}` : ''}
                  </small>
                </button>
                <b>{reais(f.valor_cent)}</b>
                {meu && <BotaoApagar aoConfirmar={() => remover('contas_fixas', f.id)} />}
              </li>
            )
          })}
        </ul>
      )}
      <Gaveta titulo={form?.fixa ? 'Editar conta' : 'Nova conta fixa'} aberta={!!form} aoFechar={() => setForm(null)}>
        {form && <FormFixa fixa={form.fixa} aoFechar={() => setForm(null)} />}
      </Gaveta>
    </Tela>
  )
}
