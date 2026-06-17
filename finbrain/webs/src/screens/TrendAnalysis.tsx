import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Icon, IconButton, Input, Segmented } from '../ds'
import {
  createAnnotation,
  deleteAnnotation,
  getTrend,
  listAnnotations,
  listIncomeEvents,
  listInstruments,
  listPrices,
  type TimeAggregation,
  type TrendPoint,
} from '../api'
import { native } from '../lib/format'
import { CurrencyValue, DeltaValue, LineChart, num, shortMoney, type LineBenchmark, type LineSeriesPoint } from '../lib/finance'
import { usePrefStore } from '../store'
import { useToast } from '../shell/Toast'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1120, margin: '0 auto' }}>{children}</div>
}

type Range = '12m' | 'ytd' | 'all'
type Subject = 'net_worth' | 'total_assets' | 'cash_value' | 'position_value'
type BenchmarkMode = 'off' | 'absolute' | 'rebase' | 'excess'

const SUBJECTS: Record<Subject, string> = {
  net_worth: '净资产',
  total_assets: '总资产',
  cash_value: '现金',
  position_value: '持仓市值',
}

export function TrendAnalysis() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const [gran, setGran] = useState<TimeAggregation>('month')
  const [range, setRange] = useState<Range>('12m')
  const [subject, setSubject] = useState<Subject>('net_worth')
  const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>('off')
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([])

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

  const benchmarkInstruments = useQuery({
    queryKey: ['benchmark-instruments'],
    queryFn: async () => (await listInstruments()).filter((i) => i.is_benchmark),
  })

  useEffect(() => {
    if (benchmarkMode === 'off' || selectedBenchmarks.length || !benchmarkInstruments.data?.length) return
    setSelectedBenchmarks(benchmarkInstruments.data.slice(0, 3).map((i) => i.symbol))
  }, [benchmarkInstruments.data, benchmarkMode, selectedBenchmarks.length])

  const benchmarkPrices = useQuery({
    queryKey: ['benchmark-prices', selectedBenchmarks],
    enabled: benchmarkMode !== 'off' && selectedBenchmarks.length > 0,
    queryFn: async () =>
      Promise.all(
        selectedBenchmarks.map(async (symbol) => {
          const inst = benchmarkInstruments.data?.find((i) => i.symbol === symbol)
          return {
            symbol,
            name: inst?.display_name || symbol,
            prices: (await listPrices({ symbol, sort: 'date_asc' })).items.map((p) => ({ date: p.price_date, v: num(p.price) ?? 0 })),
          }
        }),
      ),
  })

  const incomeEvents = useQuery({ queryKey: ['income-events', 'trend'], queryFn: () => listIncomeEvents() })
  const incomeMarkers = useMemo(
    () => (incomeEvents.data?.items ?? []).filter((e) => e.event_date >= from && e.event_date <= to),
    [from, incomeEvents.data?.items, to],
  )

  const pts = trend.data?.points ?? []
  const rawSeries: LineSeriesPoint[] = pts.map((p) => ({ m: p.date, v: pointValue(p, subject) }))
  const rawVals = rawSeries.map((s) => s.v)
  const subjectRebased = rebase(rawVals)
  const chartSeries: LineSeriesPoint[] =
    benchmarkMode === 'rebase'
      ? subjectRebased.map((v, i) => ({ m: rawSeries[i].m, v }))
      : benchmarkMode === 'excess'
        ? rawSeries.map((s) => ({ m: s.m, v: 100 }))
        : rawSeries

  const benchColors = ['var(--viz-3)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)']
  const benchLines: LineBenchmark[] =
    benchmarkMode === 'off'
      ? []
      : (benchmarkPrices.data ?? [])
          .map((b, bi) => {
            const sampled = pts.map((p) => latestAtOrBefore(b.prices, p.date) ?? 0)
            const rebased = rebase(sampled)
            const values =
              benchmarkMode === 'absolute'
                ? sampled
                : benchmarkMode === 'rebase'
                  ? rebased
                  : rebased.map((v, i) => subjectRebased[i] - v + 100)
            return {
              name: benchmarkMode === 'excess' ? `${SUBJECTS[subject]} - ${b.name}` : b.name,
              color: benchColors[bi % benchColors.length],
              series: values.map((v, i) => ({ m: pts[i].date, v })).filter((s) => Number.isFinite(s.v)),
            }
          })
          .filter((b) => b.series.length >= 2)

  const startV = rawVals[0] ?? 0
  const endV = rawVals[rawVals.length - 1] ?? 0
  const changePct = startV !== 0 ? (((endV - startV) / Math.abs(startV)) * 100).toFixed(2) : null

  const qc = useQueryClient()
  const toast = useToast()
  const annotations = useQuery({ queryKey: ['annotations', from, to], queryFn: () => listAnnotations({ from, to }) })
  const [annDate, setAnnDate] = useState(to)
  const [annLabel, setAnnLabel] = useState('')
  const addAnn = useMutation({
    mutationFn: () => createAnnotation({ event_date: annDate, label: annLabel.trim(), anchor_kind: 'date' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['annotations'] }); setAnnLabel(''); toast.success('已添加标注') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '添加失败'),
  })
  const delAnn = useMutation({
    mutationFn: deleteAnnotation,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['annotations'] }); toast.success('已删除标注') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented size="sm" value={range} onChange={(v) => setRange(v as Range)}
          options={[{ value: '12m', label: '近 12 月' }, { value: 'ytd', label: '今年' }, { value: 'all', label: '全部' }]} />
        <Segmented size="sm" value={gran} onChange={(v) => setGran(v as TimeAggregation)}
          options={[{ value: 'day', label: '日' }, { value: 'month', label: '月' }, { value: 'quarter', label: '季' }, { value: 'year', label: '年' }]} />
        <Segmented size="sm" value={subject} onChange={(v) => setSubject(v as Subject)}
          options={Object.entries(SUBJECTS).map(([value, label]) => ({ value, label }))} />
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{displayCurrency} · {fxMode === 'current' ? '当前汇率' : '历史汇率'}</span>
      </div>

      <div className="fb-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Icon name="git-compare" size={15} color="var(--accent)" />
          <Segmented
            size="sm"
            value={benchmarkMode}
            onChange={(v) => setBenchmarkMode(v as BenchmarkMode)}
            options={[
              { value: 'off', label: '无基准' },
              { value: 'absolute', label: '绝对值' },
              { value: 'rebase', label: 'Rebase=100' },
              { value: 'excess', label: '超额' },
            ]}
          />
          {benchmarkMode !== 'off' ? (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {(benchmarkInstruments.data ?? []).map((b) => {
                const active = selectedBenchmarks.includes(b.symbol)
                return (
                  <button
                    key={b.symbol}
                    onClick={() => setSelectedBenchmarks((items) => active ? items.filter((x) => x !== b.symbol) : [...items, b.symbol])}
                    className="fb-badge fb-badge--neutral"
                    style={{ borderColor: active ? 'var(--accent)' : 'var(--border-default)', color: active ? 'var(--accent-bright)' : 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    {b.display_name || b.symbol}
                  </button>
                )
              })}
              {!benchmarkInstruments.isLoading && !(benchmarkInstruments.data ?? []).length ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>暂无基准标的</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="fb-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>期末{SUBJECTS[subject]}</div>
            <CurrencyValue value={String(endV)} currency={displayCurrency} size="22px" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>区间变化</div>
            <span className="fb-num" style={{ fontSize: 16, color: 'var(--text-strong)' }}>{shortMoney(endV - startV, displayCurrency)}</span>
            {changePct != null ? <span style={{ marginLeft: 8 }}><DeltaValue percent={changePct} pill /></span> : null}
          </div>
        </div>
        {benchmarkMode !== 'off' ? (
          <Legend subject={benchmarkMode === 'excess' ? '组合基线' : SUBJECTS[subject]} benchmarkLines={benchLines} />
        ) : null}
        {chartSeries.length >= 2 ? (
          <LineChart
            series={chartSeries}
            benchmarks={benchLines}
            height={270}
            yFmt={benchmarkMode === 'off' ? (v) => shortMoney(v, displayCurrency) : (v) => v.toFixed(0)}
          />
        ) : (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {trend.isLoading ? '加载中…' : '历史数据点不足，录入更多盘点快照后趋势会更平滑'}
          </div>
        )}
        <IncomeMarkerStrip from={from} to={to} markers={incomeMarkers} />
        <CompositionStrip points={pts} currency={displayCurrency} />
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          趋势点复用当前估值引擎；缺历史价格的持仓不计入当期市值。
        </div>
      </div>

      <div className="fb-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="bookmark" size={15} color="var(--accent)" />
          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>标注</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>区间 {from} → {to}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Input type="date" size="sm" value={annDate} onChange={(e) => setAnnDate(e.target.value)} style={{ maxWidth: 160 }} />
          <Input size="sm" value={annLabel} onChange={(e) => setAnnLabel(e.target.value)} placeholder="标注内容" style={{ flex: 1, minWidth: 200 }} />
          <Button size="sm" variant="secondary" disabled={!annLabel.trim() || addAnn.isPending} iconLeft={<Icon name="plus" size={13} />} onClick={() => addAnn.mutate()}>添加</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(annotations.data ?? []).map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
              <span className="fb-num" style={{ fontSize: 11.5, color: 'var(--text-tertiary)', width: 90 }}>{a.event_date}</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{a.label}</span>
              <IconButton aria-label="删除" size="sm" onClick={() => delAnn.mutate(a.id)}><Icon name="trash-2" size={13} /></IconButton>
            </div>
          ))}
          {!annotations.isLoading && !(annotations.data ?? []).length ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>该区间暂无标注</span> : null}
        </div>
      </div>
    </Page>
  )
}

