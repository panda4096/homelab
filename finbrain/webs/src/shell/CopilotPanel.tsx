import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge, Button, Icon, Select } from '../ds'
import { activateLLMProvider, applySkill, getLLMStatus, listFxRates, listLLMModels, listLLMProviders, streamAgent, type AgentChatMessage, type AgentStep, type AgentUsage, type DisplayCurrency, type LLMProvider, type LLMStatus } from '../api'
import { usePrefStore } from '../store'
import { useToast } from './Toast'

// Copilot is a bounded skill-agent chat: natural language → model picks registered
// skills, backend executes them, model summarizes observations. It never authors
// SQL, and write operations still require explicit confirmation.

type Msg = {
  id: number
  role: 'user' | 'assistant' | 'notice'
  text: string
  skill?: string
  params?: Record<string, unknown>
  result?: unknown
  steps?: AgentStep[]
  durationMs?: number
  requiresConfirm?: boolean
  state?: 'idle' | 'written' | 'ignored'
}

// any model id the active provider serves ('' = the provider's configured default)
type AgentModel = string
type AgentRunSettings = { model: AgentModel; thinking: boolean }

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const idRef = useRef(1)
  const lastSentSettingsRef = useRef<AgentRunSettings | null>(null)
  const settingsTouchedRef = useRef(false)
  const nextId = () => idRef.current++
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [llm, setLLM] = useState<{ state: 'checking' | 'ready' | 'disabled'; status?: LLMStatus; reason?: string }>({ state: 'checking' })
  const [agentModel, setAgentModel] = useState<AgentModel>('')
  const [models, setModels] = useState<string[]>([])
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<AgentStep | null>(null)
  const [streamingAnswer, setStreamingAnswer] = useState('')
  const [sessionUsage, setSessionUsage] = useState<AgentUsage | null>(null)
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const [costRate, setCostRate] = useState(1) // USD → displayCurrency
  const [costCcy, setCostCcy] = useState<DisplayCurrency>('USD')
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: 'assistant', text: '我是 finbrain Copilot。你可以直接问资产、持仓、对账，也可以用一句话记账；涉及写入时我会先整理草稿，等你确认后才入账。' },
  ])
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    getLLMStatus(true)
      .then(async (status) => {
        if (!alive) return
        if (status.configured && status.available !== false) {
          setLLM({ state: 'ready', status })
          if (status.model) setAgentModel(status.model)
          // load the user's providers (for the provider switcher) + the active one's model list.
          try {
            const list = await listLLMProviders()
            if (!alive) return
            setProviders(list.items)
            setActiveId(list.items.find((p) => p.is_active)?.id ?? null)
          } catch { /* best-effort */ }
          try {
            const r = await listLLMModels({})
            if (!alive) return
            setModels(r.models)
            setAgentModel((prev) => (prev && r.models.includes(prev) ? prev : r.models[0] ?? prev))
          } catch { /* best-effort */ }
        } else {
          const reason = status.error || (status.configured ? '模型不可用' : '未配置 LLM API Key')
          setLLM({ state: 'disabled', status, reason })
          push({ role: 'assistant', text: `Copilot 未启用：${reason}。恢复后重新打开 Copilot 使用。` })
        }
      })
      .catch(() => {
        if (!alive) return
        setLLM({ state: 'disabled', reason: '无法读取 LLM 状态' })
        push({ role: 'assistant', text: 'Copilot 未启用：无法读取模型状态，请先确认后端服务可用。' })
      })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, busy, currentPhase, streamingAnswer])
  // Token cost is estimated in USD; convert it to the top-bar display currency (latest USD→ccy rate).
  useEffect(() => {
    if (displayCurrency === 'USD') { setCostRate(1); setCostCcy('USD'); return }
    let alive = true
    listFxRates({ base: 'USD', quote: displayCurrency, sort: 'date_desc' })
      .then((res) => {
        if (!alive) return
        const r = Number(res.items[0]?.rate)
        if (Number.isFinite(r) && r > 0) { setCostRate(r); setCostCcy(displayCurrency) }
        else { setCostRate(1); setCostCcy('USD') } // no rate on file → fall back to USD
      })
      .catch(() => { if (alive) { setCostRate(1); setCostCcy('USD') } })
    return () => { alive = false }
  }, [displayCurrency])

  function push(m: Omit<Msg, 'id'>) {
    setMsgs((prev) => [...prev, { ...m, id: nextId() }])
  }

  async function send(text?: string) {
    const t = (text ?? input).trim()
    if (!t || busy || llm.state !== 'ready') return
    setInput('') // clear immediately on send, before any further work
    const runSettings = { model: agentModel, thinking }
    if (shouldShowSettingsNotice(runSettings, lastSentSettingsRef.current, settingsTouchedRef.current)) {
      push({ role: 'notice', text: settingsNotice(runSettings) })
    }
    lastSentSettingsRef.current = runSettings
    settingsTouchedRef.current = false
    const history = buildAgentHistory(msgs)
    const startedAt = performance.now()
    push({ role: 'user', text: t })
    setBusy(true)
    setStreamingAnswer('')
    setCurrentPhase({ key: 'understand', label: '理解问题', status: 'pending', detail: '正在读取你的问题' })
    try {
      const plan = await streamAgent(t, { model: agentModel, thinking, history }, {
        onPhase: setCurrentPhase,
        onAnswerDelta: (text) => setStreamingAnswer((prev) => prev + text),
      })
      const durationMs = performance.now() - startedAt
      if (plan.usage) {
        const usage = plan.usage
        setSessionUsage((prev) => addUsage(prev, usage))
      }
      if (plan.type === 'chat' || !plan.plan) {
        push({ role: 'assistant', text: cleanReply(plan.reply) ?? '我没太理解，换个说法？可以问净资产、持仓、对账，或记一笔。', steps: plan.steps, durationMs })
        return
      }
      push({
        role: 'assistant',
        text: cleanReply(plan.reply) ?? (plan.requires_confirmation ? '我整理成了一条待确认记录，确认后才会写入账本。' : '我查到了结果，摘要如下。'),
        skill: plan.plan.skill,
        params: plan.plan.params,
        result: plan.result,
        steps: plan.steps,
        durationMs,
        requiresConfirm: plan.requires_confirmation,
        state: plan.requires_confirmation ? 'idle' : undefined,
      })
    } catch (e) {
      const text = friendlyError(e)
      if (isLLMErrorText(text)) {
        setLLM({ state: 'disabled', reason: text.replace(/^Copilot 已停用：/, '') })
      }
      push({ role: 'assistant', text, durationMs: performance.now() - startedAt })
    } finally {
      setBusy(false)
      setCurrentPhase(null)
      setStreamingAnswer('')
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
      push({ role: 'assistant', text: cleanReply(r.reply) ?? ('已写入账本。' + (r.affected_entities?.length ? ` 影响对象：${r.affected_entities.join('、')}` : '')) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '写入失败')
    } finally {
      setBusy(false)
    }
  }

  // Switch which provider Copilot uses (activates it server-side), then refetch that provider's models.
  async function switchProvider(id: number) {
    if (id === activeId) return
    settingsTouchedRef.current = true
    setActiveId(id)
    setModels([])
    try {
      await activateLLMProvider(id)
    } catch {
      toast.error('切换服务商失败')
      return
    }
    try {
      const r = await listLLMModels({})
      setModels(r.models)
      setAgentModel(r.models[0] ?? '')
    } catch {
      setAgentModel('')
    }
  }

  const canSend = llm.state === 'ready' && !busy && input.trim().length > 0
  // thinking is DeepSeek-v4 only; keep the current model selectable even if not in the fetched list
  const supportsThinking = agentModel.startsWith('deepseek-v4-')
  const modelOpts = agentModel && !models.includes(agentModel) ? [agentModel, ...models] : models

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 14px 9px' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--gradient-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="sparkles" size={12} color="var(--accent-text)" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>Copilot</span>
        <span style={{ fontSize: 10, color: llm.state === 'ready' ? 'var(--text-tertiary)' : 'var(--warning)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '0 4px' }}>{llm.state === 'ready' ? modelShort(agentModel) : llmBadge(llm)}</span>
        <button onClick={onClose} aria-label="返回导航" title="返回导航 (⌘K)" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 }}>
          <Icon name="panel-left-close" size={16} />
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {msgs.map((m) =>
          m.role === 'notice' ? (
            <div key={m.id} className="fb-copilot-notice">
              <Icon name="settings" size={11} />
              <span>{m.text}</span>
            </div>
          ) : m.role === 'user' ? (
            <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '90%', background: 'var(--accent-bg)', border: '1px solid rgba(201,168,106,0.28)', borderRadius: '10px 10px 3px 10px', padding: '8px 11px', fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {m.text}
            </div>
          ) : (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '98%', width: m.result !== undefined ? '98%' : 'auto' }}>
              {m.steps?.length ? <AgentPhase step={finalPhase(m.steps)} /> : null}
              <MarkdownMessage text={m.text} />
              {m.requiresConfirm && m.result !== undefined ? <ResultView result={m.result} /> : null}
              <AnswerMeta durationMs={m.durationMs} />
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
        {busy && (currentPhase || streamingAnswer) ? (
          <div style={{ alignSelf: 'flex-start', width: '98%' }}>
            {currentPhase ? <AgentPhase step={currentPhase} active /> : null}
            {streamingAnswer ? <StreamingAnswer text={streamingAnswer} /> : null}
          </div>
        ) : null}
      </div>

      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--divider)' }}>
        {llm.state === 'disabled' ? (
          <div style={{ ...hint, margin: '0 0 8px', color: 'var(--warning)' }}>
            Copilot 已停用：{llm.reason ?? '模型不可用'}
          </div>
        ) : null}
        <div style={modelControls}>
          {providers.length > 1 ? (
            <Select
              size="sm"
              aria-label="服务商"
              value={activeId != null ? String(activeId) : ''}
              disabled={busy || llm.state !== 'ready'}
              onChange={(e) => void switchProvider(Number(e.target.value))}
              options={providers.map((p) => ({ value: String(p.id), label: p.label || p.provider }))}
              wrapStyle={{ maxWidth: 130 }}
            />
          ) : null}
          <Select
            size="sm"
            aria-label="模型"
            value={agentModel}
            disabled={busy || llm.state !== 'ready' || modelOpts.length === 0}
            onChange={(e) => {
              const v = e.target.value
              if (v !== agentModel) settingsTouchedRef.current = true
              setAgentModel(v)
              if (!v.startsWith('deepseek-v4-')) setThinking(false)
            }}
            options={modelOpts.map((m) => ({ value: m, label: m }))}
            wrapStyle={{ maxWidth: 170 }}
          />
          {supportsThinking ? (
            <button
              type="button"
              aria-pressed={thinking}
              title={thinking ? '已开启思考模式' : '开启思考模式'}
              disabled={busy || llm.state !== 'ready'}
              onClick={() => {
                settingsTouchedRef.current = true
                setThinking((v) => !v)
              }}
              style={thinkButton(thinking, busy || llm.state !== 'ready')}
            >
              <Icon name="sparkles" size={11} />
              思考
            </button>
          ) : null}
          <div style={{ marginLeft: 'auto' }}>
            <UsageBadge usage={sessionUsage} currency={costCcy} rate={costRate} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '7px 8px 7px 11px' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
            rows={1}
            disabled={llm.state !== 'ready'}
            placeholder={llm.state === 'ready' ? '问数据 / 记一笔…（Enter 发送）' : llm.state === 'checking' ? '正在检查模型状态…' : 'Copilot 未启用'}
            style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-strong)', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.5, maxHeight: 90, padding: '3px 0', opacity: llm.state === 'ready' ? 1 : 0.55 }}
          />
          <button type="button" className="fb-copilot-send" onClick={() => void send()} aria-label="发送" disabled={!canSend} style={sendButton(canSend)}>
            <Icon name="send-horizontal" size={13} color={canSend ? 'var(--accent-text)' : 'var(--text-tertiary)'} />
            <span>发送</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

