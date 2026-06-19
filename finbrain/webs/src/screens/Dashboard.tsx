import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Icon } from '../ds'
import {
  getAllocationTargetDrift,
  getValuation,
  getTrend,
  listAllocationTargets,
  listAccountTemplates,
  listAccounts,
  listAnnotations,
  listCreditCardBills,
  marketStatus,
  type AccountTemplate,
  type CreditCardBill,
  type ValuationBucket,
} from '../api'
import { bucketName, KIND_LABEL, KIND_TONE, MARKET_TONE, native, supportsBalanceSnapshots } from '../lib/format'
import {
  CurrencyValue,
  DeltaValue,
  LineChart,
  Sparkline,
  VIZ,
  num,
  shortMoney,
  type DonutItem,
  type LineSeriesPoint,
} from '../lib/finance'
import { usePrefStore } from '../store'
import { useUiStore } from '../uiStore'

export function Dashboard() {
  const navigate = useNavigate()
  const openBuild = useUiStore((s) => s.openBuild)
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  })
  const valuation = useQuery({
    queryKey: ['valuation', displayCurrency, fxMode],
    queryFn: () => getValuation({ display_currency: displayCurrency, fx_mode: fxMode }),
    enabled: accounts.length > 0,
  })
  const trend = useQuery({
    queryKey: ['trend', 'dashboard', displayCurrency, fxMode],
    queryFn: () => getTrend({ granularity: 'month', display_currency: displayCurrency, fx_mode: fxMode }),
    enabled: accounts.length > 0,
  })
  const targetSets = useQuery({
    queryKey: ['allocation-targets'],
    queryFn: listAllocationTargets,
    enabled: accounts.length > 0,
  })
  const driftQueries = useQueries({
    queries: (targetSets.data ?? [])
      .filter((s) => s.is_dashboard_visible && !s.is_archived)
      .slice(0, 4)
      .map((s) => ({
        queryKey: ['target-drift', s.id, displayCurrency, fxMode],
        queryFn: () => getAllocationTargetDrift(s.id, { display_currency: displayCurrency, fx_mode: fxMode }),
      })),
  })
  const cashAccountCount = accounts.filter((a) => !a.is_archived && supportsBalanceSnapshots(a.kind)).length
  const bills = useQuery({
    queryKey: ['credit-card-bills', 'dashboard'],
    queryFn: listCreditCardBills,
    enabled: accounts.length > 0,
  })
  const annotations = useQuery({
    queryKey: ['annotations', 'dashboard'],
    queryFn: () => listAnnotations({ from: oneYearAgoISO(), to: new Date().toISOString().slice(0, 10) }),
    enabled: accounts.length > 0,
  })
  const market = useQuery({
    queryKey: ['market-status', 'dashboard'],
    queryFn: marketStatus,
    enabled: accounts.length > 0,
  })
  const hasAccounts = accounts.length > 0

  if (!hasAccounts && !accountsLoading) {
    return <EmptyDashboard onBuild={openBuild} />
  }

  if (valuation.isLoading || accountsLoading) {
    return (
      <Page>
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            正在计算估值…
          </div>
        </Card>
      </Page>
    )
  }

  if (valuation.isError || !valuation.data) {
    return (
      <Page>
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            无法加载仪表盘：{valuation.error instanceof Error ? valuation.error.message : '后端未连接'}
          </div>
        </Card>
      </Page>
    )
  }

  const v = valuation.data
  const trendPts = trend.data?.points ?? []
  const positionSeries = trendPts.map((p) => num(p.position_value) ?? 0)
  const positionTrend = positionSeries.length >= 2 ? positionSeries : staticTrend(v.position_value)
  const netWorthLine: LineSeriesPoint[] = trendPts.map((p) => ({ m: p.date, v: num(p.net_worth) ?? 0 }))
  const trendIsReal = trendPts.length >= 2
  const missingPriceCount = v.warnings.filter((w) => w.kind === 'missing_price').length
  const fxFallbackCount = v.warnings.filter((w) => w.kind === 'fx_fallback').length
  const marketLatest = (market.data?.items ?? []).reduce((mx, it) => (it.latest_date > mx ? it.latest_date : mx), '')
  const driftAlerts = driftQueries.flatMap((q) => (q.data?.items ?? []).filter((i) => i.over_threshold).map((i) => `${q.data?.name ?? '目标'} · ${i.dimension_value} ${i.drift ?? '0.00'}%`))
  const billSummary = summarizeBills(bills.data ?? [])
  const recentAnnotations = (annotations.data ?? []).slice(0, 4).map((a) => `${a.event_date} · ${a.label}`)

  return (
    <Page>
      <div className="fb-grid db-hero">
        <div
          className="fb-card"
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'var(--gradient-sheen)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div className="fb-eyebrow">净资产</div>
            <div style={{ marginTop: 10 }}>
              <CurrencyValue
                value={v.net_worth}
                currency={v.display_currency}
                hero
                compact
                size="52px"
                decimals={v.display_currency === 'CNY' ? 0 : 2}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {v.warnings.length ? (
                <Badge tone="warning" dot>
                  {v.warnings.length} 项数据降级
                </Badge>
              ) : (
                <Badge tone="success" dot>
                  数据完整
                </Badge>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {v.as_of} · {v.fx_mode === 'current' ? '当前汇率' : '历史汇率'}
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 26,
              marginTop: 22,
              paddingTop: 16,
              borderTop: '1px solid var(--divider)',
              position: 'relative',
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>总资产</div>
              <CurrencyValue value={v.total_assets} currency={v.display_currency} size="17px" compact />
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>总负债</div>
              <span style={{ color: 'var(--loss)' }}>
                <CurrencyValue value={v.total_liabilities} currency={v.display_currency} size="17px" compact />
              </span>
            </div>
          </div>
        </div>

        <div
          className="fb-card"
          style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          <div>
            <div className="fb-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="trending-up" size={13} /> 持仓总市值
            </div>
            <div style={{ marginTop: 9 }}>
              <CurrencyValue value={v.position_value} currency={v.display_currency} compact size="30px" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
              <DeltaValue percent={v.unrealized_pl_pct} pill />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>浮动盈亏</span>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Sparkline data={positionTrend} width={300} height={34} />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              {trendIsReal ? '近 12 个月月度截面（§6.14）' : '历史走势待更多盘点生成'}
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>持仓总成本</div>
                <CurrencyValue value={v.position_cost} currency={v.display_currency} compact size="14px" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>占净资产</div>
                <span className="fb-num" style={{ fontSize: 14, color: 'var(--text-strong)' }}>
                  {v.position_share ?? '0.00'}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="fb-grid split-2">
          <SmallMetric icon="badge-check" label="本年已实现盈亏" value={native(v.realized_pl_ytd, v.display_currency)} />
          <SmallMetric icon="coins" label="累计收益 · 本年" value={native(v.income_ytd, v.display_currency)} />
        </div>
      </div>

      {/* Allocation (single donut + dimension toggle) + the real net-worth trend chart. */}
      <div className="fb-grid db-12">
        <Card eyebrow="资产配置" actions={<span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>按用途分类</span>}>
          <AllocationDonut buckets={v.allocations.kind ?? []} currency={v.display_currency} />
        </Card>
        <Card
          eyebrow="净资产趋势 · 近 12 月"
          actions={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 2, background: 'var(--accent)' }} />
                净资产
              </span>
            </div>
          }
        >
          {netWorthLine.length >= 2 ? (
            <LineChart series={netWorthLine} height={232} yFmt={(x) => shortMoney(x, v.display_currency)} tooltipDelta />
          ) : (
            <div style={{ height: 232, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
              历史趋势待更多月度盘点生成
            </div>
          )}
        </Card>
      </div>

      {/* Action signals. */}
      <div className="fb-grid kpi-4">
        <SignalCard
          icon="target"
          title="目标漂移"
          value={driftAlerts.length ? `${driftAlerts.length} 项超阈值` : '无超阈值'}
          tone={driftAlerts.length ? 'warning' : 'success'}
          lines={driftAlerts.slice(0, 3)}
          action="查看目标"
          onAction={() => navigate('/targets')}
        />
        <SignalCard
          icon="scale"
          title="现金台账"
          value={`${cashAccountCount} 个现金账户`}
          tone="neutral"
          lines={['余额随记账实时联动']}
          action="看账户"
          onAction={() => navigate('/accounts')}
        />
        <SignalCard
          icon="credit-card"
          title="信用卡近 12 月"
          value={billSummary.total || '暂无账单'}
          tone={billSummary.unpaid > 0 ? 'warning' : 'neutral'}
          lines={[`${billSummary.count} 期账单`, `${billSummary.unpaid} 期未还`]}
          action="看账户"
          onAction={() => navigate('/accounts')}
        />
        <SignalCard
          icon="bookmark"
          title="最近标注"
          value={recentAnnotations.length ? `${recentAnnotations.length} 条` : '暂无标注'}
          tone="neutral"
          lines={recentAnnotations}
          action="趋势分析"
          onAction={() => navigate('/trend')}
        />
      </div>

      {/* Market-data status — prices are auto-fetched now, not hand-maintained. */}
      {market.data ? (
        <div className="fb-card" style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <Icon name="refresh-cw" size={13} color="var(--accent)" /> 行情自动更新
          </span>
          {marketLatest ? (
            <span style={{ color: 'var(--text-tertiary)' }}>最新 {marketLatest} · {market.data.items.length} 个标的</span>
          ) : null}
          {v.warnings.length ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warning)' }}>
              <Icon name="triangle-alert" size={13} />
              {v.warnings.length} 项估值降级
              {missingPriceCount ? ` · ${missingPriceCount} 缺价格` : ''}
              {fxFallbackCount ? ` · ${fxFallbackCount} 汇率回退` : ''}
            </span>
          ) : (
            <span style={{ color: 'var(--gain)' }}>估值数据完整</span>
          )}
          <Button variant="ghost" size="sm" iconRight={<Icon name="arrow-right" size={13} />} onClick={() => navigate('/market')} style={{ marginLeft: 'auto' }}>
            行情数据
          </Button>
        </div>
      ) : null}
    </Page>
  )
}

