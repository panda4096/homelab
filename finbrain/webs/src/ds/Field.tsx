import type { ReactNode } from 'react'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}

/** Label + control + hint/error stack — maps to .fb-field class hooks. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const cls = ['fb-field', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {label ? <label className="fb-field__label">{label}</label> : null}
      {children}
      {error ? (
        <span className="fb-field__hint fb-field__hint--error">{error}</span>
      ) : hint ? (
        <span className="fb-field__hint">{hint}</span>
      ) : null}
    </div>
  )
}
