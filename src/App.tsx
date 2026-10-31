import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  CalendarCheck, CreditCard, Gauge, Landmark, ListOrdered, Menu, PieChart, Plus, Settings, Target,
} from 'lucide-react'
import { ProvedorApp, useApp, type Visao } from './dados/contexto'
import { linkVencido, repositorioExemplo, repositorioNuvem, supabase, temNuvem, veioDeRecuperacao, type Repositorio } from './dados/repositorio'
import { Gaveta } from './componentes/base'
import { Marca } from './componentes/Marca'
import { Painel } from './telas/Painel'
import { FormLancamento, Lancamentos } from './telas/Lancamentos'
import { Cartoes } from './telas/Cartoes'
import { Fixas } from './telas/Fixas'
import { Orcamento } from './telas/Orcamento'
import { Metas } from './telas/Metas'
import { Investimentos } from './telas/Investimentos'
import { Ajustes } from './telas/Ajustes'
import { Entrar, NovaSenha } from './telas/Entrar'

const TELAS = [
  { id: 'painel', nome: 'Painel', icone: Gauge },
  { id: 'lancamentos', nome: 'Lançamentos', icone: ListOrdered },
  { id: 'cartoes', nome: 'Cartões', icone: CreditCard },
  { id: 'fixas', nome: 'Contas fixas', icone: CalendarCheck },
  { id: 'orcamento', nome: 'Orçamento', icone: PieChart },
  { id: 'metas', nome: 'Metas e reserva', icone: Target },
  { id: 'investimentos', nome: 'Investimentos', icone: Landmark },
  { id: 'ajustes', nome: 'Ajustes', icone: Settings },
]
const NO_RODAPE = ['painel', 'lancamentos', 'fixas']