// Dashboard allocation by account-purpose (用途) only. A bold hollow-center ring with a rich
// legend (label · amount · share), hover-synced between ring and rows — no center total, no
// dimension toggle.
function AllocationDonut({ buckets, currency }: { buckets: ValuationBucket[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const items = toDonutItems('kind', buckets)
  if (!items.length) {
    return <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '44px 0', textAlign: 'center' }}>暂无可估值资产。</div>
  }
  const total = items.reduce((s, it) => s + Math.max(0, it.value), 0) || 1
  const size = 188
  const thickness = 26
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - thickness / 2 - 1
  const C = 2 * Math.PI * r
  const gapPx = items.length > 1 ? 3 : 0
  let acc = 0
  const arcs = items.map((it, i) => {
    const seg = (Math.max(0, it.value) / total) * C
    const a = { ...it, i, frac: Math.max(0, it.value) / total, dash: Math.max(0, seg - gapPx), off: acc }
    acc += seg
    return a
  })
  const dim = (i: number) => (hover == null || hover === i ? 1 : 0.32)
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap', padding: '4px 0' }}>
      <svg width={size} height={size} style={{ flex: 'none', transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={thickness} />
        {arcs.map((s) => (
          <circle
            key={s.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.off}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'default', opacity: dim(s.i), transition: 'opacity .16s' }}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 168 }}>
        {arcs.map((s) => (
          <div
            key={s.key}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', columnGap: 11, alignItems: 'center', opacity: dim(s.i), transition: 'opacity .16s', cursor: 'default' }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              <div className="fb-num" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{shortMoney(s.value, currency)}</div>
            </div>
            <span className="fb-num" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right' }}>{(s.frac * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1320, margin: '0 auto' }}>
      {children}
    </div>
  )
}

function SmallMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="fb-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name={icon} size={14} color="var(--text-tertiary)" />
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 20, color: 'var(--text-tertiary)' }}>{value}</div>
    </div>
  )
}

