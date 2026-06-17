import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DateField, Field, Icon, IconButton, Segmented } from '../ds'
import { deleteSummary, generateSummary, listSummaries, type Summary } from '../api'
import { usePrefStore } from '../store'
import { useToast } from '../shell/Toast'

const KIND_LABEL: Record<string, string> = { month: '月度', quarter: '季度', year: '年度' }

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1080, margin: '0 auto' }}>{children}</div>
}

function defaultRange(kind: string): [string, string] {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const start = new Date(now)
  if (kind === 'year') start.setFullYear(now.getFullYear() - 1)
  else if (kind === 'quarter') start.setMonth(now.getMonth() - 3)
  else start.setMonth(now.getMonth() - 1)
  return [start.toISOString().slice(0, 10), end]
}

export function Summaries() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['summaries'], queryFn: listSummaries })
  const [kind, setKind] = useState<'month' | 'quarter' | 'year'>('month')
  const [range, setRange] = useState(defaultRange('month'))
  const [selected, setSelected] = useState<Summary | null>(null)

  const gen = useMutation({
    mutationFn: () => generateSummary({ period_kind: kind, period_start: range[0], period_end: range[1], display_currency: displayCurrency, fx_mode: fxMode }),
    onSuccess: (s) => { void qc.invalidateQueries({ queryKey: ['summaries'] }); setSelected(s); toast.success('已生成总结') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '生成失败'),
  })
  const remove = useMutation({
    mutationFn: deleteSummary,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['summaries'] }); setSelected(null); toast.success('已删除') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  function pickKind(k: string) {
    const kk = k as 'month' | 'quarter' | 'year'
    setKind(kk); setRange(defaultRange(kk))
  }

  return (
    <Page>
      <div className="fb-card" style={{ padding: 16, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <Field label="周期"><Segmented size="sm" value={kind} onChange={pickKind} options={[{ value: 'month', label: '月度' }, { value: 'quarter', label: '季度' }, { value: 'year', label: '年度' }]} /></Field>
        <Field label="期初"><DateField value={range[0]} onChange={(v) => setRange([v, range[1]])} /></Field>
        <Field label="期末"><DateField value={range[1]} onChange={(v) => setRange([range[0], v])} /></Field>
        <Button variant="primary" size="sm" disabled={gen.isPending} iconLeft={<Icon name="sparkles" size={14} />} onClick={() => gen.mutate()}>{gen.isPending ? '生成中…' : '生成阶段总结'}</Button>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>需配置 LLM(DeepSeek)· {displayCurrency}</span>
      </div>

      <div className="fb-grid" style={{ gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(list.data ?? []).map((s) => {
            const active = selected?.id === s.id
            return (
              <button key={s.id} onClick={() => setSelected(s)} style={{
                textAlign: 'left', padding: '11px 14px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                background: active ? 'var(--accent-bg)' : 'var(--surface-card)', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-default)') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge tone="neutral">{KIND_LABEL[s.period_kind] ?? s.period_kind}</Badge>
                  <span style={{ fontSize: 12.5, color: active ? 'var(--accent-bright)' : 'var(--text-strong)' }}>{s.period_start} → {s.period_end}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.created_at.slice(0, 10)} · {s.display_currency}</div>
              </button>
            )
          })}
          {!list.isLoading && !(list.data ?? []).length ? <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: 8 }}>暂无总结,选择周期后点「生成」。</div> : null}
        </div>

        <div className="fb-card" style={{ padding: 20, minHeight: 240 }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Badge tone="gold">{KIND_LABEL[selected.period_kind] ?? selected.period_kind}阶段总结</Badge>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{selected.period_start} → {selected.period_end}</span>
                <IconButton aria-label="删除" size="sm" style={{ marginLeft: 'auto' }} onClick={() => { if (confirm('删除这条总结？')) remove.mutate(selected.id) }}><Icon name="trash-2" size={14} /></IconButton>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.8, color: 'var(--text-primary)' }}>{selected.content}</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>选择左侧一条总结查看正文,或生成一条新的。</div>
          )}
        </div>
      </div>
    </Page>
  )
}
