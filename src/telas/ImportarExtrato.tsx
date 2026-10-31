import { useMemo, useState } from 'react'
import { useApp } from '../dados/contexto'
import { Campo } from '../componentes/base'
import { faturaDaCompra } from '../lib/calculos'
import { dataCurta, reais } from '../lib/formato'
import {
  decodificar, lerCSV, lerOFX, linhasDoCSV, separarNovas, sugerirCategoria, type LinhaExtrato, type TabelaCSV,
} from '../lib/importar'

export function ImportarExtrato({ aoFechar }: { aoFechar: () => void }) {
  const { meus, inserir, eu, erro } = useApp()
  const [linhas, setLinhas] = useState<LinhaExtrato[] | null>(null)
  const [csv, setCsv] = useState<TabelaCSV | null>(null)
  const [cols, setCols] = useState<[number, number, number]>([-1, -1, -1])
  const [problema, setProblema] = useState<string | null>(null)
  const [destino, setDestino] = useState(meus.contas[0] ? `conta:${meus.contas[0].id}` : meus.cartoes[0] ? `cartao:${meus.cartoes[0].id}` : '')
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [escolhidas, setEscolhidas] = useState<Record<string, string>>({})
  const catsDespesa = meus.categorias.filter((c) => c.tipo === 'despesa').map((c) => c.nome)
  const catsReceita = meus.categorias.filter((c) => c.tipo === 'receita').map((c) => c.nome)
  const categoriaDe = (l: LinhaExtrato) => escolhidas[l.hash]
    ?? (l.valor_cent < 0 ? sugerirCategoria(l.descricao, catsDespesa) : 'Outros')

  async function abrir(arquivo: File) {
    setProblema(null)
    setLinhas(null)
    setCsv(null)
    const texto = decodificar(new Uint8Array(await arquivo.arrayBuffer()))
    if (/\.ofx$|\.qfx$/i.test(arquivo.name) || /<OFX>/i.test(texto)) {
      const l = lerOFX(texto)
      if (!l.length) { setProblema('Não encontrei lançamentos nesse arquivo OFX. Confira se o banco exportou o período certo.'); return }
      setLinhas(l)
      return
    }
    const t = lerCSV(texto)
    if (!t) { setProblema('Não consegui ler esse arquivo. Use um OFX ou um CSV exportado pelo banco.'); return }
    setCsv(t)
    setCols([t.colData, t.colDescricao, t.colValor])
    if (t.colData >= 0 && t.colDescricao >= 0 && t.colValor >= 0) setLinhas(linhasDoCSV(t, t.colData, t.colDescricao, t.colValor))
  }

  function mudarColuna(i: 0 | 1 | 2, v: number) {
    const n = [...cols] as [number, number, number]
    n[i] = v
    setCols(n)
    if (csv && n.every((c) => c >= 0)) setLinhas(linhasDoCSV(csv, n[0], n[1], n[2]))
  }

  const sep = useMemo(() => (linhas ? separarNovas(linhas, meus.lancamentos.map((l) => l.import_hash)) : null), [linhas, meus.lancamentos])
  const paraImportar = sep?.novas.filter((l) => !desmarcadas.has(l.hash)) ?? []

  async function importar() {
    setSalvando(true)
    const cartao = destino.startsWith('cartao:') ? meus.cartoes.find((c) => `cartao:${c.id}` === destino) : undefined
    const contaId = destino.startsWith('conta:') ? destino.slice(6) : null
    const registros = paraImportar.map((l) => {
      const despesa = l.valor_cent < 0
      return {
        dono: eu.id, data: l.data, descricao: l.descricao, valor_cent: Math.abs(l.valor_cent),
        tipo: despesa ? 'despesa' : 'receita', categoria: categoriaDe(l), entrada: false,
        conta_id: contaId, import_hash: l.hash,
        cartao_id: despesa && cartao ? cartao.id : null,
        fatura_mes: despesa && cartao ? faturaDaCompra(l.data, cartao) : null,
      }
    })
    const ok = await inserir('lancamentos', registros)
    setSalvando(false)
    if (ok) aoFechar()
  }

  return (
    <div className="form">
      <p className="texto-fraco">O arquivo é lido aqui no seu aparelho e nada é enviado antes de você confirmar. Baixe o extrato no app ou site do banco, em OFX ou CSV.</p>
      <Campo rotulo="Arquivo do extrato">
        <input type="file" accept=".ofx,.qfx,.csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) abrir(f) }} />
      </Campo>
      {problema && <p className="erro" role="alert">{problema}</p>}
      {csv && (
        <div className="colunas-csv">
          {(['Coluna da data', 'Coluna da descrição', 'Coluna do valor'] as const).map((r, i) => (
            <Campo key={r} rotulo={r}>
              <select value={cols[i]} onChange={(e) => mudarColuna(i as 0 | 1 | 2, Number(e.target.value))}>
                <option value={-1}>Escolher</option>
                {csv.cabecalho.map((c, j) => <option key={j} value={j}>{c || `Coluna ${j + 1}`}</option>)}
              </select>
            </Campo>
          ))}
        </div>
      )}
      {sep && (
        <>
          <Campo rotulo="Este extrato é de">
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              {meus.contas.map((c) => <option key={c.id} value={`conta:${c.id}`}>{c.nome}</option>)}
              {meus.cartoes.map((c) => <option key={c.id} value={`cartao:${c.id}`}>{c.nome}</option>)}
            </select>
          </Campo>
          <p className="resumo-filtro">
            {paraImportar.length} para importar{sep.repetidas > 0 ? ` · ${sep.repetidas} já importados, ignorados` : ''}. Desmarque o que não for gasto nem renda, como pagamento de fatura.
          </p>
          <ul className="previa">
            {sep.novas.map((l) => (
              <li key={l.hash}>
                <select
                  aria-label={`Categoria de ${l.descricao}`} className="previa-categoria" value={categoriaDe(l)}
                  onChange={(e) => setEscolhidas({ ...escolhidas, [l.hash]: e.target.value })}
                >
                  {(l.valor_cent < 0 ? catsDespesa : catsReceita).map((c) => <option key={c}>{c}</option>)}
                </select>
                <label>
                  <input
                    type="checkbox" checked={!desmarcadas.has(l.hash)}
                    onChange={(e) => {
                      const n = new Set(desmarcadas)
                      if (e.target.checked) n.delete(l.hash); else n.add(l.hash)
                      setDesmarcadas(n)
                    }}
                  />
                  <span className="lista-nome">{l.descricao}<small>{dataCurta(l.data)}</small></span>
                  <b className={l.valor_cent > 0 ? 'valor-entrada' : ''}>{l.valor_cent > 0 ? '+ ' : ''}{reais(Math.abs(l.valor_cent))}</b>
                </label>
              </li>
            ))}
          </ul>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button className="botao botao-largo" disabled={salvando || !paraImportar.length || !destino} onClick={importar}>
            {salvando ? 'Importando…' : `Importar ${paraImportar.length}`}
          </button>        </>
      )}
    </div>
  )
}
