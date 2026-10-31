import type { ReactNode } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { mesCurto, reais, reaisCurto } from '../lib/formato'

const eixo = { fontSize: 12, fill: 'var(--texto-fraco)' }
// Espaço que não quebra: o SVG partia "R$ 3.200" em duas linhas.
const rotulo = (cent: number) => reaisCurto(cent).replace(' ', ' ')

function CaixaDica({ titulo, linhas }: { titulo: string; linhas: { nome: string; valor: string; cor?: string }[] }) {
  return (
    <div className="dica-grafico">
      <strong>{titulo}</strong>
      {linhas.map((l) => (
        <div key={l.nome} className="dica-linha">
          {l.cor && <i style={{ background: l.cor }} />}
          <span>{l.nome}</span>
          <b>{l.valor}</b>
        </div>
      ))}
    </div>
  )
}

export function TabelaGrafico({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <details className="ver-tabela">
      <summary>Ver em tabela</summary>
      <table>
        <thead><tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      </table>
    </details>
  )
}

export function Legenda({ itens }: { itens: { nome: string; cor: string; valor?: ReactNode }[] }) {
  return (
    <ul className="legenda">
      {itens.map((i) => (
        <li key={i.nome}><i style={{ background: i.cor }} />{i.nome}{i.valor !== undefined && <b>{i.valor}</b>}</li>
      ))}
    </ul>
  )
}

