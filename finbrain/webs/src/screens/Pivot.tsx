import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Segmented } from '../ds'
import { getValuation } from '../api'
import { currencyLabel, KIND_LABEL, native } from '../lib/format'
import { Donut, num, shortMoney, type DonutItem, VIZ } from '../lib/finance'
import { usePrefStore } from '../store'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { AssetFlowPanel } from './AssetFlow'

const DIMENSIONS = [
  { value: 'kind', label: '账户用途' },
  { value: 'currency', label: '账户币种' },
  { value: 'quote_currency', label: '真实计价币种' },
  { value: 'market', label: '市场' },
  { value: 'institution', label: '机构' },
  { value: 'symbol', label: '标的' },
]

const MARKET_LABEL: Record<string, string> = {
  CASH: '现金',
  US: '美股',
  HK: '港股',
  CN: 'A股',
  CRYPTO: '加密资产',
  INDEX: '指数',
}

type PivotRow = { key: string; name: string; value: number; percent: string }

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1180, margin: '0 auto' }}>{children}</div>
}

export function Pivot() {
  const displayCurrency = usePrefStore((s) => s.displayCurrency)
  const fxMode = usePrefStore((s) => s.fxMode)
  const [dim, setDim] = useState('kind')
  const [view, setView] = useState<'pivot' | 'flow'>('pivot')
  const [shareOpen, setShareOpen] = useState(false)
  const val = useQuery({
    queryKey: ['valuation', displayCurrency, fxMode],
    queryFn: () => getValuation({ display_currency: displayCurrency, fx_mode: fxMode }),
  })

  const rows = useMemo(() => {
    const v = val.data
    if (!v) return [] as PivotRow[]
    if (dim === 'symbol') {
      const groups = v.position_groups.filter((g) => g.market_value_display)
      // Denominator = Σ of the rows actually shown, so per-row %, the 合计 row and the
      // donut center all reconcile (v.position_value rounds once and can differ by cents).
      const total = groups.reduce((sum, g) => sum + (num(g.market_value_display) ?? 0), 0)
      return groups
        .map((g) => {
          const value = num(g.market_value_display) ?? 0
          return { key: g.symbol, name: g.display_name ? `${g.symbol} ${g.display_name}` : g.symbol, value, percent: total ? ((value / total) * 100).toFixed(2) : '0.00' }
        })
        .sort((a, b) => b.value - a.value)
    }
    return (v.allocations[dim] ?? [])
      .map((b) => ({ key: b.key, name: bucketLabel(dim, b.key, b.name), value: num(b.value) ?? 0, percent: b.percent }))
      .sort((a, b) => b.value - a.value)
  }, [val.data, dim])

  const total = rows.reduce((a, r) => a + r.value, 0)
  const chartRows = useMemo(() => compactChartRows(rows, total, dim === 'symbol' ? 7 : VIZ.length), [rows, total, dim])
  const donutItems: DonutItem[] = chartRows.map((r, i) => ({ key: r.key, name: r.name, value: Math.abs(r.value), color: VIZ[i % VIZ.length] }))
  // The donut center must equal what the ring actually draws (sum of plotted, abs basis).
  // For quote_currency this is gross exposure; the signed net stays in the table 合计 row.
  const donutTotal = donutItems.reduce((sum, it) => sum + it.value, 0)
  const dimLabel = DIMENSIONS.find((d) => d.value === dim)?.label ?? dim
  const basisLabel = dim === 'symbol' ? '按持仓市值' : dim === 'quote_currency' ? '按真实计价币种(暴露口径)' : '按净资产口径'

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented
          size="sm"
          value={view}
          onChange={(v) => setView(v as 'pivot' | 'flow')}
          options={[{ value: 'pivot', label: '多维透视' }, { value: 'flow', label: '资产流向' }]}
        />
        {view === 'pivot' ? (
          <>
            <Segmented size="sm" value={dim} onChange={setDim} options={DIMENSIONS} />
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<Icon name="share-2" size={14} />}
              disabled={!rows.length}
              onClick={() => setShareOpen(true)}
            >
              分享图片
            </Button>
          </>
        ) : null}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          {view === 'pivot' ? `${basisLabel} · ${displayCurrency}` : `资产结构流向 · ${displayCurrency}`}
        </span>
      </div>

      {view === 'flow' ? (
        <AssetFlowPanel valuation={val.data} displayCurrency={displayCurrency} loading={val.isLoading} error={val.isError} />
      ) : (
        <>
          <div className="fb-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
              {donutItems.length ? (
                <div style={{ width: 'min(100%, 760px)' }}>
                  <Donut items={donutItems} size={220} thickness={24} centerLabel={shortMoney(donutTotal, displayCurrency)} centerSub={dim === 'quote_currency' ? '暴露' : '合计'} legendPlacement="side" />
                </div>
              ) : (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                  {val.isLoading ? '正在加载…' : val.isError ? '估值加载失败' : '暂无数据'}
                </div>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: dim === 'symbol' ? 760 : 560, borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>{DIMENSIONS.find((d) => d.value === dim)?.label}</th>
                  <th style={thR}>金额</th><th style={thR}>占比</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} style={{ borderTop: '1px solid var(--divider)' }}>
                      <td style={tdName}>{r.name}</td>
                      <td style={tdR}>{native(String(r.value), displayCurrency)}</td>
                      <td style={tdR}>{r.percent}%</td>
                    </tr>
                  ))}
                  {rows.length ? (
                    <tr style={{ borderTop: '1px solid var(--border-strong)' }}>
                      <td style={{ ...tdName, color: 'var(--text-strong)' }}>合计</td>
                      <td style={{ ...tdR, color: 'var(--text-strong)' }}>{native(String(total), displayCurrency)}</td>
                      <td style={tdR}>—</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>多维聚合按当前估值截面展开;「资产流向」视图提供机构 → 账户用途 → 标的的多级透视。</div>
        </>
      )}
      {shareOpen && view === 'pivot' ? (
        <ShareImageModal
          dim={dim}
          dimLabel={dimLabel}
          basisLabel={basisLabel}
          chartRows={chartRows}
          total={donutTotal}
          currency={displayCurrency}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </Page>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, color: 'var(--text-secondary)' }
const tdName: React.CSSProperties = { ...td, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }

function bucketLabel(dim: string, key: string, name: string) {
  if (dim === 'kind') return KIND_LABEL[key] ?? fallbackLabel(key, name)
  if (dim === 'currency' || dim === 'quote_currency') return currencyLabel(key).replace(`${key} · `, '')
  if (dim === 'market') return MARKET_LABEL[key] ?? fallbackLabel(key, name)
  return fallbackLabel(key, name)
}

function fallbackLabel(key: string, name: string) {
  return name || key || '未分类'
}

function compactChartRows(rows: PivotRow[], total: number, limit: number) {
  if (rows.length <= limit) return rows
  const head = rows.slice(0, limit)
  const tail = rows.slice(limit)
  // The donut plots on an abs basis, so aggregate the tail by magnitude — never silently
  // drop it (a net-negative tail still contains real exposure shown in the table).
  const restAbs = tail.reduce((sum, r) => sum + Math.abs(r.value), 0)
  if (restAbs === 0) return head
  return [
    ...head,
    {
      key: '__other__',
      name: `其他（${tail.length}）`,
      value: restAbs,
      percent: total ? ((restAbs / Math.abs(total)) * 100).toFixed(2) : '0.00',
    },
  ]
}

function ShareImageModal({
  dim,
  dimLabel,
  basisLabel,
  chartRows,
  total,
  currency,
  onClose,
}: {
  dim: string
  dimLabel: string
  basisLabel: string
  chartRows: PivotRow[]
  total: number
  currency: string
  onClose: () => void
}) {
  const toast = useToast()
  const [previewUrl, setPreviewUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [working, setWorking] = useState<'copy' | 'download' | null>(null)
  const mounted = useRef(true)
  useEffect(() => () => {
    mounted.current = false
  }, [])

  useEffect(() => {
    let cancelled = false
    setGenerating(true)
    renderPivotShareImage({ dim, dimLabel, basisLabel, chartRows, total, currency })
      .then((blob) => {
        if (cancelled) return
        setPreviewUrl(URL.createObjectURL(blob))
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '生成图片失败'))
      .finally(() => {
        if (!cancelled) setGenerating(false)
      })
    return () => {
      cancelled = true
    }
  }, [basisLabel, chartRows, currency, dim, dimLabel, toast, total])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const makeBlob = () => renderPivotShareImage({ dim, dimLabel, basisLabel, chartRows, total, currency })

  async function copyImage() {
    const clipboard = navigator.clipboard as Clipboard & { write?: (items: unknown[]) => Promise<void> }
    const ClipboardItemCtor = (window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }).ClipboardItem
    if (!clipboard?.write || !ClipboardItemCtor) {
      toast.error('当前浏览器不支持复制图片')
      return
    }
    setWorking('copy')
    try {
      const blob = await makeBlob()
      await clipboard.write([new ClipboardItemCtor({ [blob.type]: blob })])
      toast.success('图片已复制')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制图片失败')
    } finally {
      if (mounted.current) setWorking(null)
    }
  }

  async function downloadImage() {
    setWorking('download')
    try {
      const blob = await makeBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finbrain-pivot-${dim}-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('图片已下载')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载图片失败')
    } finally {
      if (mounted.current) setWorking(null)
    }
  }

  return (
    <Modal
      title="分享图片"
      icon="share-2"
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" iconLeft={<Icon name="download" size={14} />} disabled={generating || working != null} onClick={downloadImage}>
            {working === 'download' ? '下载中…' : '下载图片'}
          </Button>
          <Button variant="primary" iconLeft={<Icon name="copy" size={14} />} disabled={generating || working != null} onClick={copyImage}>
            {working === 'copy' ? '复制中…' : '复制图片'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            border: '1px solid var(--divider)',
            background: 'var(--surface-sunken)',
            borderRadius: 8,
            padding: 10,
            maxHeight: '58vh',
            overflow: 'auto',
          }}
        >
          {previewUrl && !generating ? (
            <img src={previewUrl} alt="分享图片预览" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 6 }} />
          ) : (
            <div style={{ height: 320, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>生成中…</div>
          )}
        </div>
      </div>
    </Modal>
  )
}

