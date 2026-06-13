import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Field, Icon, IconButton, Input, Segmented, Select } from '../ds'
import {
  deleteFxRate,
  deleteInstrument,
  deletePrice,
  listFxRates,
  listInstruments,
  listPrices,
  updateFxRate,
  updateInstrument,
  updatePrice,
  upsertFxRate,
  upsertInstrument,
  upsertPrice,
  type FxRate,
  type Instrument,
  type Price,
} from '../api'
import { ACCOUNT_CURRENCIES, MARKET_TONE, native, todayISO } from '../lib/format'
import { LineChart, type LineSeriesPoint } from '../lib/finance'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'

type Tab = 'instruments' | 'fx' | 'benchmarks'
type Editor =
  | { kind: 'price'; item?: Price; defaultSymbol?: string; defaultCurrency?: string }
  | { kind: 'fx'; item?: FxRate }
  | { kind: 'instrument'; item?: Instrument; benchmark?: boolean }
  | null

interface FxPairGroup {
  key: string
  base: string
  quote: string
  count: number
  latest: FxRate
}

const TAB_OPTIONS = [
  { value: 'instruments', label: '标的' },
  { value: 'fx', label: '汇率' },
  { value: 'benchmarks', label: '基准' },
]

const MARKET_OPTIONS = ['US', 'HK', 'CN', 'CRYPTO', 'INDEX'].map((value) => ({ value, label: value }))
const ASSET_KIND_OPTIONS = [
  { value: 'equity', label: '股票' },
  { value: 'fund', label: '基金' },
  { value: 'crypto', label: '加密资产' },
  { value: 'index', label: '指数' },
  { value: 'cash', label: '现金' },
]