function cleanReply(s?: string | null) {
  const t = (s ?? '').trim()
  return t || undefined
}

function friendlyError(e: unknown) {
  const msg = e instanceof Error ? e.message : ''
  if (msg.includes('余额不足')) {
    return 'Copilot 已停用：模型服务余额不足。充值后重新打开 Copilot 使用。'
  }
  if (msg.includes('认证失败') || msg.includes('限流') || msg.includes('暂时不可用') || msg.includes('连接超时')) {
    return `Copilot 已停用：${msg}。恢复后重新打开 Copilot。`
  }
  if (msg.includes('LLM') || msg.includes('模型') || msg.includes('llm_unavailable')) {
    return `Copilot 已停用：${msg || '模型调用失败'}。请先检查 LLM 配置、网络或额度。`
  }
  return msg || '请求失败，请稍后再试。'
}

function isLLMErrorText(text: string) {
  return text.includes('Copilot 已停用') || text.includes('LLM') || text.includes('模型调用失败')
}

function llmBadge(llm: { state: 'checking' | 'ready' | 'disabled'; status?: LLMStatus }) {
  if (llm.state === 'checking') return 'checking'
  if (llm.state === 'disabled') return 'disabled'
  const model = llm.status?.model ?? 'ready'
  return model.replace('deepseek-v4-', '').replace('deepseek-', '')
}