async function renderPivotShareImage({
  dim,
  dimLabel,
  basisLabel,
  chartRows,
  total,
  currency,
}: {
  dim: string
  dimLabel: string
  basisLabel: string
  chartRows: PivotRow[]
  total: number
  currency: string
}): Promise<Blob> {
  const width = 640
  const pad = 32
  const dividerY = 96
  const chartR = 102
  const chartInnerR = 72
  const chartGap = 26
  const swatch = 10
  const swatchGap = 8
  const pctGap = 10
  const pctWidth = 46
  const rowGap = 7
  const lineH = 17
  const chartTotal = chartRows.reduce((sum, r) => sum + Math.abs(r.value), 0) || 1
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx) throw new Error('当前浏览器无法生成图片')
  setFont(measureCtx, 12, 600)
  const legendNameMax = width - pad * 2 - chartR * 2 - chartGap - swatch - swatchGap - pctGap - pctWidth
  const measuredNameWidth = Math.max(80, ...chartRows.map((r) => Math.ceil(measureCtx.measureText(r.name).width) + 4))
  const legendNameWidth = Math.min(legendNameMax, measuredNameWidth)
  const legendRows = chartRows.map((r) => {
    const lines = wrapCanvasText(measureCtx, r.name, legendNameWidth)
    return { row: r, lines, height: Math.max(24, lines.length * lineH) }
  })
  const legendWidth = swatch + swatchGap + legendNameWidth + pctGap + pctWidth
  const legendHeight = legendRows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, legendRows.length - 1) * rowGap
  const contentTop = dividerY + 34
  const contentHeight = Math.max(chartR * 2, legendHeight)
  const contentWidth = chartR * 2 + chartGap + legendWidth
  const contentLeft = (width - contentWidth) / 2
  const chartCx = contentLeft + chartR
  const chartCy = contentTop + contentHeight / 2
  const legendX = contentLeft + chartR * 2 + chartGap
  const legendTop = contentTop + (contentHeight - legendHeight) / 2
  const contentBottom = contentTop + contentHeight
  const height = contentBottom + 56
  const scale = Math.max(2, Math.min(window.devicePixelRatio || 2, 3))
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法生成图片')
  ctx.scale(scale, scale)

  const color = (name: string, fallback: string) => cssVar(name) || fallback
  const bg = color('--surface-base', '#0B0D11')
  const card = color('--surface-card', '#13161B')
  const divider = cssVar('--divider') || 'rgba(255,255,255,0.08)'
  const strong = color('--text-strong', '#F4F6F8')
  const primary = color('--text-primary', '#E3E7EB')
  const secondary = color('--text-secondary', '#99A1A9')
  const tertiary = color('--text-tertiary', '#67707A')
  const accent = color('--accent', '#C9A86A')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
  roundedRect(ctx, 12, 12, width - 24, height - 24, 16)
  ctx.fillStyle = card
  ctx.fill()

  setFont(ctx, 18, 700)
  ctx.fillStyle = accent
  ctx.fillText('finbrain', pad, 42)
  const titleX = pad + ctx.measureText('finbrain').width + 12
  ctx.fillStyle = strong
  ctx.fillText(`多维聚合 · ${dimLabel}`, titleX, 42)
  setFont(ctx, 12, 400)
  ctx.fillStyle = tertiary
  ctx.fillText(basisLabel, pad, 70)

  ctx.strokeStyle = divider
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, dividerY)
  ctx.lineTo(width - pad, dividerY)
  ctx.stroke()

  drawCanvasDonut(ctx, chartRows, chartTotal, chartCx, chartCy, chartR, chartInnerR)
  setFont(ctx, 15, 700, true)
  ctx.fillStyle = strong
  ctx.textAlign = 'center'
  ctx.fillText(shortMoney(total, currency), chartCx, chartCy - 4)
  setFont(ctx, 9, 500)
  ctx.fillStyle = tertiary
  ctx.fillText(dim === 'quote_currency' ? '暴露' : '合计', chartCx, chartCy + 12)
  ctx.textAlign = 'left'

  const nameX = legendX + swatch + swatchGap
  const pctX = legendX + legendWidth
  let legendY = legendTop
  legendRows.forEach(({ row, lines, height: rowH }, i) => {
    const rowCenterY = legendY + rowH / 2
    const textTop = legendY + (rowH - lines.length * lineH) / 2
    ctx.beginPath()
    ctx.fillStyle = vizColor(i)
    roundedRect(ctx, legendX, rowCenterY - swatch / 2, swatch, swatch, 3)
    ctx.fill()
    setFont(ctx, 12, 600)
    ctx.fillStyle = primary
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, nameX, textTop + lineIndex * lineH + lineH / 2)
    })
    ctx.textAlign = 'right'
    ctx.fillStyle = secondary
    setFont(ctx, 12, 600)
    ctx.fillText(`${((Math.abs(row.value) / chartTotal) * 100).toFixed(1)}%`, pctX, rowCenterY)
    ctx.textAlign = 'left'
    legendY += rowH + rowGap
  })

  setFont(ctx, 10.5, 500)
  ctx.fillStyle = tertiary
  ctx.textAlign = 'right'
  ctx.fillText(new Date().toLocaleDateString(), width - pad, height - 30)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('生成图片失败'))
    }, 'image/png')
  })
}

