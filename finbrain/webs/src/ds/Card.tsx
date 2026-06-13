import type { CSSProperties, ReactNode } from 'react'

export interface CardProps {
  eyebrow?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** when false, render children without the default body padding */
  padded?: boolean
  inset?: boolean
  flush?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * Faithful port of the design's Card — maps to .fb-card class hooks.
 * Header is only rendered when an eyebrow/title/actions are supplied.
 */
export function Card({
  eyebrow,
  title,
  subtitle,
  actions,
  padded = true,
  inset,
  flush,
  className,
  style,
  children,
}: CardProps) {
  const cls = [
    'fb-card',
    inset && 'fb-card--inset',
    flush && 'fb-card--flush',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const hasHeader = eyebrow != null || title != null || actions != null
  return (
    <div className={cls} style={style}>
      {hasHeader ? (
        <div className="fb-card__header">
          <div>
            {eyebrow ? <div className="fb-card__eyebrow">{eyebrow}</div> : null}
            {title ? <div className="fb-card__title">{title}</div> : null}
            {subtitle ? <div className="fb-card__subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div> : null}
        </div>
      ) : null}
      {padded ? <div className="fb-card__body">{children}</div> : children}
    </div>
  )
}
