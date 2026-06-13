import type { CSSProperties, DragEventHandler, ReactNode } from 'react'
import { Icon } from '../ds'
import { KIND_LABEL, KIND_TONE } from './format'

/** Kind pill — port of Accounts.jsx KindBadge (uses KIND_TONE color + dot). */
export function KindBadge({ kind }: { kind: string }) {
  const tone = KIND_TONE[kind] || 'var(--text-secondary)'
  return (
    <span className="fb-badge fb-badge--neutral" style={{ color: tone }}>
      <span className="fb-badge__dot" style={{ background: tone }} />
      {KIND_LABEL[kind] || kind}
    </span>
  )
}

// ---- table cells (port of ui.jsx Th/Td/Row) ----

export function Th({
  children,
  right,
  w,
}: {
  children?: ReactNode
  right?: boolean
  w?: number | string
}) {
  return (
    <th
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '9px 12px',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
        background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-default)',
        width: w,
      }}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  right,
  mono,
  color,
  dim,
  w,
  style,
}: {
  children?: ReactNode
  right?: boolean
  mono?: boolean
  color?: string
  dim?: boolean
  w?: number | string
  style?: CSSProperties
}) {
  return (
    <td
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '10px 12px',
        fontSize: 12.5,
        fontFamily: mono ? 'var(--font-num)' : 'var(--font-sans)',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        color: color || (dim ? 'var(--text-tertiary)' : 'var(--text-primary)'),
        whiteSpace: 'nowrap',
        width: w,
        ...style,
      }}
    >
      {children}
    </td>
  )
}

export function Row({
  children,
  onClick,
  highlight,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  children: ReactNode
  onClick?: () => void
  highlight?: boolean
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLTableRowElement>
  onDragOver?: DragEventHandler<HTMLTableRowElement>
  onDrop?: DragEventHandler<HTMLTableRowElement>
  onDragEnd?: DragEventHandler<HTMLTableRowElement>
}) {
  return (
    <tr
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        borderBottom: '1px solid var(--divider)',
        background: highlight ? 'var(--surface-inset)' : 'transparent',
        transition: 'var(--transition-control)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-raised)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = highlight ? 'var(--surface-inset)' : 'transparent'
      }}
    >
      {children}
    </tr>
  )
}

export function SectionHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        color: 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        lineHeight: 1.6,
      }}
    >
      <Icon name="info" size={13} /> {children}
    </div>
  )
}
