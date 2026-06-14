import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Icon, Segmented } from '../ds'
import { NAV } from '../nav'
import wordmark from '../assets/logo/finbrain-wordmark.svg'

// Ported from design/project/app/Shell.jsx (Sidebar). The Copilot pane opens the
// NL assistant (P6: query + entry, default DeepSeek) via onOpenCopilot.
export function Sidebar({ onOpenCopilot }: { onOpenCopilot: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'nav' | 'copilot'>('nav')
  const copilot = mode === 'copilot'
  const active = location.pathname.replace(/^\//, '') || 'dashboard'

  return (
    <aside
      style={{
        width: copilot ? 348 : 'var(--sidebar-width)',
        background: 'var(--surface-panel)',
        borderRight: '1px solid var(--divider)',
        display: 'flex',
        flexDirection: 'column',
        flex: 'none',
        height: '100%',
        transition: 'width .24s var(--ease-out)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 18px 14px',
          borderBottom: '1px solid var(--divider)',
        }}
      >
        <img src={wordmark} height={31} alt="finbrain" style={{ display: 'block' }} />
      </div>
      <div style={{ padding: '10px 10px 6px' }}>
        <Segmented
          size="sm"
          value={mode}
          onChange={(m) => setMode(m as 'nav' | 'copilot')}
          options={[
            { value: 'nav', label: '导航' },
            { value: 'copilot', label: 'Copilot' },
          ]}
        />
      </div>

      {copilot ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles" size={20} color="var(--accent)" />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)' }}>Copilot</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
            自然语言
            <strong style={{ color: 'var(--text-secondary)' }}>查询</strong>
            与
            <strong style={{ color: 'var(--text-secondary)' }}>录入</strong>
            已可用(默认 DeepSeek)。问数据、记一笔,业主确认后写入。
          </div>
          <Button variant="primary" size="sm" iconLeft={<Icon name="sparkles" size={14} />} onClick={onOpenCopilot}>
            打开助手 · ⌘K
          </Button>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-tertiary)',
              lineHeight: 1.9,
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
            }}
          >
            例:<br />
            「持有 GOOG 的账户和数量」<br />
            「招行 6231 今天 12.3 万」<br />
            「这三个月信用卡支出最大的两个类目」
          </div>
          <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            未配置 LLM Key 时优雅降级;状态见「设置 · 数据与智能」。
          </div>
        </div>
      ) : (
        <>
          <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 18px' }}>
            {NAV.map((grp) => (
              <div key={grp.section} style={{ marginBottom: 14 }}>
                <div className="fb-eyebrow" style={{ padding: '8px 10px 6px' }}>
                  {grp.section}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {grp.items.map((it) => {
                    const on = active === it.id
                    return (
                      <button
                        key={it.id}
                        onClick={() => navigate(`/${it.id}`)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          background: on ? 'var(--accent-bg)' : 'transparent',
                          color: on ? 'var(--accent-bright)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13,
                          fontWeight: on ? 500 : 400,
                          boxShadow: on ? 'inset 2px 0 0 var(--accent)' : 'none',
                          transition: 'var(--transition-control)',
                        }}
                        onMouseEnter={(e) => {
                          if (!on) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                            e.currentTarget.style.color = 'var(--text-primary)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!on) {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                          }
                        }}
                      >
                        <Icon name={it.icon} size={16} stroke={on ? 1.9 : 1.7} />
                        <span style={{ flex: 1 }}>{it.label}</span>
                        {it.accent ? (
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'var(--accent)',
                            }}
                          />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--divider)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--gradient-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-text)',
                fontWeight: 700,
                fontSize: 12,
                flex: 'none',
              }}
            >
              业
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>业主</div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                self-hosted · k3s
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
