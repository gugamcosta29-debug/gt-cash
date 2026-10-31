import { useState } from 'react'
import { Download } from 'lucide-react'
import { useApp } from '../dados/contexto'
import { BotaoApagar, Campo, CampoValor, centavosValidos, Tela } from '../componentes/base'
import { centavosParaCampo, hojeISO } from '../lib/formato'
import type { Dados } from '../lib/tipos'

function paraCSV(linhas: Record<string, unknown>[]) {
  if (!linhas.length) return ''
  const colunas = Object.keys(linhas[0])
  const celula = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(';'))].join('\n')
}

function baixar(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function exportarTudo(meus: Dados) {
  const data = hojeISO()
  for (const [tabela, linhas] of Object.entries(meus)) {
    if ((linhas as unknown[]).length) baixar(`gt-cash-${tabela}-${data}.csv`, paraCSV(linhas as Record<string, unknown>[]))
  }
}

export function Ajustes() {
  const { eu, meus, repo, salvar, vinculo, inserir, remover, erro } = useApp()
  const [nome, setNome] = useState(eu.nome)
  const [renda, setRenda] = useState(centavosParaCampo(eu.renda_prevista_cent))
  const [meses, setMeses] = useState(String(eu.meses_reserva))
  const [teto, setTeto] = useState(String(eu.teto_cripto_pct))
  const [salvo, setSalvo] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [convite, setConvite] = useState<string | null>(vinculo.convitePendente)
  const [aceitando, setAceitando] = useState(false)
  const [contaNome, setContaNome] = useState('')
  const [contaSaldo, setContaSaldo] = useState('')

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault()
    const ok = await salvar(() => repo.atualizarPerfil({
      nome: nome.trim() || 'Eu', renda_prevista_cent: centavosValidos(renda) ?? 0,
      meses_reserva: Number(meses), teto_cripto_pct: Number(teto),
    }))
    setSalvo(ok)
  }

  async function criarConta(e: React.FormEvent) {
    e.preventDefault()
    const ok = await inserir('contas', [{ dono: eu.id, nome: contaNome.trim(), tipo: 'corrente', saldo_inicial_cent: centavosValidos(contaSaldo) ?? 0 }])
    if (ok) { setContaNome(''); setContaSaldo('') }
  }

  return (
    <Tela titulo="Ajustes">
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="grade-ajustes">
        <form className="bloco form" onSubmit={salvarPerfil}>
          <h2>Seus dados</h2>
          <Campo rotulo="Seu nome"><input value={nome} maxLength={40} onChange={(e) => { setNome(e.target.value); setSalvo(false) }} /></Campo>
          <Campo rotulo="Renda prevista por mês" dica="Usada até o salário entrar nos lançamentos, para o número do painel já fazer sentido."><CampoValor valor={renda} aoMudar={(v) => { setRenda(v); setSalvo(false) }} required={false} /></Campo>
          <div className="duas-colunas">
            <Campo rotulo="Meses de reserva"><input type="number" min={3} max={12} value={meses} onChange={(e) => { setMeses(e.target.value); setSalvo(false) }} /></Campo>
            <Campo rotulo="Teto de cripto (%)"><input type="number" min={0} max={100} value={teto} onChange={(e) => { setTeto(e.target.value); setSalvo(false) }} /></Campo>
          </div>
          <button className="botao">{salvo ? 'Salvo' : 'Salvar'}</button>
        </form>

        <article className="bloco">
          <h2>Contas</h2>
          <ul className="lista-simples-p">
            {meus.contas.map((c) => (
              <li key={c.id}>
                <span>{c.nome}</span>
                <BotaoApagar rotulo={`Apagar ${c.nome}`} aoConfirmar={() => remover('contas', c.id)} />
              </li>
            ))}
          </ul>
          <form className="form" onSubmit={criarConta}>
            <Campo rotulo="Nome da conta"><input required value={contaNome} maxLength={40} placeholder="Banco, carteira…" onChange={(e) => setContaNome(e.target.value)} /></Campo>
            <Campo rotulo="Saldo hoje"><CampoValor valor={contaSaldo} aoMudar={setContaSaldo} required={false} /></Campo>
            <button className="botao botao-secundario">Adicionar conta</button>
          </form>
        </article>

        <article className="bloco">
          <h2>Conta conjunta</h2>
          {vinculo.parceiro ? (
            <>
              <p>Você e {vinculo.parceiro.nome} estão vinculados. Cada um vê tudo do outro, mas só edita o que é seu.</p>
              <button className="botao botao-perigo-contorno" onClick={() => salvar(() => repo.desvincular())}>Desvincular</button>
              <p className="campo-dica">O acesso acaba na hora, para os dois. Nenhum dado é apagado.</p>
            </>
          ) : (
            <>
              <p>Ao vincular, <strong>os dois passam a ver tudo um do outro</strong>: gastos, contas, cartões e investimentos. Cada um continua editando só o que é seu, e dá para desvincular quando quiser.</p>
              <div className="form">
                <button className="botao botao-secundario" onClick={async () => {
                  let novo = ''
                  if (await salvar(async () => { novo = await repo.gerarConvite() })) setConvite(novo)
                }}>Gerar código de convite</button>
                {convite && <p className="codigo-convite">Envie este código para a outra pessoa: <strong>{convite}</strong><small>Vale por 7 dias.</small></p>}
                <Campo rotulo="Ou digite o código que recebeu"><input value={codigo} autoCapitalize="characters" onChange={(e) => { setCodigo(e.target.value); setAceitando(false) }} /></Campo>
                {!aceitando ? (
                  <button className="botao botao-secundario" disabled={!codigo.trim()} onClick={() => setAceitando(true)}>Continuar</button>
                ) : (
                  <>
                    <p className="aviso-vinculo">Confirmando, você verá tudo da outra pessoa e ela verá tudo seu.</p>
                    <button className="botao" onClick={() => salvar(() => repo.aceitarConvite(codigo))}>Entendi, vincular</button>
                  </>
                )}
              </div>
            </>
          )}
        </article>

        <article className="bloco">
          <h2>Seus dados em arquivo</h2>
          <p className="texto-fraco">Baixa uma planilha (CSV) para cada tipo de dado seu. Bom para ter um backup de vez em quando.</p>
          <button className="botao botao-secundario" onClick={() => exportarTudo(meus)}><Download size={16} />Baixar backup</button>
        </article>

        <article className="bloco">
          <h2>Sessão</h2>
          <button className="botao botao-secundario" onClick={() => repo.sair()}>{repo.modo === 'exemplo' ? 'Sair do exemplo e restaurar os dados' : 'Sair da conta'}</button>
        </article>
      </div>
    </Tela>
  )
}
