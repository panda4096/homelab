import type { ReactNode } from 'react'

type Tone = 'solid' | 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}

/** Faithful port of the design's Badge — maps to .fb-badge class hooks. */
export function Badge({ tone = 'neutral', dot, className, children }: BadgeProps) {
  const cls = ['fb-badge', `fb-badge--${tone}`, className].filter(Boolean).join(' ')
  return (
    <span className={cls}>
      {dot ? <span className="fb-badge__dot" /> : null}
      {children}
    </span>
  )
}
