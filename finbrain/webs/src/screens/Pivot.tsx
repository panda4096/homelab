import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Segmented } from '../ds'
import { getValuation } from '../api'
import { currencyLabel, KIND_LABEL, native } from '../lib/format'
import { Donut, num, shortMoney, type DonutItem, VIZ } from '../lib/finance'
import { usePrefStore } from '../store'

const DIMENSIONS = [
  { value: 'kind', label: '账户用途' },
  { value: 'currency', label: '账户币种' },
  { value: 'quote_currency', label: '真实计价币种' },
  { value: 'market', label: '市场' },
  { value: 'institution', label: '机构' },
  { value: 'symbol', label: '标的' },
]

const MARKET_LABEL: Record<string, string> = {
  CASH: '现金',
  US: '美股',
  HK: '港股',
  CN: 'A股',
  CRYPTO: '加密资产',
  INDEX: '指数',
}

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1180, margin: '0 auto' }}>{children}</div>
}

export function Pivot() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const [dim, setDim] = useState('kind')
  const val = useQuery({
    queryKey: ['valuation', displayCurrency, fxMode],
    queryFn: () => getValuation({ display_currency: displayCurrency, fx_mode: fxMode }),
  })

  const rows = useMemo(() => {
    const v = val.data
    if (!v) return [] as { key: string; name: string; value: number; percent: string }[]
    if (dim === 'symbol') {
      const total = num(v.position_value) ?? 0
      return v.position_groups
        .filter((g) => g.market_value_display)
        .map((g) => {
          const value = num(g.market_value_display) ?? 0
          return { key: g.symbol, name: g.display_name ? `${g.symbol} ${g.display_name}` : g.symbol, value, percent: total ? ((value / total) * 100).toFixed(2) : '0.00' }
        })
        .sort((a, b) => b.value - a.value)
    }
    return (v.allocations[dim] ?? [])
      .map((b) => ({ key: b.key, name: bucketLabel(dim, b.key, b.name), value: num(b.value) ?? 0, percent: b.percent }))
      .sort((a, b) => b.value - a.value)
  }, [val.data, dim])

  const total = rows.reduce((a, r) => a + r.value, 0)
  const chartRows = useMemo(() => compactChartRows(rows, total, dim === 'symbol' ? 7 : VIZ.length), [rows, total, dim])
  const donutItems: DonutItem[] = chartRows.map((r, i) => ({ key: r.key, name: r.name, value: Math.abs(r.value), color: VIZ[i % VIZ.length] }))

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented size="sm" value={dim} onChange={setDim} options={DIMENSIONS} />
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          {dim === 'symbol' ? '按持仓市值' : dim === 'quote_currency' ? '按真实计价币种(暴露口径)' : '按净资产口径'} · {displayCurrency}
        </span>
      </div>

      <div className="fb-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          {donutItems.length ? (
            <div style={{ width: 'min(100%, 760px)' }}>
              <Donut items={donutItems} size={180} thickness={16} centerLabel={shortMoney(total, displayCurrency)} centerSub="合计" />
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>暂无数据</div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: dim === 'symbol' ? 760 : 560, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>{DIMENSIONS.find((d) => d.value === dim)?.label}</th>
              <th style={thR}>金额</th><th style={thR}>占比</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td style={tdName}>{r.name}</td>
                  <td style={tdR}>{native(String(r.value), displayCurrency)}</td>
                  <td style={tdR}>{r.percent}%</td>
                </tr>
              ))}
              {rows.length ? (
                <tr style={{ borderTop: '1px solid var(--border-strong)' }}>
                  <td style={{ ...tdName, color: 'var(--text-strong)' }}>合计</td>
                  <td style={{ ...tdR, color: 'var(--text-strong)' }}>{native(String(total), displayCurrency)}</td>
                  <td style={tdR}>—</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>多维聚合按当前估值截面展开;时间维度与行×列双维透视将在后续迭代补充。</div>
    </Page>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, color: 'var(--text-secondary)' }
const tdName: React.CSSProperties = { ...td, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }

function bucketLabel(dim: string, key: string, name: string) {
  if (dim === 'kind') return KIND_LABEL[key] ?? fallbackLabel(key, name)
  if (dim === 'currency' || dim === 'quote_currency') return currencyLabel(key).replace(`${key} · `, '')
  if (dim === 'market') return MARKET_LABEL[key] ?? fallbackLabel(key, name)
  return fallbackLabel(key, name)
}

function fallbackLabel(key: string, name: string) {
  return name || key || '未分类'
}

function compactChartRows(rows: Array<{ key: string; name: string; value: number; percent: string }>, total: number, limit: number) {
  if (rows.length <= limit) return rows
  const head = rows.slice(0, limit)
  const restValue = rows.slice(limit).reduce((sum, r) => sum + r.value, 0)
  if (restValue <= 0) return head
  return [
    ...head,
    {
      key: '__other__',
      name: '其他',
      value: restValue,
      percent: total ? ((restValue / total) * 100).toFixed(2) : '0.00',
    },
  ]
}
