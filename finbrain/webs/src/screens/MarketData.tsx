import { useMemo, useState } from 'react'
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
import { Row, Td, Th } from '../lib/ui'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'

type Tab = 'prices' | 'fx' | 'instruments' | 'benchmarks'
type Editor =
  | { kind: 'price'; item?: Price }
  | { kind: 'fx'; item?: FxRate }
  | { kind: 'instrument'; item?: Instrument; benchmark?: boolean }
  | null

const TAB_OPTIONS = [
  { value: 'prices', label: '价格' },
  { value: 'fx', label: '汇率' },
  { value: 'instruments', label: '标的' },
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
  const [tab, setTab] = useState<Tab>('prices')
  const [editor, setEditor] = useState<Editor>(null)
  const [priceSymbol, setPriceSymbol] = useState('')
  const [priceSort, setPriceSort] = useState<'date_desc' | 'date_asc'>('date_desc')
  const [fxSort, setFxSort] = useState<'date_desc' | 'date_asc'>('date_desc')
  const qc = useQueryClient()
  const toast = useToast()

  const prices = useQuery({
    queryKey: ['prices', priceSymbol, priceSort],
    queryFn: () => listPrices({ symbol: priceSymbol.trim(), sort: priceSort }),
  })
  const fxRates = useQuery({
    queryKey: ['fx-rates', fxSort],
    queryFn: () => listFxRates({ sort: fxSort }),
  })
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments })
  const benchmarks = useMemo(
    () => (instruments.data ?? []).filter((i) => i.is_benchmark),
    [instruments.data],
  )

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

  const actionText = { prices: '价格', fx: '汇率', instruments: '标的', benchmarks: '基准' }[tab]

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
              tab === 'prices'
                ? { kind: 'price' }
                : tab === 'fx'
                  ? { kind: 'fx' }
                  : { kind: 'instrument', benchmark: tab === 'benchmarks' },
            )
          }
        >
          新增{actionText}
        </Button>
      </div>

      <Card padded={false}>
        {tab === 'prices' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderBottom: '1px solid var(--divider)' }}>
            <Input
              value={priceSymbol}
              onChange={(e) => setPriceSymbol(e.target.value)}
              placeholder="按标的过滤"
              style={{ maxWidth: 220 }}
            />
            <Segmented
              size="sm"
              value={priceSort}
              onChange={(v) => setPriceSort(v as 'date_desc' | 'date_asc')}
              options={[
                { value: 'date_desc', label: '日期降序' },
                { value: 'date_asc', label: '日期升序' },
              ]}
            />
            {prices.data?.truncated ? <Badge tone="warning">仅显示前 {prices.data.limit} 行</Badge> : null}
          </div>
        ) : tab === 'fx' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderBottom: '1px solid var(--divider)' }}>
            <Segmented
              size="sm"
              value={fxSort}
              onChange={(v) => setFxSort(v as 'date_desc' | 'date_asc')}
              options={[
                { value: 'date_desc', label: '日期降序' },
                { value: 'date_asc', label: '日期升序' },
              ]}
            />
            {fxRates.data?.truncated ? <Badge tone="warning">仅显示前 {fxRates.data.limit} 行</Badge> : null}
          </div>
        ) : null}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          {tab === 'prices' ? (
            <MarketTable>
              <thead>
                <tr>
                  <Th>标的</Th>
                  <Th>日期</Th>
                  <Th right>价格</Th>
                  <Th>币种</Th>
                  <Th>来源</Th>
                  <Th w={92}></Th>
                </tr>
              </thead>
              <tbody>
                {(prices.data?.items ?? []).map((p) => (
                  <Row key={p.id}>
                    <Td mono color="var(--text-strong)">{p.symbol}</Td>
                    <Td mono dim>{p.price_date}</Td>
                    <Td right mono color="var(--text-strong)">{native(p.price, p.currency, 4)}</Td>
                    <Td><Badge tone="neutral">{p.currency}</Badge></Td>
                    <Td dim>{p.source || 'manual'}</Td>
                    <Td right>
                      <RowActions
                        onEdit={() => setEditor({ kind: 'price', item: p })}
                        onDelete={() => removePrice.mutate(p.id)}
                      />
                    </Td>
                  </Row>
                ))}
                {!prices.isLoading && !(prices.data?.items ?? []).length ? <EmptyRow text="暂无价格" /> : null}
              </tbody>
            </MarketTable>
          ) : tab === 'fx' ? (
            <MarketTable>
              <thead>
                <tr>
                  <Th>币种对</Th>
                  <Th>日期</Th>
                  <Th right>汇率</Th>
                  <Th>来源</Th>
                  <Th w={92}></Th>
                </tr>
              </thead>
              <tbody>
                {(fxRates.data?.items ?? []).map((r) => (
                  <Row key={r.id}>
                    <Td mono color="var(--text-strong)">{r.base_currency}/{r.quote_currency}</Td>
                    <Td mono dim>{r.rate_date}</Td>
                    <Td right mono color="var(--text-strong)">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 8 })}</Td>
                    <Td dim>{r.source || 'manual'}</Td>
                    <Td right>
                      <RowActions onEdit={() => setEditor({ kind: 'fx', item: r })} onDelete={() => removeFx.mutate(r.id)} />
                    </Td>
                  </Row>
                ))}
                {!fxRates.isLoading && !(fxRates.data?.items ?? []).length ? <EmptyRow text="暂无汇率" /> : null}
              </tbody>
            </MarketTable>
          ) : (
            <MarketTable>
              <thead>
                <tr>
                  <Th>标的</Th>
                  <Th>名称</Th>
                  <Th>市场</Th>
                  <Th>计价币种</Th>
                  <Th>资产类型</Th>
                  <Th>基准</Th>
                  <Th w={92}></Th>
                </tr>
              </thead>
              <tbody>
                {(tab === 'benchmarks' ? benchmarks : instruments.data ?? []).map((m) => (
                  <Row key={m.symbol}>
                    <Td mono color="var(--text-strong)">{m.symbol}</Td>
                    <Td>{m.display_name ?? '—'}</Td>
                    <Td><MarketBadge market={m.market} /></Td>
                    <Td><Badge tone="neutral">{m.quote_currency ?? '—'}</Badge></Td>
                    <Td dim>{assetKindLabel(m.asset_kind)}</Td>
                    <Td>{m.is_benchmark ? <Badge tone="gold">基准</Badge> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</Td>
                    <Td right>
                      <RowActions
                        onEdit={() => setEditor({ kind: 'instrument', item: m, benchmark: tab === 'benchmarks' })}
                        onDelete={() => removeInstrument.mutate(m.symbol)}
                      />
                    </Td>
                  </Row>
                ))}
                {!instruments.isLoading && !(tab === 'benchmarks' ? benchmarks : instruments.data ?? []).length ? (
                  <EmptyRow text={tab === 'benchmarks' ? '暂无基准' : '暂无标的'} />
                ) : null}
              </tbody>
            </MarketTable>
          )}
        </div>
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.6 }}>
        <Icon name="info" size={13} />
        {tab === 'fx'
          ? '反向汇率自动互换；缺失时按 1:1 降级并在仪表盘提示。'
          : tab === 'prices'
            ? '市价手动维护或后续接入自动数据源；无价格时市值显示“无价格”，不阻塞其他计算。'
            : '标的元数据用于市场、计价币种和基准展示；已有持仓引用的标的不能直接删除。'}
      </div>

      {editor?.kind === 'price' ? <PriceModal item={editor.item} onClose={() => setEditor(null)} /> : null}
      {editor?.kind === 'fx' ? <FxModal item={editor.item} onClose={() => setEditor(null)} /> : null}
      {editor?.kind === 'instrument' ? (
        <InstrumentModal item={editor.item} benchmark={editor.benchmark} onClose={() => setEditor(null)} />
      ) : null}
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1320, margin: '0 auto' }}>
      {children}
    </div>
  )
}

function MarketTable({ children }: { children: React.ReactNode }) {
  return <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>{children}</table>
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      <IconButton aria-label="编辑" size="sm" onClick={onEdit}>
        <Icon name="pencil" size={13} />
      </IconButton>
      <IconButton aria-label="删除" size="sm" onClick={onDelete}>
        <Icon name="trash-2" size={13} />
      </IconButton>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <tr>
      <Td dim>{text}</Td>
    </tr>
  )
}

function PriceModal({ item, onClose }: { item?: Price; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [symbol, setSymbol] = useState(item?.symbol ?? '')
  const [priceDate, setPriceDate] = useState(item?.price_date ?? todayISO())
  const [price, setPrice] = useState(item?.price ?? '')
  const [currency, setCurrency] = useState(item?.currency ?? 'HKD')
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