export function GraficoCategorias({ dados, destaques = [] }: { dados: { categoria: string; valor: number }[]; destaques?: string[] }) {
  // O resto vira uma linha só, para as barras somarem o gasto do mês.
  // Categoria perto do limite nunca entra nessa linha, porque os avisos falam dela.
  const visiveis = dados.filter((d, i) => i < 6 || destaques.includes(d.categoria))
  const resto = dados.filter((d) => !visiveis.includes(d)).reduce((t, d) => t + d.valor, 0)
  const lista = resto > 0 ? [...visiveis, { categoria: 'Demais', valor: resto }] : visiveis
  return (
    <>
      <div style={{ height: Math.max(lista.length * 38 + 8, 120) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={lista} layout="vertical" margin={{ top: 0, right: 74, bottom: 0, left: 0 }} barCategoryGap={9}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="categoria" width={108} tickLine={false} axisLine={false} tick={{ ...eixo, fill: 'var(--texto-medio)' }} />
            <Tooltip
              cursor={{ fill: 'var(--realce)' }} isAnimationActive={false}
              content={({ active, payload }) => active && payload?.[0] ? (
                <CaixaDica titulo={String(payload[0].payload.categoria)} linhas={[{ nome: 'Gasto', valor: reais(Number(payload[0].value)) }]} />
              ) : null}
            />
            <Bar
              dataKey="valor" fill="var(--serie-1)" radius={[0, 4, 4, 0]} isAnimationActive={false}
              label={{ position: 'right', formatter: (v: unknown) => rotulo(Number(v)), fill: 'var(--texto-medio)', fontSize: 12 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TabelaGrafico colunas={['Categoria', 'Gasto']} linhas={dados.map((d) => [d.categoria, reais(d.valor)])} />
    </>
  )
}

export function GraficoMeses({ dados }: { dados: { mes: string; receitas: number; despesas: number }[] }) {
  const lista = dados.map((d) => ({ ...d, nome: mesCurto(d.mes) }))
  return (
    <>
      <Legenda itens={[{ nome: 'Entrou', cor: 'var(--serie-1)' }, { nome: 'Saiu', cor: 'var(--serie-2)' }]} />
      <div style={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={lista} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="26%">
            <CartesianGrid vertical={false} stroke="var(--grade)" />
            <XAxis dataKey="nome" interval={0} tickLine={false} axisLine={{ stroke: 'var(--eixo)' }} tick={{ ...eixo, fontSize: 11 }} />
            <YAxis width={66} tickLine={false} axisLine={false} tick={eixo} tickFormatter={(v) => rotulo(Number(v))} />
            <Tooltip
              cursor={{ fill: 'var(--realce)' }} isAnimationActive={false}
              content={({ active, payload }) => active && payload?.length ? (
                <CaixaDica
                  titulo={String(payload[0].payload.nome)}
                  linhas={[
                    { nome: 'Entrou', valor: reais(payload[0].payload.receitas), cor: 'var(--serie-1)' },
                    { nome: 'Saiu', valor: reais(payload[0].payload.despesas), cor: 'var(--serie-2)' },
                    { nome: 'Sobrou', valor: reais(payload[0].payload.receitas - payload[0].payload.despesas) },
                  ]}
                />
              ) : null}
            />
            <Bar dataKey="receitas" fill="var(--serie-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="despesas" fill="var(--serie-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TabelaGrafico
        colunas={['Mês', 'Entrou', 'Saiu', 'Sobrou']}
        linhas={dados.map((d) => [mesCurto(d.mes), reais(d.receitas), reais(d.despesas), reais(d.receitas - d.despesas)])}
      />
    </>
  )
}

export function GraficoPatrimonio({ dados }: { dados: { mes: string; total: number }[] }) {
  const lista = dados.map((d) => ({ ...d, nome: mesCurto(d.mes) }))
  return (
    <>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={lista} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grade)" />
            <XAxis dataKey="nome" interval={0} padding={{ left: 16, right: 16 }} tickLine={false} axisLine={{ stroke: 'var(--eixo)' }} tick={{ ...eixo, fontSize: 11 }} />
            <YAxis width={66} tickLine={false} axisLine={false} tick={eixo} tickFormatter={(v) => rotulo(Number(v))} />
            <ReferenceLine y={0} stroke="var(--eixo)" />
            <Tooltip
              isAnimationActive={false} cursor={{ stroke: 'var(--eixo)' }}
              content={({ active, payload }) => active && payload?.[0] ? (
                <CaixaDica titulo={String(payload[0].payload.nome)} linhas={[{ nome: 'Patrimônio', valor: reais(Number(payload[0].value)) }]} />
              ) : null}
            />
            <Area type="monotone" dataKey="total" stroke="var(--serie-1)" strokeWidth={2} fill="var(--serie-1)" fillOpacity={0.1} isAnimationActive={false} activeDot={{ r: 5, stroke: 'var(--superficie)', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <TabelaGrafico colunas={['Mês', 'Patrimônio']} linhas={dados.map((d) => [mesCurto(d.mes), reais(d.total)])} />
    </>
  )
}

export function GraficoFuturo({ dados, renda }: { dados: { mes: string; valor: number; pct: number }[]; renda: number }) {
  const lista = dados.map((d) => ({ ...d, nome: mesCurto(d.mes) }))
  return (
    <>
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={lista} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} barCategoryGap="34%">
            <XAxis dataKey="nome" tickLine={false} axisLine={{ stroke: 'var(--eixo)' }} tick={eixo} />
            {/* A escala vai até a renda, para a barra mostrar o peso real da parcela. */}
            <YAxis hide domain={[0, renda > 0 ? (max: number) => Math.max(max, renda) : 'auto']} />
            {renda > 0 && (
              <ReferenceLine y={renda} stroke="var(--eixo)" strokeDasharray="4 4" label={{ value: `Renda ${rotulo(renda)}`, position: 'insideTopLeft', fill: 'var(--texto-fraco)', fontSize: 12 }} />
            )}
            <Tooltip
              cursor={{ fill: 'var(--realce)' }} isAnimationActive={false}
              content={({ active, payload }) => active && payload?.[0] ? (
                <CaixaDica titulo={String(payload[0].payload.nome)} linhas={[
                  { nome: 'Já comprometido', valor: reais(Number(payload[0].value)) },
                  { nome: 'Da renda', valor: `${Math.round(payload[0].payload.pct * 100)}%` },
                ]} />
              ) : null}
            />
            <Bar
              dataKey="valor" fill="var(--serie-2)" radius={[4, 4, 0, 0]} isAnimationActive={false}
              label={{ position: 'top', formatter: (v: unknown) => (Number(v) ? rotulo(Number(v)) : ''), fill: 'var(--texto-medio)', fontSize: 12 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TabelaGrafico colunas={['Mês', 'Comprometido', '% da renda']} linhas={dados.map((d) => [mesCurto(d.mes), reais(d.valor), `${Math.round(d.pct * 100)}%`])} />
    </>
  )
}

// Barra empilhada única para divisão de um todo; a ordem das cores segue o tipo, nunca o tamanho.
export function BarraDivisao({ partes }: { partes: { nome: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((t, p) => t + Math.max(p.valor, 0), 0)
  const visiveis = partes.filter((p) => p.valor > 0)
  return (
    <>
      <div className="divisao" role="img" aria-label={visiveis.map((p) => `${p.nome}: ${reais(p.valor)}`).join(', ')}>
        {visiveis.map((p) => (
          <div key={p.nome} title={`${p.nome}: ${reais(p.valor)}`} style={{ flexGrow: p.valor / (total || 1), background: p.cor }} />
        ))}
      </div>
      <Legenda itens={visiveis.map((p) => ({ nome: p.nome, cor: p.cor, valor: reais(p.valor) }))} />
    </>
  )
}
