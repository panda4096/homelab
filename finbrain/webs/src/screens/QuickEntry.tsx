import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DateField, Field, Icon, Input, Segmented, Select } from '../ds'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { useUiStore, type QuickEntryState, type QuickEntryType } from '../uiStore'
import {
  ApiError,
  listAccounts,
  listBalanceSnapshots,
  listInstruments,
  listPositionSnapshots,
  updateBalanceSnapshot,
  updatePositionSnapshot,
  upsertBalanceSnapshot,
  upsertPositionSnapshot,
  type Account,
} from '../api'
import {
  isNumericString,
  KIND_LABEL,
  maxSnapshotDateISO,
  native,
  supportsBalanceSnapshots,
  supportsPositionSnapshots,
  SYM,
  todayISO,
} from '../lib/format'
import { usePrefStore } from '../store'

const TYPE_OPTIONS = [
  { value: 'balance', label: '更新余额' },
  { value: 'position', label: '更新持仓' },
]

function accountLabel(a: Account): string {
  return `${a.institution} · ${a.name} (${a.currency})`
}

export function QuickEntry() {
  const target = useUiStore((s) => s.quickEntry)
  const close = useUiStore((s) => s.closeQuickEntry)
  if (!target) return null
  return <QuickEntryInner initial={target} onClose={close} />
}

