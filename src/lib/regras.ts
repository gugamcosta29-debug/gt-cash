import {
  comprometimentoFuturo, dataNoMes, diasNoMes, diferencaDias, faturasDoCartao, fixaPaga, mesDe,
  orcamentosComGasto, reserva, resumoMes, somarMeses, totalInvestido, valorInvestimento,
} from './calculos'
import { reais, dataCurta, plural } from './formato'
import type { Cotacoes, Dados, Perfil } from './tipos'

export type Nivel = 'critico' | 'atencao' | 'info'

export interface Aviso {
  id: string
  nivel: Nivel
  titulo: string
  calculo: string
  acao: string
  tela: string
}

const ordem: Record<Nivel, number> = { critico: 0, atencao: 1, info: 2 }

export function gerarAvisos(dados: Dados, perfis: Perfil[], hoje: string): Aviso[] {
  const avisos: Aviso[] = []
  const mes = mesDe(hoje)
  const resumo = resumoMes(dados, perfis, mes, hoje)

  for (const f of dados.contas_fixas) {
    if (!f.ativa) continue
    if (fixaPaga(f, dados.lancamentos, mes)) continue
    const vence = dataNoMes(mes, f.dia_vencimento)
    const dias = diferencaDias(hoje, vence)
    if (dias < 0) {
      avisos.push({
        id: `fixa-atraso-${f.id}`, nivel: 'critico',
        titulo: `${f.nome} está ${plural(-dias, 'dia', 'dias')} atrasada`,
        calculo: `${reais(f.valor_cent)}, venceu em ${dataCurta(vence)}.`,
        acao: 'Pague ou marque como paga. Atraso costuma gerar multa e juros.', tela: 'fixas',
      })
    } else if (dias <= 3) {
      avisos.push({
        id: `fixa-vence-${f.id}`, nivel: 'atencao',
        titulo: dias === 0 ? `${f.nome} vence hoje` : `${f.nome} vence em ${plural(dias, 'dia', 'dias')}`,
        calculo: `${reais(f.valor_cent)}, vencimento em ${dataCurta(vence)}.`,
        acao: 'Separe o valor ou marque como paga.', tela: 'fixas',
      })
    }
  }

  for (const c of dados.cartoes) {
    for (const fat of faturasDoCartao(c, dados.lancamentos)) {
      if (fat.paga) continue
      const dias = diferencaDias(hoje, fat.vencimento)
      if (dias < 0) {
        avisos.push({
          id: `fatura-atraso-${c.id}-${fat.mes}`, nivel: 'critico',
          titulo: `Fatura do ${c.nome} vencida`,
          calculo: `${reais(fat.total)}, venceu em ${dataCurta(fat.vencimento)}.`,
          acao: 'Quite essa fatura antes de guardar ou investir: os juros do rotativo costumam ser bem maiores que qualquer rendimento.',
          tela: 'cartoes',
        })
      } else if (dias <= 5) {
        avisos.push({
          id: `fatura-vence-${c.id}-${fat.mes}`, nivel: 'atencao',
          titulo: `Fatura do ${c.nome} vence em ${plural(dias, 'dia', 'dias')}`,
          calculo: `${reais(fat.total)}, vencimento em ${dataCurta(fat.vencimento)}.`,
          acao: 'Pague o valor total, se puder, para não entrar no rotativo.', tela: 'cartoes',
        })
      }
      const fechaEm = diferencaDias(hoje, fat.fechamento)
      if (fechaEm >= 0 && fechaEm <= 3) {
        avisos.push({
          id: `fatura-fecha-${c.id}-${fat.mes}`, nivel: 'info',
          titulo: `Fatura do ${c.nome} fecha em ${plural(fechaEm, 'dia', 'dias')}`,
          calculo: `Fechamento em ${dataCurta(fat.fechamento)}, com ${reais(fat.total)} até agora.`,
          acao: 'Compras a partir do fechamento só entram na fatura seguinte.', tela: 'cartoes',
        })
      }
    }
  }

  for (const o of orcamentosComGasto(dados, mes)) {
    if (o.pct >= 1) {
      avisos.push({
        id: `orc-100-${o.categoria}`, nivel: 'atencao',
        titulo: `${o.categoria} passou do limite`,
        calculo: `${reais(o.gasto)} de ${reais(o.limite)} (${Math.round(o.pct * 100)}%).`,
        acao: `Tente segurar ${o.categoria.toLowerCase()} até o fim do mês ou ajuste o limite.`, tela: 'orcamento',
      })
    } else if (o.pct >= 0.8) {
      avisos.push({
        id: `orc-80-${o.categoria}`, nivel: 'info',
        titulo: `${o.categoria} está em ${Math.round(o.pct * 100)}% do limite`,
        calculo: `Restam ${reais(o.limite - o.gasto)} de ${reais(o.limite)}.`,
        acao: 'Vale olhar antes do próximo gasto nessa categoria.', tela: 'orcamento',
      })
    }
  }

  if (resumo.disponivel < 0) {
    avisos.push({
      id: 'mes-negativo', nivel: 'critico',
      titulo: `Faltam ${reais(-resumo.disponivel)} para fechar o mês`,
      calculo: `Renda de ${reais(resumo.renda)}, menos ${reais(resumo.renda - resumo.disponivel)} em gastos, contas e fatura.`,
      acao: 'Comece pelas categorias sem contrato, como lazer e restaurantes.', tela: 'painel',
    })
  } else {
    const dia = Number(hoje.slice(8, 10))
    const variavel = dados.lancamentos
      .filter((l) => l.tipo === 'despesa' && mesDe(l.data) === mes && !l.fixa_id && !l.parcela_grupo)
      .reduce((t, l) => t + l.valor_cent, 0)
    const total = diasNoMes(mes)
    const restante = total - dia
    const projecao = dia > 0 ? Math.round((variavel / dia) * restante) : 0
    if (dia >= 5 && restante > 0 && projecao > resumo.disponivel) {
      avisos.push({
        id: 'ritmo', nivel: 'atencao',
        titulo: 'No ritmo atual, o dinheiro não chega até o fim do mês',
        calculo: `Média de ${reais(Math.round(variavel / dia))} por dia daria mais ${reais(projecao)} em ${plural(restante, 'dia', 'dias')}, e sobram ${reais(resumo.disponivel)}.`,
        acao: `Para fechar no azul, gaste até ${reais(resumo.porDia)} por dia.`, tela: 'painel',
      })
    }
  }

  const proximo = comprometimentoFuturo(dados, hoje, resumo.renda, 1)[0]
  if (resumo.renda > 0 && proximo.pct > 0.3) {
    avisos.push({
      id: 'parcelas-30', nivel: 'atencao',
      titulo: `Cartão já leva ${Math.round(proximo.pct * 100)}% da renda do mês que vem`,
      calculo: `${reais(proximo.valor)} em faturas de ${somarMeses(mes, 1).slice(5)}/${mes.slice(0, 4)}, para renda de ${reais(resumo.renda)}.`,
      acao: 'Evite parcelar novas compras até esse número cair abaixo de 30%.', tela: 'cartoes',
    })
  }

  return avisos.sort((a, b) => ordem[a.nivel] - ordem[b.nivel])
}

