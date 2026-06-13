import { useNavigate } from 'react-router-dom'
import { Button, Icon, IconButton, Segmented } from '../ds'
import { usePrefStore } from '../store'
import { useUiStore } from '../uiStore'
import type { DisplayCurrency } from '../api'

export interface TopbarProps {
  title: string
  onNL: () => void
}

// Ported from design/project/app/Shell.jsx (Topbar). Currency is bound to the
// global preferences store; the primary action starts the monthly review.
export function Topbar({ title, onNL }: TopbarProps) {
  const navigate = useNavigate()
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const setDisplayCurrency = usePrefStore((s) => s.setDisplayCurrency)
  const openQuickEntry = useUiStore((s) => s.openQuickEntry)

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
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="zap" size={14} />}
          onClick={() => openQuickEntry()}
        >
          快速录入
        </Button>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Icon name="list-checks" size={14} />}
          onClick={() => navigate('/review')}
        >
          开始本月盘点
        </Button>
        <Segmented
          options={['CNY', 'HKD', 'USD']}
          value={displayCurrency}
          onChange={(v) => void setDisplayCurrency(v as DisplayCurrency)}
          size="sm"
        />
        <IconButton aria-label="自然语言 ⌘K" onClick={onNL}>
          <Icon name="sparkles" size={16} />
        </IconButton>
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
