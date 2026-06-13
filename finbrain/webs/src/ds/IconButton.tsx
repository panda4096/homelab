import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Size = 'xs' | 'sm' | 'md'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size
  solid?: boolean
  children: ReactNode
}

/** Faithful port of the design's IconButton — maps to .fb-iconbtn class hooks. */
export function IconButton({
  size = 'md',
  solid,
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const cls = [
    'fb-iconbtn',
    size !== 'md' && `fb-iconbtn--${size}`,
    solid && 'fb-iconbtn--solid',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  )
}
