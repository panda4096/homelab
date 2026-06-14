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
          letterSpacing="0.06em"
        >
          {centerSub}
        </text>
      </svg>
      <div
        style={sideLegend
          ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: '0 1 auto', width: legendWidth, maxWidth: '100%' }
          : {
            display: 'grid',
            gridTemplateColumns: `repeat(${bottomColumns}, ${legendWidth}px)`,
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

interface SankeyLayoutNode extends SankeyNodeInput {
  value: number
  x0: number
  x1: number
  y0: number
  y1: number
  order: number
  sourceCursor: number
  targetCursor: number
}

interface SankeyLayoutLink extends SankeyLinkInput {
  d: string
  width: number
  sourceY: number
  targetY: number
  color: string
}

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
  const maxColumn = Math.max(0, ...nodes.map((n) => n.column))
  const layout = layoutSankey(nodes, links, {
    width,
    height,
    nodeW,
    padX,
    padTop,
    padBottom,
    gap,
    maxColumn,
  })

  if (!layout.nodes.length || !layout.links.length) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        暂无可展示的流向数据
      </div>
    )
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="资产结构桑基图" style={{ display: 'block', overflow: 'visible' }}>
      {columnLabels.map((label, column) => {
        const x = xForSankeyColumn(column, maxColumn, width, padX, nodeW)
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
              d={link.d}
              stroke={link.color}
              strokeWidth={Math.max(1.4, link.width)}
              strokeOpacity={active ? 0.3 : 0.08}
              strokeLinecap="butt"
              onMouseEnter={() => setHover(link.source)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-opacity .16s' }}
            >
              <title>
                {showValues
                  ? `${nodeLabel(layout.nodesByID, link.source)} → ${nodeLabel(layout.nodesByID, link.target)} · ${formatValue?.(link.value) ?? link.value.toLocaleString()}`
                  : `${nodeLabel(layout.nodesByID, link.source)} → ${nodeLabel(layout.nodesByID, link.target)}`}
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
                height={Math.max(3, node.y1 - node.y0)}
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

function layoutSankey(
  nodes: SankeyNodeInput[],
  links: SankeyLinkInput[],
  opts: {
    width: number
    height: number
    nodeW: number
    padX: number
    padTop: number
    padBottom: number
    gap: number
    maxColumn: number
  },
) {
  const inputByID = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const safeLinks = links.filter((l) => {
    if (l.value <= 0 || !Number.isFinite(l.value)) return false
    return inputByID.has(l.source) && inputByID.has(l.target)
  })
  for (const link of safeLinks) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value)
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + link.value)
  }

  const layoutNodes = nodes
    .map((node, index) => ({
      ...node,
      value: Math.max(incoming.get(node.id) ?? 0, outgoing.get(node.id) ?? 0),
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 0,
      order: index,
      sourceCursor: 0,
      targetCursor: 0,
    }))
    .filter((n) => n.value > 0)

  const nodesByID = new Map(layoutNodes.map((n) => [n.id, n]))
  const columns = new Map<number, SankeyLayoutNode[]>()
  for (const node of layoutNodes) {
    const list = columns.get(node.column) ?? []
    list.push(node)
    columns.set(node.column, list)
  }

  const available = Math.max(80, opts.height - opts.padTop - opts.padBottom)
  const scales = [...columns.values()]
    .filter((col) => col.length > 0)
    .map((col) => {
      const total = col.reduce((sum, n) => sum + n.value, 0)
      const gaps = Math.max(0, col.length - 1) * opts.gap
      return total > 0 ? Math.max(0.0001, (available - gaps) / total) : 1
    })
  const scale = Math.max(0.0001, Math.min(...scales))

  for (const [column, col] of columns) {
    col.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    const used = col.reduce((sum, n) => sum + n.value * scale, 0) + Math.max(0, col.length - 1) * opts.gap
    let y = opts.padTop + Math.max(0, (available - used) / 2)
    const x = xForSankeyColumn(column, opts.maxColumn, opts.width, opts.padX, opts.nodeW)
    col.forEach((node, index) => {
      const h = Math.max(3, node.value * scale)
      node.x0 = x
      node.x1 = x + opts.nodeW
      node.y0 = y
      node.y1 = y + h
      node.sourceCursor = y
      node.targetCursor = y
      node.order = index
      y += h + opts.gap
    })
  }

  const sortedLinks = safeLinks
    .filter((l) => nodesByID.has(l.source) && nodesByID.has(l.target))
    .sort((a, b) => {
      const sa = nodesByID.get(a.source)!
      const sb = nodesByID.get(b.source)!
      const ta = nodesByID.get(a.target)!
      const tb = nodesByID.get(b.target)!
      return sa.column - sb.column || sa.y0 - sb.y0 || ta.y0 - tb.y0
    })

  const layoutLinks: SankeyLayoutLink[] = sortedLinks.map((link) => {
    const source = nodesByID.get(link.source)!
    const target = nodesByID.get(link.target)!
    const w = link.value * scale
    const sourceY = source.sourceCursor + w / 2
    const targetY = target.targetCursor + w / 2
    source.sourceCursor += w
    target.targetCursor += w
    const x0 = source.x1
    const x1 = target.x0
    const bend = Math.max(44, Math.abs(x1 - x0) * 0.54)
    return {
      ...link,
      sourceY,
      targetY,
      width: w,
      color: link.color ?? source.color ?? VIZ[source.order % VIZ.length],
      d: `M${x0.toFixed(1)} ${sourceY.toFixed(1)} C${(x0 + bend).toFixed(1)} ${sourceY.toFixed(1)} ${(x1 - bend).toFixed(1)} ${targetY.toFixed(1)} ${x1.toFixed(1)} ${targetY.toFixed(1)}`,
    }
  })

  return { nodes: layoutNodes, links: layoutLinks, nodesByID }
}

function xForSankeyColumn(column: number, maxColumn: number, width: number, padX: number, nodeW: number) {
  if (maxColumn <= 0) return padX
  return padX + ((width - padX * 2 - nodeW) * column) / maxColumn
}

function nodeLabel(nodes: Map<string, SankeyLayoutNode>, id: string) {
  return nodes.get(id)?.label ?? id
}

function trimSankeyLabel(label: string, maxUnits: number) {
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