function SignalCard({
  icon,
  title,
  value,
  tone,
  lines,
  action,
  onAction,
}: {
  icon: string
  title: string
  value: string
  tone: 'success' | 'warning' | 'neutral'
  lines: string[]
  action: string
  onAction: () => void
}) {
  return (
    <div className="fb-card" style={{ padding: 15, minHeight: 152, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={15} color={tone === 'warning' ? 'var(--warning)' : 'var(--accent)'} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{title}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Badge tone={tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'neutral'}>{value}</Badge>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 48 }}>
        {lines.length ? lines.slice(0, 3).map((line, index) => (
          <div key={index} style={{ fontSize: 11.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {line}
          </div>
        )) : <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>暂无需要处理的项目</div>}
      </div>
      <Button variant="ghost" size="sm" iconRight={<Icon name="arrow-right" size={13} />} onClick={onAction} style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
        {action}
      </Button>
    </div>
  )
}

function EmptyDashboard({ onBuild }: { onBuild: () => void }) {
  return (
    <Page>
      <Card padded={false}>
        <div style={{ display: 'flex', gap: 18, padding: '28px 26px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'var(--gradient-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
              flex: 'none',
            }}
          >
            <Icon name="sparkles" size={26} color="var(--accent-text)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="fb-card__eyebrow">WELCOME</div>
            <h2 style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-strong)', margin: '2px 0 8px' }}>
              欢迎使用 finbrain
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, maxWidth: 640 }}>
              当前还没有任何账户。可以从内置模板快速建账，或手动添加单个账户，然后开始更新余额 / 持仓。
            </p>
            <ol style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.9, margin: '10px 0 0', paddingLeft: 18, maxWidth: 640 }}>
              <li><strong style={{ color: 'var(--text-secondary)' }}>建账</strong> — 从模板或手动创建机构与账户</li>
              <li><strong style={{ color: 'var(--text-secondary)' }}>录入</strong> — 更新余额 / 持仓快照（或用月度盘点向导一次录完），价格 / 汇率在「行情数据」维护</li>
              <li><strong style={{ color: 'var(--text-secondary)' }}>查看</strong> — 仪表盘看净资产与分布，持仓总览、趋势、对账逐步点亮</li>
            </ol>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" iconLeft={<Icon name="plus" size={14} />} onClick={onBuild}>
                新增账户
              </Button>
            </div>
          </div>
        </div>
      </Card>
      <TemplatesPreview onBuild={onBuild} />
    </Page>
  )
}