function QuickEntryInner({
  initial,
  onClose,
}: {
  initial: QuickEntryState
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const isEdit = !!initial.isEdit
  const lockType = isEdit || !!initial.lockType
  const lockAccount = isEdit || !!initial.lockAccount
  const lockSymbol = isEdit || !!initial.lockSymbol

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const { data: instruments = [] } = useQuery({
    queryKey: ['instruments'],
    queryFn: listInstruments,
  })

  const [type, setType] = useState<QuickEntryType>(initial.type ?? 'balance')

  // Account pool: non-archived, filtered by the record type each account kind supports.
  const pool = useMemo(() => {
    const live = accounts.filter((a) => !a.is_archived)
    return type === 'balance'
      ? live.filter((a) => supportsBalanceSnapshots(a.kind))
      : live.filter((a) => supportsPositionSnapshots(a.kind))
  }, [accounts, type])

  const [accountId, setAccountId] = useState<string>(() =>
    initial.accountId != null ? String(initial.accountId) : '',
  )
  // keep the selection valid when switching type filters the pool
  const effectiveAccountId =
    accountId && pool.some((a) => String(a.id) === accountId)
      ? accountId
      : pool.length
        ? String(pool[0].id)
        : ''
  const account = pool.find((a) => String(a.id) === effectiveAccountId)

  const [date, setDate] = useState(initial.date ?? todayISO(timezone))
  const [note, setNote] = useState(initial.note ?? '')

  // balance fields
  const [balance, setBalance] = useState(initial.balance ?? '')

  // position fields
  const [symbol, setSymbol] = useState(initial.symbol ?? '')
  const [quantity, setQuantity] = useState(initial.quantity ?? '')
  const [avgCost, setAvgCost] = useState(initial.avgCost ?? '')
  const [costCurrency, setCostCurrency] = useState(initial.costCurrency ?? '')

  const [touched, setTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const accountCcy = account?.currency ?? 'CNY'
  const maxDate = maxSnapshotDateISO(timezone)

  // resolve the matched instrument (case-insensitive) for cost-currency defaulting
  const matchedInstrument = useMemo(() => {
    const s = symbol.trim().toUpperCase()
    if (!s) return undefined
    return instruments.find((i) => i.symbol.toUpperCase() === s)
  }, [instruments, symbol])

  // ---- "保留上次" prefills ----
  const prefillBalance = useMutation({
    mutationFn: () => listBalanceSnapshots(Number(effectiveAccountId)),
    onSuccess: (snaps) => {
      if (snaps.length) {
        setBalance(snaps[0].balance)
        toast.info(`已带入上次余额 ${native(snaps[0].balance, accountCcy, 2)}`)
      } else {
        toast.info('该账户暂无历史余额记录')
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '读取失败'),
  })

  const prefillPosition = useMutation({
    mutationFn: () => listPositionSnapshots(Number(effectiveAccountId)),
    onSuccess: (snaps) => {
      const s = symbol.trim().toUpperCase()
      const last = snaps.find((p) => p.symbol.toUpperCase() === s)
      if (last) {
        setQuantity(last.quantity)
        if (last.avg_cost != null) setAvgCost(last.avg_cost)
        if (last.cost_currency != null) setCostCurrency(last.cost_currency)
        toast.info(`已带入 ${last.symbol} 上次持仓`)
      } else {
        toast.info('该账户该标的暂无历史持仓')
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '读取失败'),
  })

  // ---- validation ----
  const errs: Record<string, string> = {}
  if (!effectiveAccountId) errs.account = '请选择账户'
  if (!date) errs.date = '请选择日期'
  else if (date > maxDate) errs.date = '日期不能晚于今天 +7 天'
  if (type === 'balance') {
    if (!isNumericString(balance)) errs.balance = '余额必须为数字'
  } else {
    if (!symbol.trim()) errs.symbol = '请填写标的代码'
    if (!isNumericString(quantity)) errs.quantity = '数量必须为数字'
    else if (Number(quantity) < 0) errs.quantity = '数量不能为负'
    if (avgCost.trim() !== '' && !isNumericString(avgCost)) errs.avgCost = '成本必须为数字'
  }
  const valid = Object.keys(errs).length === 0
  const negativeBalance = type === 'balance' && isNumericString(balance) && Number(balance) < 0

  const save = useMutation({
    mutationFn: async () => {
      const accId = Number(effectiveAccountId)
      if (type === 'balance') {
        const payload = {
          snapshot_date: date,
          balance: balance.trim(),
          note: note.trim() || undefined,
        }
        if (isEdit && initial.snapshotId != null) {
          return updateBalanceSnapshot(initial.snapshotId, payload)
        }
        return upsertBalanceSnapshot({
          account_id: accId,
          ...payload,
        })
      }
      const resolvedCcy =
        costCurrency.trim() || matchedInstrument?.quote_currency || accountCcy
      const payload = {
        quantity: quantity.trim(),
        avg_cost: avgCost.trim() || undefined,
        cost_currency: avgCost.trim() ? resolvedCcy : undefined,
        snapshot_date: date,
        note: note.trim() || undefined,
      }
      if (isEdit && initial.snapshotId != null) {
        return updatePositionSnapshot(initial.snapshotId, payload)
      }
      return upsertPositionSnapshot({
        account_id: accId,
        symbol: symbol.trim().toUpperCase(),
        ...payload,
      })
    },
    onSuccess: () => {
      const accId = Number(effectiveAccountId)
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['account', accId] })
      void qc.invalidateQueries({ queryKey: ['balance-snapshots', accId] })
      void qc.invalidateQueries({ queryKey: ['position-snapshots', accId] })
      void qc.invalidateQueries({ queryKey: ['positions', accId] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success(type === 'balance' ? '余额已保存' : '持仓已保存')
      onClose()
    },
    onError: (e) => {
      setFormError(e instanceof ApiError || e instanceof Error ? e.message : '保存失败')
    },
  })

  function submit() {
    setTouched(true)
    setFormError(null)
    if (!valid) return
    save.mutate()
  }

  const ccySym = SYM[accountCcy] ?? accountCcy
  const modalTitle = isEdit
    ? '编辑记录'
    : lockType
      ? type === 'balance'
        ? '更新余额'
        : '更新持仓'
      : '快速录入'

  return (
    <Modal
      title={modalTitle}
      icon="zap"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Icon name="check" size={14} />}
            onClick={submit}
            disabled={save.isPending || (touched && !valid) || !pool.length}
          >
            {save.isPending ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!lockType ? (
          <Segmented
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => {
              setType(v as QuickEntryType)
              setTouched(false)
              setFormError(null)
            }}
          />
        ) : null}

        {!pool.length ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '4px 0' }}>
            {type === 'balance'
              ? '没有可更新余额的账户（仅现金、定期、理财账户支持）。'
              : '没有可更新持仓的账户（仅证券、基金、加密钱包账户支持）。'}
          </div>
        ) : null}

        <Field label="账户" error={touched ? errs.account : undefined}>
          <Select
            value={effectiveAccountId}
            disabled={lockAccount}
            onChange={(e) => setAccountId(e.target.value)}
            options={pool.map((a) => ({ value: String(a.id), label: accountLabel(a) }))}
          />
        </Field>

        {type === 'balance' ? (
          <SectionHint>
            <Icon name="info" size={12} /> 现金、定期、理财账户更新余额；持仓型账户请更新持仓。
          </SectionHint>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="日期" hint={`默认今天 · 最晚 ${maxDate}`} error={touched ? errs.date : undefined}>
            <DateField
              value={date}
              max={maxDate}
              invalid={touched && !!errs.date}
              onChange={setDate}
            />
          </Field>
          {type === 'balance' ? (
            <Field
              label="余额"
              error={touched ? errs.balance : undefined}
              hint={negativeBalance ? undefined : '可为负（如透支）'}
            >
              <Input
                numeric
                prefix={ccySym}
                placeholder="0.00"
                value={balance}
                invalid={touched && !!errs.balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="数量" error={touched ? errs.quantity : undefined}>
              <Input
                numeric
                placeholder="0"
                value={quantity}
                invalid={touched && !!errs.quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          )}
        </div>

        {negativeBalance ? (
          <SectionHint warn>
            <Icon name="triangle-alert" size={12} color="var(--warning)" /> 余额为负，请确认无误。
          </SectionHint>
        ) : null}

        {type === 'position' ? (
          <>
            <Field label="标的" error={touched ? errs.symbol : undefined}>
              <Input
                placeholder="如 AAPL / 0700.HK / BTC"
                list="fb-instruments"
                value={symbol}
                disabled={lockSymbol}
                invalid={touched && !!errs.symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
              <datalist id="fb-instruments">
                {instruments.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.display_name ?? i.symbol}
                  </option>
                ))}
              </datalist>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="平均成本（可选）" error={touched ? errs.avgCost : undefined}>
                <Input
                  numeric
                  placeholder="0.00"
                  value={avgCost}
                  invalid={touched && !!errs.avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                />
              </Field>
              <Field
                label="成本币种（可选）"
                hint={
                  matchedInstrument?.quote_currency
                    ? `默认 ${matchedInstrument.quote_currency}`
                    : `默认 ${accountCcy}`
                }
              >
                <Input
                  placeholder={matchedInstrument?.quote_currency ?? accountCcy}
                  value={costCurrency}
                  onChange={(e) => setCostCurrency(e.target.value.toUpperCase())}
                />
              </Field>
            </div>
          </>
        ) : null}

        <Field label="备注（可选）">
          <Input
            placeholder="可留空"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {type === 'balance' ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon name="history" size={13} />}
              disabled={!effectiveAccountId || prefillBalance.isPending}
              onClick={() => prefillBalance.mutate()}
            >
              保留上次
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon name="history" size={13} />}
              disabled={!effectiveAccountId || !symbol.trim() || prefillPosition.isPending}
              onClick={() => prefillPosition.mutate()}
            >
              保留上次
            </Button>
          )}
          {account ? (
            <Badge tone="neutral">{KIND_LABEL[account.kind] ?? account.kind}</Badge>
          ) : null}
        </div>

        {formError ? (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--danger)',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
            }}
          >
            {formError}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function SectionHint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        color: warn ? 'var(--warning)' : 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}
