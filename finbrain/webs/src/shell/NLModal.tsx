import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Icon, Segmented } from '../ds'
import {
  createIncomeEvent,
  createTransaction,
  createTransfer,
  getLLMStatus,
  llmParse,
  llmQuery,
  upsertBalanceSnapshot,
  upsertCreditCardBill,
  upsertPositionSnapshot,
  type QueryResult,
} from '../api'
import { useToast } from './Toast'

export interface NLModalProps {
  onClose: () => void
}

type Mode = 'query' | 'entry'
type Draft = { intent?: string; account_id?: number; account_candidates?: number[]; fields?: Record<string, unknown>; confidence?: number; note?: string }

const INTENT_LABEL: Record<string, string> = {
  balance_snapshot: '余额快照', position_snapshot: '持仓快照', credit_card_bill: '信用卡账单',
  income_event: '收益事件', transaction: '持仓交易', transfer: '账户转账',
  price: '价格', fx_rate: '汇率', corporate_action: '公司动作', unknown: '未识别',
}

export function NLModal({ onClose }: NLModalProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('query')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [sql, setSql] = useState<string | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    if (!q.trim() || busy) return
    setBusy(true); setErr(null); setSql(null); setResult(null); setDraft(null)
    try {
      const status = await getLLMStatus()
      if (!status.configured) { setErr('未配置 LLM(设置 DEEPSEEK_API_KEY 后可用)'); return }
      if (mode === 'query') {
        const r = await llmQuery(q.trim())
        setSql(r.sql); setResult(r.result)
      } else {
        const r = await llmParse(q.trim())
        setDraft((r.draft ?? {}) as Draft)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '请求失败')
    } finally {
      setBusy(false)
    }
  }

  async function confirmWrite() {
    if (!draft) return
    setBusy(true)
    try {
      await writeDraft(draft)
      toast.success('已写入')
      void qc.invalidateQueries()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '写入失败,请到对应录入页手动提交')
    } finally {
      setBusy(false)
    }
  }

  const canWrite = !!(draft && draft.intent && SUPPORTED_WRITE.has(draft.intent))

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="fb-card" style={{ width: 640, maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <Icon name="sparkles" size={18} color="var(--accent)" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run() }}
            placeholder={mode === 'query' ? '问点什么…（自然语言查询）' : '记点什么…（自然语言录入）'}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-strong)', fontFamily: 'var(--font-sans)', fontSize: 15 }} />
          <Segmented size="sm" value={mode} onChange={(v) => { setMode(v as Mode); setSql(null); setResult(null); setDraft(null); setErr(null) }}
            options={[{ value: 'query', label: '查询' }, { value: 'entry', label: '录入' }]} />
        </div>

        <div style={{ padding: 16, maxHeight: '60vh', overflowY: 'auto' }}>
          {err ? <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 10 }}>{err}</div> : null}
          {busy ? <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>处理中…</div> : null}

          {sql ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)', background: 'var(--surface-inset)', borderRadius: 'var(--radius-md)', padding: 10, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{sql}</div>
          ) : null}
          {result ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr>{result.columns.map((c) => <th key={c} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-tertiary)', fontWeight: 400, borderBottom: '1px solid var(--divider)' }}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                      {row.map((cell, j) => <td key={j} style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{cell == null ? '—' : String(cell)}</td>)}
                    </tr>
                  ))}
                  {!result.rows.length ? <tr><td style={{ padding: '8px 10px', color: 'var(--text-tertiary)' }}>无结果</td></tr> : null}
                </tbody>
              </table>
              {result.truncated ? <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6 }}>结果已截断</div> : null}
            </div>
          ) : null}

          {draft ? (
            <div style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone="gold">{INTENT_LABEL[draft.intent ?? 'unknown'] ?? draft.intent}</Badge>
                {draft.confidence != null ? <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>置信度 {draft.confidence}</span> : null}
              </div>
              {Object.entries({ ...(draft.account_id ? { account_id: draft.account_id } : {}), ...(draft.fields ?? {}) }).map(([k, v]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
              {draft.note ? <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{draft.note}</div> : null}
              {!canWrite ? <div style={{ fontSize: 11.5, color: 'var(--warning)' }}>该意图暂不支持一键写入,请到对应录入页确认提交。</div> : null}
            </div>
          ) : null}

          {!busy && !sql && !draft && !err ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
              {mode === 'query'
                ? '例:「这三个月信用卡支出最大的两个类目」「持有 GOOG 的账户和数量」。生成只读 SQL 并展示结果。'
                : '例:「招行 6231 今天 12.3 万」「富途美股 GOOG 买入 10 股 单价 184」。解析为结构化草稿,确认后写入。'}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--divider)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          {mode === 'entry' && draft && canWrite ? (
            <Button variant="primary" size="sm" disabled={busy} iconLeft={<Icon name="check" size={14} />} onClick={confirmWrite}>确认写入</Button>
          ) : (
            <Button variant="primary" size="sm" disabled={busy || !q.trim()} iconLeft={<Icon name="corner-down-left" size={14} />} onClick={run}>{mode === 'query' ? '查询' : '解析'}</Button>
          )}
        </div>
      </div>
    </div>
  )
}

const SUPPORTED_WRITE = new Set(['balance_snapshot', 'position_snapshot', 'credit_card_bill', 'income_event', 'transaction', 'transfer'])

async function writeDraft(d: Draft): Promise<void> {
  const f = (d.fields ?? {}) as Record<string, any>
  const acct = d.account_id ?? f.account_id
  const str = (v: unknown) => (v == null ? undefined : String(v))
  switch (d.intent) {
    case 'balance_snapshot':
      await upsertBalanceSnapshot({ account_id: Number(acct), snapshot_date: f.snapshot_date, balance: String(f.balance), note: f.note })
      return
    case 'position_snapshot':
      await upsertPositionSnapshot({ account_id: Number(acct), symbol: String(f.symbol), quantity: String(f.quantity), avg_cost: str(f.avg_cost), cost_currency: str(f.cost_currency), snapshot_date: f.snapshot_date })
      return
    case 'credit_card_bill':
      await upsertCreditCardBill({ account_id: Number(acct), statement_date: f.statement_date, amount_total: String(f.amount_total), currency: str(f.currency), paid_at: f.paid_at ?? null })
      return
    case 'income_event':
      await createIncomeEvent({ event_kind: f.event_kind, event_date: f.event_date, account_id: Number(acct), symbol: str(f.symbol) ?? null, amount: String(f.amount), currency: String(f.currency) })
      return
    case 'transaction':
      await createTransaction({ account_id: Number(acct), symbol: String(f.symbol), action: f.action, trade_date: f.trade_date, quantity: String(f.quantity), price: String(f.price), currency: String(f.currency), fee: str(f.fee) ?? null, is_settled: !!f.is_settled })
      return
    case 'transfer':
      await createTransfer({ from_account_id: Number(f.from_account_id), to_account_id: Number(f.to_account_id), from_amount: String(f.from_amount), to_amount: String(f.to_amount ?? f.from_amount), transfer_date: f.transfer_date })
      return
    default:
      throw new Error('unsupported intent')
  }
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(4,6,9,0.62)', backdropFilter: 'var(--blur-overlay)',
  zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
}
