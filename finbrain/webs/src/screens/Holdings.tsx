import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card, DateField, Icon, Segmented } from '../ds'
import { getValuation, type ValuationPosition } from '../api'
import { marketLabel, MARKET_TONE, native, quantity, todayISO } from '../lib/format'
import { CurrencyValue, DeltaValue, StatCard, Tag, VIZ, num } from '../lib/finance'
import { usePrefStore } from '../store'

type SortKey =
  | 'symbol'
  | 'quantity'
  | 'avgCost'
  | 'price'
  | 'marketValue'
  | 'plPct'
  | 'weight'
  | 'assetWeight'
  | 'holdingDays'

interface HoldingRow {
  key: string
  symbol: string
  name: string
  subtitle: string
  market: string
  quoteCurrency: string
  costCurrency: string
  quantity: string | null
  avgCost: string | null
  price: string | null
  priceCurrency: string | null
  marketValue: number | null
  costValue: number | null
  plValue: number | null
  plPct: number | null
  weight: number | null
  assetWeight: number | null
  holdingDays: number | null
  missingPrice: boolean
  fxFallback: boolean
}

export function Holdings() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const timezone = usePrefStore((s) => s.timezone)
  const [group, setGroup] = useState('symbol')
  const [filter, setFilter] = useState('all')
  const [costMode, setCostMode] = useState<'weighted' | 'net'>('weighted')
  const [sort, setSort] = useState<{ key: SortKey | null; dir: number }>({ key: null, dir: 1 })
  const today = todayISO(timezone)
  const [asOf, setAsOf] = useState(today)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['valuation', asOf, displayCurrency, fxMode],
    queryFn: () => getValuation({ date: asOf, display_currency: displayCurrency, fx_mode: fxMode }),
  })

  const rows = useMemo(() => {
    if (!data) return []
    let next =
      group === 'symbol'
        ? (data.position_groups?.length ? data.position_groups : data.positions).map((p) =>
            positionToRow(p, num(data.position_value) ?? 0, costMode),
          )
        : buildRows(data.positions, group, num(data.position_value) ?? 0, costMode)
    next = next.filter((h) => {
      if (filter === 'all') return true
      if (filter === 'profit') return (h.plPct ?? 0) > 0
      if (filter === 'noprice') return h.missingPrice
      return h.market === filter
    })
    next = [...next].sort((a, b) => {
      const missing = Number(a.missingPrice) - Number(b.missingPrice)
      if (missing !== 0) return missing
      if (!sort.key) return 0
      return compareHolding(a, b, sort.key) * sort.dir
    })
    return next
  }, [costMode, data, filter, group, sort])

  const marketCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of data?.positions ?? []) {
      const m = p.market || 'UNKNOWN'
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    return [...counts.entries()].filter(([m]) => m !== 'UNKNOWN')
  }, [data])

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))
  }

  if (isLoading) {
    return (
      <Page>
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>加载持仓中…</div>
        </Card>
      </Page>
    )
  }

  if (isError || !data) {
    return (
      <Page>
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            无法加载持仓：{error instanceof Error ? error.message : '后端未连接'}
          </div>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <div className="fb-grid fb-grid--g14 kpi-5">
        <StatCard label="持仓总市值" value={data.position_value} currency={data.display_currency} compact />
        <StatCard
          label={costMode === 'net' ? '净持有成本' : '持仓总成本'}
          value={costMode === 'net' ? data.position_net_cost : data.position_cost}
          currency={data.display_currency}
          compact
        />
        <StatCard
          label="总浮动盈亏"
          raw={
            <span style={{ color: (num(data.unrealized_pl) ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
              <CurrencyValue value={data.unrealized_pl} currency={data.display_currency} signed size="var(--text-3xl)" compact />
            </span>
          }
          deltaPercent={data.unrealized_pl_pct}
        />
        <StatCard
          label="本年已实现盈亏"
          raw={
            <span style={{ color: (num(data.realized_pl_ytd) ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
              <CurrencyValue value={data.realized_pl_ytd} currency={data.display_currency} signed size="var(--text-3xl)" compact />
            </span>
          }
        />
        <StatCard
          label="持仓占净资产"
          raw={<span className="fb-num" style={{ fontSize: 'var(--text-3xl)', color: 'var(--text-strong)' }}>{data.position_share ?? '0.00'}%</span>}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented
          value={group}
          onChange={setGroup}
          size="sm"
          options={[
            { value: 'account', label: '按账户' },
            { value: 'symbol', label: '按标的合并' },
            { value: 'market', label: '按市场' },
            { value: 'quote', label: '按计价币种' },
          ]}
        />
        <div style={{ width: 1, height: 22, background: 'var(--divider)' }} />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <Tag clickable active={filter === 'all'} onClick={() => setFilter('all')}>
            全部 {data.positions.length}
          </Tag>
          {marketCounts.map(([market, count], i) => (
            <Tag
              key={market}
              clickable
              active={filter === market}
              dotColor={MARKET_TONE[market] ?? VIZ[i % VIZ.length]}
              onClick={() => setFilter(market)}
            >
              {marketLabel(market)} {count}
            </Tag>
          ))}
          <Tag clickable active={filter === 'profit'} onClick={() => setFilter('profit')}>
            盈利中
          </Tag>
          <Tag clickable active={filter === 'noprice'} onClick={() => setFilter('noprice')}>
            无价格
          </Tag>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>截至</span>
          <DateField size="sm" value={asOf} max={today} onChange={setAsOf} style={{ maxWidth: 150 }} />
          <div style={{ width: 1, height: 22, background: 'var(--divider)' }} />
          <Icon name="columns-3" size={14} color="var(--text-tertiary)" />
          <Segmented
            size="sm"
            value={costMode}
            onChange={(v) => setCostMode(v as 'weighted' | 'net')}
            options={[
              { value: 'weighted', label: '加权买入' },
              { value: 'net', label: '净持有成本' },
            ]}
          />
        </div>
      </div>

      <Card padded={false}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1220 }}>
            <thead>
              <tr>
                <SortableTh w="210px" sortKey="symbol" sort={sort} onSort={onSort}>标的 / 账户</SortableTh>
                <SortableTh>市场</SortableTh>
                <SortableTh right sortKey="quantity" sort={sort} onSort={onSort}>数量</SortableTh>
                <SortableTh right sortKey="avgCost" sort={sort} onSort={onSort}>{costMode === 'net' ? '净持有成本' : '加权买入'}</SortableTh>
                <SortableTh right sortKey="price" sort={sort} onSort={onSort}>现价</SortableTh>
                <SortableTh right sortKey="marketValue" sort={sort} onSort={onSort}>持仓市值</SortableTh>
                <SortableTh right sortKey="plPct" sort={sort} onSort={onSort}>浮动盈亏率</SortableTh>
                <SortableTh right>浮动盈亏</SortableTh>
                <SortableTh right sortKey="weight" sort={sort} onSort={onSort}>仓位权重</SortableTh>
                <SortableTh right sortKey="assetWeight" sort={sort} onSort={onSort}>资产权重</SortableTh>
                <SortableTh right sortKey="holdingDays" sort={sort} onSort={onSort}>持仓时长</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((h) => (
                  <tr
                    key={h.key}
                    style={{
                      borderBottom: '1px solid var(--divider)',
                      background: h.missingPrice ? 'var(--surface-inset)' : 'transparent',
                      transition: 'var(--transition-control)',
                    }}
                    onMouseEnter={(e) => {
                      if (!h.missingPrice) e.currentTarget.style.background = 'var(--surface-raised)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = h.missingPrice ? 'var(--surface-inset)' : 'transparent'
                    }}
                  >
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)', fontSize: 13 }}>
                              {h.symbol}
                            </span>
                            {h.fxFallback ? <Badge tone="warning">汇率暂估</Badge> : null}
                            {h.missingPrice ? <Badge tone="danger">无价格</Badge> : null}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{h.subtitle}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="fb-badge fb-badge--neutral" style={{ color: MARKET_TONE[h.market] ?? 'var(--text-secondary)' }}>
                        <span className="fb-badge__dot" style={{ background: MARKET_TONE[h.market] ?? 'var(--text-secondary)' }} />
                        {marketLabel(h.market)}
                      </span>
                    </Td>
                    <Td right mono>{h.quantity == null ? '—' : quantity(h.quantity)}</Td>
                    <Td right mono dim>{h.avgCost == null ? '—' : native(h.avgCost, h.costCurrency, 4)}</Td>
                    <Td right mono color={h.price ? 'var(--text-strong)' : 'var(--text-tertiary)'}>
                      {h.price && h.priceCurrency ? native(h.price, h.priceCurrency, 4) : '—'}
                    </Td>
                    <Td right mono color="var(--text-strong)">{native(h.marketValue, data.display_currency, 2)}</Td>
                    <Td right>{h.plPct == null ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : <DeltaValue percent={h.plPct} />}</Td>
                    <Td right mono color={(h.plValue ?? 0) > 0 ? 'var(--gain)' : (h.plValue ?? 0) < 0 ? 'var(--loss)' : 'var(--text-tertiary)'}>
                      {h.plValue == null ? '—' : native(h.plValue, data.display_currency, 2)}
                    </Td>
                    <Td right mono>{h.weight == null ? '—' : `${h.weight.toFixed(2)}%`}</Td>
                    <Td right mono>{h.assetWeight == null ? '—' : `${h.assetWeight.toFixed(2)}%`}</Td>
                    <Td right mono>{durationLabel(h.holdingDays)}</Td>
                  </tr>
                ))
              ) : (
                <tr>
                  <Td dim>没有匹配的持仓</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="info" size={13} /> 成本和浮动盈亏随成本口径切换；无价格持仓置底展示且不计入汇总。
      </div>
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1320, margin: '0 auto' }}>
      {children}
    </div>
  )
}

function SortableTh({
  children,
  right,
  w,
  sortKey,
  sort,
  onSort,
}: {
  children?: React.ReactNode
  right?: boolean
  w?: number | string
  sortKey?: SortKey
  sort?: { key: SortKey | null; dir: number }
  onSort?: (key: SortKey) => void
}) {
  const active = sortKey != null && sort?.key === sortKey
  return (
    <th
      onClick={sortKey ? () => onSort?.(sortKey) : undefined}
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '9px 12px',
        fontSize: 11,
        fontWeight: 500,
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
        background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-default)',
        width: w,
        cursor: sortKey ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {children}
      {active ? <span style={{ marginLeft: 3, color: 'var(--accent)' }}>{sort.dir > 0 ? '▲' : '▼'}</span> : sortKey ? <span style={{ marginLeft: 3, opacity: 0.3 }}>⇅</span> : null}
    </th>
  )
}

