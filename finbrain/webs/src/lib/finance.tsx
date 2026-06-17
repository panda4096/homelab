import { useId, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
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
  tooltipDelta = false,
  tooltipRows,
  baseline,
}: {
  series: LineSeriesPoint[]
  benchmarks?: LineBenchmark[]
  height?: number
  yFmt?: (v: number) => string
  /** show a "vs 区间首日 ±x%" line in the hover tooltip (used by the price chart) */
  tooltipDelta?: boolean
  /** draw a labelled horizontal reference line at this value (e.g. 100 = the rebase/excess 0% baseline) */
  baseline?: number
  /** rich multi-line hover tooltip: given the hovered date, return a caption + one row per
   *  visible line. When rows is non-empty it replaces the default single-value tooltip. */
  tooltipRows?: (date: string) => { caption?: string; rows: { label: string; value: string; color: string; valueColor?: string }[] }
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

  // Map each date to the subject's x-grid index so benchmark lines/dots are placed BY DATE, not
  // by their own (possibly shorter) length — otherwise a benchmark missing early data gets
  // stretched across the full width and detaches from the subject's crosshair.
  const dateIndex = new Map(data.map((p, i) => [p.m, i] as const))

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
  // Adaptive tick density: ~one label per 90px of plot width, 2–7 ticks.
  const tickCount = Math.min(7, Math.max(2, Math.floor(iw / 90)))
  const xTicks = Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (data.length - 1)))
        .filter((i) => i >= 0 && i < data.length),
    ),
  )
  const hoverPoint = hover == null ? null : data[hover]
  const hoverPct = hoverPoint && data[0].v ? (hoverPoint.v - data[0].v) / data[0].v : 0

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
      {baseline != null && baseline > min && baseline < max ? (
        <g>
          <line x1={padL} y1={y(baseline)} x2={width - padR} y2={y(baseline)} stroke="var(--text-tertiary)" strokeDasharray="2 3" opacity="0.55" />
          <text x={width - padR} y={y(baseline) - 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-tertiary)">
            0%
          </text>
        </g>
      ) : null}
      <path d={area} fill={`url(#${gradientId})`} />
      {benchmarkSeries.map((b, bi) => {
        const d = b.series
          .filter((p) => dateIndex.has(p.m))
          .map((p, i) => `${i ? 'L' : 'M'}${x(dateIndex.get(p.m)!).toFixed(1)} ${y(p.v).toFixed(1)}`)
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
          {/* project the hovered value onto the y-axis: dashed guide + value chip */}
          <line
            x1={padL}
            y1={y(hoverPoint.v)}
            x2={x(hover)}
            y2={y(hoverPoint.v)}
            stroke="var(--border-strong)"
            strokeDasharray="3 3"
            opacity="0.7"
          />
          <g transform={`translate(0, ${y(hoverPoint.v)})`}>
            <rect x="2" y="-8" width={padL - 6} height="16" rx="3" fill="var(--accent)" />
            <text x={padL - 7} y="3.5" textAnchor="end" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--accent-text)">
              {fmt(hoverPoint.v)}
            </text>
          </g>
          {benchmarkSeries.map((b, bi) => {
            const bp = b.series.find((p) => p.m === hoverPoint.m)
            if (!bp) return null
            return (
              <circle
                key={b.name}
                cx={x(hover)}
                cy={y(bp.v)}
                r="3"
                fill={b.color ?? VIZ[(bi + 1) % VIZ.length]}
                stroke="var(--surface-base)"
                strokeWidth="1.5"
              />
            )
          })}
          <circle
            cx={x(hover)}
            cy={y(hoverPoint.v)}
            r="4"
            fill="var(--accent-bright)"
            stroke="var(--surface-base)"
            strokeWidth="2"
          />
          {(() => {
            const content = tooltipRows?.(hoverPoint.m)
            const rows = content?.rows ?? []
            if (rows.length > 0) {
              const caption = content?.caption
              const firstRowY = caption ? 47 : 31
              const tw = 238
              const th = firstRowY + rows.length * 16 - 2
              const tx = x(hover) + 12 + tw > width - padR ? x(hover) - tw - 12 : x(hover) + 12
              return (
                <g transform={`translate(${tx}, ${padT + 6})`}>
                  <rect width={tw} height={th} rx="6" fill="var(--surface-overlay)" stroke="var(--border-default)" />
                  <text x="12" y="17" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--text-tertiary)">{hoverPoint.m}</text>
                  {caption ? <text x="12" y="32" fontFamily="var(--font-sans)" fontSize="9.5" fill="var(--text-tertiary)">{caption}</text> : null}
                  {rows.map((r, ri) => (
                    <g key={ri} transform={`translate(0, ${firstRowY + ri * 16})`}>
                      <circle cx="16" cy="-3.2" r="3.2" fill={r.color} />
                      <text x="25" y="0" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--text-secondary)">{r.label.length > 12 ? `${r.label.slice(0, 11)}…` : r.label}</text>
                      <text x={tw - 12} y="0" textAnchor="end" fontFamily="var(--font-num)" fontSize="10.5" fontWeight="600" fill={r.valueColor ?? 'var(--text-strong)'}>{r.value}</text>
                    </g>
                  ))}
                </g>
              )
            }
            return (
              <g transform={`translate(${Math.min(x(hover) + 8, width - 132)}, ${padT + 6})`}>
                <rect width="124" height={tooltipDelta ? 58 : 42} rx="6" fill="var(--surface-overlay)" stroke="var(--border-default)" />
                <text x="9" y="16" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--text-tertiary)">{hoverPoint.m}</text>
                <text x="9" y="32" fontFamily="var(--font-num)" fontSize="12.5" fontWeight="600" fill="var(--text-strong)">{fmt(hoverPoint.v)}</text>
                {tooltipDelta ? (
                  <text
                    x="9"
                    y="49"
                    fontFamily="var(--font-num)"
                    fontSize="10.5"
                    fontWeight="600"
                    fill={hoverPct > 0 ? 'var(--gain)' : hoverPct < 0 ? 'var(--loss)' : 'var(--text-tertiary)'}
                  >
                    {hoverPct >= 0 ? '+' : ''}{(hoverPct * 100).toFixed(2)}% · 区间
                  </text>
                ) : null}
              </g>
            )
          })()}
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
  legendPlacement = 'auto',
}: {
  items: DonutItem[]
  centerLabel: string
  centerSub: string
  size?: number
  thickness?: number
  legendPlacement?: 'auto' | 'side' | 'bottom'
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
  const legendNameWidth = Math.min(260, Math.max(34, ...segs.map((s) => approxLegendTextWidth(s.name))))
  const legendWidth = 8 + 8 + legendNameWidth + 8 + 46
  const sideLegend = legendPlacement === 'side' || (legendPlacement === 'auto' && segs.length <= 4 && legendNameWidth <= 90)
  const bottomColumns = !sideLegend && legendWidth <= 280 && segs.length > 3 ? 2 : 1
  return (
    <div style={{ display: 'flex', flexDirection: sideLegend ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: sideLegend ? 24 : 16 }}>
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
        >
          {centerSub}
        </text>
      </svg>
      <div
        style={sideLegend
          ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: '0 1 auto', width: legendWidth, maxWidth: '100%' }
          : {
            display: 'grid',
            gridTemplateColumns: `repeat(${bottomColumns}, minmax(0, ${legendWidth}px))`,
            justifyContent: 'center',
            columnGap: 24,
            rowGap: 8,
            minWidth: 0,
            maxWidth: '100%',
          }}
      >
        {segs.map((s) => (
          <div
            key={s.key}
            style={{
              display: 'grid',
              gridTemplateColumns: `8px minmax(0, ${legendNameWidth}px) 46px`,
              columnGap: 8,
              alignItems: 'center',
              fontSize: 12,
              width: '100%',
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

function approxLegendTextWidth(text: string) {
  return [...text].reduce((sum, ch) => {
    if (/[\u3400-\u9fff]/.test(ch)) return sum + 13.5
    if (/[A-Z0-9]/.test(ch)) return sum + 8.4
    return sum + 7
  }, 0) + 12
}

export interface SankeyNodeInput {
  id: string
  label: string
  column: number
  color?: string
}

export interface SankeyLinkInput {
  source: string
  target: string
  value: number
  color?: string
}

export interface SankeyGeomNode extends SankeyNodeInput {
  value: number
  order: number
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface SankeyGeomLink {
  source: string
  target: string
  value: number
  color: string
  width: number
  /** ribbon endpoints: (sx,sy) on the source edge, (tx,ty) on the target edge */
  sx: number
  sy: number
  tx: number
  ty: number
  bend: number
}

export interface SankeyLayout {
  nodes: SankeyGeomNode[]
  links: SankeyGeomLink[]
}

export interface SankeyLayoutOpts {
  /** left x of a column's node rect */
  columnX: (column: number) => number
  nodeW: number
  gap: number
  /** top y of the drawable band */
  top: number
  /** usable vertical height of the band */
  available: number
}

type SankeyWorkNode = SankeyGeomNode & { sourceCursor: number; targetCursor: number; height: number }

export function SankeyChart({
  nodes,
  links,
  height = 320,
  columnLabels = [],
  formatValue,
  showValues = true,
}: {
  nodes: SankeyNodeInput[]
  links: SankeyLinkInput[]
  height?: number
  columnLabels?: string[]
  formatValue?: (value: number) => string
  showValues?: boolean
}) {
  const [hover, setHover] = useState<string | null>(null)
  const width = 980
  const nodeW = 14
  const padX = 26
  const padTop = columnLabels.length ? 42 : 24
  const padBottom = 24
  const gap = 14
  const maxColumn = useMemo(() => Math.max(0, ...nodes.map((n) => n.column)), [nodes])
  const layout = useMemo(
    () =>
      computeSankeyLayout(nodes, links, {
        columnX: (column) => sankeyColumnX(column, maxColumn, width, padX, nodeW),
        nodeW,
        gap,
        top: padTop,
        available: Math.max(80, height - padTop - padBottom),
      }),
    [nodes, links, maxColumn, height, padTop],
  )

  if (!layout.nodes.length || !layout.links.length) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        暂无可展示的流向数据
      </div>
    )
  }

  const nameOf = new Map(layout.nodes.map((n) => [n.id, n.label]))
  const labelFor = (id: string) => nameOf.get(id) ?? id

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={columnLabels.length ? `${columnLabels.join(' → ')} 桑基图` : '桑基图'}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {columnLabels.map((label, column) => {
        const x = sankeyColumnX(column, maxColumn, width, padX, nodeW)
        return (
          <text
            key={label}
            x={column === maxColumn ? x + nodeW : x}
            y={18}
            textAnchor={column === maxColumn ? 'end' : 'start'}
            fontSize="11"
            fontWeight="600"
            fill="var(--text-tertiary)"
          >
            {label}
          </text>
        )
      })}
      <g fill="none">
        {layout.links.map((link, index) => {
          const active = hover == null || hover === link.source || hover === link.target
          return (
            <path
              key={`${link.source}-${link.target}-${index}`}
              d={sankeyLinkPath(link)}
              stroke={link.color}
              strokeWidth={link.width}
              strokeOpacity={active ? 0.3 : 0.08}
              strokeLinecap="butt"
              onMouseEnter={() => setHover(link.source)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-opacity .16s' }}
            >
              <title>
                {showValues
                  ? `${labelFor(link.source)} → ${labelFor(link.target)} · ${formatValue?.(link.value) ?? link.value.toLocaleString()}`
                  : `${labelFor(link.source)} → ${labelFor(link.target)}`}
              </title>
            </path>
          )
        })}
      </g>
      <g>
        {layout.nodes.map((node) => {
          const active = hover == null || hover === node.id
          const labelSide = node.column === maxColumn ? 'left' : 'right'
          const labelX = labelSide === 'left' ? node.x0 - 8 : node.x1 + 8
          const valueText = formatValue?.(node.value) ?? node.value.toLocaleString()
          const label = trimSankeyLabel(node.label, node.column === maxColumn ? 20 : 15)
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}
              style={{ opacity: active ? 1 : 0.38, transition: 'opacity .16s' }}
            >
              <rect
                x={node.x0}
                y={node.y0}
                width={nodeW}
                height={node.y1 - node.y0}
                rx={4}
                fill={node.color ?? VIZ[node.order % VIZ.length]}
              >
                <title>{showValues ? `${node.label} · ${valueText}` : node.label}</title>
              </rect>
              <text
                x={labelX}
                y={(node.y0 + node.y1) / 2 - (showValues && node.y1 - node.y0 > 28 ? 6 : 0)}
                textAnchor={labelSide === 'left' ? 'end' : 'start'}
                fontSize="11.5"
                fontWeight="500"
                fill="var(--text-secondary)"
              >
                {label}
              </text>
              {showValues && node.y1 - node.y0 > 28 ? (
                <text
                  x={labelX}
                  y={(node.y0 + node.y1) / 2 + 9}
                  textAnchor={labelSide === 'left' ? 'end' : 'start'}
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                  fill="var(--text-tertiary)"
                >
                  {valueText}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// px floors applied at LAYOUT time so the packing cursor stays consistent with the
// rendered stroke/rect. (Mixing an unclamped cursor with a clamped stroke makes
// adjacent thin ribbons overlap; flooring the band keeps ribbons from spilling out.)
const SANKEY_MIN_LINK = 1
const SANKEY_MIN_NODE = 3

// Render-agnostic Sankey geometry shared by the SVG <SankeyChart> and the canvas
// share-image renderer — single source of truth for the layout math.
export function computeSankeyLayout(
  nodes: SankeyNodeInput[],
  links: SankeyLinkInput[],
  opts: SankeyLayoutOpts,
): SankeyLayout {
  const { columnX, nodeW, gap, top, available } = opts
  const inputByID = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const safeLinks = links.filter(
    (l) => l.value > 0 && Number.isFinite(l.value) && inputByID.has(l.source) && inputByID.has(l.target),
  )
  for (const link of safeLinks) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value)
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + link.value)
  }

  const layoutNodes: SankeyWorkNode[] = nodes
    .map((node, index) => ({
      ...node,
      value: Math.max(incoming.get(node.id) ?? 0, outgoing.get(node.id) ?? 0),
      order: index,
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 0,
      sourceCursor: 0,
      targetCursor: 0,
      height: 0,
    }))
    .filter((n) => n.value > 0)

  const byID = new Map<string, SankeyWorkNode>(layoutNodes.map((n) => [n.id, n]))
  const columns = new Map<number, SankeyWorkNode[]>()
  for (const node of layoutNodes) {
    const list = columns.get(node.column) ?? []
    list.push(node)
    columns.set(node.column, list)
  }

  // Cap each column's gap so a crowded column can never drive (available - gaps)
  // negative and collapse the whole diagram to hairlines.
  const colGap = (count: number) => (count > 1 ? Math.min(gap, available / (2 * count)) : 0)

  // Per-node incoming/outgoing link VALUES — a node's band must hold its larger side's
  // stacked ribbon widths, and each ribbon is floored, so band height is non-linear in scale.
  const inLinks = new Map<string, number[]>()
  const outLinks = new Map<string, number[]>()
  for (const link of safeLinks) {
    if (!outLinks.has(link.source)) outLinks.set(link.source, [])
    if (!inLinks.has(link.target)) inLinks.set(link.target, [])
    outLinks.get(link.source)!.push(link.value)
    inLinks.get(link.target)!.push(link.value)
  }
  const sideStack = (vals: number[] | undefined, s: number) =>
    (vals ?? []).reduce((sum, v) => sum + Math.max(SANKEY_MIN_LINK, v * s), 0)
  const nodeHeightAt = (id: string, s: number) =>
    Math.max(SANKEY_MIN_NODE, sideStack(inLinks.get(id), s), sideStack(outLinks.get(id), s))
  const columnUsed = (col: SankeyWorkNode[], s: number) =>
    col.reduce((sum, n) => sum + nodeHeightAt(n.id, s), 0) + Math.max(0, col.length - 1) * colGap(col.length)

  // One scale across all columns (flow conservation): start from the continuous model
  // (raw values), then shrink until every column fits AFTER flooring — the MIN_NODE/MIN_LINK
  // floors add height the raw scale never budgeted for. This handles all realistic inputs.
  const rawScales = [...columns.values()]
    .filter((col) => col.length > 0)
    .map((col) => {
      const total = col.reduce((sum, n) => sum + n.value, 0)
      const usable = Math.max(1, available - colGap(col.length) * Math.max(0, col.length - 1))
      return total > 0 ? Math.max(0.0001, usable / total) : 1
    })
  let scale = rawScales.length ? Math.max(0.0001, Math.min(...rawScales)) : 1
  for (let iter = 0; iter < 16; iter++) {
    let worst = 1
    for (const col of columns.values()) {
      if (!col.length) continue
      const used = columnUsed(col, scale)
      if (used > available + 0.5) worst = Math.max(worst, used / available)
    }
    if (worst <= 1.0001) break
    scale /= worst
  }

  // The floors put a scale-independent lower bound on a column's height, so shrinking
  // `scale` alone cannot fit a column with very many nodes (e.g. 40+ institutions).
  // Apply one global compression so the densest column fits the band exactly; every
  // ribbon/node scales by the same `fit` so conservation holds. fit === 1 (no-op) for
  // all inputs the loop above already fit.
  let fit = 1
  for (const col of columns.values()) {
    if (!col.length) continue
    const sumH = col.reduce((sum, n) => sum + nodeHeightAt(n.id, scale), 0)
    const gaps = Math.max(0, col.length - 1) * colGap(col.length)
    if (sumH > 0) fit = Math.min(fit, (available - gaps) / sumH)
  }
  fit = Math.max(0.0001, Math.min(1, fit))

  const linkWidth = (value: number) => Math.max(SANKEY_MIN_LINK, value * scale) * fit

  for (const [column, col] of columns) {
    col.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    const g = colGap(col.length)
    for (const n of col) n.height = nodeHeightAt(n.id, scale) * fit
    const used = col.reduce((sum, n) => sum + n.height, 0) + Math.max(0, col.length - 1) * g
    let y = top + Math.max(0, (available - used) / 2)
    const x = columnX(column)
    col.forEach((node, index) => {
      node.order = index
      node.x0 = x
      node.x1 = x + nodeW
      node.y0 = y
      node.y1 = y + node.height
      // Center each side's ribbon stack within the band so a thin feed attaches at the
      // node's vertical center rather than top-aligning (no off-center gap, no overlap).
      node.sourceCursor = y + Math.max(0, (node.height - sideStack(outLinks.get(node.id), scale) * fit) / 2)
      node.targetCursor = y + Math.max(0, (node.height - sideStack(inLinks.get(node.id), scale) * fit) / 2)
      y += node.height + g
    })
  }

  const layoutLinks: SankeyGeomLink[] = safeLinks
    .slice()
    .sort((a, b) => {
      const sa = byID.get(a.source)!
      const sb = byID.get(b.source)!
      const ta = byID.get(a.target)!
      const tb = byID.get(b.target)!
      return sa.column - sb.column || sa.y0 - sb.y0 || ta.y0 - tb.y0
    })
    .map((link) => {
      const source = byID.get(link.source)!
      const target = byID.get(link.target)!
      const w = linkWidth(link.value)
      const sy = source.sourceCursor + w / 2
      const ty = target.targetCursor + w / 2
      source.sourceCursor += w
      target.targetCursor += w
      const sx = source.x1
      const tx = target.x0
      return {
        source: link.source,
        target: link.target,
        value: link.value,
        width: w,
        sx,
        sy,
        tx,
        ty,
        bend: Math.max(44, Math.abs(tx - sx) * 0.54),
        color: link.color ?? source.color ?? VIZ[source.order % VIZ.length],
      }
    })

  return { nodes: layoutNodes, links: layoutLinks }
}

export function sankeyColumnX(column: number, maxColumn: number, width: number, padX: number, nodeW: number) {
  if (maxColumn <= 0) return padX
  return padX + ((width - padX * 2 - nodeW) * column) / maxColumn
}

export function sankeyLinkPath(link: SankeyGeomLink) {
  return `M${link.sx.toFixed(1)} ${link.sy.toFixed(1)} C${(link.sx + link.bend).toFixed(1)} ${link.sy.toFixed(1)} ${(link.tx - link.bend).toFixed(1)} ${link.ty.toFixed(1)} ${link.tx.toFixed(1)} ${link.ty.toFixed(1)}`
}

export function trimSankeyLabel(label: string, maxUnits: number) {
  let units = 0
  let out = ''
  for (const ch of Array.from(label)) {
    units += /[\u3400-\u9fff]/.test(ch) ? 1.35 : 1
    if (units > maxUnits) return `${out}…`
    out += ch
  }
  return out
}

export function shortMoney(value: string | number | null | undefined, currency: string) {
  const n = num(value)
  if (n == null) return '—'
  const parts = displayNumber(n, true, n === 0 ? 0 : undefined)
  const sign = n < 0 ? '−' : ''
  return `${sign}${SYM[currency] || currency}${parts.value}${parts.suffix}`
}
