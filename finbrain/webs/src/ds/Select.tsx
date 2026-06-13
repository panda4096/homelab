import { forwardRef, type SelectHTMLAttributes } from 'react'
import { Icon } from './Icon'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[]
  size?: 'sm' | 'md'
  /** optional placeholder rendered as a disabled first option */
  placeholder?: string
  wrapStyle?: React.CSSProperties
}

/** Native <select> with a chevron — maps to .fb-select class hooks. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, size = 'md', placeholder, className, wrapStyle, value, ...rest },
  ref,
) {
  const cls = ['fb-select', size === 'sm' && 'fb-select--sm', className].filter(Boolean).join(' ')
  return (
    <div className="fb-select-wrap" style={{ display: 'flex', width: '100%', ...wrapStyle }}>
      <select ref={ref} className={cls} value={value} {...rest}>
        {placeholder != null ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="fb-select-wrap__chevron">
        <Icon name="chevron-down" size={14} />
      </span>
    </div>
  )
})
