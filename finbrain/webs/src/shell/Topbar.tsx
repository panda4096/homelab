import { Icon, IconButton, Segmented } from '../ds'
import { usePrefStore } from '../store'
import type { DisplayCurrency } from '../api'

export interface TopbarProps {
  title: string
}

// Topbar: page title + global display-currency toggle + refresh/notifications.
// (Quick-entry / monthly-review / Copilot live in the sidebar nav, so they're not duplicated here.)
export function Topbar({ title }: TopbarProps) {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const setDisplayCurrency = usePrefStore((s) => s.setDisplayCurrency)

  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        flex: 'none',
        borderBottom: '1px solid var(--divider)',
        background: 'color-mix(in srgb, var(--surface-base) 82%, transparent)',
        backdropFilter: 'var(--blur-bar)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 22px',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <h1
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--text-strong)',
          margin: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 'none',
        }}
      >
        <Segmented
          options={['CNY', 'HKD', 'USD']}
          value={displayCurrency}
          onChange={(v) => void setDisplayCurrency(v as DisplayCurrency)}
          size="sm"
        />
        <IconButton aria-label="刷新">
          <Icon name="refresh-cw" size={16} />
        </IconButton>
        <div style={{ position: 'relative' }}>
          <IconButton aria-label="通知">
            <Icon name="bell" size={16} />
          </IconButton>
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 7,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--warning)',
              border: '1.5px solid var(--surface-base)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </header>
  )
}
