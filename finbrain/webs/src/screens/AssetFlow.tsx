import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon } from '../ds'
import { KIND_LABEL, KIND_TONE } from '../lib/format'
import {
  computeSankeyLayout,
  num,
  SankeyChart,
  shortMoney,
  trimSankeyLabel,
  type SankeyLinkInput,
  type SankeyNodeInput,
} from '../lib/finance'
import type { Valuation } from '../api'
import { useToast } from '../shell/Toast'
import { Modal } from '../shell/Modal'

// Read-only "资产结构流向" Sankey (机构 → 账户用途 → 标的 / 现金) over the current
// committed valuation. Controlled — the host passes the valuation it already loads
// (Pivot shares the ['valuation', …] query), so this panel never fires a second fetch.
export function AssetFlowPanel({
  valuation,
  displayCurrency,
  loading,
  error,
}: {
  valuation: Valuation | null | undefined
  displayCurrency: string
  loading?: boolean
  error?: boolean
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const flow = useMemo(() => (valuation ? buildAssetFlow(valuation) : null), [valuation])

  return (
    <div className="fb-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="git-compare-arrows" size={17} color="var(--accent)" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, color: 'var(--text-strong)', fontWeight: 500 }}>资产结构流向</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>机构 → 账户用途 → 标的 / 现金账户</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="fb-num" style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
            {valuation ? shortMoney(valuation.total_assets, displayCurrency) : '—'}
          </div>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<Icon name="share-2" size={14} />}
            disabled={!flow?.links.length}
            onClick={() => setShareOpen(true)}
          >
            分享图片
          </Button>
        </div>
      </div>
      {loading ? (
        <div style={{ height: 260, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>加载资产流向…</div>
      ) : flow && flow.links.length ? (
        <>
          <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
            <div style={{ minWidth: 760 }}>
              <SankeyChart
                nodes={flow.nodes}
                links={flow.links}
                height={300}
                columnLabels={['机构', '账户用途', '资产']}
                formatValue={(value) => shortMoney(value, displayCurrency)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            <span>按当前估值截面和展示币种 {displayCurrency} 计算。</span>
            {flow.compactedCount > 0 ? <span>末端已合并 {flow.compactedCount} 个小额资产到「其他资产」。</span> : null}
            {flow.omittedCount > 0 ? (
              <span>已忽略 {flow.omittedCount} 项无估值或负值资产，图示合计 {shortMoney(flow.includedTotal, displayCurrency)}。</span>
            ) : null}
          </div>
        </>
      ) : (
        <div style={{ height: 220, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {error ? '资产流向加载失败' : '暂无可展示的资产流向'}
        </div>
      )}
      {shareOpen && flow && valuation ? (
        <AssetFlowShareModal
          flow={flow}
          displayCurrency={displayCurrency}
          totalAssets={valuation.total_assets}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>
  )
}

function AssetFlowShareModal({
  flow,
  displayCurrency,
  totalAssets,
  onClose,
}: {
  flow: AssetFlowData
  displayCurrency: string
  totalAssets: string
  onClose: () => void
}) {
  const toast = useToast()
  const [hideAmounts, setHideAmounts] = useState(false)
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
    renderAssetFlowShareImage({ flow, displayCurrency, totalAssets, hideAmounts })
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
  }, [displayCurrency, flow, hideAmounts, toast, totalAssets])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const makeBlob = () => renderAssetFlowShareImage({ flow, displayCurrency, totalAssets, hideAmounts })

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
      a.download = `finbrain-asset-flow-${new Date().toISOString().slice(0, 10)}.png`
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
      title="分享资产结构流向"
      icon="share-2"
      width={720}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content', color: 'var(--text-secondary)', fontSize: 12.5, cursor: 'pointer' }}
        >
          <input type="checkbox" checked={hideAmounts} onChange={(e) => setHideAmounts(e.target.checked)} />
          隐藏金额
        </label>
        <div style={{ border: '1px solid var(--divider)', background: 'var(--surface-sunken)', borderRadius: 8, padding: 10, maxHeight: '62vh', overflow: 'auto' }}>
          {previewUrl && !generating ? (
            <img src={previewUrl} alt="资产结构流向分享图预览" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 6 }} />
          ) : (
            <div style={{ height: 360, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>生成中…</div>
          )}
        </div>
      </div>
    </Modal>
  )
}

type AssetFlowItem = {
  institution: string
  kind: string
  leafID: string
  leafLabel: string
  value: number
}

export type AssetFlowData = {
  nodes: SankeyNodeInput[]
  links: SankeyLinkInput[]
  compactedCount: number
  omittedCount: number
  /** sum of the values actually drawn — differs from total_assets when items are omitted */
  includedTotal: number
}

export function buildAssetFlow(valuation: Valuation): AssetFlowData {
  const items: AssetFlowItem[] = []
  let omittedCount = 0
  for (const cash of valuation.cash_accounts ?? []) {
    const value = num(cash.balance_value_display) ?? 0
    if (value <= 0) {
      if (value < 0) omittedCount += 1 // overdraft / negative balance — can't size a ribbon
      continue
    }
    items.push({
      institution: cash.institution || '未分类机构',
      kind: cash.account_kind,
      leafID: `cash:${cash.account_id}`,
      leafLabel: `${cash.account_name} · ${cash.account_currency}`,
      value,
    })
  }
  for (const position of valuation.positions ?? []) {
    const raw = num(position.market_value_display)
    const value = raw ?? 0
    if (value <= 0) {
      if (raw == null || value < 0) omittedCount += 1 // missing price or negative exposure
      continue
    }
    items.push({
      institution: position.institution || '未分类机构',
      kind: position.account_kind,
      leafID: `symbol:${position.symbol}`,
      leafLabel: position.display_name ? `${position.symbol} ${position.display_name}` : position.symbol,
      value,
    })
  }

  const leafTotals = new Map<string, number>()
  for (const item of items) {
    leafTotals.set(item.leafID, (leafTotals.get(item.leafID) ?? 0) + item.value)
  }
  const maxLeaves = 10
  // Stable boundary: break value ties by id so the same leaf is always the one kept/folded.
  const sortedLeaves = [...leafTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  // Folding a single leaf into 「其他资产」 adds no clarity, so only compact when ≥2 would merge.
  const doCompact = leafTotals.size - maxLeaves >= 2
  const topLeafIDs = new Set((doCompact ? sortedLeaves.slice(0, maxLeaves) : sortedLeaves).map(([id]) => id))
  const compactedCount = doCompact ? leafTotals.size - topLeafIDs.size : 0

  const nodes = new Map<string, SankeyNodeInput>()
  const links = new Map<string, SankeyLinkInput>()
  const institutionColors = new Map<string, string>()
  const leafColors = new Map<string, string>()

  function node(id: string, label: string, column: number, color?: string) {
    if (!nodes.has(id)) nodes.set(id, { id, label, column, color })
  }

  function link(source: string, target: string, value: number, color?: string) {
    const key = `${source}->${target}`
    const existing = links.get(key)
    if (existing) {
      existing.value += value
    } else {
      links.set(key, { source, target, value, color })
    }
  }

  function institutionColor(institution: string) {
    const existing = institutionColors.get(institution)
    if (existing) return existing
    const color = `var(--viz-${(institutionColors.size % 8) + 1})`
    institutionColors.set(institution, color)
    return color
  }

  function leafColor(leafID: string) {
    if (leafID === 'leaf:__other__') return 'var(--viz-8)'
    const existing = leafColors.get(leafID)
    if (existing) return existing
    const color = `var(--viz-${(leafColors.size % 8) + 1})`
    leafColors.set(leafID, color)
    return color
  }

  for (const item of items) {
    const instID = `institution:${item.institution}`
    // Namespace the 用途 node per institution — a global `kind:${kind}` node would merge
    // unrelated institutions' same-kind flows and imply phantom cross-institution movement.
    const kindID = `kind:${item.institution}:${item.kind}`
    const compacted = compactedCount > 0 && !topLeafIDs.has(item.leafID)
    const leafID = compacted ? 'leaf:__other__' : item.leafID
    const leafLabel = compacted ? '其他资产' : item.leafLabel
    const instColor = institutionColor(item.institution)
    const kindColor = KIND_TONE[item.kind] ?? 'var(--viz-6)'
    node(instID, item.institution, 0, instColor)
    node(kindID, KIND_LABEL[item.kind] ?? item.kind, 1, kindColor)
    node(leafID, leafLabel, 2, leafColor(leafID))
    link(instID, kindID, item.value, instColor)
    link(kindID, leafID, item.value, kindColor)
  }

  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
    compactedCount,
    omittedCount,
    includedTotal: items.reduce((sum, it) => sum + it.value, 0),
  }
}

async function renderAssetFlowShareImage({
  flow,
  displayCurrency,
  totalAssets,
  hideAmounts,
}: {
  flow: AssetFlowData
  displayCurrency: string
  totalAssets: string
  hideAmounts: boolean
}): Promise<Blob> {
  const width = 900
  const height = 560
  const scale = Math.max(2, Math.min(window.devicePixelRatio || 2, 3))
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法生成图片')
  ctx.scale(scale, scale)

  const bg = shareColor('--surface-base', '#0B0D11')
  const card = shareColor('--surface-card', '#15181E')
  const divider = shareColor('--divider', 'rgba(255,255,255,0.08)')
  const strong = shareColor('--text-strong', '#F4F6F8')
  const primary = shareColor('--text-primary', '#DDE3EA')
  const secondary = shareColor('--text-secondary', '#A2AAB3')
  const tertiary = shareColor('--text-tertiary', '#707985')
  const accent = shareColor('--accent', '#C9A86A')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
  shareRoundedRect(ctx, 16, 16, width - 32, height - 32, 18)
  ctx.fillStyle = card
  ctx.fill()

  shareSetFont(ctx, 20, 700)
  ctx.fillStyle = accent
  ctx.fillText('finbrain', 44, 54)
  // Place the title relative to the measured brand width so a different font-stack
  // fallback can't make the two strings overlap or leave a gap.
  const titleX = 44 + ctx.measureText('finbrain').width + 12
  ctx.fillStyle = strong
  ctx.fillText('资产结构流向', titleX, 54)
  shareSetFont(ctx, 12.5, 500)
  ctx.fillStyle = tertiary
  ctx.fillText(`机构 → 账户用途 → 资产 · ${displayCurrency}`, 44, 84)
  if (!hideAmounts) {
    ctx.textAlign = 'right'
    shareSetFont(ctx, 18, 700, true)
    ctx.fillStyle = primary
    ctx.fillText(shortMoney(totalAssets, displayCurrency), width - 44, 56)
    ctx.textAlign = 'left'
  }

  ctx.strokeStyle = divider
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(44, 108)
  ctx.lineTo(width - 44, 108)
  ctx.stroke()

  const nodeW = 16
  const maxColumn = Math.max(0, ...flow.nodes.map((n) => n.column))
  const layout = computeSankeyLayout(flow.nodes, flow.links, {
    columnX: (column) => 44 + ((width - 44 * 2 - nodeW) * column) / Math.max(1, maxColumn),
    nodeW,
    gap: 14,
    top: 142,
    available: 350,
  })

  shareSetFont(ctx, 11, 600)
  ctx.fillStyle = tertiary
  ctx.fillText('机构', 44, 130)
  ctx.fillText('账户用途', width / 2 - 32, 130)
  ctx.textAlign = 'right'
  ctx.fillText('资产', width - 44, 130)
  ctx.textAlign = 'left'

  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.lineCap = 'butt'
  for (const link of layout.links) {
    ctx.beginPath()
    ctx.moveTo(link.sx, link.sy)
    ctx.bezierCurveTo(link.sx + link.bend, link.sy, link.tx - link.bend, link.ty, link.tx, link.ty)
    ctx.strokeStyle = shareColorFromToken(link.color, accent)
    ctx.lineWidth = link.width
    ctx.stroke()
  }
  ctx.restore()

  for (const node of layout.nodes) {
    ctx.fillStyle = shareColorFromToken(node.color, accent)
    // Trust the laid-out band height (the SANKEY_MIN_NODE floor is already budgeted by
    // computeSankeyLayout's fit factor); re-flooring here would defeat fit and overflow.
    shareRoundedRect(ctx, node.x0, node.y0, node.x1 - node.x0, node.y1 - node.y0, 4)
    ctx.fill()

    const labelOnLeft = node.column === maxColumn
    const labelX = labelOnLeft ? node.x0 - 8 : node.x1 + 8
    const midY = (node.y0 + node.y1) / 2
    const label = trimSankeyLabel(node.label, labelOnLeft ? 24 : 18)
    ctx.textAlign = labelOnLeft ? 'right' : 'left'
    shareSetFont(ctx, 11.5, 600)
    ctx.fillStyle = secondary
    ctx.fillText(label, labelX, midY - (!hideAmounts && node.y1 - node.y0 > 30 ? 7 : 0))
    if (!hideAmounts && node.y1 - node.y0 > 30) {
      shareSetFont(ctx, 10.5, 500, true)
      ctx.fillStyle = tertiary
      ctx.fillText(shortMoney(node.value, displayCurrency), labelX, midY + 9)
    }
  }
  ctx.textAlign = 'left'

  shareSetFont(ctx, 11, 500)
  ctx.fillStyle = tertiary
  // When assets are omitted, the ribbons sum to includedTotal, not the total_assets shown
  // top-right — disclose it here so the shared image isn't read as the full portfolio.
  let footer: string
  if (hideAmounts) {
    // Even with amounts hidden, disclose omitted assets so the structure isn't read as complete.
    footer = flow.omittedCount > 0
      ? `金额已隐藏；已忽略 ${flow.omittedCount} 项无估值或负值资产。`
      : '金额已隐藏，仅展示资产结构与流向权重。'
  } else if (flow.omittedCount > 0) {
    footer = `已忽略 ${flow.omittedCount} 项无估值或负值资产，图示合计 ${shortMoney(flow.includedTotal, displayCurrency)}`
  } else {
    footer = '按当前估值截面计算，连线宽度代表金额占比。'
  }
  ctx.fillText(footer, 44, height - 48)
  if (flow.compactedCount > 0) {
    // The secondary note shares this line with the (possibly long) left footer; only draw it
    // right-aligned when it measurably fits, otherwise drop it to avoid overlapping text.
    const note = `已合并 ${flow.compactedCount} 个小额资产`
    if (44 + ctx.measureText(footer).width + 24 + ctx.measureText(note).width <= width - 44) {
      ctx.textAlign = 'right'
      ctx.fillText(note, width - 44, height - 48)
      ctx.textAlign = 'left'
    }
  }
  shareSetFont(ctx, 10.5, 500)
  ctx.fillStyle = tertiary
  ctx.textAlign = 'right'
  ctx.fillText(new Date().toLocaleDateString(), width - 44, height - 28)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('生成图片失败'))
    }, 'image/png')
  })
}

function shareColor(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function shareColorFromToken(value: string | undefined, fallback: string) {
  if (!value) return fallback
  const match = value.match(/^var\((--[^)]+)\)$/)
  if (match) return shareColor(match[1], fallback)
  return value
}

function shareSetFont(ctx: CanvasRenderingContext2D, size: number, weight = 400, mono = false) {
  const family = mono
    ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    : '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.font = `${weight} ${size}px ${family}`
  ctx.textBaseline = 'middle'
}

function shareRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