function pointValue(p: TrendPoint, subject: Subject) {
  return num(p[subject]) ?? 0
}

function rebase(vals: number[]) {
  const base = vals.find((v) => v > 0)
  return base ? vals.map((v) => (v > 0 ? (v / base) * 100 : NaN)) : vals
}

function Legend({ subject, benchmarkLines }: { subject: string; benchmarkLines: LineBenchmark[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 6, fontSize: 11.5, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 2, background: 'var(--accent)' }} />{subject}</span>
      {benchmarkLines.map((b) => <span key={b.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}><span style={{ width: 12, height: 2, background: b.color, display: 'inline-block' }} />{b.name}</span>)}
      {!benchmarkLines.length ? <span style={{ color: 'var(--text-tertiary)' }}>无可用基准价格数据</span> : null}
    </div>
  )
}

function IncomeMarkerStrip({ from, to, markers }: { from: string; to: string; markers: { event_date: string; amount: string; currency: string; symbol: string | null }[] }) {
  if (!markers.length) return null
  const start = new Date(from).getTime()
  const span = Math.max(1, new Date(to).getTime() - start)
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>收益标记</div>
      <div style={{ position: 'relative', height: 24, borderTop: '1px solid var(--divider)' }}>
        {markers.slice(0, 30).map((m, i) => {
          const left = Math.max(0, Math.min(100, ((new Date(m.event_date).getTime() - start) / span) * 100))
          return (
            <span
              key={`${m.event_date}-${i}`}
              title={`${m.event_date} ${m.symbol ?? ''} ${m.amount} ${m.currency}`}
              style={{ position: 'absolute', left: `${left}%`, top: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--gain)', boxShadow: '0 0 0 3px rgba(81,177,108,.14)' }}
            />
          )
        })}
      </div>
    </div>
  )
}

