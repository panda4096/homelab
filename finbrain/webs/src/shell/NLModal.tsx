import { useState } from 'react'
import { Badge, Button, Icon } from '../ds'

// Ported from the NLModal in 「finbrain 控制台.html」. Non-functional stub for P0
// (no real LLM): the parse preview is static and 确认写入 just closes.
const NL_SAMPLES = [
  { t: '招行 6231 今天 12.3 万', intent: '更新余额', conf: 0.94 },
  { t: '汇丰美股 GOOG 加到 50 股，成本不变', intent: '更新持仓', conf: 0.88 },
  { t: '招行信用卡这期 5800，餐饮 2k 网购 1.5k', intent: '信用卡账单', conf: 0.91 },
  { t: '今天 USD/CNY 7.18', intent: '汇率', conf: 0.97 },
]

const PREVIEW_ROWS: Array<[string, string]> = [
  ['账户', '富途 · 美股账户 (USD)'],
  ['标的', 'GOOG · Alphabet'],
  ['数量', '50 股'],
  ['平均成本', '保留 $142.30'],
  ['日期', '2026-06-13 (今天)'],
]

export interface NLModalProps {
  onClose: () => void
}

export function NLModal({ onClose }: NLModalProps) {
  const [q, setQ] = useState('汇丰美股 GOOG 加到 50 股，成本不变')
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,6,9,0.62)',
        backdropFilter: 'var(--blur-overlay)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fb-card"
        style={{ width: 600, maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--divider)',
          }}
        >
          <Icon name="sparkles" size={18} color="var(--accent)" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="自然语言录入 / 查询…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
            }}
          />
          <kbd
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            esc
          </kbd>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            解析预览 · 置信度 0.88 · 业主确认后写入
          </div>
          <div
            style={{
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge tone="gold">更新持仓</Badge>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                当前持仓记录
              </span>
            </div>
            {PREVIEW_ROWS.map(([k, v]) => (
              <div
                key={k}
                style={{ display: 'grid', gridTemplateColumns: '84px 1fr', fontSize: 13 }}
              >
                <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: k === '数量' || k === '平均成本' ? 'var(--font-num)' : 'inherit',
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {NL_SAMPLES.map((s, i) => (
              <button
                key={i}
                onClick={() => setQ(s.t)}
                className="fb-tag fb-tag--clickable"
                style={{ fontSize: 11 }}
              >
                {s.t}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '12px 16px',
            borderTop: '1px solid var(--divider)',
          }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Icon name="check" size={14} />}
            onClick={onClose}
          >
            确认写入
          </Button>
        </div>
      </div>
    </div>
  )
}