function TemplatesPreview({ onBuild }: { onBuild: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['account-templates'],
    queryFn: listAccountTemplates,
  })

  return (
    <Card
      eyebrow="QUICK START"
      title="内置建账模板"
      subtitle="一键创建一组关联账户"
      actions={
        <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={onBuild}>
          新增账户
        </Button>
      }
    >
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>加载模板中…</div>
      ) : isError ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
          无法加载模板（后端未连接）。启动后端服务后可见内置模板。
        </div>
      ) : (
        <div className="fb-grid kpi-4" style={{ display: 'grid', gap: 14 }}>
          {(data ?? []).map((tpl: AccountTemplate) => (
            <div
              key={tpl.id}
              style={{
                background: 'var(--surface-inset)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="layers" size={15} color="var(--accent)" />
                <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 500 }}>{tpl.name}</span>
                {tpl.is_builtin ? <Badge tone="gold">内置</Badge> : null}
              </div>
              {tpl.description ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{tpl.description}</div> : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
                {tpl.account_blueprints.map((bp, i) => (
                  <span key={i} className="fb-tag" style={{ fontSize: 11 }}>
                    {bp.name_suffix}
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
                      {KIND_LABEL[bp.kind] ?? bp.kind} · {bp.currency}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function toDonutItems(dim: string, buckets: ValuationBucket[]): DonutItem[] {
  return buckets.map((b, i) => ({
    key: b.key,
    name: bucketName(dim, b.key, b.name),
    value: Math.abs(num(b.value) ?? 0),
    color: bucketColor(dim, b.key, i),
  }))
}

function bucketColor(dim: string, key: string, index: number) {
  if (dim === 'kind') return KIND_TONE[key] ?? VIZ[index % VIZ.length]
  if (dim === 'market') return MARKET_TONE[key] ?? VIZ[index % VIZ.length]
  return VIZ[index % VIZ.length]
}

function staticTrend(value: string) {
  const v = num(value) ?? 0
  return [v, v]
}

function oneYearAgoISO() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

function summarizeBills(bills: CreditCardBill[]) {
  const from = oneYearAgoISO()
  const recent = bills.filter((b) => b.statement_date >= from)
  const byCurrency = new Map<string, number>()
  for (const bill of recent) {
    byCurrency.set(bill.currency, (byCurrency.get(bill.currency) ?? 0) + (num(bill.amount_total) ?? 0))
  }
  const total = [...byCurrency.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)
    .map(([currency, amount]) => native(amount, currency))
    .join(' / ')
  return {
    total,
    count: recent.length,
    unpaid: recent.filter((b) => !b.paid_at).length,
  }
}
