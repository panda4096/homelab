import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card, DateField, Icon, Segmented } from '../ds'
import { getAttribution, getValuation } from '../api'
import { bucketName } from '../lib/format'
import { CurrencyValue, DeltaValue, num } from '../lib/finance'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { usePrefStore } from '../store'

const DIMENSIONS = [
  { value: 'kind', label: '账户用途' },
  { value: 'currency', label: '账户币种' },
  { value: 'quote_currency', label: '真实计价币种' },
  { value: 'market', label: '市场' },
  { value: 'institution', label: '机构' },
]

const PRESETS = [
  { value: 'mom', label: '本月 vs 上月' },
  { value: 'qoq', label: '本季 vs 上季' },
  { value: 'yoy', label: '本年 vs 去年' },
  { value: 'custom', label: '自定义' },
]

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoLocal(d)
}
// Preset endpoints relative to today; `from` snaps to a month-end (snapshots are typically monthly).
function presetRange(preset: string): { from: string; to: string } | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed
  const today = isoLocal(now)
  if (preset === 'mom') return { from: isoLocal(new Date(y, m, 0)), to: today } // last day of prev month
  if (preset === 'qoq') return { from: isoLocal(new Date(y, Math.floor(m / 3) * 3, 0)), to: today } // end of prev quarter
  if (preset === 'yoy') return { from: isoLocal(new Date(y - 1, m + 1, 0)), to: today } // this month-end, last year
  return null
}

type DimRow = { key: string; name: string; from: number; to: number }

