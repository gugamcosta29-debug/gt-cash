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
  return m
}

export function Entrar({ aoVerExemplo }: { aoVerExemplo: () => void }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
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
        <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        {modo === 'criar' && <Campo rotulo="Seu nome"><input required autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>}
        <Campo rotulo="E-mail"><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo rotulo="Senha"><input type="password" required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {aviso && <p className="aviso-vinculo" role="status">{aviso}</p>}
        <button className="botao botao-largo" disabled={enviando}>{enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="link-p" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null) }}>
          {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
        <button type="button" className="link-p" onClick={aoVerExemplo}>Ver um exemplo com dados fictícios</button>
      </form>
    </main>
  )
}