function Td({
  children,
  right,
  mono,
  color,
  dim,
}: {
  children?: React.ReactNode
  right?: boolean
  mono?: boolean
  color?: string
  dim?: boolean
}) {
  return (
    <td
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '10px 12px',
        fontSize: 12.5,
        fontFamily: mono ? 'var(--font-num)' : 'var(--font-sans)',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        color: color || (dim ? 'var(--text-tertiary)' : 'var(--text-primary)'),
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  )
}

function buildRows(positions: ValuationPosition[], group: string, totalPositionValue: number, costMode: 'weighted' | 'net'): HoldingRow[] {
  const base = positions.map((p) => positionToRow(p, totalPositionValue, costMode))
  if (group === 'account') return base
  const keyOf = (r: HoldingRow) => {
    if (group === 'symbol') return r.symbol
    if (group === 'market') return r.market
    return r.quoteCurrency
  }
  const map = new Map<string, HoldingRow & { count: number }>()
  for (const r of base) {
    const key = keyOf(r) || 'UNKNOWN'
    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        ...r,
        key: `${group}:${key}`,
        symbol: group === 'symbol' ? r.symbol : key,
        name: group === 'symbol' ? r.name : group === 'market' ? marketLabel(key) : key,
        subtitle: group === 'symbol' ? r.name : group === 'market' ? '按市场合并' : '按计价币种合并',
        quantity: group === 'symbol' ? r.quantity : null,
        avgCost: group === 'symbol' ? r.avgCost : null,
        price: group === 'symbol' ? r.price : null,
        count: 1,
      })
      continue
    }
    cur.count += 1
    cur.marketValue = addNullable(cur.marketValue, r.marketValue)
    cur.costValue = addNullable(cur.costValue, r.costValue)
    cur.plValue = addNullable(cur.plValue, r.plValue)
    cur.missingPrice = cur.missingPrice || r.missingPrice
    cur.fxFallback = cur.fxFallback || r.fxFallback
    if (group === 'symbol' && cur.quantity != null && r.quantity != null) {
      const q = (num(cur.quantity) ?? 0) + (num(r.quantity) ?? 0)
      cur.quantity = String(q)
    }
    cur.subtitle = group === 'symbol' ? `${cur.count} 个账户` : cur.subtitle
  }
  return [...map.values()].map((r) => {
    const plPct = r.costValue && r.costValue !== 0 && r.plValue != null ? (r.plValue / r.costValue) * 100 : null
    const weight = r.marketValue != null && totalPositionValue ? (r.marketValue / totalPositionValue) * 100 : null
    return { ...r, plPct, weight, assetWeight: null, holdingDays: null }
  })
}

