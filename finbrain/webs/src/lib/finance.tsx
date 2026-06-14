import { useId, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
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

export interface LineSeriesPoint {
  m: string
  v: number
}

export interface LineBenchmark {
  name: string
  series: LineSeriesPoint[]
  color?: string
}

export function LineChart({
  series,
  benchmarks = [],
  height = 240,
  yFmt,
}: {
  series: LineSeriesPoint[]
  benchmarks?: LineBenchmark[]
  height?: number
  yFmt?: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = `lineArea${useId().replace(/:/g, '')}`
  const width = 720
  const padL = 56
  const padR = 18
  const padT = 16
  const padB = 28
  const iw = width - padL - padR
  const ih = height - padT - padB
  const data = series.filter((p) => Number.isFinite(p.v))

  if (data.length < 2) {
    return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  }

  const benchmarkSeries = benchmarks
    .map((b) => ({
      ...b,
      series: b.series.filter((p) => Number.isFinite(p.v)),
    }))
    .filter((b) => b.series.length >= 2)
  const allValues = [
    ...data.map((d) => d.v),
    ...benchmarkSeries.flatMap((b) => b.series.map((d) => d.v)),
  ]
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const padding = Math.max(Math.abs(rawMax - rawMin) * 0.08, Math.abs(rawMax) * 0.01, 1)
  const min = rawMin === rawMax ? rawMin - padding : rawMin - padding
  const max = rawMin === rawMax ? rawMax + padding : rawMax + padding
  const span = max - min || 1
  const fmt = yFmt ?? ((v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }))
  const x = (i: number, count = data.length) => padL + (count <= 1 ? 0 : (i / (count - 1)) * iw)
  const y = (v: number) => padT + ih - ((v - min) / span) * ih
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.v).toFixed(1)}`).join(' ')
  const area = `${path} L${x(data.length - 1).toFixed(1)} ${padT + ih} L${padL} ${padT + ih} Z`
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    t,
    v: min + span * (1 - t),
    y: padT + ih * t,
  }))
  const xTicks = Array.from(
    new Set(
      [0, 0.33, 0.66, 1]
        .map((t) => Math.round(t * (data.length - 1)))
        .filter((i) => i >= 0 && i < data.length),
    ),
  )
  const hoverPoint = hover == null ? null : data[hover]

  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const svgX = ratio * width
    if (svgX < padL || svgX > width - padR) {
      setHover(null)
      return
    }
    const next = Math.round(((svgX - padL) / iw) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, next)))
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="历史走势折线图"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridY.map((g) => (
        <g key={g.t}>
          <line x1={padL} y1={g.y} x2={width - padR} y2={g.y} stroke="var(--border-subtle)" />
          <text
            x={padL - 8}
            y={g.y + 3}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize="9.5"
            fill="var(--text-tertiary)"
          >
            {fmt(g.v)}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      {benchmarkSeries.map((b, bi) => {
        const d = b.series
          .map((p, i) => `${i ? 'L' : 'M'}${x(i, b.series.length).toFixed(1)} ${y(p.v).toFixed(1)}`)
          .join(' ')
        return (
          <path
            key={b.name}
            d={d}
            fill="none"
            stroke={b.color ?? VIZ[(bi + 1) % VIZ.length]}
            strokeWidth="1.4"
            strokeDasharray="4 3"
            opacity="0.7"
          />
        )
      })}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {hover != null && hoverPoint ? (
        <g>
          <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + ih} stroke="var(--border-strong)" />
          <circle
            cx={x(hover)}
            cy={y(hoverPoint.v)}
            r="4"
            fill="var(--accent-bright)"
            stroke="var(--surface-base)"
            strokeWidth="2"
          />
          <g transform={`translate(${Math.min(x(hover) + 8, width - 132)}, ${padT + 6})`}>
            <rect width="124" height="42" rx="6" fill="var(--surface-overlay)" stroke="var(--border-default)" />
            <text x="9" y="16" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--text-tertiary)">
              {hoverPoint.m}
            </text>
            <text x="9" y="32" fontFamily="var(--font-num)" fontSize="12.5" fontWeight="600" fill="var(--text-strong)">
              {fmt(hoverPoint.v)}
            </text>
          </g>
        </g>
      ) : null}
      {xTicks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 9}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fill="var(--text-tertiary)"
        >
          {data[i].m.slice(5)}
        </text>
      ))}
    </svg>
  )
}

function polar(cx: number, cy: number, r: number, a: number) {
  const rad = ((a - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function ringSegmentPath(cx: number, cy: number, outerR: number, innerR: number, a0: number, a1: number) {
  const [x0o, y0o] = polar(cx, cy, outerR, a0)
  const [x1o, y1o] = polar(cx, cy, outerR, a1)
  const [x1i, y1i] = polar(cx, cy, innerR, a1)
  const [x0i, y0i] = polar(cx, cy, innerR, a0)
  const large = a1 - a0 > 180 ? 1 : 0
  return [
    `M${x0o} ${y0o}`,
    `A${outerR} ${outerR} 0 ${large} 1 ${x1o} ${y1o}`,
    `L${x1i} ${y1i}`,
    `A${innerR} ${innerR} 0 ${large} 0 ${x0i} ${y0i}`,
    'Z',
  ].join(' ')
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
  const outerR = size / 2 - 1
  const innerR = Math.max(outerR - thickness, 1)
  const midR = innerR + thickness / 2
  const gapDeg = items.length > 1 ? 1.6 : 0
  let a = 0
  const segs = items.map((it, i) => {
    const sweep = (Math.max(0, it.value) / total) * 360
    const gap = Math.min(gapDeg, sweep * 0.4)
    const a0 = a + gap / 2
    const a1 = a + sweep - gap / 2
    const full = sweep >= 359.5
    const seg = {
      ...it,
      d: full ? '' : ringSegmentPath(cx, cy, outerR, innerR, a0, a1),
      full,
      i,
    }
    a += sweep
    return seg
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg width={size} height={size} style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={midR} fill="none" stroke="var(--surface-inset)" strokeWidth={thickness} />
        {segs.map((s) =>
          s.full ? (
            <circle
              key={s.key}
              cx={cx}
              cy={cy}
              r={midR}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
              style={{
                cursor: 'default',
                opacity: hover == null || hover === s.i ? 1 : 0.4,
                transition: 'opacity .15s',
              }}
            />
          ) : (
            <path
              key={s.key}
              d={s.d}
              fill={s.color}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
              style={{
                cursor: 'default',
                opacity: hover == null || hover === s.i ? 1 : 0.4,
                transition: 'opacity .15s',
              }}
            />
          ),
        )}
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7, minWidth: 0, flex: '0 1 320px' }}>
        {segs.map((s) => (
          <div
            key={s.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '8px minmax(0, 1fr) 46px',
              columnGap: 8,
              alignItems: 'center',
              fontSize: 12,
              width: 'min(100%, 300px)',
              opacity: hover == null || hover === s.i ? 1 : 0.45,
              transition: 'opacity .15s',
            }}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </span>
            <span className="fb-num" style={{ color: 'var(--text-primary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
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