function telaDaUrl() {
  const t = location.hash.replace(/^#\/?/, '')
  return TELAS.some((x) => x.id === t) ? t : 'painel'
}

function Interface() {
  const { repo, visao, setVisao, vinculo, somenteLeitura, eu, erro, limparErro } = useApp()
  const [tela, setTela] = useState(telaDaUrl)
  const [adicionando, setAdicionando] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const f = () => { setTela(telaDaUrl()); window.scrollTo(0, 0) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  const irPara = (t: string) => { location.hash = `/${t}`; setMenu(false) }

  const atual = TELAS.find((t) => t.id === tela)!
  const nomeParceiro = vinculo.parceiro?.nome ?? 'Parceiro(a)'
  const visoes: { id: Visao; nome: string }[] = [
    { id: 'eu', nome: eu.nome === 'Eu' ? 'Eu' : eu.nome },
    { id: 'parceiro', nome: nomeParceiro },
    { id: 'nos', nome: 'Nós' },
  ]

  const conteudo = useMemo(() => {
    switch (tela) {
      case 'lancamentos': return <Lancamentos aoAdicionar={() => setAdicionando(true)} />
      case 'cartoes': return <Cartoes />
      case 'fixas': return <Fixas />
      case 'orcamento': return <Orcamento />
      case 'metas': return <Metas irPara={irPara} />
      case 'investimentos': return <Investimentos />
      case 'ajustes': return <Ajustes />
      default: return <Painel irPara={irPara} />
    }
  }, [tela])

  return (
    <div className="app">
      <aside className="lateral">
        <Marca />
        <nav aria-label="Principal">
          {TELAS.map((t) => (
            <a key={t.id} href={`#/${t.id}`} aria-current={tela === t.id ? 'page' : undefined}>
              <t.icone size={18} aria-hidden="true" />{t.nome}
            </a>
          ))}
        </nav>
        <button className="botao botao-largo" onClick={() => setAdicionando(true)}><Plus size={18} />Lançar</button>
      </aside>

      <div className="principal">
        <header className="topo">
          <span className="so-celular"><Marca /></span>
          {vinculo.parceiro ? (
            <div className="seletor" role="group" aria-label="De quem são os dados">
              {visoes.map((v) => (
                <button key={v.id} aria-pressed={visao === v.id} className={visao === v.id ? 'ativo' : ''} onClick={() => setVisao(v.id)}>{v.nome}</button>
              ))}
            </div>
          ) : <span />}
        </header>

        {repo.modo === 'exemplo' && (
          <p className="faixa-exemplo">Exemplo com dados fictícios, salvos só neste navegador.</p>
        )}
        {somenteLeitura && <p className="faixa-leitura">Você está vendo os dados de {nomeParceiro}. Só quem cadastrou pode alterar.</p>}
        {erro && tela !== 'ajustes' && !adicionando && (
          <p className="erro faixa-erro" role="alert">{erro} <button className="link-p" onClick={limparErro}>Fechar</button></p>
        )}

        <main key={atual.id}>{conteudo}</main>
      </div>

      <nav className="rodape" aria-label="Atalhos">
        {TELAS.filter((t) => NO_RODAPE.includes(t.id)).slice(0, 2).map((t) => (
          <a key={t.id} href={`#/${t.id}`} aria-current={tela === t.id ? 'page' : undefined}><t.icone size={21} aria-hidden="true" /><span>{t.nome}</span></a>
        ))}
        <button className="rodape-mais" aria-label="Novo lançamento" onClick={() => setAdicionando(true)}><Plus size={26} /></button>
        <a href="#/fixas" aria-current={tela === 'fixas' ? 'page' : undefined}><CalendarCheck size={21} aria-hidden="true" /><span>Contas</span></a>
        <button className={!NO_RODAPE.includes(tela) ? 'atual' : ''} onClick={() => setMenu(true)}><Menu size={21} aria-hidden="true" /><span>Mais</span></button>
      </nav>

      <Gaveta titulo="Novo lançamento" aberta={adicionando} aoFechar={() => { setAdicionando(false); limparErro() }}>
        {adicionando && <FormLancamento aoFechar={() => setAdicionando(false)} />}
      </Gaveta>
      <Gaveta titulo="Mais" aberta={menu} aoFechar={() => setMenu(false)}>
        <div className="menu-mais">
          {TELAS.filter((t) => !NO_RODAPE.includes(t.id)).map((t) => (
            <button key={t.id} onClick={() => irPara(t.id)}><t.icone size={20} aria-hidden="true" />{t.nome}</button>
          ))}
        </div>
      </Gaveta>
    </div>
  )
}

function Carregando({ texto = 'Carregando seus dados…' }: { texto?: string }) {
  return <div className="carregando" role="status"><Marca /><p>{texto}</p></div>
}

export function App() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [pronta, setPronta] = useState(!temNuvem)
  const [exemplo, setExemplo] = useState(!temNuvem || new URLSearchParams(location.search).has('exemplo'))
  const [recuperando, setRecuperando] = useState(veioDeRecuperacao)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setPronta(true) })
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecuperando(true)
      setSessao(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const usuario = sessao?.user.id
  const repo = useMemo<Repositorio | null>(() => {
    if (exemplo) return repositorioExemplo(() => { if (temNuvem) setExemplo(false); else location.reload() })
    return usuario ? repositorioNuvem(usuario) : null
  }, [exemplo, usuario])

  if (!pronta) return <Carregando texto="Abrindo…" />
  if (recuperando && sessao) return <NovaSenha aoConcluir={() => setRecuperando(false)} />
  if (!repo) return <Entrar aoVerExemplo={() => setExemplo(true)} linkInvalido={linkVencido || recuperando} />
  return (
    <ProvedorApp
      key={repo.usuarioId}
      repo={repo}
      carregando={<Carregando />}
      falha={(msg, tentar) => (
        <div className="carregando" role="alert">
          <Marca />
          <p>Não consegui abrir seus dados. {msg}</p>
          <p className="campo-dica">Se o app ficou uma semana sem uso, o banco gratuito pode ter pausado: reative no painel do Supabase.</p>
          <button className="botao" onClick={tentar}>Tentar de novo</button>
        </div>
      )}
    >
      <Interface />
    </ProvedorApp>
  )
}
