import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from './Icon'

export interface DateFieldProps {
  /** ISO date string 'YYYY-MM-DD' (or '') */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  style?: CSSProperties
  className?: string
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] // Monday-first
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-indexed

function parseISO(s?: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim())
  return mm ? { y: +mm[1], m: +mm[2] - 1, d: +mm[3] } : null
}

/** Themed date picker — a drop-in for <Input type="date"> with a styled calendar popover.
 *  Dates are plain 'YYYY-MM-DD' strings; comparison/formatting is string-based (no UTC shift). */
export function DateField({ value, onChange, min, max, size = 'md', disabled, invalid, placeholder = '选择日期', style, className }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sel = parseISO(value)
  const today = new Date()
  const todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate())
  const [view, setView] = useState(() => sel ?? { y: today.getFullYear(), m: today.getMonth(), d: 1 })

  // follow external value changes into the visible month
  useEffect(() => {
    const p = parseISO(value)
    if (p) setView((v) => (v.y === p.y && v.m === p.m ? v : { y: p.y, m: p.m, d: 1 }))
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const firstWeekday = (new Date(view.y, view.m, 1).getDay() + 6) % 7 // Monday-first leading blanks
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const isDisabled = (d: number) => {
    const s = iso(view.y, view.m, d)
    return (!!min && s < min) || (!!max && s > max)
  }
  const stepMonth = (delta: number) => setView((v) => { const t = new Date(v.y, v.m + delta, 1); return { y: t.getFullYear(), m: t.getMonth(), d: 1 } })
  const pick = (d: number) => { if (isDisabled(d)) return; onChange(iso(view.y, view.m, d)); setOpen(false) }
  const goToday = () => { if ((min && todayISO < min) || (max && todayISO > max)) return; onChange(todayISO); setOpen(false) }

  const wrapCls = ['fb-input-wrap', size === 'sm' && 'fb-input-wrap--sm', invalid && 'fb-input-wrap--error', disabled && 'fb-input-wrap--disabled', className].filter(Boolean).join(' ')

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        className={wrapCls}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', borderColor: open ? 'var(--accent)' : undefined }}
      >
        <span className="fb-input" style={{ flex: 1, color: sel ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: 'var(--font-num)' }}>
          {value || placeholder}
        </span>
        <Icon name="calendar" size={14} color="var(--text-tertiary)" />
      </button>
      {open && !disabled ? (
        <div
          role="dialog"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, width: 252, padding: 12,
            background: 'var(--surface-overlay)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <NavBtn onClick={() => setView((v) => ({ ...v, y: v.y - 1 }))} title="上一年">«</NavBtn>
              <NavBtn onClick={() => stepMonth(-1)} title="上一月">‹</NavBtn>
            </div>
            <span className="fb-num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{view.y} 年 {view.m + 1} 月</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <NavBtn onClick={() => stepMonth(1)} title="下一月">›</NavBtn>
              <NavBtn onClick={() => setView((v) => ({ ...v, y: v.y + 1 }))} title="下一年">»</NavBtn>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map((w) => (
              <span key={w} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-tertiary)', padding: '2px 0' }}>{w}</span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (d == null) return <span key={`b${i}`} />
              const s = iso(view.y, view.m, d)
              const selected = !!sel && s === value
              const isToday = s === todayISO
              const off = isDisabled(d)
              return (
                <button
                  key={d}
                  type="button"
                  disabled={off}
                  onClick={() => pick(d)}
                  className="fb-num"
                  style={{
                    height: 30, border: 'none', borderRadius: 'var(--radius-sm, 6px)', cursor: off ? 'default' : 'pointer',
                    fontSize: 12.5, fontFamily: 'var(--font-num)',
                    background: selected ? 'var(--accent)' : 'transparent',
                    color: off ? 'var(--text-disabled, var(--text-tertiary))' : selected ? 'var(--accent-text, #1a1205)' : 'var(--text-primary)',
                    opacity: off ? 0.35 : 1,
                    boxShadow: !selected && isToday ? 'inset 0 0 0 1px var(--accent-border)' : undefined,
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { if (!selected && !off) e.currentTarget.style.background = 'var(--surface-raised)' }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, borderTop: '1px solid var(--divider)', paddingTop: 8 }}>
            <button type="button" onClick={goToday} style={{ appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--accent)' }}>
              今天
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NavBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        appearance: 'none', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer',
        color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-raised)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}
