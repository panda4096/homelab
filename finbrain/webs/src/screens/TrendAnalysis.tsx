import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Segmented } from '../ds'
import { getTrend, type TimeAggregation } from '../api'
import { native } from '../lib/format'
import { CurrencyValue, DeltaValue, LineChart, num, shortMoney, type LineSeriesPoint } from '../lib/finance'
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

  const pts = trend.data?.points ?? []
  const series: LineSeriesPoint[] = pts.map((p) => ({ m: p.date, v: num(p.net_worth) ?? 0 }))
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
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>展示币种 {displayCurrency} · {fxMode === 'current' ? '当前汇率' : '历史汇率'}</span>
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
        {series.length >= 2 ? (
          <LineChart series={series} height={260} yFmt={(v) => shortMoney(v, displayCurrency)} />
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

const th: React.CSSProperties = { textAlign: 'left', padding: '9px 14px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }
const tdR: React.CSSProperties = { ...td, textAlign: 'right', color: 'var(--text-strong)' }
