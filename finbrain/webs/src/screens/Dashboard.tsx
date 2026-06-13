import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Icon } from '../ds'
import {
  getValuation,
  getTrend,
  listAccountTemplates,
  listAccounts,
  type AccountTemplate,
  type ValuationBucket,
} from '../api'
import { currencyLabel, KIND_LABEL, KIND_TONE, MARKET_TONE, native } from '../lib/format'
import {
  CurrencyValue,
  DeltaValue,
  Donut,
  Sparkline,
  VIZ,
  num,
  shortMoney,
  type DonutItem,
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
  const netWorthSeries = trendPts.map((p) => num(p.net_worth) ?? 0)
  const positionSeries = trendPts.map((p) => num(p.position_value) ?? 0)
  const positionTrend = positionSeries.length >= 2 ? positionSeries : staticTrend(v.position_value)
  const netWorthTrend = netWorthSeries.length >= 2 ? netWorthSeries : staticTrend(v.net_worth)
  const trendIsReal = netWorthSeries.length >= 2
  const missingPriceCount = v.warnings.filter((w) => w.kind === 'missing_price').length
  const fxFallbackCount = v.warnings.filter((w) => w.kind === 'fx_fallback').length
  const liabilityValue = num(v.total_liabilities) ?? 0

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

      <div className="fb-grid db-21">
        <Card
          eyebrow="估值状态"
          title="数据完整性"
          actions={
            v.warnings.length ? <Badge tone="warning" dot>{v.warnings.length} 项</Badge> : <Badge tone="success">正常</Badge>
          }
        >
          {v.warnings.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {v.warnings.slice(0, 5).map((w, i) => (
                <div
                  key={`${w.kind}-${w.key}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 0',
                    borderBottom: i < Math.min(v.warnings.length, 5) - 1 ? '1px solid var(--divider)' : 'none',
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--surface-inset)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-tertiary)',
                      flex: 'none',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{w.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              当前持仓都有可用价格，涉及币种都有可用汇率。估值按 {v.as_of} 的账户和持仓记录计算。
            </div>
          )}
        </Card>
        <div className="fb-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="fb-card__eyebrow">估值口径</div>
          <StatusBox icon="landmark" label="现金账户" value={shortMoney(v.cash_value, v.display_currency)} />
          <StatusBox icon="receipt" label="信用卡负债" value={shortMoney(v.total_liabilities, v.display_currency)} warning={liabilityValue > 0} />
          <StatusBox icon="badge-alert" label="无价格持仓" value={`${missingPriceCount} 项`} warning={missingPriceCount > 0} />
          <StatusBox icon="repeat-2" label="汇率降级" value={`${fxFallbackCount} 项`} warning={fxFallbackCount > 0} />
          <Button
            variant="secondary"
            size="sm"
            block
            iconRight={<Icon name="arrow-right" size={14} />}
            onClick={() => navigate('/market')}
          >
            维护价格 / 汇率
          </Button>
        </div>
      </div>

      <div className="fb-grid kpi-4">
        <AllocationCard title="按用途" dim="kind" buckets={v.allocations.kind ?? []} total={v.total_assets} currency={v.display_currency} />
        <AllocationCard title="按账户币种" dim="currency" buckets={v.allocations.currency ?? []} total={v.total_assets} currency={v.display_currency} />
        <AllocationCard title="按真实计价币种" dim="quote_currency" buckets={v.allocations.quote_currency ?? []} total={v.total_assets} currency={v.display_currency} />
        <AllocationCard title="按机构" dim="institution" buckets={v.allocations.institution ?? []} total={v.total_assets} currency={v.display_currency} />
      </div>

      <div className="fb-grid db-12">
        <Card
          eyebrow={trendIsReal ? '净资产趋势 · 近 12 月' : '净资产趋势 · 静态预览'}
          actions={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 2, background: 'var(--accent)' }} />
                净资产
              </span>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 18, alignItems: 'center' }}>
            <Sparkline data={netWorthTrend} width={720} height={130} tone="accent" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>当前净资产</div>
                <CurrencyValue value={v.net_worth} currency={v.display_currency} compact size="22px" />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                {trendIsReal ? '按月度盘点截面插值生成（§6.14）；缺历史价格的持仓不计入当期市值。' : '历史趋势待更多盘点快照生成；当前仅展示当日估值结构。'}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  )
}

function AllocationCard({
  title,
  dim,
  buckets,
  total,
  currency,
}: {
  title: string
  dim: string
  buckets: ValuationBucket[]
  total: string
  currency: string
}) {
  const items = toDonutItems(dim, buckets)
  return (
    <Card eyebrow="资产配置" title={title}>
      {items.length ? (
        <Donut
          items={items}
          centerLabel={shortMoney(total, currency)}
          centerSub={dim === 'quote_currency' ? '暴露' : '总资产'}
          size={116}
          thickness={12}
        />
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>暂无可估值资产。</div>
      )}
    </Card>
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

function StatusBox({
  icon,
  label,
  value,
  warning,
}: {
  icon: string
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div
      style={{
        background: warning ? 'var(--warning-bg)' : 'var(--surface-inset)',
        border: warning ? '1px solid rgba(221,162,62,0.3)' : '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: warning ? 'var(--warning)' : 'var(--text-secondary)' }}>
        <Icon name={icon} size={14} />
        <span className="fb-num" style={{ fontSize: 18, fontWeight: 600, color: warning ? 'var(--warning)' : 'var(--text-strong)' }}>
          {value}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
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
    name: bucketName(dim, b),
    value: Math.abs(num(b.value) ?? 0),
    color: bucketColor(dim, b.key, i),
  }))
}

function bucketName(dim: string, b: ValuationBucket) {
  if (dim === 'kind') return KIND_LABEL[b.key] ?? b.name
  if (dim === 'currency' || dim === 'quote_currency') return currencyLabel(b.key).replace(`${b.key} · `, '')
  if (dim === 'market') return b.key === 'CASH' ? '现金' : b.key
  return b.name
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