function positionToRow(p: ValuationPosition, totalPositionValue: number, costMode: 'weighted' | 'net'): HoldingRow {
  const marketValue = num(p.market_value_display)
  const weightedCostValue = num(p.cost_value_display)
  const netCostValue = num(p.net_cost_value_display)
  const costValue = costMode === 'net' ? (netCostValue ?? weightedCostValue) : weightedCostValue
  const avgCost = costMode === 'net' ? (p.net_cost ?? p.avg_cost) : p.avg_cost
  const plValue = marketValue != null && costValue != null ? marketValue - costValue : num(p.unrealized_pl_display)
  const plPct = costValue && costValue !== 0 && plValue != null ? (plValue / costValue) * 100 : num(p.unrealized_pl_pct)
  return {
    key: `${p.account_id}:${p.symbol}`,
    symbol: p.symbol,
    name: p.display_name ?? p.symbol,
    subtitle: `${p.display_name ?? p.symbol} · ${p.institution} · ${p.account_name}`,
    market: p.market ?? 'UNKNOWN',
    quoteCurrency: p.quote_currency ?? p.price_currency ?? p.cost_currency,
    costCurrency: p.cost_currency,
    quantity: p.quantity,
    avgCost,
    price: p.price,
    priceCurrency: p.price_currency,
    marketValue,
    costValue,
    plValue,
    plPct,
    weight: p.weight != null ? num(p.weight) : marketValue != null && totalPositionValue ? (marketValue / totalPositionValue) * 100 : null,
    assetWeight: num(p.asset_weight),
    holdingDays: p.holding_days,
    missingPrice: p.missing_price,
    fxFallback: p.fx_fallback,
  }
}

function addNullable(a: number | null, b: number | null) {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

function compareHolding(a: HoldingRow, b: HoldingRow, key: SortKey) {
  if (key === 'symbol') return a.symbol.localeCompare(b.symbol)
  const av = holdingSortValue(a, key)
  const bv = holdingSortValue(b, key)
  if (av == null) return 1
  if (bv == null) return -1
  return av > bv ? 1 : av < bv ? -1 : 0
}

function holdingSortValue(r: HoldingRow, key: SortKey) {
  switch (key) {
    case 'quantity':
      return num(r.quantity)
    case 'avgCost':
      return num(r.avgCost)
    case 'price':
      return num(r.price)
    case 'marketValue':
      return r.marketValue
    case 'plPct':
      return r.plPct
    case 'weight':
      return r.weight
    case 'assetWeight':
      return r.assetWeight
    case 'holdingDays':
      return r.holdingDays
    default:
      return null
  }
}

function durationLabel(days: number | null) {
  if (days == null) return '—'
  if (days < 30) return `${days} 天`
  if (days < 365) return `${Math.floor(days / 30)} 月`
  const years = days / 365
  return `${years.toFixed(years >= 10 ? 0 : 1)} 年`
}