function CompositionStrip({ points, currency }: { points: TrendPoint[]; currency: string }) {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>资产构成</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}><span style={{ width: 9, height: 9, background: 'var(--viz-2)' }} />现金 {native(last.cash_value, currency)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}><span style={{ width: 9, height: 9, background: 'var(--accent)' }} />持仓 {native(last.position_value, currency)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}><span style={{ width: 9, height: 9, background: 'var(--loss)' }} />负债 {native(last.total_liabilities, currency)}</span>
      </div>
      <div style={{ height: 42, display: 'flex', alignItems: 'stretch', gap: 2 }}>
        {points.map((p) => {
          const cash = Math.max(0, num(p.cash_value) ?? 0)
          const pos = Math.max(0, num(p.position_value) ?? 0)
          const liab = Math.max(0, num(p.total_liabilities) ?? 0)
          const denom = Math.max(1, cash + pos + liab)
          return (
            <div key={p.date} title={p.date} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', background: 'var(--surface-inset)', minWidth: 3 }}>
              <span style={{ height: `${(cash / denom) * 100}%`, background: 'var(--viz-2)' }} />
              <span style={{ height: `${(pos / denom) * 100}%`, background: 'var(--accent)' }} />
              <span style={{ height: `${(liab / denom) * 100}%`, background: 'var(--loss)' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function latestAtOrBefore(prices: { date: string; v: number }[], date: string): number | null {
  let result: number | null = null
  for (const p of prices) {
    if (p.date <= date) result = p.v
    else break
  }
  return result
}