function modelShort(model: AgentModel) {
  const m = model.replace('deepseek-v4-', '').replace('deepseek-', '')
  return m || '默认'
}

function modelLabel(model: AgentModel) {
  return model || '默认模型'
}

function shouldShowSettingsNotice(current: AgentRunSettings, previous: AgentRunSettings | null, touched: boolean) {
  if (!touched) return false
  if (!previous) return true
  return previous.model !== current.model || previous.thinking !== current.thinking
}

function settingsNotice(settings: AgentRunSettings) {
  return `本次使用 ${modelLabel(settings.model)}，思考${settings.thinking ? '开启' : '关闭'}`
}

function buildAgentHistory(messages: Msg[]): AgentChatMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.id !== 0 && cleanReply(m.text))
    .slice(-8)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      text: shortHistoryText(m.text),
    }))
}

function shortHistoryText(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= 900) return compact
  return compact.slice(0, 900) + '…'
}

function finalPhase(steps: AgentStep[]) {
  const last = steps[steps.length - 1]
  const tool = [...steps].reverse().find((x) => x.skill)
  if (last?.key === 'answer' && tool) {
    return { ...last, detail: `${skillLabel(tool.skill)}${tool.row_count != null ? ` · ${tool.row_count} 条` : ''}` }
  }
  return last ?? { key: 'done', label: '完成', status: 'done' }
}

