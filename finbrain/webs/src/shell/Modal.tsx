import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ds'

export interface ModalProps {
  title: ReactNode
  icon?: string
  onClose: () => void
  width?: number
  footer?: ReactNode
  children: ReactNode
}

/**
 * Overlay modal shell — same look/behaviour as the ⌘K NLModal (backdrop click +
 * Esc to close, centred card, blurred backdrop). Reused by quick-entry / build-account.
 */
export function Modal({ title, icon, onClose, width = 560, footer, children }: ModalProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,6,9,0.62)',
        backdropFilter: 'var(--blur-overlay)',
        zIndex: 70,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
        paddingBottom: '6vh',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fb-card"
        // .fb-card sets `overflow: clip`, which would crop popovers that extend past
        // the card edge (e.g. the DateField calendar near the bottom). Modals scroll via
        // the backdrop, so let their content overflow visibly instead.
        style={{ width, maxWidth: '92vw', boxShadow: 'var(--shadow-lg)', overflow: 'visible' }}
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
          {icon ? <Icon name={icon} size={18} color="var(--accent)" /> : null}
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-strong)', flex: 1 }}>
            {title}
          </span>
          <button
            aria-label="关闭"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: 0,
              display: 'inline-flex',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
        {footer ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              padding: '12px 16px',
              borderTop: '1px solid var(--divider)',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
