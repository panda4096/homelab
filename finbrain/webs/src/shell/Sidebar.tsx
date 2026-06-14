import { useLocation, useNavigate } from 'react-router-dom'
import { Icon, Segmented } from '../ds'
import { NAV } from '../nav'
import { CopilotPanel } from './CopilotPanel'
import wordmark from '../assets/logo/finbrain-wordmark.svg'

// Ported from design/project/app/Shell.jsx (Sidebar). The Copilot mode hosts the
// persistent NL conversation panel (P6). Open state is controlled by App so ⌘K
// and the Topbar trigger toggle the same pane.
export function Sidebar({ copilotOpen, onCopilotChange }: { copilotOpen: boolean; onCopilotChange: (v: boolean) => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const copilot = copilotOpen
  const active = location.pathname.replace(/^\//, '') || 'dashboard'

  return (
    <aside
      style={{
        width: copilot ? 348 : 'var(--sidebar-width)',
        minWidth: copilot ? 348 : 'var(--sidebar-width)',
        background: 'var(--surface-panel)',
        borderRight: '1px solid var(--divider)',
        display: 'flex',
        flexDirection: 'column',
        flex: 'none',
        height: '100%',
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
          value={copilot ? 'copilot' : 'nav'}
          onChange={(m) => onCopilotChange(m === 'copilot')}
          options={[
            { value: 'nav', label: '导航' },
            { value: 'copilot', label: 'Copilot' },
          ]}
        />
      </div>

      {copilot ? (
        <CopilotPanel onClose={() => onCopilotChange(false)} />
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