function AgentPhase({ step, active = false }: { step: AgentStep; active?: boolean }) {
  const displayStep = userFacingStep(step)
  const done = step.status === 'done'
  const errored = step.status === 'error'
  const pending = step.status === 'pending' || (active && !done && !errored)
  return (
    <div className={`fb-agent-phase${pending ? ' fb-agent-phase--active' : ''}`} style={phaseLine} aria-live="polite">
      <span style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: `1px solid ${done ? 'rgba(201,168,106,0.7)' : pending ? 'rgba(201,168,106,0.5)' : 'var(--border-default)'}`,
        background: done ? 'rgba(201,168,106,0.16)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: done ? 'var(--accent)' : 'var(--text-tertiary)',
        flex: 'none',
      }}>
        <Icon name={done ? 'check' : pending ? 'zap' : 'circle-alert'} size={10} />
      </span>
      <span style={{ color: pending ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 11.5, fontWeight: 600, flex: 'none' }}>{displayStep.label}</span>
      {displayStep.detail ? <span style={{ color: 'var(--text-tertiary)', fontSize: 10.8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayStep.detail}</span> : null}
      {pending ? (
        <span className="fb-agent-phase__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </div>
  )
}

function StreamingAnswer({ text }: { text: string }) {
  return (
    <div className="fb-copilot-stream">
      <MarkdownMessage text={text} />
    </div>
  )
}

const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="fb-copilot-table">
      <table>{children}</table>
    </div>
  ),
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="fb-copilot-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
    </div>
  )
}

function AnswerMeta({ durationMs }: { durationMs?: number }) {
  if (durationMs == null) return null
  return <div style={answerMeta}>用时 {formatDuration(durationMs)}</div>
}

