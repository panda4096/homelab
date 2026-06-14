import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon, Segmented } from '../ds'
import { NAV } from '../nav'
import { CopilotPanel } from './CopilotPanel'
import wordmark from '../assets/logo/finbrain-wordmark.svg'
import type { AuthUser } from '../api'

const COPILOT_WIDTH_KEY = 'finbrain.copilotSidebarWidth'
const COPILOT_DEFAULT_WIDTH = 360
const COPILOT_MIN_WIDTH = 332
const COPILOT_MAX_WIDTH = 720

// Ported from design/project/app/Shell.jsx (Sidebar). The Copilot mode hosts the
// persistent NL conversation panel (P6). Open state is controlled by App so ⌘K
// and the Topbar trigger toggle the same pane.
export function Sidebar({
  copilotOpen,
  onCopilotChange,
  user,
  onLogout,
}: {
  copilotOpen: boolean
  onCopilotChange: (v: boolean) => void
  user?: AuthUser | null
  onLogout?: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const copilot = copilotOpen
  const active = location.pathname.replace(/^\//, '') || 'dashboard'
  const asideRef = useRef<HTMLElement | null>(null)
  const resizingRef = useRef(false)
  const [copilotWidth, setCopilotWidth] = useState(readCopilotWidth)

  useEffect(() => {
    if (!copilot) return

    const endResize = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    const moveResize = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const left = asideRef.current?.getBoundingClientRect().left ?? 0
      updateCopilotWidth(e.clientX - left)
    }

    window.addEventListener('mousemove', moveResize)
    window.addEventListener('mouseup', endResize)
    window.addEventListener('blur', endResize)
    return () => {
      window.removeEventListener('mousemove', moveResize)
      window.removeEventListener('mouseup', endResize)
      window.removeEventListener('blur', endResize)
      endResize()
    }
  }, [copilot])

  function updateCopilotWidth(next: number) {
    setCopilotWidth(() => {
      const clamped = clampCopilotWidth(next)
      window.localStorage.setItem(COPILOT_WIDTH_KEY, String(clamped))
      return clamped
    })
  }

  function startResize(e: ReactMouseEvent<HTMLDivElement>) {
    if (!copilot) return
    e.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <aside
      ref={asideRef}
      style={{
        width: copilot ? copilotWidth : 'var(--sidebar-width)',
        minWidth: copilot ? COPILOT_MIN_WIDTH : 'var(--sidebar-width)',
        background: 'var(--surface-panel)',
        borderRight: '1px solid var(--divider)',
        display: 'flex',
        flexDirection: 'column',
        flex: 'none',
        height: '100%',
        position: 'relative',
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
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{user?.display_name ?? '用户'}</div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                user:{user?.id ?? 1}
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="登出"
              aria-label="登出"
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--divider)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="log-out" size={15} />
            </button>
          </div>
        </>
      )}
      {copilot ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 Copilot 侧栏宽度"
          tabIndex={0}
          onMouseDown={startResize}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              updateCopilotWidth(copilotWidth - (e.shiftKey ? 40 : 16))
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              updateCopilotWidth(copilotWidth + (e.shiftKey ? 40 : 16))
            }
          }}
          style={{
            position: 'absolute',
            top: 0,
            right: -4,
            width: 8,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 20,
            outline: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,168,106,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          onFocus={(e) => { e.currentTarget.style.background = 'rgba(201,168,106,0.16)' }}
          onBlur={(e) => { e.currentTarget.style.background = 'transparent' }}
        />
      ) : null}
    </aside>
  )
}

function readCopilotWidth() {
  if (typeof window === 'undefined') return COPILOT_DEFAULT_WIDTH
  const saved = Number(window.localStorage.getItem(COPILOT_WIDTH_KEY))
  if (!Number.isFinite(saved)) return COPILOT_DEFAULT_WIDTH
  return clampCopilotWidth(saved)
}

function clampCopilotWidth(width: number) {
  const viewportMax = typeof window === 'undefined' ? COPILOT_MAX_WIDTH : Math.max(COPILOT_MIN_WIDTH, window.innerWidth - 480)
  return Math.round(Math.min(Math.max(width, COPILOT_MIN_WIDTH), Math.min(COPILOT_MAX_WIDTH, viewportMax)))
}