function drawCanvasDonut(ctx: CanvasRenderingContext2D, rows: PivotRow[], total: number, cx: number, cy: number, outerR: number, innerR: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, outerR - (outerR - innerR) / 2, 0, Math.PI * 2)
  ctx.strokeStyle = cssVar('--surface-inset') || '#090B0E'
  ctx.lineWidth = outerR - innerR
  ctx.stroke()
  let start = -Math.PI / 2
  const gap = rows.length > 1 ? 0.025 : 0
  rows.forEach((row, i) => {
    const sweep = (Math.abs(row.value) / total) * Math.PI * 2
    const g = Math.min(gap, sweep * 0.4)
    const a0 = start + g / 2
    const a1 = start + sweep - g / 2
    if (a1 > a0) {
      ctx.beginPath()
      ctx.arc(cx, cy, outerR, a0, a1)
      ctx.arc(cx, cy, innerR, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = vizColor(i)
      ctx.fill()
    }
    start += sweep
  })
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function vizColor(index: number) {
  const fallback = ['#C9A86A', '#5E8BD6', '#3CB57F', '#9B7AC0', '#D98C54', '#4FA8B8', '#C9697A', '#7C8794']
  return cssVar(`--viz-${(index % VIZ.length) + 1}`) || fallback[index % fallback.length]
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 400, mono = false) {
  const family = mono
    ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    : '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.font = `${weight} ${size}px ${family}`
  ctx.textBaseline = 'middle'
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return [text]
  const units = text.match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+|\s+/g) ?? [text]
  const lines: string[] = []
  let line = ''
  for (const unit of units) {
    const candidate = line ? `${line}${unit}` : unit.trimStart()
    if (!candidate) continue
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
      continue
    }
    if (line) {
      lines.push(line.trimEnd())
      line = ''
    }
    const trimmed = unit.trim()
    if (!trimmed) continue
    if (ctx.measureText(trimmed).width <= maxWidth) {
      line = trimmed
      continue
    }
    const split = splitLongCanvasText(ctx, trimmed, maxWidth)
    lines.push(...split.slice(0, -1))
    line = split[split.length - 1] ?? ''
  }
  if (line) lines.push(line.trimEnd())
  return lines.length ? lines : [text]
}

function splitLongCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const ch of Array.from(text)) {
    const candidate = `${line}${ch}`
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
    } else {
      lines.push(line)
      line = ch
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}
