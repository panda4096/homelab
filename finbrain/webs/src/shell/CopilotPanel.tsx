import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Icon } from '../ds'
import { applySkill, getLLMStatus, planAgent } from '../api'
import { useToast } from './Toast'

// Copilot is a skill-runner chat: natural language → the backend maps it to ONE
// registered skill + params (function-calling; never SQL), runs read/draft skills,
// and confirms writes via /agent/apply. Every call is audited server-side.

type Msg = {
  id: number
  role: 'user' | 'assistant'
  text: string
  skill?: string
  params?: Record<string, unknown>
  result?: unknown
  requiresConfirm?: boolean
  state?: 'idle' | 'written' | 'ignored'
}

const CHIPS = ['本月净资产快照', '持有 GOOG 的账户和数量', '今年外汇敞口', '人民币活期 今天 12.3 万']

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const idRef = useRef(1)
  const nextId = () => idRef.current++
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: 'assistant', text: '我是 finbrain Copilot。用自然语言问数据或记一笔,我会调用后端注册的 skill 来完成 —— 不直接碰数据库,写操作都要你确认。' },
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
        push({ role: 'assistant', text: '尚未配置 LLM(后端设置 DEEPSEEK_API_KEY 后即可对话)。你仍可在各页面手动操作,或在「技能」页直接调用 skill。' })
        return
      }
      const plan = await planAgent(t)
      if (plan.type === 'chat' || !plan.plan) {
        push({ role: 'assistant', text: plan.reply ?? '我没太理解,换个说法?可以问净资产、持仓、对账,或记一笔。' })
        return
      }
      push({
        role: 'assistant',
        text: plan.requires_confirmation ? '已理解为一次录入,确认后写入账本:' : '已通过 skill 取数:',
        skill: plan.plan.skill,
        params: plan.plan.params,
        result: plan.result,
        requiresConfirm: plan.requires_confirmation,
        state: plan.requires_confirmation ? 'idle' : undefined,
      })
    } catch (e) {
      push({ role: 'assistant', text: e instanceof Error ? e.message : '请求失败' })
    } finally {
      setBusy(false)
    }
  }

  async function confirm(m: Msg) {
    if (busy || !m.skill || !m.params) return
    const applyName = m.skill.replace('draft', 'apply')
    setBusy(true)
    try {
      const r = await applySkill(applyName, m.params)
      void qc.invalidateQueries()
      toast.success('已写入账本')
      setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, state: 'written' } : x)))
      push({ role: 'assistant', text: '已写入账本 ✓ ' + (r.affected_entities?.join(', ') ?? '') })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '写入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 14px 9px' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--gradient-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="sparkles" size={12} color="var(--accent-text)" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>Copilot</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '0 4px' }}>skills</span>
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
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '98%', width: m.result !== undefined ? '98%' : 'auto' }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{m.text}</div>
              {m.skill ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0', flexWrap: 'wrap' }}>
                  <span className="fb-badge fb-badge--neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                    <Icon name="wrench" size={11} /> {m.skill}
                  </span>
                  {m.params && Object.keys(m.params).length ? (
                    <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{JSON.stringify(m.params)}</span>
                  ) : null}
                </div>
              ) : null}
              {m.result !== undefined ? <ResultView result={m.result} /> : null}
              {m.requiresConfirm ? (
                m.state === 'written' ? (
                  <div style={{ fontSize: 11.5, color: 'var(--gain)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}><Icon name="check" size={12} /> 已写入</div>
                ) : m.state === 'ignored' ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>已忽略</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button variant="primary" size="xs" disabled={busy} iconLeft={<Icon name="check" size={12} />} onClick={() => confirm(m)}>确认写入</Button>
                    <Button variant="ghost" size="xs" onClick={() => setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, state: 'ignored' } : x)))}>忽略</Button>
                  </div>
                )
              ) : null}
            </div>
          ),
        )}
        {busy ? <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-tertiary)' }}>思考中…</div> : null}
      </div>

      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
          {CHIPS.map((c, i) => (
            <button key={i} onClick={() => send(c)} className="fb-tag fb-tag--clickable" style={{ fontSize: 10.5, cursor: 'pointer' }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '7px 8px 7px 11px' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            rows={1}
            placeholder="问数据 / 记一笔…（Enter 发送）"
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

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

function ResultView({ result }: { result: unknown }) {
  // draft preview: { entity, account, fields }
  if (result && typeof result === 'object' && !Array.isArray(result) && 'entity' in (result as object) && 'fields' in (result as object)) {
    const r = result as { entity?: string; account?: Record<string, unknown>; fields?: Record<string, unknown> }
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Badge tone="gold">{String(r.entity)}</Badge>
          {r.account ? <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{String((r.account as any).institution ?? '')} · {String((r.account as any).name ?? '')}</span> : null}
        </div>
        <KV obj={r.fields ?? {}} />
      </div>
    )
  }
  if (Array.isArray(result)) {
    if (!result.length) return <div style={hint}>无结果</div>
    if (isScalar(result[0])) return <div style={card}>{result.slice(0, 30).map((v, i) => <div key={i} style={{ fontSize: 12 }}>{String(v)}</div>)}</div>
    const rows = result as Record<string, unknown>[]
    const cols = Object.keys(rows[0]).filter((k) => isScalar(rows[0][k])).slice(0, 6)
    return (
      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-tertiary)', fontWeight: 400, borderBottom: '1px solid var(--divider)' }}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 12).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                {cols.map((c) => <td key={c} style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{row[c] == null ? '—' : String(row[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 12 ? <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '4px 6px' }}>共 {rows.length} 项,显示前 12</div> : null}
      </div>
    )
  }
  if (result && typeof result === 'object') return <div style={card}><KV obj={result as Record<string, unknown>} /></div>
  return <div style={hint}>{String(result)}</div>
}

function KV({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj)
  return (
    <>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: 12, padding: '1px 0' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
          <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
            {isScalar(v) ? String(v) : Array.isArray(v) ? `[${v.length} 项]` : v == null ? '—' : '{…}'}
          </span>
        </div>
      ))}
    </>
  )
}

const card: React.CSSProperties = { background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10, marginTop: 6 }
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }
