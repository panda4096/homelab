import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Segmented } from '../ds'
import { getTrend, listInstruments, listPrices, type TimeAggregation } from '../api'
import { native } from '../lib/format'
import { CurrencyValue, DeltaValue, LineChart, num, shortMoney, type LineBenchmark, type LineSeriesPoint } from '../lib/finance'
import { usePrefStore } from '../store'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1100, margin: '0 auto' }}>{children}</div>
}

type Range = '12m' | 'ytd' | 'all'

export function TrendAnalysis() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const [gran, setGran] = useState<TimeAggregation>('month')
  const [range, setRange] = useState<Range>('12m')
  const [bench, setBench] = useState(false)

  const today = new Date()
  const to = today.toISOString().slice(0, 10)
  const from = useMemo(() => {
    if (range === 'ytd') return `${today.getFullYear()}-01-01`
    if (range === 'all') return '2015-01-01'
    const d = new Date(today)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  }, [range])

  const trend = useQuery({
    queryKey: ['trend', from, to, gran, displayCurrency, fxMode],
    queryFn: () => getTrend({ from, to, granularity: gran, display_currency: displayCurrency, fx_mode: fxMode }),
  })

  const benchmarks = useQuery({
    queryKey: ['benchmark-prices'],
    enabled: bench,
    queryFn: async () => {
      const insts = (await listInstruments()).filter((i) => i.is_benchmark)
      return Promise.all(
        insts.slice(0, 3).map(async (i) => ({
          name: i.display_name || i.symbol,
          prices: (await listPrices({ symbol: i.symbol, sort: 'date_asc' })).items.map((p) => ({ date: p.price_date, v: num(p.price) ?? 0 })),
        })),
      )
    },
  })

  const pts = trend.data?.points ?? []
  const series: LineSeriesPoint[] = pts.map((p) => ({ m: p.date, v: num(p.net_worth) ?? 0 }))

  // §6.13 rebase=100 comparison: net worth and each benchmark indexed to 100 at the start.
  const rebase = (vals: number[]) => {
    const base = vals.find((v) => v > 0)
    return base ? vals.map((v) => (v > 0 ? (v / base) * 100 : NaN)) : vals
  }
  const chartSeries: LineSeriesPoint[] = bench
    ? rebase(series.map((s) => s.v)).map((v, i) => ({ m: series[i].m, v }))
    : series
  const benchColors = ['var(--viz-3)', 'var(--viz-5)', 'var(--viz-6)']
  const benchLines: LineBenchmark[] = bench
    ? (benchmarks.data ?? [])
        .map((b, bi) => {
          const sampled = pts.map((p) => latestAtOrBefore(b.prices, p.date))
          const reb = rebase(sampled.map((v) => v ?? 0))
          return { name: b.name, color: benchColors[bi % benchColors.length], series: reb.map((v, i) => ({ m: pts[i].date, v })).filter((s) => Number.isFinite(s.v)) }
        })
        .filter((b) => b.series.length >= 2)
    : []
  const first = pts[0]
  const last = pts[pts.length - 1]
  const startV = num(first?.net_worth) ?? 0
  const endV = num(last?.net_worth) ?? 0
  const changePct = startV !== 0 ? (((endV - startV) / Math.abs(startV)) * 100).toFixed(2) : null

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented size="sm" value={range} onChange={(v) => setRange(v as Range)}
          options={[{ value: '12m', label: '近 12 月' }, { value: 'ytd', label: '今年' }, { value: 'all', label: '全部' }]} />
        <Segmented size="sm" value={gran} onChange={(v) => setGran(v as TimeAggregation)}
          options={[{ value: 'day', label: '日' }, { value: 'month', label: '月' }, { value: 'quarter', label: '季' }, { value: 'year', label: '年' }]} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={bench} onChange={(e) => setBench(e.target.checked)} /> 基准对比
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{bench ? '归一化 rebase=100' : '展示币种 ' + displayCurrency} · {fxMode === 'current' ? '当前汇率' : '历史汇率'}</span>
      </div>

      <div className="fb-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>期末净资产</div>
            <CurrencyValue value={last?.net_worth ?? '0'} currency={displayCurrency} size="22px" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>区间变化</div>
            <span className="fb-num" style={{ fontSize: 16, color: 'var(--text-strong)' }}>{shortMoney(endV - startV, displayCurrency)}</span>
            {changePct != null ? <span style={{ marginLeft: 8 }}><DeltaValue percent={changePct} pill /></span> : null}
          </div>
        </div>
        {bench ? (
          <div style={{ display: 'flex', gap: 14, marginBottom: 6, fontSize: 11.5, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 2, background: 'var(--accent)' }} />净资产</span>
            {benchLines.map((b) => <span key={b.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}><span style={{ width: 12, height: 2, background: b.color, display: 'inline-block' }} />{b.name}</span>)}
            {!benchLines.length ? <span style={{ color: 'var(--text-tertiary)' }}>无基准价格数据(在「价格/汇率/基准」维护基准标的的历史价)</span> : null}
          </div>
        ) : null}
        {chartSeries.length >= 2 ? (
          <LineChart series={chartSeries} benchmarks={benchLines} height={260} yFmt={bench ? (v) => v.toFixed(0) : (v) => shortMoney(v, displayCurrency)} />
        ) : (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {trend.isLoading ? '加载中…' : '历史数据点不足，录入更多盘点快照后趋势会更平滑'}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          净资产按截面取「不晚于该日的最近一条」快照插值（§6.14）；缺历史价格的持仓不计入当期市值。
        </div>
      </div>

      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>
            <th style={th}>日期</th><th style={thR}>净资产</th><th style={thR}>总资产</th><th style={thR}>负债</th><th style={thR}>持仓市值</th>
          </tr></thead>
          <tbody>
            {[...pts].reverse().map((p) => (
              <tr key={p.date} style={{ borderTop: '1px solid var(--divider)' }}>
                <td style={td}>{p.date}</td>
                <td style={tdR}>{native(p.net_worth, displayCurrency)}</td>
                <td style={tdR}>{native(p.total_assets, displayCurrency)}</td>
                <td style={tdR}>{native(p.total_liabilities, displayCurrency)}</td>
                <td style={tdR}>{native(p.position_value, displayCurrency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  )
}

// latestAtOrBefore returns the most recent price value on/before date (prices sorted ascending), or null.
function latestAtOrBefore(prices: { date: string; v: number }[], date: string): number | null {
  let result: number | null = null
  for (const p of prices) {
    if (p.date <= date) result = p.v
    else break
  }
  return result
}

const th: React.CSSProperties = { textAlign: 'left', padding: '9px 14px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }
const tdR: React.CSSProperties = { ...td, textAlign: 'right', color: 'var(--text-strong)' }