export function MarketData() {
  const [tab, setTab] = useState<Tab>('instruments')
  const [editor, setEditor] = useState<Editor>(null)
  const [fxSort, setFxSort] = useState<'date_desc' | 'date_asc'>('date_desc')
  const [instrumentFilter, setInstrumentFilter] = useState('')
  const [selectedFxPair, setSelectedFxPair] = useState('')
  const [selectedInstrumentSymbol, setSelectedInstrumentSymbol] = useState('')
  const [selectedBenchmarkSymbol, setSelectedBenchmarkSymbol] = useState('')
  const qc = useQueryClient()
  const toast = useToast()

  const fxRates = useQuery({
    queryKey: ['fx-rates', 'all', fxSort],
    queryFn: () => listFxRates({ sort: fxSort }),
  })
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments })

  const benchmarks = useMemo(() => (instruments.data ?? []).filter((i) => i.is_benchmark), [instruments.data])
  const fxPairs = useMemo(() => groupFxRates(fxRates.data?.items ?? []), [fxRates.data?.items])
  const filteredInstruments = useMemo(
    () => filterInstruments(instruments.data ?? [], instrumentFilter),
    [instruments.data, instrumentFilter],
  )
  const filteredBenchmarks = useMemo(
    () => filterInstruments(benchmarks, instrumentFilter),
    [benchmarks, instrumentFilter],
  )

  useEffect(() => {
    pickFirstAvailable(fxPairs.map((p) => p.key), selectedFxPair, setSelectedFxPair)
  }, [fxPairs, selectedFxPair])
  useEffect(() => {
    pickFirstAvailable(filteredInstruments.map((i) => i.symbol), selectedInstrumentSymbol, setSelectedInstrumentSymbol)
  }, [filteredInstruments, selectedInstrumentSymbol])
  useEffect(() => {
    pickFirstAvailable(filteredBenchmarks.map((i) => i.symbol), selectedBenchmarkSymbol, setSelectedBenchmarkSymbol)
  }, [filteredBenchmarks, selectedBenchmarkSymbol])

  const historySymbol =
    tab === 'instruments'
        ? selectedInstrumentSymbol
        : tab === 'benchmarks'
          ? selectedBenchmarkSymbol
          : ''
  const selectedFx = parseFxPair(selectedFxPair)
  const priceHistory = useQuery({
    queryKey: ['prices', 'history', historySymbol],
    queryFn: () => listPrices({ symbol: historySymbol, sort: 'date_asc' }),
    enabled: !!historySymbol && tab !== 'fx',
  })
  const fxHistory = useQuery({
    queryKey: ['fx-rates', 'history', selectedFx?.base, selectedFx?.quote],
    queryFn: () => listFxRates({ base: selectedFx?.base, quote: selectedFx?.quote, sort: 'date_asc' }),
    enabled: tab === 'fx' && selectedFx != null,
  })

  const selectedPriceRows = exactPriceRows(priceHistory.data?.items ?? [], historySymbol)
  const selectedFxRows = selectedFx ? exactFxRows(fxHistory.data?.items ?? [], selectedFx.base, selectedFx.quote) : []

  const removePrice = useMutation({
    mutationFn: deletePrice,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prices'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('价格已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })
  const removeFx = useMutation({
    mutationFn: deleteFxRate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fx-rates'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('汇率已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })
  const removeInstrument = useMutation({
    mutationFn: deleteInstrument,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['instruments'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('标的已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败；已被持仓或价格引用的标的不能删除'),
  })
  const removeBenchmark = useMutation({
    mutationFn: (symbol: string) => updateInstrument(symbol, { is_benchmark: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['instruments'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('已移出基准')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '移出基准失败'),
  })

  const actionText = { fx: '汇率', instruments: '标的', benchmarks: '基准' }[tab]
  const hint = {
    fx: '反向汇率自动互换；缺失时按 1:1 降级并在仪表盘提示。批量补历史走后端 API §4.10.1。',
    instruments: '标的是价格历史的归属实体；价格点在标的详情里维护，切换展示币种不影响本页原币种展示。',
    benchmarks: '基准是标的的一种身份，历史价格仍来自同一张 prices 表；后续趋势图会使用这些曲线做基准对比。',
  }[tab]

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented value={tab} onChange={(v) => setTab(v as Tab)} size="sm" options={TAB_OPTIONS} />
        <Button
          variant="primary"
          size="sm"
          style={{ marginLeft: 'auto' }}
          iconLeft={<Icon name="plus" size={14} />}
          onClick={() =>
            setEditor(
              tab === 'fx'
                  ? { kind: 'fx' }
                  : { kind: 'instrument', benchmark: tab === 'benchmarks' },
            )
          }
        >
          新增{actionText}
        </Button>
      </div>

      <Card padded={false}>
        {tab === 'fx' ? (
          <FxManager
            pairs={fxPairs}
            selectedPair={selectedFxPair}
            onSelect={setSelectedFxPair}
            rows={selectedFxRows}
            sort={fxSort}
            onSort={setFxSort}
            listTruncated={fxRates.data?.truncated}
            historyTruncated={fxHistory.data?.truncated}
            limit={fxRates.data?.limit}
            onEdit={(r) => setEditor({ kind: 'fx', item: r })}
            onDelete={(r) => removeFx.mutate(r.id)}
          />
        ) : tab === 'instruments' ? (
          <InstrumentManager
            items={filteredInstruments}
            selectedSymbol={selectedInstrumentSymbol}
            onSelect={setSelectedInstrumentSymbol}
            filter={instrumentFilter}
            onFilter={setInstrumentFilter}
            rows={selectedPriceRows}
            historyTruncated={priceHistory.data?.truncated}
            limit={priceHistory.data?.limit}
            onEditInstrument={(m) => setEditor({ kind: 'instrument', item: m })}
            onDeleteInstrument={(m) => removeInstrument.mutate(m.symbol)}
            onAddPrice={(m) =>
              setEditor({ kind: 'price', defaultSymbol: m.symbol, defaultCurrency: m.quote_currency ?? undefined })
            }
            onEditPrice={(p) => setEditor({ kind: 'price', item: p })}
            onDeletePrice={(p) => removePrice.mutate(p.id)}
          />
        ) : (
          <BenchmarkManager
            items={filteredBenchmarks}
            selectedSymbol={selectedBenchmarkSymbol}
            onSelect={setSelectedBenchmarkSymbol}
            filter={instrumentFilter}
            onFilter={setInstrumentFilter}
            rows={selectedPriceRows}
            historyTruncated={priceHistory.data?.truncated}
            limit={priceHistory.data?.limit}
            onEditInstrument={(m) => setEditor({ kind: 'instrument', item: m, benchmark: true })}
            onRemoveBenchmark={(m) => removeBenchmark.mutate(m.symbol)}
            onAddPrice={(m) =>
              setEditor({ kind: 'price', defaultSymbol: m.symbol, defaultCurrency: m.quote_currency ?? undefined })
            }
            onEditPrice={(p) => setEditor({ kind: 'price', item: p })}
            onDeletePrice={(p) => removePrice.mutate(p.id)}
          />
        )}
      </Card>

      <SectionHint>{hint}</SectionHint>

      {editor?.kind === 'price' ? (
        <PriceModal
          item={editor.item}
          defaultSymbol={editor.defaultSymbol}
          defaultCurrency={editor.defaultCurrency}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {editor?.kind === 'fx' ? <FxModal item={editor.item} onClose={() => setEditor(null)} /> : null}
      {editor?.kind === 'instrument' ? (
        <InstrumentModal item={editor.item} benchmark={editor.benchmark} onClose={() => setEditor(null)} />
      ) : null}
    </Page>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1320, margin: '0 auto' }}>
      {children}
    </div>
  )
}

function FxManager({
  pairs,
  selectedPair,
  onSelect,
  rows,
  sort,
  onSort,
  listTruncated,
  historyTruncated,
  limit,
  onEdit,
  onDelete,
}: {
  pairs: FxPairGroup[]
  selectedPair: string
  onSelect: (pair: string) => void
  rows: FxRate[]
  sort: 'date_desc' | 'date_asc'
  onSort: (sort: 'date_desc' | 'date_asc') => void
  listTruncated?: boolean
  historyTruncated?: boolean
  limit?: number
  onEdit: (rate: FxRate) => void
  onDelete: (rate: FxRate) => void
}) {
  const cur = pairs.find((p) => p.key === selectedPair)
  const historyRows = sortFxRates(rows, 'date_asc')
  const tableRows = sortFxRates(historyRows, sort)
  const series = fxSeries(historyRows)
  const latest = latestFxRate(historyRows) ?? cur?.latest

  return (
    <MasterDetail
      rail={
        <Rail empty="暂无汇率">
          {pairs.map((p) => (
            <RailButton key={p.key} active={p.key === selectedPair} onClick={() => onSelect(p.key)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <RailTitle active={p.key === selectedPair}>{p.key}</RailTitle>
                <RailSub>{p.count} 点</RailSub>
              </div>
              <span className="fb-num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {formatRate(p.latest.rate)}
              </span>
            </RailButton>
          ))}
        </Rail>
      }
    >
      <DetailHead
        title={selectedPair || '汇率'}
        sub={latest ? `1 ${latest.base_currency} = ${formatRate(latest.rate)} ${latest.quote_currency}` : undefined}
        series={series}
        actions={
          <HistoryToolbar
            sort={sort}
            onSort={onSort}
            listTruncated={listTruncated}
            historyTruncated={historyTruncated}
            limit={limit}
          />
        }
      />
      <HistoryChart
        series={series}
        yFmt={formatAxisRate}
        emptyText={
          series.length === 0
            ? '暂无历史汇率'
            : '历史汇率不足 2 点,无法绘制走势 — 用批量导入 API §4.10.1 补足'
        }
        pointLabel="汇率点"
      />
      <FxPointTable rows={tableRows} onEdit={onEdit} onDelete={onDelete} />
    </MasterDetail>
  )
}

function InstrumentManager({
  items,
  selectedSymbol,
  onSelect,
  filter,
  onFilter,
  rows,
  historyTruncated,
  limit,
  onEditInstrument,
  onDeleteInstrument,
  onAddPrice,
  onEditPrice,
  onDeletePrice,
}: {
  items: Instrument[]
  selectedSymbol: string
  onSelect: (symbol: string) => void
  filter: string
  onFilter: (value: string) => void
  rows: Price[]
  historyTruncated?: boolean
  limit?: number
  onEditInstrument: (instrument: Instrument) => void
  onDeleteInstrument: (instrument: Instrument) => void
  onAddPrice: (instrument: Instrument) => void
  onEditPrice: (price: Price) => void
  onDeletePrice: (price: Price) => void
}) {
  const cur = items.find((i) => i.symbol === selectedSymbol)
  const historyRows = sortPrices(exactPriceRows(rows, selectedSymbol), 'date_asc')
  const series = priceSeries(historyRows)
  const currency = latestPrice(historyRows)?.currency ?? cur?.quote_currency ?? 'USD'

  return (
    <MasterDetail
      rail={
        <InstrumentRail
          items={items}
          selectedSymbol={selectedSymbol}
          onSelect={onSelect}
          filter={filter}
          onFilter={onFilter}
          empty="暂无标的"
        />
      }
    >
      {cur ? (
        <>
          <DetailHead
            title={cur.symbol}
            sub={cur.display_name ?? undefined}
            series={series}
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {historyTruncated ? <Badge tone="warning">当前历史已截断 {limit ?? 5000} 点</Badge> : null}
                <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={() => onAddPrice(cur)}>
                  新增价格
                </Button>
                <RowActions onEdit={() => onEditInstrument(cur)} onDelete={() => onDeleteInstrument(cur)} />
              </div>
            }
          />
          <InstrumentMeta instrument={cur} />
          <HistoryChart
            series={series}
            yFmt={(v) => native(v, currency, 4)}
            emptyText={series.length === 0 ? '暂无历史价格' : '历史价格不足 2 点,无法绘制走势 — 用批量导入 API §4.10.1 补足'}
            pointLabel="价格点"
          />
          <PricePointTable rows={sortPrices(historyRows, 'date_desc')} onEdit={onEditPrice} onDelete={onDeletePrice} />
        </>
      ) : (
        <EmptyPanel text="暂无标的" />
      )}
    </MasterDetail>
  )
}

function BenchmarkManager({
  items,
  selectedSymbol,
  onSelect,
  filter,
  onFilter,
  rows,
  historyTruncated,
  limit,
  onEditInstrument,
  onRemoveBenchmark,
  onAddPrice,
  onEditPrice,
  onDeletePrice,
}: {
  items: Instrument[]
  selectedSymbol: string
  onSelect: (symbol: string) => void
  filter: string
  onFilter: (value: string) => void
  rows: Price[]
  historyTruncated?: boolean
  limit?: number
  onEditInstrument: (instrument: Instrument) => void
  onRemoveBenchmark: (instrument: Instrument) => void
  onAddPrice: (instrument: Instrument) => void
  onEditPrice: (price: Price) => void
  onDeletePrice: (price: Price) => void
}) {
  const cur = items.find((i) => i.symbol === selectedSymbol)
  const historyRows = sortPrices(exactPriceRows(rows, selectedSymbol), 'date_asc')
  const series = priceSeries(historyRows)
  const currency = latestPrice(historyRows)?.currency ?? cur?.quote_currency ?? 'USD'
  const order = cur ? items.findIndex((i) => i.symbol === cur.symbol) + 1 : 0

  return (
    <MasterDetail
      rail={
        <InstrumentRail
          items={items}
          selectedSymbol={selectedSymbol}
          onSelect={onSelect}
          filter={filter}
          onFilter={onFilter}
          empty="暂无基准"
          benchmark
        />
      }
    >
      {cur ? (
        <>
          <DetailHead
            title={cur.display_name ?? cur.symbol}
            sub={cur.symbol}
            series={series}
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {historyTruncated ? <Badge tone="warning">当前历史已截断 {limit ?? 5000} 点</Badge> : null}
                <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={() => onAddPrice(cur)}>
                  新增价格
                </Button>
                <RowActions onEdit={() => onEditInstrument(cur)} onDelete={() => onRemoveBenchmark(cur)} deleteLabel="移出基准" />
              </div>
            }
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Meta label="显示名" value={cur.display_name ?? '—'} />
            <Meta label="计价币种" value={cur.quote_currency ?? '—'} />
            <Meta label="资产类型" value={assetKindLabel(cur.asset_kind)} />
            <Meta label="默认叠加" value="是" />
            <Meta label="排序" value={order ? `#${order}` : '—'} />
          </div>
          <HistoryChart
            series={series}
            yFmt={(v) => native(v, currency, 4)}
            emptyText={series.length === 0 ? '暂无历史价格' : '历史价格不足 2 点,无法绘制走势 — 用批量导入 API §4.10.1 补足'}
            pointLabel="价格点"
          />
          <PricePointTable rows={sortPrices(historyRows, 'date_desc')} onEdit={onEditPrice} onDelete={onDeletePrice} />
        </>
      ) : (
        <EmptyPanel text="暂无基准；可在新增/编辑标的时勾选“用作基准”" />
      )}
    </MasterDetail>
  )
}

function MasterDetail({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', minHeight: 520 }}>
      <div style={{ borderRight: '1px solid var(--divider)', minWidth: 0 }}>{rail}</div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Rail({ search, empty, children }: { search?: ReactNode; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 620, minHeight: 520 }}>
      {search ? <div style={{ padding: 12, borderBottom: '1px solid var(--divider)' }}>{search}</div> : null}
      <div style={{ overflowY: 'auto', flex: 1 }}>{hasChildren ? children : <EmptyPanel text={empty} compact />}</div>
    </div>
  )
}

function RailButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        cursor: 'pointer',
        background: active ? 'var(--accent-bg)' : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        borderBottom: '1px solid var(--divider)',
      }}
    >
      {children}
    </button>
  )
}

function RailTitle({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        fontSize: 12.5,
        color: active ? 'var(--accent-bright)' : 'var(--text-strong)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

function RailSub({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </div>
  )
}

function InstrumentRail({
  items,
  selectedSymbol,
  onSelect,
  filter,
  onFilter,
  empty,
  benchmark,
}: {
  items: Instrument[]
  selectedSymbol: string
  onSelect: (symbol: string) => void
  filter: string
  onFilter: (value: string) => void
  empty: string
  benchmark?: boolean
}) {
  return (
    <Rail
      search={<Input value={filter} onChange={(e) => onFilter(e.target.value)} placeholder="过滤标的" aria-label="过滤标的" />}
      empty={empty}
    >
      {items.map((m, index) => (
        <RailButton key={m.symbol} active={m.symbol === selectedSymbol} onClick={() => onSelect(m.symbol)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <RailTitle active={m.symbol === selectedSymbol}>{benchmark ? (m.display_name ?? m.symbol) : m.symbol}</RailTitle>
            <RailSub>{benchmark ? `${m.symbol} · 默认叠加 · #${index + 1}` : (m.display_name ?? '—')}</RailSub>
          </div>
          <MarketBadge market={m.market} />
        </RailButton>
      ))}
    </Rail>
  )
}

function DetailHead({
  title,
  sub,
  series,
  actions,
}: {
  title: string
  sub?: ReactNode
  series: LineSeriesPoint[]
  actions?: ReactNode
}) {
  const range = series.length ? `${series[0].m} → ${series[series.length - 1].m} · ${series.length} 点` : '— · 0 点'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 15, color: 'var(--text-strong)' }}>{title}</span>
      {sub ? <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{sub}</span> : null}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{range}</span>
      {actions}
    </div>
  )
}

function HistoryToolbar({
  sort,
  onSort,
  listTruncated,
  historyTruncated,
  limit,
}: {
  sort: 'date_desc' | 'date_asc'
  onSort: (sort: 'date_desc' | 'date_asc') => void
  listTruncated?: boolean
  historyTruncated?: boolean
  limit?: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {listTruncated ? <Badge tone="warning">左栏基于前 {limit ?? 5000} 行聚合</Badge> : null}
      {historyTruncated ? <Badge tone="warning">当前历史已截断 {limit ?? 5000} 点</Badge> : null}
      <Segmented
        size="sm"
        value={sort}
        onChange={(v) => onSort(v as 'date_desc' | 'date_asc')}
        options={[
          { value: 'date_desc', label: '日期降序' },
          { value: 'date_asc', label: '日期升序' },
        ]}
      />
    </div>
  )
}

function HistoryChart({
  series,
  yFmt,
  emptyText,
  pointLabel,
}: {
  series: LineSeriesPoint[]
  yFmt: (v: number) => string
  emptyText: string
  pointLabel: string
}) {
  const hints = historyHints(series, pointLabel)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {series.length >= 2 ? (
        <LineChart series={series} height={210} yFmt={yFmt} />
      ) : (
        <div
          style={{
            height: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            background: 'var(--surface-inset)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
          }}
        >
          {emptyText}
        </div>
      )}
      {hints.map((hint) => (
        <div key={hint} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--warning)' }}>
          <Icon name="triangle-alert" size={13} />
          {hint} · 可用批量导入(API §4.10.1)补足
        </div>
      ))}
    </div>
  )
}

function InstrumentMeta({ instrument }: { instrument: Instrument }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Meta label="显示名" value={instrument.display_name ?? '—'} />
      <Meta label="市场" value={instrument.market ?? '—'} />
      <Meta label="计价币种" value={instrument.quote_currency ?? '—'} />
      <Meta label="资产类型" value={assetKindLabel(instrument.asset_kind)} />
      <Meta label="基准" value={instrument.is_benchmark ? '是' : '否'} />
    </div>
  )
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 12px', background: 'var(--surface-inset)', borderRadius: 'var(--radius-md)', minWidth: 84 }}>
      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function MarketTable({ children }: { children: ReactNode }) {
  return <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>{children}</table>
}

function PricePointTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: Price[]
  onEdit: (price: Price) => void
  onDelete: (price: Price) => void
}) {
  return (
    <MarketTable>
      <thead>
        <tr>
          <Th w="23%">日期</Th>
          <Th right w="25%">价格</Th>
          <Th w="16%">币种</Th>
          <Th>来源</Th>
          <Th w={88}></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <Row key={p.id}>
            <Td mono dim>{p.price_date}</Td>
            <Td right mono color="var(--text-strong)">{native(p.price, p.currency, 4)}</Td>
            <Td><Badge tone="neutral">{p.currency}</Badge></Td>
            <Td dim>{p.source || 'manual'}</Td>
            <Td right><RowActions onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} /></Td>
          </Row>
        ))}
        {!rows.length ? <EmptyTableRow text="暂无价格点" colSpan={5} /> : null}
      </tbody>
    </MarketTable>
  )
}

function FxPointTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: FxRate[]
  onEdit: (rate: FxRate) => void
  onDelete: (rate: FxRate) => void
}) {
  return (
    <MarketTable>
      <thead>
        <tr>
          <Th w="23%">日期</Th>
          <Th right w="28%">汇率</Th>
          <Th>来源</Th>
          <Th w={88}></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Row key={r.id}>
            <Td mono dim>{r.rate_date}</Td>
            <Td right mono color="var(--text-strong)">{formatRate(r.rate)}</Td>
            <Td dim>{r.source || 'manual'}</Td>
            <Td right><RowActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /></Td>
          </Row>
        ))}
        {!rows.length ? <EmptyTableRow text="暂无汇率点" colSpan={4} /> : null}
      </tbody>
    </MarketTable>
  )
}

function RowActions({
  onEdit,
  onDelete,
  deleteLabel = '删除',
}: {
  onEdit: () => void
  onDelete: () => void
  deleteLabel?: string
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      <IconButton aria-label="编辑" size="sm" onClick={onEdit}>
        <Icon name="pencil" size={13} />
      </IconButton>
      <IconButton aria-label={deleteLabel} size="sm" onClick={onDelete}>
        <Icon name="trash-2" size={13} />
      </IconButton>
    </div>
  )
}

function EmptyTableRow({ text, colSpan }: { text: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: '22px 12px',
          fontSize: 12.5,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
        }}
      >
        {text}
      </td>
    </tr>
  )
}

function EmptyPanel({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div
      style={{
        minHeight: compact ? 120 : 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'var(--text-tertiary)',
        fontSize: 12.5,
        padding: 18,
      }}
    >
      {text}
    </div>
  )
}

function PriceModal({
  item,
  defaultSymbol,
  defaultCurrency,
  onClose,
}: {
  item?: Price
  defaultSymbol?: string
  defaultCurrency?: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [symbol, setSymbol] = useState(item?.symbol ?? defaultSymbol ?? '')
  const [priceDate, setPriceDate] = useState(item?.price_date ?? todayISO())
  const [price, setPrice] = useState(item?.price ?? '')
  const [currency, setCurrency] = useState(item?.currency ?? defaultCurrency ?? 'HKD')
  const [source, setSource] = useState(item?.source ?? 'manual')
  const [note, setNote] = useState(item?.note ?? '')
  const [touched, setTouched] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      item
        ? updatePrice(item.id, { price_date: priceDate, price, currency, source, note })
        : upsertPrice({ symbol, price_date: priceDate, price, currency, source, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prices'] })
      void qc.invalidateQueries({ queryKey: ['instruments'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success(item ? '价格已更新' : '价格已新增')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })
  const invalid = touched && (!symbol.trim() || !price.trim())

  return (
    <Modal
      title={item ? '编辑价格' : '新增价格'}
      icon="candlestick-chart"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true)
              if (!symbol.trim() || !price.trim()) return
              mutation.mutate()
            }}
            disabled={mutation.isPending}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="fb-form form-4">
        <Field label="标的" error={invalid && !symbol.trim() ? '必填' : undefined}>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={!!item} placeholder="0700.HK" />
        </Field>
        <Field label="日期">
          <Input type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
        </Field>
        <Field label="价格" error={invalid && !price.trim() ? '必填' : undefined}>
          <Input numeric value={price} onChange={(e) => setPrice(e.target.value)} placeholder="401.20" />
        </Field>
        <Field label="币种">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={currencyOptions()} />
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="来源">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" />
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="备注">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" />
        </Field>
      </div>
    </Modal>
  )
}

function FxModal({ item, onClose }: { item?: FxRate; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [base, setBase] = useState(item?.base_currency ?? 'USD')
  const [quote, setQuote] = useState(item?.quote_currency ?? 'CNY')
  const [rateDate, setRateDate] = useState(item?.rate_date ?? todayISO())
  const [rate, setRate] = useState(item?.rate ?? '')
  const [source, setSource] = useState(item?.source ?? 'manual')
  const [note, setNote] = useState(item?.note ?? '')
  const [touched, setTouched] = useState(false)
  const invalid = touched && (!rate.trim() || base === quote)

  const mutation = useMutation({
    mutationFn: () =>
      item
        ? updateFxRate(item.id, { rate_date: rateDate, rate, source, note })
        : upsertFxRate({ base_currency: base, quote_currency: quote, rate_date: rateDate, rate, source, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fx-rates'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success(item ? '汇率已更新' : '汇率已新增')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  return (
    <Modal
      title={item ? '编辑汇率' : '新增汇率'}
      icon="repeat-2"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true)
              if (!rate.trim() || base === quote) return
              mutation.mutate()
            }}
            disabled={mutation.isPending}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="fb-form form-4">
        <Field label="基准币种" error={invalid && base === quote ? '币种不能相同' : undefined}>
          <Select value={base} onChange={(e) => setBase(e.target.value)} disabled={!!item} options={currencyOptions()} />
        </Field>
        <Field label="报价币种">
          <Select value={quote} onChange={(e) => setQuote(e.target.value)} disabled={!!item} options={currencyOptions()} />
        </Field>
        <Field label="日期">
          <Input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
        </Field>
        <Field label="汇率" error={invalid && !rate.trim() ? '必填' : undefined}>
          <Input numeric value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7.2000" />
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="来源">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" />
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="备注">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" />
        </Field>
      </div>
    </Modal>
  )
}

function InstrumentModal({
  item,
  benchmark,
  onClose,
}: {
  item?: Instrument
  benchmark?: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [symbol, setSymbol] = useState(item?.symbol ?? '')
  const [displayName, setDisplayName] = useState(item?.display_name ?? '')
  const [market, setMarket] = useState(item?.market ?? (benchmark ? 'INDEX' : 'US'))
  const [quoteCurrency, setQuoteCurrency] = useState(item?.quote_currency ?? 'USD')
  const [assetKind, setAssetKind] = useState(item?.asset_kind ?? (benchmark ? 'index' : 'equity'))
  const [isBenchmark, setIsBenchmark] = useState(item?.is_benchmark ?? !!benchmark)
  const [note, setNote] = useState(item?.note ?? '')
  const [touched, setTouched] = useState(false)
  const invalid = touched && !symbol.trim()

  const payload = {
    display_name: displayName || null,
    market: market || null,
    quote_currency: quoteCurrency || null,
    asset_kind: assetKind || null,
    is_benchmark: isBenchmark,
    note: note || null,
  }
  const mutation = useMutation({
    mutationFn: () => (item ? updateInstrument(item.symbol, payload) : upsertInstrument({ symbol, ...payload })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['instruments'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success(item ? '标的已更新' : '标的已新增')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  return (
    <Modal
      title={item ? '编辑标的' : benchmark ? '新增基准' : '新增标的'}
      icon="badge"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true)
              if (!symbol.trim()) return
              mutation.mutate()
            }}
            disabled={mutation.isPending}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="fb-form form-4">
        <Field label="标的代码" error={invalid ? '必填' : undefined}>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={!!item} placeholder="GOOG" />
        </Field>
        <Field label="显示名">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alphabet" />
        </Field>
        <Field label="市场">
          <Select value={market} onChange={(e) => setMarket(e.target.value)} options={MARKET_OPTIONS} />
        </Field>
        <Field label="计价币种">
          <Select value={quoteCurrency} onChange={(e) => setQuoteCurrency(e.target.value)} options={currencyOptions()} />
        </Field>
      </div>
      <div className="fb-form form-4" style={{ marginTop: 12 }}>
        <Field label="资产类型">
          <Select value={assetKind} onChange={(e) => setAssetKind(e.target.value)} options={ASSET_KIND_OPTIONS} />
        </Field>
        <Field label="基准">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 'var(--control-md)', color: 'var(--text-secondary)', fontSize: 13 }}>
            <input type="checkbox" checked={isBenchmark} onChange={(e) => setIsBenchmark(e.target.checked)} />
            用作基准
          </label>
        </Field>
        <Field label="备注">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" />
        </Field>
      </div>
    </Modal>
  )
}

function groupFxRates(rows: FxRate[]) {
  const map = new Map<string, FxPairGroup>()
  rows.forEach((row) => {
    const key = `${row.base_currency}/${row.quote_currency}`
    const cur = map.get(key)
    if (!cur) {
      map.set(key, { key, base: row.base_currency, quote: row.quote_currency, count: 1, latest: row })
      return
    }
    cur.count += 1
    if (row.rate_date > cur.latest.rate_date) cur.latest = row
  })
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

function filterInstruments(items: Instrument[], filter: string) {
  const q = filter.trim().toLowerCase()
  const sorted = [...items].sort((a, b) => a.symbol.localeCompare(b.symbol))
  if (!q) return sorted
  return sorted.filter(
    (i) =>
      i.symbol.toLowerCase().includes(q) ||
      (i.display_name ?? '').toLowerCase().includes(q) ||
      (i.market ?? '').toLowerCase().includes(q),
  )
}

function pickFirstAvailable(values: string[], current: string, setCurrent: (value: string) => void) {
  if (!values.length) {
    if (current) setCurrent('')
    return
  }
  if (!current || !values.includes(current)) setCurrent(values[0])
}

function parseFxPair(pair: string) {
  const [base, quote] = pair.split('/')
  if (!base || !quote) return null
  return { base, quote }
}

function exactPriceRows(rows: Price[], symbol: string) {
  if (!symbol) return []
  return rows.filter((row) => row.symbol === symbol)
}

function exactFxRows(rows: FxRate[], base: string, quote: string) {
  return rows.filter((row) => row.base_currency === base && row.quote_currency === quote)
}

function sortPrices(rows: Price[], sort: 'date_desc' | 'date_asc') {
  return [...rows].sort((a, b) => (sort === 'date_asc' ? a.price_date.localeCompare(b.price_date) : b.price_date.localeCompare(a.price_date)))
}

function sortFxRates(rows: FxRate[], sort: 'date_desc' | 'date_asc') {
  return [...rows].sort((a, b) => (sort === 'date_asc' ? a.rate_date.localeCompare(b.rate_date) : b.rate_date.localeCompare(a.rate_date)))
}

function priceSeries(rows: Price[]): LineSeriesPoint[] {
  return rows
    .map((row) => ({ m: row.price_date, v: Number(row.price) }))
    .filter((point) => Number.isFinite(point.v))
}

function fxSeries(rows: FxRate[]): LineSeriesPoint[] {
  return rows
    .map((row) => ({ m: row.rate_date, v: Number(row.rate) }))
    .filter((point) => Number.isFinite(point.v))
}

function latestPrice(rows: Price[]) {
  return sortPrices(rows, 'date_desc')[0]
}

function latestFxRate(rows: FxRate[]) {
  return sortFxRates(rows, 'date_desc')[0]
}

function historyHints(series: LineSeriesPoint[], pointLabel: string) {
  const hints: string[] = []
  if (series.length > 0 && series.length < 4) {
    hints.push(`${pointLabel}偏少,趋势/基准曲线可能不平滑`)
  }
  const gap = maxGapDays(series)
  if (gap > 45) hints.push(`存在 ${gap} 天缺口`)
  return hints
}

function maxGapDays(series: LineSeriesPoint[]) {
  let max = 0
  for (let i = 1; i < series.length; i += 1) {
    const prev = new Date(`${series[i - 1].m}T00:00:00`).getTime()
    const cur = new Date(`${series[i].m}T00:00:00`).getTime()
    if (Number.isFinite(prev) && Number.isFinite(cur)) {
      max = Math.max(max, Math.round((cur - prev) / 86_400_000))
    }
  }
  return max
}

function formatRate(rate: string | number | null | undefined) {
  if (rate == null || rate === '') return '—'
  const n = typeof rate === 'number' ? rate : Number(rate)
  if (!Number.isFinite(n)) return String(rate)
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function formatAxisRate(rate: number) {
  return rate.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function currencyOptions() {
  return ACCOUNT_CURRENCIES.map((value) => ({ value, label: value }))
}

function MarketBadge({ market }: { market: string | null }) {
  const key = market || '—'
  const color = market ? MARKET_TONE[market] ?? 'var(--text-secondary)' : 'var(--text-tertiary)'
  return (
    <span className="fb-badge fb-badge--neutral" style={{ color }}>
      <span className="fb-badge__dot" style={{ background: color }} />
      {key}
    </span>
  )
}

function assetKindLabel(kind: string | null) {
  if (!kind) return '—'
  return ASSET_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind
}
