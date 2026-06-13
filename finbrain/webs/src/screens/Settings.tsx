import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Icon, Segmented } from '../ds'
import { usePrefStore } from '../store'
import { getLLMStatus } from '../api'
import type {
  DisplayCurrency,
  FxMode,
  MarketConvention,
  TimeAggregation,
} from '../api'

interface RowProps {
  label: string
  hint?: string
  children: React.ReactNode
}

function Row({ label, hint, children }: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid var(--divider)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{label}</div>
        {hint ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{hint}</div>
        ) : null}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  )
}

// Minimal real Settings screen. Every control persists the changed field via
// PUT /api/preferences (the store handles the request + merge).
export function Settings() {
  const {
    displayCurrency,
    fxMode,
    marketConvention,
    timeAggregationDefault,
    setDisplayCurrency,
    setFxMode,
    setMarketConvention,
    setTimeAggregationDefault,
  } = usePrefStore()
  const llm = useQuery({ queryKey: ['llm-status'], queryFn: getLLMStatus })

  return (
    <div style={{ padding: 22, maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card eyebrow="PREFERENCES" title="显示偏好" subtitle="更改后立即写入后端 · 单用户全局生效">
        <Row label="显示货币" hint="所有金额折算到该货币展示">
          <Segmented
            size="sm"
            options={['CNY', 'HKD', 'USD']}
            value={displayCurrency}
            onChange={(v) => void setDisplayCurrency(v as DisplayCurrency)}
          />
        </Row>
        <Row label="汇率口径" hint="历史记录使用当时汇率，或统一用当前汇率重估">
          <Segmented
            size="sm"
            options={[
              { value: 'current', label: '当前汇率' },
              { value: 'historical', label: '历史汇率' },
            ]}
            value={fxMode}
            onChange={(v) => void setFxMode(v as FxMode)}
          />
        </Row>
        <Row label="涨跌约定" hint="绿涨红跌（西方）或红涨绿跌（A 股习惯）">
          <Segmented
            size="sm"
            options={[
              { value: 'western', label: '绿涨红跌' },
              { value: 'cn', label: '红涨绿跌' },
            ]}
            value={marketConvention}
            onChange={(v) => void setMarketConvention(v as MarketConvention)}
          />
        </Row>
        <Row label="默认时间聚合" hint="趋势 / 对比等视图的默认时间粒度">
          <Segmented
            size="sm"
            options={[
              { value: 'day', label: '日' },
              { value: 'month', label: '月' },
              { value: 'quarter', label: '季' },
              { value: 'year', label: '年' },
            ]}
            value={timeAggregationDefault}
            onChange={(v) => void setTimeAggregationDefault(v as TimeAggregation)}
          />
        </Row>
      </Card>

      <Card eyebrow="DATA & AI" title="数据与智能">
        <Row label="自然语言能力" hint="⌘K 录入 / 查询 / 阶段总结，默认 DeepSeek（DEEPSEEK_API_KEY）">
          {llm.data?.configured
            ? <Badge tone="success" dot>{llm.data.provider} · {llm.data.model}</Badge>
            : <Badge tone="neutral">未配置</Badge>}
        </Row>
        <Row label="全量数据导出" hint="所有业务表打包为 CSV（zip）">
          <Button size="sm" variant="secondary" iconLeft={<Icon name="download" size={14} />} onClick={() => { window.location.href = '/api/export' }}>导出 CSV</Button>
        </Row>
        <Row label="关于 finbrain" hint="个人资产快照管理 · 自托管">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>P0–P7</span>
        </Row>
      </Card>
    </div>
  )
}
