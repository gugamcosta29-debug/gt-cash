export type TipoLancamento = 'despesa' | 'receita' | 'guardado' | 'transferencia'
export type TipoInvestimento = 'cdb' | 'tesouro' | 'caixinha' | 'cripto' | 'outro'

export interface Perfil {
  id: string
  nome: string
  renda_prevista_cent: number
  meses_reserva: number
  teto_cripto_pct: number
}

export interface Conta {
  id: string
  dono: string
  nome: string
  tipo: 'corrente' | 'poupanca' | 'carteira' | 'outra'
  saldo_inicial_cent: number
}

export interface Categoria {
  id: string
  dono: string
  nome: string
  tipo: 'despesa' | 'receita'
}

export interface Cartao {
  id: string
  dono: string
  nome: string
  limite_cent: number
  dia_fechamento: number
  dia_vencimento: number
  paga_ate: string | null
}

export interface Fixa {
  id: string
  dono: string
  nome: string
  valor_cent: number
  dia_vencimento: number
  categoria: string
  assinatura: boolean
  ativa: boolean
  conta_id: string | null
}

export interface Meta {
  id: string
  dono: string
  nome: string
  alvo_cent: number
  guardado_inicial_cent: number
  prazo: string | null
}

export interface Lancamento {
  id: string
  dono: string
  data: string
  descricao: string
  valor_cent: number
  tipo: TipoLancamento
  entrada: boolean
  categoria: string | null
  conta_id: string | null
  cartao_id: string | null
  fatura_mes: string | null
  parcela_grupo: string | null
  parcela_num: number | null
  parcela_total: number | null
  fixa_id: string | null
  fixa_mes: string | null
  meta_id: string | null
  import_hash: string | null
}

export interface Orcamento {
  id: string
  dono: string
  categoria: string
  limite_cent: number
}

export interface Investimento {
  id: string
  dono: string
  tipo: TipoInvestimento
  nome: string
  data: string
  valor_cent: number
  pct_cdi: number | null
  vencimento: string | null
  moeda_id: string | null
  quantidade: number | null
  e_reserva: boolean
}

export interface Dados {
  contas: Conta[]
  categorias: Categoria[]
  cartoes: Cartao[]
  contas_fixas: Fixa[]
  metas: Meta[]
  lancamentos: Lancamento[]
  orcamentos: Orcamento[]
  investimentos: Investimento[]
}

export type Tabela = keyof Dados

export interface Cotacoes {
  cdi: number | null
  cdiData: string | null
  precos: Record<string, number>
  precosData: string | null
}
