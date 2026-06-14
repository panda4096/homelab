import { useEffect, useRef, useState } from 'react'
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

type Mode = 'query' | 'entry'
type Draft = {
  intent?: string
  account_id?: number
  account_candidates?: number[]
  fields?: Record<string, unknown>
  confidence?: number
  note?: string
}

type Msg = {
  id: number
  role: 'user' | 'assistant'
  text: string
  sql?: string
  result?: QueryResult
  draft?: Draft
  state?: 'idle' | 'written' | 'ignored'
}

const INTENT_LABEL: Record<string, string> = {
  balance_snapshot: '余额快照', position_snapshot: '持仓快照', credit_card_bill: '信用卡账单',
  income_event: '收益事件', transaction: '持仓交易', transfer: '账户转账',
  price: '价格', fx_rate: '汇率', corporate_action: '公司动作', unknown: '未识别',
}
const SUPPORTED_WRITE = new Set(['balance_snapshot', 'position_snapshot', 'credit_card_bill', 'income_event', 'transaction', 'transfer'])
const CHIPS: Record<Mode, string[]> = {
  query: ['今年外汇敞口多少？', '持有 GOOG 的账户和数量', '这三个月信用卡支出最大的两个类目'],
  entry: ['招行 6231 今天 12.3 万', '富途美股 GOOG 买入 10 股 单价 184'],
}

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const idRef = useRef(1)
  const nextId = () => idRef.current++
  const [mode, setMode] = useState<Mode>('query')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: 'assistant', text: '我是 finbrain Copilot。可以帮你查询资产、录入快照 / 交易,用自然语言告诉我就行。下方可切换「查询 / 录入」。' },
  ])
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, busy])

  function push(m: Omit<Msg, 'id'>) {
    setMsgs((prev) => [...prev, { ...m, id: nextId() }])
  }

  async function send(text?: string) {
    const t = (text ?? input).trim()
    if (!t || busy) return
    push({ role: 'user', text: t })
    setInput('')
    setBusy(true)
    try {
      const status = await getLLMStatus()
      if (!status.configured) {
        push({ role: 'assistant', text: '尚未配置 LLM —— 在后端设置 DEEPSEEK_API_KEY 后即可对话。当前你仍可用各录入页手动操作。' })
        return
      }
      if (mode === 'query') {
        const r = await llmQuery(t)
        push({ role: 'assistant', text: '查询结果:', sql: r.sql, result: r.result })
      } else {
        const r = await llmParse(t)
        const draft = (r.draft ?? {}) as Draft
        if (draft.intent && draft.intent !== 'unknown') {
          push({ role: 'assistant', text: '已解析,确认后写入账本:', draft, state: 'idle' })
        } else {
          push({ role: 'assistant', text: '没能识别这条录入,换个说法或到对应录入页手动提交。', draft })
        }
      }
    } catch (e) {
      push({ role: 'assistant', text: e instanceof Error ? e.message : '请求失败' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmWrite(id: number, draft: Draft) {
    if (busy) return
    setBusy(true)
    try {
      await writeDraft(draft)
      void qc.invalidateQueries()
      toast.success('已写入账本')
      setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, state: 'written' } : m)))
      push({ role: 'assistant', text: '已写入账本 ✓ 还要记点别的吗?' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '写入失败,请到对应录入页确认提交')
    } finally {
      setBusy(false)
    }
  }

  function ignore(id: number) {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, state: 'ignored' } : m)))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 14px 9px' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--gradient-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="sparkles" size={12} color="var(--accent-text)" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>Copilot</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '0 4px' }}>beta</span>
        <button onClick={onClose} aria-label="返回导航" title="返回导航 (⌘K)" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 }}>
          <Icon name="panel-left-close" size={16} />
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '90%', background: 'var(--accent-bg)', border: '1px solid rgba(201,168,106,0.28)', borderRadius: '10px 10px 3px 10px', padding: '8px 11px', fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {m.text}
            </div>
          ) : (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '98%', width: m.result || m.draft ? '98%' : 'auto' }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{m.text}</div>
              {m.sql ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)', background: 'var(--surface-inset)', borderRadius: 'var(--radius-sm)', padding: 8, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.sql}</div>
              ) : null}
              {m.result ? <ResultTable result={m.result} /> : null}
              {m.draft ? <DraftCard msg={m} onConfirm={() => confirmWrite(m.id, m.draft as Draft)} onIgnore={() => ignore(m.id)} busy={busy} /> : null}
            </div>
          ),
        )}
        {busy ? <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-tertiary)' }}>思考中…</div> : null}
      </div>

      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <Segmented size="sm" value={mode} onChange={(v) => setMode(v as Mode)} options={[{ value: 'query', label: '查询' }, { value: 'entry', label: '录入' }]} />
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{mode === 'query' ? '只读问数据' : '解析后确认写入'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
          {CHIPS[mode].map((c, i) => (
            <button key={i} onClick={() => send(c)} className="fb-tag fb-tag--clickable" style={{ fontSize: 10.5, cursor: 'pointer' }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '7px 8px 7px 11px' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            rows={1}
            placeholder={mode === 'query' ? '问点什么…（Enter 发送）' : '记点什么…（Enter 发送）'}
            style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-strong)', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.5, maxHeight: 90, padding: '3px 0' }}
          />
          <button onClick={() => void send()} aria-label="发送" disabled={busy} style={{ flex: 'none', width: 28, height: 28, borderRadius: 7, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, background: 'var(--gradient-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrow-up" size={15} color="var(--accent-text)" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 7, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr>{result.columns.map((c) => <th key={c} style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text-tertiary)', fontWeight: 400, borderBottom: '1px solid var(--divider)' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
              {row.map((cell, j) => <td key={j} style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{cell == null ? '—' : String(cell)}</td>)}
            </tr>
          ))}
          {!result.rows.length ? <tr><td style={{ padding: '6px 8px', color: 'var(--text-tertiary)' }}>无结果</td></tr> : null}
        </tbody>
      </table>
      {result.truncated ? <div style={{ fontSize: 10.5, color: 'var(--warning)', padding: '4px 8px' }}>结果已截断</div> : null}
    </div>
  )
}

function DraftCard({ msg, onConfirm, onIgnore, busy }: { msg: Msg; onConfirm: () => void; onIgnore: () => void; busy: boolean }) {
  const draft = msg.draft as Draft
  const canWrite = !!(draft.intent && SUPPORTED_WRITE.has(draft.intent))
  const fields = { ...(draft.account_id ? { account_id: draft.account_id } : {}), ...(draft.fields ?? {}) }
  return (
    <div style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge tone="gold">{INTENT_LABEL[draft.intent ?? 'unknown'] ?? draft.intent}</Badge>
        {draft.confidence != null ? <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{draft.confidence}</span> : null}
      </div>
      {Object.entries(fields).map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', fontSize: 12 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
          <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}
      {!canWrite ? <div style={{ fontSize: 11, color: 'var(--warning)' }}>该意图暂不支持一键写入,请到对应录入页确认提交。</div> : null}
      {msg.state === 'written' ? (
        <div style={{ fontSize: 11.5, color: 'var(--gain)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={12} /> 已写入</div>
      ) : msg.state === 'ignored' ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>已忽略</div>
      ) : canWrite ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
          <Button variant="primary" size="xs" disabled={busy} iconLeft={<Icon name="check" size={12} />} onClick={onConfirm}>确认写入</Button>
          <Button variant="ghost" size="xs" onClick={onIgnore}>忽略</Button>
        </div>
      ) : null}
    </div>
  )
}

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