export type EstadoPasso = 'feito' | 'agora' | 'depois'

export interface Passo {
  id: 'dividas' | 'reserva' | 'renda-fixa' | 'cripto'
  titulo: string
  estado: EstadoPasso
  detalhe: string
}

export function ordemDoDinheiro(dados: Dados, perfis: Perfil[], perfilBase: Perfil, cot: Cotacoes, hoje: string): Passo[] {
  const mes = mesDe(hoje)
  const atrasadas = gerarAvisos(dados, perfis, hoje).filter((a) => a.id.includes('atraso'))
  const res = reserva(dados, perfilBase.meses_reserva, cot, hoje)
  const carteira = totalInvestido(dados.investimentos.filter((i) => !i.e_reserva), cot, hoje)
  const cripto = dados.investimentos
    .filter((i) => i.tipo === 'cripto')
    .reduce((t, i) => t + valorInvestimento(i, cot, hoje).atual, 0)
  const pctCripto = carteira > 0 ? Math.round((cripto / carteira) * 100) : 0
  const reservaPronta = res.alvo > 0 && res.faltam === 0
  const semDados = !dados.lancamentos.length && !dados.contas_fixas.length && !dados.cartoes.length
  const emDia = atrasadas.length === 0 && !semDados
  const sobra = Math.max(resumoMes(dados, perfis, mes, hoje).disponivel, 0)

  const passos: Passo[] = [
    {
      id: 'dividas', titulo: 'Pôr em dia contas e cartão', estado: emDia ? 'feito' : 'agora',
      detalhe: semDados
        ? 'Cadastre contas fixas e cartões para o app acompanhar os vencimentos.'
        : emDia
        ? 'Nada atrasado. Continue pagando a fatura inteira: o rotativo cobra muito mais do que qualquer investimento rende.'
        : `${plural(atrasadas.length, 'item atrasado', 'itens atrasados')}. Quitar isso rende mais que investir, porque os juros de atraso são altos.`,
    },
    {
      id: 'reserva', titulo: 'Formar a reserva de emergência', estado: reservaPronta ? 'feito' : emDia ? 'agora' : 'depois',
      detalhe: res.alvo === 0
        ? 'Lance seus gastos por um mês para calcular o tamanho certo da reserva.'
        : reservaPronta
          ? `Reserva completa: ${reais(res.guardada)}, equivalente a ${perfilBase.meses_reserva} meses de gastos.`
          : `Faltam ${reais(res.faltam)} de ${reais(res.alvo)} (${perfilBase.meses_reserva} × ${reais(res.gastoMedio)} de gasto médio). Guarde em aplicação com resgate imediato.${sobra > 0 && emDia ? ` Este mês sobram ${reais(sobra)}.` : ''}`,
    },
    {
      id: 'renda-fixa', titulo: 'CDB ou Tesouro para objetivos com prazo',
      estado: reservaPronta && emDia ? 'agora' : 'depois',
      detalhe: 'Quando a reserva estiver pronta, compare rentabilidade, prazo e garantia do FGC antes de aplicar.',
    },
    {
      id: 'cripto', titulo: 'Cripto, com teto na carteira',
      estado: reservaPronta && emDia ? 'agora' : 'depois',
      detalhe: reservaPronta
        ? `Teto de ${perfilBase.teto_cripto_pct}% da carteira; hoje está em ${pctCripto}%. O preço pode cair muito, então só entra dinheiro que pode ficar parado por anos.`
        : `Pode cair muito em pouco tempo, então vale entrar só com a reserva pronta. Teto definido: ${perfilBase.teto_cripto_pct}% da carteira.`,
    },
  ]
  return passos
}
