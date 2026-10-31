import { useState } from 'react'
import { supabase } from '../dados/repositorio'
import { Campo } from '../componentes/base'
import { Marca } from '../componentes/Marca'

function traduzir(m: string) {
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta. Use a opção Entrar.'
  if (/at least 6|password should/i.test(m)) return 'Use uma senha com pelo menos 8 caracteres.'
  if (/email not confirmed/i.test(m)) return 'Confirme o e-mail pelo link que enviamos e tente de novo.'
  if (/fetch/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.'
  if (/rate limit|security purposes/i.test(m)) return 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.'
  if (/different from the old/i.test(m)) return 'Escolha uma senha diferente da anterior.'
  return m
}

export function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const { error } = await supabase!.auth.updateUser({ password: senha })
      if (error) setErro(traduzir(error.message))
      else return aoConcluir()
    } catch (x) {
      setErro(traduzir(x instanceof Error ? x.message : String(x)))
    }
    setEnviando(false)
  }

  return (
    <main className="entrar">
      <form className="entrar-caixa form" onSubmit={enviar}>
        <Marca />
        <h1>Criar nova senha</h1>
        <Campo rotulo="Nova senha"><input type="password" required minLength={8} autoFocus autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao botao-largo" disabled={enviando}>{enviando ? 'Aguarde…' : 'Salvar nova senha'}</button>
      </form>
    </main>
  )
}

export function Entrar({ aoVerExemplo, linkInvalido = false }: { aoVerExemplo: () => void; linkInvalido?: boolean }) {
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(linkInvalido ? 'Esse link venceu ou já foi usado. Peça um novo.' : null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase!.auth.signInWithPassword({ email, password: senha })
        if (error) setErro(traduzir(error.message))
      } else if (modo === 'recuperar') {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
        if (error) setErro(traduzir(error.message))
        else setAviso('Se esse e-mail tiver conta, enviamos um link para criar uma nova senha. Olhe também o spam.')
      } else {
        const { data, error } = await supabase!.auth.signUp({ email, password: senha, options: { data: { nome: nome.trim() || 'Eu' } } })
        if (error) setErro(traduzir(error.message))
        else if (!data.session) setAviso('Conta criada. Enviamos um link de confirmação para o seu e-mail.')
      }
    } catch (x) {
      setErro(traduzir(x instanceof Error ? x.message : String(x)))
    }
    setEnviando(false)
  }

  return (
    <main className="entrar">
      <form className="entrar-caixa form" onSubmit={enviar}>
        <Marca />
        <h1>{modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Recuperar senha'}</h1>
        {modo === 'criar' && <Campo rotulo="Seu nome"><input required autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>}
        <Campo rotulo="E-mail"><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        {modo !== 'recuperar' && <Campo rotulo="Senha"><input type="password" required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>}
        {erro && <p className="erro" role="alert">{erro}</p>}
        {aviso && <p className="aviso-vinculo" role="status">{aviso}</p>}
        <button className="botao botao-largo" disabled={enviando}>{enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}</button>
        {modo === 'entrar' && <button type="button" className="link-p" onClick={() => { setModo('recuperar'); setErro(null); setAviso(null) }}>Esqueci minha senha</button>}
        <button type="button" className="link-p" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null); setAviso(null) }}>
          {modo === 'entrar' ? 'Ainda não tenho conta' : modo === 'criar' ? 'Já tenho conta' : 'Voltar para entrar'}
        </button>
        <button type="button" className="link-p" onClick={aoVerExemplo}>Ver um exemplo com dados fictícios</button>
      </form>
    </main>
  )
}