export function Compare() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const [preset, setPreset] = useState('mom')
  const [custom, setCustom] = useState({ from: isoDaysAgo(30), to: isoLocal(new Date()) })
  const [dim, setDim] = useState('kind')

  const range = preset === 'custom' ? custom : presetRange(preset)!
  const { from, to } = range

  const valA = useQuery({ queryKey: ['valuation', from, displayCurrency, fxMode], queryFn: () => getValuation({ date: from, display_currency: displayCurrency, fx_mode: fxMode }) })
  const valB = useQuery({ queryKey: ['valuation', to, displayCurrency, fxMode], queryFn: () => getValuation({ date: to, display_currency: displayCurrency, fx_mode: fxMode }) })
  const attr = useQuery({ queryKey: ['attribution', from, to, displayCurrency, fxMode], queryFn: () => getAttribution({ from, to, display_currency: displayCurrency, fx_mode: fxMode }) })

  const nwA = num(valA.data?.net_worth) ?? 0
  const nwB = num(valB.data?.net_worth) ?? 0
  const ready = !!valA.data && !!valB.data
  const delta = nwB - nwA
  const rate = nwA !== 0 ? (delta / Math.abs(nwA)) * 100 : null

  const dimRows = useMemo(() => {
    const a = valA.data, b = valB.data
    if (!a || !b) return [] as DimRow[]
    const map = new Map<string, DimRow>()
    for (const x of a.allocations[dim] ?? []) map.set(x.key, { key: x.key, name: x.name, from: num(x.value) ?? 0, to: 0 })
    for (const x of b.allocations[dim] ?? []) {
      const e = map.get(x.key) ?? { key: x.key, name: x.name, from: 0, to: 0 }
      e.to = num(x.value) ?? 0
      map.set(x.key, e)
    }
    return [...map.values()].sort((p, q) => (q.to - q.from) - (p.to - p.from))
  }, [valA.data, valB.data, dim])

  const totalDelta = dimRows.reduce((s, r) => s + (r.to - r.from), 0)
  const up = dimRows.filter((r) => r.to - r.from > 0).slice(0, 5)
  const down = [...dimRows].filter((r) => r.to - r.from < 0).sort((a, b) => (a.to - a.from) - (b.to - b.from)).slice(0, 5)

  const attrItems = attr.data
    ? [
        { name: '价格变动', value: num(attr.data.price_effect) ?? 0 },
        { name: '数量 / 余额', value: num(attr.data.quantity_effect) ?? 0 },
        { name: '收益事件', value: num(attr.data.income_effect) ?? 0 },
        { name: '汇率 / 其他', value: num(attr.data.fx_effect) ?? 0 },
      ]
    : []
  const attrMax = Math.max(1, ...attrItems.map((a) => Math.abs(a.value)))
  const netChange = num(attr.data?.net_change) ?? delta

  const dimLabel = DIMENSIONS.find((d) => d.value === dim)?.label ?? dim

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1180, margin: '0 auto' }}>
      {/* period selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented size="sm" value={preset} onChange={setPreset} options={PRESETS} />
        {preset === 'custom' ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <DateField size="sm" value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} style={{ maxWidth: 150 }} />
            <Icon name="arrow-right" size={13} />
            <DateField size="sm" value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} style={{ maxWidth: 150 }} />
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)' }}>
            <Badge tone="neutral">{from}</Badge>
            <Icon name="arrow-right" size={13} />
            <Badge tone="neutral">{to}</Badge>
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          口径：净资产 · {displayCurrency} · {fxMode === 'current' ? '当前汇率' : '历史汇率'}
        </span>
      </div>

      {/* KPI cards */}
      <div className="fb-grid fb-grid--g14 kpi-4">
        <Kpi label="净资产期初" raw={<CurrencyValue value={valA.data?.net_worth} currency={displayCurrency} compact size="22px" />} />
        <Kpi label="净资产期末" raw={<CurrencyValue value={valB.data?.net_worth} currency={displayCurrency} compact size="22px" />} />
        <Kpi label="变化值" raw={ready ? <CurrencyValue value={delta} currency={displayCurrency} signed compact size="22px" style={{ color: delta > 0 ? 'var(--gain)' : delta < 0 ? 'var(--loss)' : undefined }} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>} />
        <Kpi label="变化率" raw={ready && rate != null ? <DeltaValue percent={rate} pill /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>} />
      </div>

      {/* detail table + attribution */}
      <div className="fb-grid split-32" style={{ alignItems: 'start' }}>
        <Card eyebrow={`按${dimLabel}明细`} padded={false} actions={<Segmented size="sm" value={dim} onChange={setDim} options={DIMENSIONS} />}>
          {/* wrapper keeps the table out of `.fb-card > table` (display:block) so it fills the card
              width and distributes columns, while still scrolling horizontally if it ever overflows */}
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>{dimLabel}</Th><Th right>期初</Th><Th right>期末</Th><Th right>变化值</Th><Th right>变化率</Th><Th right>贡献占比</Th></tr></thead>
            <tbody>
              {dimRows.map((r) => {
                const change = r.to - r.from
                const rrate = r.from !== 0 ? (change / Math.abs(r.from)) * 100 : null
                const contrib = totalDelta !== 0 ? (change / totalDelta) * 100 : null
                return (
                  <Row key={r.key}>
                    <Td>{bucketName(dim, r.key, r.name)}</Td>
                    <Td right mono dim><CurrencyValue value={r.from} currency={displayCurrency} compact /></Td>
                    <Td right mono color="var(--text-strong)"><CurrencyValue value={r.to} currency={displayCurrency} compact /></Td>
                    <Td right mono color={change > 0 ? 'var(--gain)' : change < 0 ? 'var(--loss)' : 'var(--text-tertiary)'}>
                      <CurrencyValue value={change} currency={displayCurrency} signed compact />
                    </Td>
                    <Td right>{rrate != null ? <DeltaValue percent={rrate} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</Td>
                    <Td right mono dim>{contrib != null ? `${contrib > 0 ? '+' : ''}${contrib.toFixed(0)}%` : '—'}</Td>
                  </Row>
                )
              })}
              {!dimRows.length ? <tr><td colSpan={6} style={{ padding: '14px 12px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>{valA.isLoading || valB.isLoading ? '加载中…' : '该区间两端均无数据'}</td></tr> : null}
            </tbody>
          </table>
          </div>
        </Card>

        <Card eyebrow="增长来源分解">
          {attr.data ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {attrItems.map((a) => (
                  <div key={a.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span className="fb-num" style={{ color: a.value < 0 ? 'var(--loss)' : a.value > 0 ? 'var(--gain)' : 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                        <CurrencyValue value={a.value} currency={displayCurrency} signed compact />
                      </span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface-inset)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: a.value < 0 ? 'auto' : '50%', right: a.value < 0 ? '50%' : 'auto', height: '100%', width: `${(Math.abs(a.value) / attrMax) * 48}%`, background: a.value < 0 ? 'var(--loss)' : 'var(--gain)', borderRadius: 4 }} />
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border-strong)' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>四桶之和 = 净值变化</span>
                <span className="fb-num" style={{ color: netChange > 0 ? 'var(--gain)' : netChange < 0 ? 'var(--loss)' : 'var(--text-strong)' }}>
                  <CurrencyValue value={netChange} currency={displayCurrency} signed compact />
                </span>
              </div>
            </>
          ) : (
            <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5 }}>{attr.isLoading ? '加载中…' : '暂无归因数据'}</div>
          )}
        </Card>
      </div>

      {/* risers / fallers */}
      <div className="fb-grid split-2">
        <Card eyebrow="增长前列">
          {up.length ? up.map((r) => <MoverRow key={r.key} name={bucketName(dim, r.key, r.name)} change={r.to - r.from} base={r.from} ccy={displayCurrency} up />) : <Empty text="本期无增长项" />}
        </Card>
        <Card eyebrow="下跌前列">
          {down.length ? down.map((r) => <MoverRow key={r.key} name={bucketName(dim, r.key, r.name)} change={r.to - r.from} base={r.from} ccy={displayCurrency} />) : <Empty text="本期无下跌项" />}
        </Card>
      </div>

      <SectionHint>对比两个截面的资产构成差异（§7.16）；贡献占比 = 该项变化 ÷ 总变化。增长来源按价格、数量 / 余额、收益事件、汇率 / 其他四桶拆解，四桶之和 = 净值变化；汇率桶仅在历史汇率口径下输出。</SectionHint>
    </div>
  )
}

function Kpi({ label, raw }: { label: string; raw: React.ReactNode }) {
  return (
    <div className="fb-card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ marginTop: 6 }}>{raw}</div>
    </div>
  )
}

function MoverRow({ name, change, base, ccy, up }: { name: string; change: number; base: number; ccy: string; up?: boolean }) {
  const rate = base !== 0 ? (change / Math.abs(base)) * 100 : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: up ? 'var(--gain)' : 'var(--loss)', flexShrink: 0 }} />
      <span style={{ fontSize: 12.5 }}>{name}</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className="fb-num" style={{ fontSize: 12, color: up ? 'var(--gain)' : 'var(--loss)' }}><CurrencyValue value={change} currency={ccy} signed compact /></span>
        {rate != null ? <DeltaValue percent={rate} /> : null}
      </span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5 }}>{text}</div>
}
