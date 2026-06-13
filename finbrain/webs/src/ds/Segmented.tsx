type Size = 'sm' | 'md'

export interface SegmentedOption {
  value: string
  label: string
  accent?: boolean
}

export interface SegmentedProps {
  options: Array<string | SegmentedOption>
  value: string
  onChange: (value: string) => void
  size?: Size
  className?: string
}

function normalize(opt: string | SegmentedOption): SegmentedOption {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt
}

/** Faithful port of the design's Segmented — maps to .fb-segmented class hooks. */
export function Segmented({ options, value, onChange, size = 'md', className }: SegmentedProps) {
  const cls = ['fb-segmented', size === 'sm' && 'fb-segmented--sm', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} role="tablist">
      {options.map((raw) => {
        const opt = normalize(raw)
        const active = opt.value === value
        const optCls = [
          'fb-segmented__opt',
          active && 'fb-segmented__opt--active',
          active && opt.accent && 'fb-segmented__opt--accent',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={optCls}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
