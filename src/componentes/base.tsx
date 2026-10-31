import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CircleAlert, Info, Trash2, X } from 'lucide-react'
import type { Nivel } from '../lib/regras'
import { paraCentavos } from '../lib/formato'

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  )
}

export function CampoValor({ valor, aoMudar, autoFocus, required = true }: {
  valor: string
  aoMudar: (v: string) => void
  autoFocus?: boolean
  required?: boolean
}) {
  return (
    <div className="campo-valor">
      <span aria-hidden="true">R$</span>
      <input
        inputMode="decimal" placeholder="0,00" value={valor} autoFocus={autoFocus} required={required}
        onChange={(e) => aoMudar(e.target.value)}
        onInvalid={(e) => e.currentTarget.setCustomValidity('Informe um valor, como 25,90.')}
        onInput={(e) => e.currentTarget.setCustomValidity('')}
      />
    </div>
  )
}

// Valor positivo em centavos a partir do que foi digitado.
export function centavosValidos(texto: string) {
  const c = paraCentavos(texto)
  return c !== null && c > 0 ? c : null
}

export function Gaveta({ titulo, aberta, aoFechar, children }: {
  titulo: string
  aberta: boolean
  aoFechar: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
  }, [aberta])
  return (
    <dialog
      ref={ref} className="gaveta" aria-label={titulo} onClose={aoFechar}
      onClick={(e) => { if (e.target === ref.current) aoFechar() }}
    >
      {aberta && (
        <div className="gaveta-conteudo">
          <header className="gaveta-topo">
            <h2>{titulo}</h2>
            <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar"><X size={20} /></button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function BotaoApagar({ aoConfirmar, rotulo = 'Apagar' }: { aoConfirmar: () => void; rotulo?: string }) {
  const [confirmando, setConfirmando] = useState(false)
  useEffect(() => {
    if (!confirmando) return
    const t = setTimeout(() => setConfirmando(false), 4000)
    return () => clearTimeout(t)
  }, [confirmando])
  return confirmando ? (
    <button type="button" className="botao botao-perigo botao-p" onClick={aoConfirmar}>Confirmar</button>
  ) : (
    <button type="button" className="botao-icone" aria-label={rotulo} title={rotulo} onClick={() => setConfirmando(true)}>
      <Trash2 size={17} />
    </button>
  )
}

const ICONES = { critico: CircleAlert, atencao: AlertTriangle, info: Info }
const NOMES = { critico: 'Urgente', atencao: 'Atenção', info: 'Fique de olho' }

export function SeloNivel({ nivel }: { nivel: Nivel }) {
  const I = ICONES[nivel]
  return <span className={`selo selo-${nivel}`}><I size={14} aria-hidden="true" />{NOMES[nivel]}</span>
}

export function Barra({ pct, nivel, rotulo }: { pct: number; nivel?: Nivel | 'bom'; rotulo: string }) {
  const v = Math.max(0, Math.min(pct, 1))
  return (
    <div className="barra" role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`barra-valor ${nivel ? `barra-${nivel}` : ''}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <h3>{titulo}</h3>
      <p>{texto}</p>
      {acao}
    </div>
  )
}

export function Tela({ titulo, descricao, acao, children }: {
  titulo: string
  descricao?: string
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="tela">
      <header className="tela-topo">
        <div>
          <h1>{titulo}</h1>
          {descricao && <p>{descricao}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  )
}
