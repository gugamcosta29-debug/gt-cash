import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Pencil, PiggyBank, Repeat, Upload } from 'lucide-react'
import { useApp } from '../dados/contexto'
import { BotaoApagar, Campo, CampoValor, centavosValidos, Gaveta, Tela, Vazio } from '../componentes/base'
import { dividirParcelas, faturaDaCompra, mesCaixa, somarMeses } from '../lib/calculos'
import { centavosParaCampo, dataCurta, mesCurto, reais } from '../lib/formato'
import type { Lancamento, TipoLancamento } from '../lib/tipos'
import { ImportarExtrato } from './ImportarExtrato'

const TIPOS: { id: TipoLancamento; nome: string }[] = [
  { id: 'despesa', nome: 'Gasto' },
  { id: 'receita', nome: 'Entrada' },
  { id: 'transferencia', nome: 'Transferência' },
]

export function FormLancamento({ aoFechar }: { aoFechar: () => void }) {
  const { meus, inserir, eu, hoje, erro } = useApp()
  const [tipo, setTipo] = useState<TipoLancamento>('despesa')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState(hoje)
  const cats = meus.categorias.filter((c) => c.tipo === (tipo === 'receita' ? 'receita' : 'despesa'))
  const [categoria, setCategoria] = useState('')
  const [origem, setOrigem] = useState(meus.contas[0] ? `conta:${meus.contas[0].id}` : meus.cartoes[0] ? `cartao:${meus.cartoes[0].id}` : '')
  const [parcelas, setParcelas] = useState(1)
  const [entrada, setEntrada] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [problema, setProblema] = useState<string | null>(null)
  const noCartao = origem.startsWith('cartao:')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(valor)
    if (!cent) { setProblema('Informe um valor maior que zero, como 25,90.'); return }
    setProblema(null)
    setSalvando(true)
    const cat = tipo === 'transferencia' ? null : categoria || cats[0]?.nome || 'Outros'
    const desc = descricao.trim() || cat || 'Transferência'
    const base = { dono: eu.id, data, descricao: desc, tipo, categoria: cat, entrada: tipo === 'transferencia' && entrada }
    const cartao = noCartao && tipo === 'despesa' ? meus.cartoes.find((c) => `cartao:${c.id}` === origem) : undefined
    let linhas: Record<string, unknown>[]
    if (cartao) {
      const primeira = faturaDaCompra(data, cartao)
      const grupo = parcelas > 1 ? crypto.randomUUID() : null
      linhas = dividirParcelas(cent, parcelas).map((v, i) => ({
        ...base, valor_cent: v, cartao_id: cartao.id, fatura_mes: somarMeses(primeira, i),
        parcela_grupo: grupo, parcela_num: parcelas > 1 ? i + 1 : null, parcela_total: parcelas > 1 ? parcelas : null,
      }))
    } else {
      linhas = [{ ...base, valor_cent: cent, conta_id: origem.startsWith('conta:') ? origem.slice(6) : null }]
    }
    const ok = await inserir('lancamentos', linhas)
    setSalvando(false)
    if (ok) aoFechar()
  }

  return (
    <form className="form" onSubmit={enviar}>
      <div className="abas-tipo" role="group" aria-label="Tipo de lançamento">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tipo === t.id} className={tipo === t.id ? 'ativo' : ''} onClick={() => { setTipo(t.id); setCategoria('') }}>{t.nome}</button>
        ))}
      </div>
      <Campo rotulo="Valor"><CampoValor valor={valor} aoMudar={setValor} autoFocus /></Campo>
      {tipo !== 'transferencia' && (
        <Campo rotulo="Categoria">
          <select value={categoria || cats[0]?.nome || ''} onChange={(e) => setCategoria(e.target.value)}>
            {cats.map((c) => <option key={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      )}
      {tipo === 'transferencia' && (
        <Campo rotulo="Direção" dica="Transferência entre vocês não conta como gasto nem como renda. Cada um lança o seu lado.">
          <select value={entrada ? 's' : 'n'} onChange={(e) => setEntrada(e.target.value === 's')}>
            <option value="n">Enviei</option>
            <option value="s">Recebi</option>
          </select>
        </Campo>
      )}
      <Campo rotulo={tipo === 'despesa' ? 'Pago com' : 'Conta'}>
        <select value={origem} onChange={(e) => { setOrigem(e.target.value); setParcelas(1) }}>
          {meus.contas.map((c) => <option key={c.id} value={`conta:${c.id}`}>{c.nome}</option>)}
          {tipo === 'despesa' && meus.cartoes.map((c) => <option key={c.id} value={`cartao:${c.id}`}>{c.nome}</option>)}
          {!meus.contas.length && (tipo !== 'despesa' || !meus.cartoes.length) && <option value="">Sem conta cadastrada</option>}
        </select>
      </Campo>
      {noCartao && tipo === 'despesa' && (
        <Campo rotulo="Parcelas">
          <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Data"><input type="date" value={data} required onChange={(e) => setData(e.target.value)} /></Campo>
      <Campo rotulo="Descrição (opcional)"><input value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} /></Campo>
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </form>
  )
}

function FormEditar({ l, aoFechar }: { l: Lancamento; aoFechar: () => void }) {
  const { meus, salvar, repo, erro } = useApp()
  const parcelado = !!l.parcela_grupo
  const cats = meus.categorias.filter((c) => c.tipo === (l.tipo === 'receita' ? 'receita' : 'despesa'))
  const [valor, setValor] = useState(centavosParaCampo(l.valor_cent))
  const [descricao, setDescricao] = useState(l.descricao)
  const [categoria, setCategoria] = useState(l.categoria ?? '')
  const [data, setData] = useState(l.data)
  const [problema, setProblema] = useState<string | null>(null)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const cent = centavosValidos(valor)
    if (!cent) { setProblema('Informe um valor maior que zero, como 25,90.'); return }
    const comuns = { descricao: descricao.trim() || l.descricao, categoria: l.categoria === null ? null : categoria }
    const ok = await salvar(async () => {
      if (parcelado) {
        // Em parcelas, valor e data definem as faturas: só nome e categoria mudam, em todas juntas.
        for (const x of meus.lancamentos.filter((y) => y.parcela_grupo === l.parcela_grupo)) {
          await repo.atualizar('lancamentos', x.id, comuns)
        }
        return
      }
      const cartao = l.cartao_id ? meus.cartoes.find((c) => c.id === l.cartao_id) : undefined
      await repo.atualizar('lancamentos', l.id, {
        ...comuns, valor_cent: cent, data, ...(cartao ? { fatura_mes: faturaDaCompra(data, cartao) } : {}),
      })
    })
    if (ok) aoFechar()
  }
  return (
    <form className="form" onSubmit={enviar}>
      {!parcelado && <Campo rotulo="Valor"><CampoValor valor={valor} aoMudar={setValor} /></Campo>}
      {parcelado && <p className="campo-dica">Compra em {l.parcela_total}x: a mudança vale para todas as parcelas. Para mudar valor ou data, apague e lance de novo.</p>}
      <Campo rotulo="Descrição"><input value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} /></Campo>
      {l.categoria !== null && (
        <Campo rotulo="Categoria">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {!cats.some((c) => c.nome === categoria) && <option>{categoria}</option>}
            {cats.map((c) => <option key={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      )}
      {!parcelado && <Campo rotulo="Data"><input type="date" value={data} required onChange={(e) => setData(e.target.value)} /></Campo>}
      {(problema || erro) && <p className="erro" role="alert">{problema ?? erro}</p>}
      <button className="botao botao-largo">Salvar</button>
    </form>
  )
}

function IconeLancamento({ l }: { l: Lancamento }) {
  if (l.tipo === 'receita') return <ArrowDownLeft size={18} />
  if (l.tipo === 'guardado') return <PiggyBank size={18} />
  if (l.tipo === 'transferencia') return <Repeat size={18} />
  if (l.cartao_id) return <CreditCard size={18} />
  return <ArrowUpRight size={18} />
}

export function Lancamentos({ aoAdicionar }: { aoAdicionar: () => void }) {
  const { dados, salvar, somenteLeitura, repo, nomeDono, visao, mes, atualizar } = useApp()
  const [importando, setImportando] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [mesFiltro, setMesFiltro] = useState(mes)
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return dados.lancamentos
      .filter((l) => mesCaixa(l) === mesFiltro)
      .filter((l) => !categoria || l.categoria === categoria)
      .filter((l) => !termo || l.descricao.toLowerCase().includes(termo))
      .sort((a, b) => b.data.localeCompare(a.data))
  }, [dados.lancamentos, mesFiltro, categoria, busca])

  const cats = [...new Set(dados.lancamentos.map((l) => l.categoria).filter(Boolean))].sort() as string[]
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mes, 3 - i))
  const somaDespesas = lista.filter((l) => l.tipo === 'despesa').reduce((t, l) => t + l.valor_cent, 0)
  const somaEntradas = lista.filter((l) => l.tipo === 'receita').reduce((t, l) => t + l.valor_cent, 0)

  return (
    <Tela
      titulo="Lançamentos"
      acao={!somenteLeitura && (
        <div className="acoes">
          <button className="botao botao-secundario" onClick={() => setImportando(true)}><Upload size={16} />Importar extrato</button>
          <button className="botao so-computador" onClick={aoAdicionar}>Novo lançamento</button>
        </div>
      )}
    >
      <div className="filtros">
        <select aria-label="Mês" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}>
          {meses.map((m) => <option key={m} value={m}>{mesCurto(m)}</option>)}
        </select>
        <select aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input aria-label="Buscar" placeholder="Buscar pela descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <p className="resumo-filtro">Entrou {reais(somaEntradas)} · Saiu {reais(somaDespesas)}</p>
      {lista.length === 0 ? (
        <Vazio titulo="Nada por aqui" texto="Nenhum lançamento com esses filtros." />
      ) : (
        <ul className="bloco lista-lancamentos">
          {lista.map((l) => {
            const meu = l.dono === repo.usuarioId
            return (
              <li key={l.id}>
                <span className={`icone-lanc tipo-${l.tipo}`} aria-hidden="true"><IconeLancamento l={l} /></span>
                <button type="button" className="lista-nome linha-editar" disabled={!meu} onClick={() => setEditando(l)} aria-label={meu ? `Editar ${l.descricao}` : undefined}>
                  <span>{l.descricao}{meu && <Pencil size={13} aria-hidden="true" className="lapis" />}</span>
                  <small>
                    {dataCurta(l.data)}{l.categoria ? ` · ${l.categoria}` : ''}
                    {l.parcela_total ? ` · ${l.parcela_num}/${l.parcela_total}` : ''}
                    {visao === 'nos' ? ` · ${nomeDono(l.dono)}` : ''}
                  </small>
                </button>
                <b className={l.tipo === 'receita' || (l.tipo === 'transferencia' && l.entrada) ? 'valor-entrada' : ''}>
                  {l.tipo === 'receita' || (l.tipo === 'transferencia' && l.entrada) ? '+ ' : ''}{reais(l.valor_cent)}
                </b>
                {meu && l.import_hash && l.tipo === 'despesa' && !l.cartao_id && (
                  <button type="button" className="link-p" title="Use para pagamento de fatura ou movimento entre contas, que não é gasto" onClick={() => atualizar('lancamentos', l.id, { tipo: 'transferencia', categoria: null })}>
                    Não é gasto
                  </button>
                )}
                {meu && <BotaoApagar aoConfirmar={() => {
                  // Parcela leva o grupo inteiro junto, para não sobrar compra pela metade.
                  const irmas = l.parcela_grupo ? dados.lancamentos.filter((x) => x.parcela_grupo === l.parcela_grupo) : [l]
                  salvar(async () => { for (const x of irmas) await repo.remover('lancamentos', x.id) })
                }} rotulo={l.parcela_grupo ? 'Apagar todas as parcelas' : 'Apagar'} />}
              </li>
            )
          })}
        </ul>
      )}
      <Gaveta titulo="Editar lançamento" aberta={!!editando} aoFechar={() => setEditando(null)}>
        {editando && <FormEditar l={editando} aoFechar={() => setEditando(null)} />}
      </Gaveta>
      <Gaveta titulo="Importar extrato" aberta={importando} aoFechar={() => setImportando(false)}>
        <ImportarExtrato aoFechar={() => setImportando(false)} />
      </Gaveta>
    </Tela>
  )
}
