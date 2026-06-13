import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** right-align + tabular numerals for money/quantity inputs */
  numeric?: boolean
  /** error state styling for the wrapper */
  invalid?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
  iconLeft?: ReactNode
  size?: 'sm' | 'md'
  wrapClassName?: string
}

/** Text input shell — maps to .fb-input-wrap / .fb-input class hooks. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { numeric, invalid, prefix, suffix, iconLeft, size = 'md', className, wrapClassName, ...rest },
  ref,
) {
  const wrapCls = [
    'fb-input-wrap',
    size === 'sm' && 'fb-input-wrap--sm',
    invalid && 'fb-input-wrap--error',
    rest.disabled && 'fb-input-wrap--disabled',
    wrapClassName,
  ]
    .filter(Boolean)
    .join(' ')
  const inputCls = ['fb-input', numeric && 'fb-input--num', className].filter(Boolean).join(' ')
  return (
    <div className={wrapCls}>
      {iconLeft ? <span className="fb-input__icon">{iconLeft}</span> : null}
      {prefix ? <span className="fb-input__affix">{prefix}</span> : null}
      <input ref={ref} className={inputCls} {...rest} />
      {suffix ? <span className="fb-input__affix">{suffix}</span> : null}
    </div>
  )
})
