import { useState, type CSSProperties, type ReactNode } from 'react'
import { SYM } from './format'

export const VIZ = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
  'var(--viz-7)',
  'var(--viz-8)',
] as const

export function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function displayNumber(n: number, compact?: boolean, decimals?: number) {
  const abs = Math.abs(n)
  if (compact && abs >= 10_000) {
    const v = abs / 10_000
    const max = decimals ?? (v >= 100 ? 1 : 2)
    const min = decimals ?? (v >= 100 ? 0 : 1)
    return {
      value: v.toLocaleString(undefined, {
        maximumFractionDigits: max,
        minimumFractionDigits: Math.min(min, max),
      }),
      suffix: '万',
    }
  }
  return {
    value: abs.toLocaleString(undefined, {
      maximumFractionDigits: decimals ?? 2,
      minimumFractionDigits: decimals ?? 0,
    }),
    suffix: '',
  }
}

export function CurrencyValue({
  value,
  currency,
  hero,
  compact,
  size,
  signed,
  decimals,
  style,
}: {
  value: string | number | null | undefined
  currency: string
  hero?: boolean
  compact?: boolean
  size?: string
  signed?: boolean
  decimals?: number
  style?: CSSProperties
}) {
  const n = num(value)
  if (n == null) {
    return <span style={{ color: 'var(--text-tertiary)', ...style }}>—</span>
  }
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  const parts = displayNumber(n, compact, decimals)
  const cls = ['fb-metric', hero && 'fb-metric--hero'].filter(Boolean).join(' ')
  return (
    <span className={cls} style={{ fontSize: size, ...style }}>
      {sign}
      <span className="fb-metric__ccy">{SYM[currency] || currency}</span>
      {parts.value}
      {parts.suffix ? (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.62em', marginLeft: 2 }}>
          {parts.suffix}
        </span>
      ) : null}
    </span>
  )
}

export function DeltaValue({
  value,
  percent,
  pill,
}: {
  value?: string | number | null
  percent?: string | number | null
  pill?: boolean
}) {
  const base = percent != null ? num(percent) : num(value)
  const tone = base == null || base === 0 ? 'flat' : base > 0 ? 'up' : 'down'
  const cls = ['fb-delta', `fb-delta--${tone}`, pill && 'fb-delta--pill'].filter(Boolean).join(' ')
  const sign = base != null && base > 0 ? '+' : base != null && base < 0 ? '−' : ''
  const body =
    percent != null
      ? `${sign}${Math.abs(base ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
      : `${sign}${Math.abs(base ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  return (
    <span className={cls}>
      {tone === 'up' ? <span className="fb-delta__arrow">▲</span> : null}
      {tone === 'down' ? <span className="fb-delta__arrow">▼</span> : null}
      {body}
    </span>
  )
}

export function StatCard({
  label,
  value,
  currency,
  raw,
  deltaPercent,
  caption,
  compact,
}: {
  label: ReactNode
  value?: string | number | null
  currency?: string
  raw?: ReactNode
  deltaPercent?: string | number | null
  caption?: ReactNode
  compact?: boolean
}) {
  return (
    <div className="fb-stat">
      <div className="fb-stat__label">{label}</div>
      <div className="fb-stat__value">
        {raw ?? (
          <CurrencyValue
            value={value}
            currency={currency ?? ''}
            compact={compact}
            size="var(--text-3xl)"
          />
        )}
      </div>
      {deltaPercent != null || caption ? (
        <div className="fb-stat__foot">
          {deltaPercent != null ? <DeltaValue percent={deltaPercent} pill /> : null}
          {caption ? <span>{caption}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

export function Tag({
  children,
  active,
  clickable,
  dotColor,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  clickable?: boolean
  dotColor?: string
  onClick?: () => void
}) {
  const cls = ['fb-tag', clickable && 'fb-tag--clickable', active && 'fb-tag--active']
    .filter(Boolean)
    .join(' ')
  if (clickable) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {dotColor ? <span className="fb-tag__dot" style={{ background: dotColor }} /> : null}
        {children}
      </button>
    )
  }
  return (
    <span className={cls}>
      {dotColor ? <span className="fb-tag__dot" style={{ background: dotColor }} /> : null}
      {children}
    </span>
  )
}

export function Sparkline({
  data,
  width = 120,
  height = 34,
  tone = 'auto',
}: {
  data: number[]
  width?: number
  height?: number
  tone?: 'auto' | 'accent'
}) {
  if (data.length < 2) {
    return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const x = (i: number) => (i / (data.length - 1)) * width
  const y = (v: number) => height - ((v - min) / span) * (height - 4) - 2
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const up = data[data.length - 1] >= data[0]
  const color = tone === 'accent' ? 'var(--accent)' : up ? 'var(--gain)' : 'var(--loss)'
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function polar(cx: number, cy: number, r: number, a: number) {
  const rad = ((a - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

export interface DonutItem {
  key: string
  name: string
  value: number
  color: string
}

export function Donut({
  items,
  centerLabel,
  centerSub,
  size = 132,
  thickness = 14,
}: {
  items: DonutItem[]
  centerLabel: string
  centerSub: string
  size?: number
  thickness?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = items.reduce((s, it) => s + Math.max(0, it.value), 0) || 1
  const cx = size / 2
  const cy = size / 2
  const r = (size - thickness) / 2
  let a = 0
  const segs = items.map((it, i) => {
    const sweep = (Math.max(0, it.value) / total) * 360
    const seg = { ...it, a0: a + 1, a1: a + sweep - 1, i }
    a += sweep
    return seg
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg width={size} height={size} style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={thickness} />
        {segs.map((s) => (
          <path
            key={s.key}
            d={arc(cx, cy, r, s.a0, s.a1)}
            fill="none"
            stroke={s.color}
            strokeWidth={hover === s.i ? thickness + 3 : thickness}
            strokeLinecap="round"
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            style={{
              transition: 'stroke-width .15s',
              cursor: 'default',
              opacity: hover == null || hover === s.i ? 1 : 0.4,
            }}
          />
        ))}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontFamily="var(--font-num)"
          fontSize="17"
          fontWeight="600"
          fill="var(--text-strong)"
        >
          {centerLabel}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="9.5"
          fill="var(--text-tertiary)"
          letterSpacing="0.06em"
        >
          {centerSub}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, flex: 1 }}>
        {segs.map((s) => (
          <div
            key={s.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              opacity: hover == null || hover === s.i ? 1 : 0.45,
              transition: 'opacity .15s',
            }}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: 'none' }} />
            <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.name}
            </span>
            <span className="fb-num" style={{ marginLeft: 'auto', color: 'var(--text-primary)', paddingLeft: 14 }}>
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function shortMoney(value: string | number | null | undefined, currency: string) {
  const n = num(value)
  if (n == null) return '—'
  const parts = displayNumber(n, true, n === 0 ? 0 : undefined)
  const sign = n < 0 ? '−' : ''
  return `${sign}${SYM[currency] || currency}${parts.value}${parts.suffix}`
}
