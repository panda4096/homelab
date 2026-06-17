import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Segmented, DateField } from '../ds'
import { getAttribution, getValuation, type Valuation } from '../api'
import { bucketName, native } from '../lib/format'
import { num } from '../lib/finance'
import { usePrefStore } from '../store'

const DIMENSIONS = [
  { value: 'kind', label: '账户用途' },
  { value: 'currency', label: '账户币种' },
  { value: 'quote_currency', label: '真实计价币种' },
  { value: 'market', label: '市场' },
  { value: 'institution', label: '机构' },
]

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1080, margin: '0 auto' }}>{children}</div>
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function Compare() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const [from, setFrom] = useState(isoDaysAgo(30))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [dim, setDim] = useState('kind')

  const valA = useQuery({ queryKey: ['valuation', from, displayCurrency, fxMode], queryFn: () => getValuation({ date: from, display_currency: displayCurrency, fx_mode: fxMode }) })
  const valB = useQuery({ queryKey: ['valuation', to, displayCurrency, fxMode], queryFn: () => getValuation({ date: to, display_currency: displayCurrency, fx_mode: fxMode }) })
  const attr = useQuery({ queryKey: ['attribution', from, to, displayCurrency, fxMode], queryFn: () => getAttribution({ from, to, display_currency: displayCurrency, fx_mode: fxMode }) })

  const dimRows = useMemo(() => {
    const a = valA.data, b = valB.data
    if (!a || !b) return [] as { key: string; name: string; from: number; to: number }[]
    const map = new Map<string, { key: string; name: string; from: number; to: number }>()
    for (const x of a.allocations[dim] ?? []) map.set(x.key, { key: x.key, name: x.name, from: num(x.value) ?? 0, to: 0 })
    for (const x of b.allocations[dim] ?? []) {
      const e = map.get(x.key) ?? { key: x.key, name: x.name, from: 0, to: 0 }
      e.to = num(x.value) ?? 0
      map.set(x.key, e)
    }
    return [...map.values()].sort((p, q) => (q.to - q.from) - (p.to - p.from))
  }, [valA.data, valB.data, dim])

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <DateField size="sm" value={from} onChange={setFrom} style={{ maxWidth: 160 }} />
        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
        <DateField size="sm" value={to} onChange={setTo} style={{ maxWidth: 160 }} />
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{displayCurrency} · {fxMode === 'current' ? '当前汇率' : '历史汇率'}</span>
      </div>

      <div className="fb-card" style={{ padding: 18, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <Stat label="净资产期初" v={valA.data?.net_worth} ccy={displayCurrency} />
        <Stat label="净资产期末" v={valB.data?.net_worth} ccy={displayCurrency} />
        <DiffStat label="变化" a={valA.data} b={valB.data} pick={(v) => v.net_worth} ccy={displayCurrency} />
        <DiffStat label="总资产变化" a={valA.data} b={valB.data} pick={(v) => v.total_assets} ccy={displayCurrency} />
        <DiffStat label="负债变化" a={valA.data} b={valB.data} pick={(v) => v.total_liabilities} ccy={displayCurrency} />
      </div>

      {attr.data ? (
        <div className="fb-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>增长归因（§6.12）· 净变化 {native(attr.data.net_change, displayCurrency)}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <AttrBucket label="价格变动" v={attr.data.price_effect} ccy={displayCurrency} />
            <AttrBucket label="数量 / 余额变动" v={attr.data.quantity_effect} ccy={displayCurrency} />
            <AttrBucket label="收益事件" v={attr.data.income_effect} ccy={displayCurrency} />
            <AttrBucket label="汇率 / 其他" v={attr.data.fx_effect} ccy={displayCurrency} />
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Segmented size="sm" value={dim} onChange={setDim} options={DIMENSIONS} />
      </div>
      <div className="fb-card">
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr><th style={th}>{DIMENSIONS.find((d) => d.value === dim)?.label}</th><th style={thR}>期初</th><th style={thR}>期末</th><th style={thR}>变化</th><th style={thR}>变化率</th></tr></thead>
          <tbody>
            {dimRows.map((r) => {
              const change = r.to - r.from
              const pct = r.from !== 0 ? ((change / Math.abs(r.from)) * 100).toFixed(1) : null
              return (
                <tr key={r.key} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td style={td}>{bucketName(dim, r.key, r.name)}</td>
                  <td style={tdR}>{native(String(r.from), displayCurrency)}</td>
                  <td style={tdR}>{native(String(r.to), displayCurrency)}</td>
                  <td style={{ ...tdR, color: change > 0 ? 'var(--gain)' : change < 0 ? 'var(--loss)' : 'var(--text-tertiary)' }}>{change > 0 ? '+' : ''}{native(String(change), displayCurrency)}</td>
                  <td style={tdR}>{pct != null ? `${Number(pct) > 0 ? '+' : ''}${pct}%` : '—'}</td>
                </tr>
              )
            })}
            {!dimRows.length ? <tr><td style={td} colSpan={5}>{valA.isLoading || valB.isLoading ? '加载中…' : '该区间两端均无数据'}</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>对比两个截面的资产构成差异；增长归因按价格、数量 / 余额、收益事件、汇率 / 其他四桶拆解。</div>
    </Page>
  )
}

function Stat({ label, v, ccy }: { label: string; v?: string; ccy: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
      <span className="fb-num" style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)' }}>{v ? native(v, ccy) : '—'}</span>
    </div>
  )
}

function DiffStat({ label, a, b, pick, ccy }: { label: string; a?: Valuation; b?: Valuation; pick: (v: Valuation) => string; ccy: string }) {
  if (!a || !b) return <Stat label={label} ccy={ccy} />
  const change = (num(pick(b)) ?? 0) - (num(pick(a)) ?? 0)
  const base = num(pick(a)) ?? 0
  const pct = base !== 0 ? ((change / Math.abs(base)) * 100).toFixed(1) : null
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
      <span className="fb-num" style={{ fontSize: 20, fontWeight: 600, color: change > 0 ? 'var(--gain)' : change < 0 ? 'var(--loss)' : 'var(--text-strong)' }}>
        {change > 0 ? '+' : ''}{native(String(change), ccy)}
      </span>
      {pct != null ? <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>{Number(pct) > 0 ? '+' : ''}{pct}%</span> : null}
    </div>
  )
}

function AttrBucket({ label, v, ccy }: { label: string; v: string; ccy: string }) {
  const n = num(v) ?? 0
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
      <span className="fb-num" style={{ fontSize: 16, fontWeight: 600, color: n > 0 ? 'var(--gain)' : n < 0 ? 'var(--loss)' : 'var(--text-strong)' }}>
        {n > 0 ? '+' : ''}{native(v, ccy)}
      </span>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, color: 'var(--text-secondary)' }
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }
