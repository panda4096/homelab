import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Field, Icon, IconButton, Input, Segmented } from '../ds'
import {
  createAllocationTarget,
  deleteAllocationTarget,
  getAllocationTargetDrift,
  listAllocationTargets,
  updateAllocationTarget,
  type AllocationTargetSet,
} from '../api'
import { native } from '../lib/format'
import { usePrefStore } from '../store'
import { useToast } from '../shell/Toast'

const DIMENSIONS = [
  { value: 'kind', label: '账户用途' },
  { value: 'asset_kind', label: '资产类型' },
  { value: 'currency', label: '账户币种' },
  { value: 'quote_currency', label: '真实计价币种' },
  { value: 'market', label: '市场' },
  { value: 'institution', label: '机构' },
]

type DraftItem = { dimension_value: string; target_pct: string }

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1180, margin: '0 auto' }}>{children}</div>
}

export function Targets() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const qc = useQueryClient()
  const sets = useQuery({ queryKey: ['allocation-targets'], queryFn: listAllocationTargets })
  const [selId, setSelId] = useState<number | 'new' | null>(null)

  useEffect(() => {
    if (selId === null && sets.data && sets.data.length) setSelId(sets.data[0].id)
  }, [sets.data, selId])

  const current = selId !== null && selId !== 'new' ? sets.data?.find((s) => s.id === selId) : undefined

  return (
    <Page>
      <div className="fb-grid" style={{ gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(sets.data ?? []).map((s) => {
            const active = s.id === selId
            return (
              <button key={s.id} onClick={() => setSelId(s.id)} style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                background: active ? 'var(--accent-bg)' : 'var(--surface-card)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-default)') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: active ? 'var(--accent-bright)' : 'var(--text-strong)' }}>{s.name}</span>
                  {s.is_dashboard_visible ? <Badge tone="gold">仪表盘</Badge> : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {DIMENSIONS.find((d) => d.value === s.dimension)?.label ?? s.dimension} · 阈值 ±{s.drift_threshold_pct}%
                </div>
              </button>
            )
          })}
          <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={14} />} onClick={() => setSelId('new')}>新建配置</Button>
        </div>

        {selId === 'new' ? (
          <TargetEditor key="new" displayCurrency={displayCurrency} fxMode={fxMode}
            onSaved={(s) => { void qc.invalidateQueries({ queryKey: ['allocation-targets'] }); setSelId(s.id) }} />
        ) : current ? (
          <TargetEditor key={current.id} set={current} displayCurrency={displayCurrency} fxMode={fxMode}
            onSaved={() => qc.invalidateQueries({ queryKey: ['allocation-targets'] })}
            onDeleted={() => { void qc.invalidateQueries({ queryKey: ['allocation-targets'] }); setSelId(null) }} />
        ) : (
          <div className="fb-card" style={{ padding: 24, color: 'var(--text-tertiary)' }}>选择或新建一套配置。</div>
        )}
      </div>
      {!sets.isLoading && !(sets.data ?? []).length && selId !== 'new' ? null : null}
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <Icon name="info" size={13} /> 漂移 = 实际占比 − 目标占比;再平衡建议 = 漂移% × 净资产(§6.10)。展示币种 {displayCurrency}。
      </div>
    </Page>
  )
}

function TargetEditor({ set, displayCurrency, fxMode, onSaved, onDeleted }: {
  set?: AllocationTargetSet
  displayCurrency: string
  fxMode: string
  onSaved: (s: AllocationTargetSet) => void
  onDeleted?: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(set?.name ?? '')
  const [dimension, setDimension] = useState(set?.dimension ?? 'kind')
  const [threshold, setThreshold] = useState(set?.drift_threshold_pct ?? '5')
  const [visible, setVisible] = useState(set?.is_dashboard_visible ?? true)
  const [items, setItems] = useState<DraftItem[]>(set?.items.map((i) => ({ dimension_value: i.dimension_value, target_pct: i.target_pct })) ?? [{ dimension_value: '', target_pct: '' }])

  const drift = useQuery({
    queryKey: ['target-drift', set?.id, displayCurrency, fxMode],
    queryFn: () => getAllocationTargetDrift(set!.id, { display_currency: displayCurrency, fx_mode: fxMode as 'current' | 'historical' }),
    enabled: !!set?.id,
  })

  const sum = items.reduce((a, i) => a + (Number(i.target_pct) || 0), 0)
  const sumOk = Math.abs(sum - 100) < 0.01

  const save = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), dimension, drift_threshold_pct: threshold.trim() || '5', is_dashboard_visible: visible, items: items.filter((i) => i.dimension_value.trim()) }
      return set?.id ? updateAllocationTarget(set.id, input) : createAllocationTarget(input)
    },
    onSuccess: (s) => { toast.success(set?.id ? '已保存' : '已创建'); onSaved(s) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })
  const remove = useMutation({
    mutationFn: () => deleteAllocationTarget(set!.id),
    onSuccess: () => { toast.success('已删除'); onDeleted?.() },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const driftByValue = new Map((drift.data?.items ?? []).map((i) => [i.dimension_value, i]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="fb-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="fb-form form-4">
          <Field label="名称"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="按用途分布目标" /></Field>
          <Field label="维度"><Segmented size="sm" value={dimension} onChange={setDimension} options={DIMENSIONS} /></Field>
          <Field label="漂移阈值"><Input numeric suffix="%" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></Field>
          <Field label="仪表盘可见">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 'var(--control-md)', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> 显示
            </label>
          </Field>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr 1.2fr 32px', gap: 10, padding: '0 4px', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span>维度值</span><span style={{ textAlign: 'right' }}>目标%</span><span style={{ textAlign: 'right' }}>实际%</span><span style={{ textAlign: 'right' }}>漂移</span><span style={{ textAlign: 'right' }}>再平衡</span><span></span>
          </div>
          {items.map((it, idx) => {
            const d = driftByValue.get(it.dimension_value)
            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr 1.2fr 32px', gap: 10, alignItems: 'center' }}>
                <Input size="sm" value={it.dimension_value} onChange={(e) => setItems((a) => a.map((x, i) => i === idx ? { ...x, dimension_value: e.target.value } : x))} placeholder="cash / USD / US …" />
                <Input size="sm" numeric value={it.target_pct} onChange={(e) => setItems((a) => a.map((x, i) => i === idx ? { ...x, target_pct: e.target.value } : x))} />
                <span className="fb-num" style={{ textAlign: 'right', fontSize: 12.5 }}>{d?.actual_pct ?? '—'}{d ? '%' : ''}</span>
                <span className="fb-num" style={{ textAlign: 'right', fontSize: 12.5, color: d?.over_threshold ? 'var(--warning)' : 'var(--text-tertiary)' }}>{d?.drift != null ? `${Number(d.drift) > 0 ? '+' : ''}${d.drift}%` : '—'}</span>
                <span className="fb-num" style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--text-secondary)' }}>{d?.rebalance != null ? `${Number(d.rebalance) > 0 ? '减 ' : '增 '}${native(String(Math.abs(Number(d.rebalance))), displayCurrency)}` : '—'}</span>
                <IconButton aria-label="删除" size="sm" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}><Icon name="x" size={13} /></IconButton>
              </div>
            )
          })}
          <Button variant="ghost" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={() => setItems((a) => [...a, { dimension_value: '', target_pct: '' }])}>添加目标项</Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>目标总和</span>
          <span className="fb-num" style={{ fontSize: 15, fontWeight: 600, color: sumOk ? 'var(--gain)' : 'var(--warning)' }}>{sum.toFixed(1)}%</span>
          {sumOk ? <Icon name="check" size={15} color="var(--gain)" /> : <span style={{ fontSize: 11.5, color: 'var(--warning)' }}>需等于 100%</span>}
          {set?.id && onDeleted ? <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => { if (confirm('删除该配置？')) remove.mutate() }}>删除</Button> : <span style={{ marginLeft: 'auto' }} />}
          <Button variant="primary" size="sm" disabled={!sumOk || !name.trim() || save.isPending} onClick={() => save.mutate()}>保存目标</Button>
        </div>
      </div>
    </div>
  )
}