function UsageBadge({ usage, currency, rate }: { usage: AgentUsage | null; currency: DisplayCurrency; rate: number }) {
  const total = usage?.total_tokens ?? 0
  const hit = usage?.prompt_cache_hit_tokens ?? 0
  const miss = usage?.prompt_cache_miss_tokens ?? 0
  const prompt = hit + miss || usage?.prompt_tokens || 0
  const cacheRate = prompt > 0 ? hit / prompt : null
  const title = usage
    ? `本会话模型用量\n调用 ${usage.calls ?? 0} 次\n输入 ${formatCompactInt(usage.prompt_tokens ?? prompt)} tokens\nCache 命中 ${formatCompactInt(hit)} / 未命中 ${formatCompactInt(miss)}\n输出 ${formatCompactInt(usage.completion_tokens ?? 0)} tokens${usage.reasoning_tokens ? `\n思考 ${formatCompactInt(usage.reasoning_tokens)} tokens` : ''}\n估算花费 ${formatCost(usage.cost_usd ?? 0, currency, rate)}`
    : '本会话模型用量'
  return (
    <div style={usageBadge} title={title}>
      <span>{formatCompactInt(total)} tok</span>
      <span>Cache {cacheRate == null ? '—' : `${Math.round(cacheRate * 100)}%`}</span>
      <span>{formatCost(usage?.cost_usd ?? 0, currency, rate)}</span>
    </div>
  )
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} 秒`
}

function addUsage(prev: AgentUsage | null, next: AgentUsage): AgentUsage {
  return {
    calls: (prev?.calls ?? 0) + (next.calls ?? 0),
    prompt_tokens: (prev?.prompt_tokens ?? 0) + (next.prompt_tokens ?? 0),
    prompt_cache_hit_tokens: (prev?.prompt_cache_hit_tokens ?? 0) + (next.prompt_cache_hit_tokens ?? 0),
    prompt_cache_miss_tokens: (prev?.prompt_cache_miss_tokens ?? 0) + (next.prompt_cache_miss_tokens ?? 0),
    completion_tokens: (prev?.completion_tokens ?? 0) + (next.completion_tokens ?? 0),
    reasoning_tokens: (prev?.reasoning_tokens ?? 0) + (next.reasoning_tokens ?? 0),
    total_tokens: (prev?.total_tokens ?? 0) + (next.total_tokens ?? 0),
    cost_usd: (prev?.cost_usd ?? 0) + (next.cost_usd ?? 0),
  }
}

function formatCompactInt(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

const CCY_SYMBOL: Record<DisplayCurrency, string> = { CNY: '¥', HKD: 'HK$', USD: '$' }

// cost is estimated in USD; rate converts USD → the given display currency (1 when currency is USD).
function formatCost(usd: number, currency: DisplayCurrency, rate: number) {
  const sym = CCY_SYMBOL[currency] ?? '$'
  const v = (Number.isFinite(rate) && rate > 0 ? rate : 1) * usd
  if (!Number.isFinite(v) || v <= 0) return `${sym}0.0000`
  if (v < 0.0001) return `<${sym}0.0001`
  if (v < 0.01) return `${sym}${v.toFixed(4)}`
  return `${sym}${v.toFixed(3)}`
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
          <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-tertiary)', fontWeight: 400, borderBottom: '1px solid var(--divider)' }}>{fieldLabel(c)}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 12).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                {cols.map((c) => <td key={c} style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatCell(row[c])}</td>)}
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
          <span style={{ color: 'var(--text-tertiary)' }}>{fieldLabel(k)}</span>
          <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
            {formatCell(v)}
          </span>
        </div>
      ))}
    </>
  )
}

const card: React.CSSProperties = { background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10, marginTop: 6 }
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }
const phaseLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.018)', marginBottom: 7 }
const answerMeta: React.CSSProperties = { marginTop: 8, color: 'var(--text-tertiary)', fontSize: 10.5, lineHeight: 1.4 }
const modelControls: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 8 }
const usageBadge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: 220, overflow: 'hidden', whiteSpace: 'nowrap', border: '1px solid var(--border-default)', borderRadius: 8, background: 'rgba(255,255,255,0.018)', color: 'var(--text-tertiary)', fontSize: 10.5, fontFamily: 'var(--font-mono)', padding: '4px 7px' }
function thinkButton(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    height: 'var(--control-sm)',
    border: `1px solid ${active ? 'rgba(201,168,106,0.48)' : 'var(--border-default)'}`,
    borderRadius: 8,
    background: active ? 'rgba(201,168,106,0.16)' : 'var(--surface-inset)',
    color: active ? 'var(--accent)' : 'var(--text-tertiary)',
    fontSize: 11,
    fontWeight: 700,
    padding: '0 10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function sendButton(active: boolean): React.CSSProperties {
  return {
    flex: 'none',
    minWidth: 58,
    height: 30,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? 'rgba(201,168,106,0.56)' : 'var(--border-default)'}`,
    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.018)',
    color: active ? 'var(--accent-text)' : 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0,
    cursor: active ? 'pointer' : 'default',
    opacity: active ? 1 : 0.55,
  }
}

