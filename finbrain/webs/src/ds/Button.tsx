import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

/** Faithful port of the design's Button — maps to .fb-btn class hooks. */
export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  iconLeft,
  iconRight,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'fb-btn',
    `fb-btn--${variant}`,
    size !== 'md' && `fb-btn--${size}`,
    block && 'fb-btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {iconLeft ? <span className="fb-btn__icon">{iconLeft}</span> : null}
      {children}
      {iconRight ? <span className="fb-btn__icon">{iconRight}</span> : null}
    </button>
  )
}