function userFacingStep(step: AgentStep) {
  let detail = step.detail ?? ''
  if (step.skill) {
    detail = replaceAllText(detail, step.skill, skillLabel(step.skill))
  }
  for (const [name, label] of Object.entries(SKILL_LABELS)) {
    detail = replaceAllText(detail, name, label)
  }
  detail = replaceAllText(replaceAllText(replaceAllText(detail, 'skill', '操作'), 'tool', '操作'), 'Tool', '操作')
  return { ...step, detail }
}

function replaceAllText(text: string, search: string, replacement: string) {
  if (!search) return text
  return text.split(search).join(replacement)
}

function skillLabel(skill?: string) {
  if (!skill) return ''
  return SKILL_LABELS[skill] ?? '数据查询'
}

const SKILL_LABELS: Record<string, string> = {
  'portfolio.getSnapshot': '资产快照',
  'holdings.listCurrent': '当前持仓',
  'holdings.getAccountPositions': '账户持仓',
  'accounts.list': '账户列表',
  'accounts.getDetail': '账户详情',
  'institutions.list': '机构列表',
  'marketData.getInstrumentHistory': '历史价格',
  'fx.getRateHistory': '历史汇率',
  'recon.getAccountDiff': '现金对账',
  'compare.getPeriodAttribution': '期间归因',
  'targets.getDrift': '目标配置漂移',
  'entry.draftBalanceSnapshot': '余额快照草稿',
  'entry.draftTransaction': '持仓交易草稿',
  'entry.draftCreditCardBill': '信用卡账单草稿',
  'entry.draftPositionSnapshot': '持仓快照草稿',
  'entry.draftTransfer': '账户转账草稿',
  'entry.draftIncomeEvent': '收益事件草稿',
  'entry.draftCorporateAction': '公司动作草稿',
  'marketData.draftPrice': '价格记录草稿',
  'marketData.draftFxRate': '汇率记录草稿',
  'planning.draftAllocationTargetSet': '配置目标草稿',
  'timeline.draftAnnotation': '时间线标注草稿',
}

function formatCell(v: unknown) {
  if (v == null) return '—'
  if (isScalar(v)) return String(v)
  if (Array.isArray(v)) return `[${v.length} 项]`
  return '{…}'
}

function fieldLabel(k: string) {
  const labels: Record<string, string> = {
    as_of: '日期',
    display_currency: '展示币种',
    fx_mode: '汇率口径',
    net_worth: '净资产',
    total_assets: '总资产',
    total_liabilities: '总负债',
    cash_value: '现金',
    position_value: '持仓',
    position_cost: '持仓成本',
    position_net_cost: '持仓净成本',
    unrealized_pl: '浮动盈亏',
    unrealized_pl_pct: '浮盈亏率',
    position_share: '持仓占比',
    realized_pl_ytd: '今年已实现盈亏',
    income_ytd: '今年收益',
    allocations: '配置分布',
    cash_accounts: '现金账户',
    positions: '持仓明细',
    position_groups: '合并持仓',
    warnings: '数据提醒',
    entity: '记录类型',
    account: '账户',
    fields: '字段',
    snapshot_date: '日期',
    balance: '余额',
    trade_date: '交易日',
    action: '方向',
    symbol: '标的',
    quantity: '数量',
    price: '价格',
    currency: '币种',
    statement_date: '出账日',
    amount_total: '账单金额',
    paid_at: '还款日',
    avg_cost: '成本价',
    cost_currency: '成本币种',
    transfer_date: '转账日',
    from_amount: '转出金额',
    to_amount: '转入金额',
    event_date: '事件日',
    event_kind: '类型',
    amount: '金额',
    ratio_numerator: '比例分子',
    ratio_denominator: '比例分母',
    price_date: '价格日',
    source: '来源',
    rate_date: '汇率日',
    base_currency: '基准币种',
    quote_currency: '目标币种',
    rate: '汇率',
    name: '名称',
    dimension: '维度',
    drift_threshold_pct: '漂移阈值',
    label: '标题',
    anchor_kind: '锚点',
  }
  return labels[k] ?? k
}
