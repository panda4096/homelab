import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, DateField, Icon, IconButton, Input, Select } from '../ds'
import { SectionHint } from '../lib/ui'
import { invalidatePortfolio } from '../lib/invalidate'
import {
  ACCOUNT_CURRENCIES,
  isNumericString,
  maxSnapshotDateISO,
  native,
  quantity,
  supportsBalanceSnapshots,
  supportsPositionSnapshots,
  todayISO,
} from '../lib/format'
import {
  ApiError,
  listAccounts,
  listAllocationTargets,
  listBalanceSnapshots,
  listPositions,
  submitReviewBatch,
  type Account,
} from '../api'
import { useToast } from '../shell/Toast'
import { usePrefStore } from '../store'

const DRAFT_KEY = 'finbrain.reviewDraft.v1'

const STEPS = [
  { id: 1, label: '盘点日期', icon: 'calendar' },
  { id: 2, label: '金额型账户', icon: 'wallet' },
  { id: 3, label: '持仓型账户', icon: 'trending-up' },
  { id: 4, label: '公司动作', icon: 'split' },
  { id: 5, label: '账户转账', icon: 'repeat' },
  { id: 6, label: '信用卡账单', icon: 'receipt' },
  { id: 7, label: '收益事件', icon: 'coins' },
  { id: 8, label: '漂移检视', icon: 'target' },
  { id: 9, label: '预览确认', icon: 'clipboard-check' },
]

interface BalanceDraft {
  account_id: number
  account_label: string
  currency: string
  last_balance: string
  balance: string
  skip: boolean
  note: string
  touched?: boolean // user typed a custom 当日余额 (vs. the last-value default)
  confirmed?: boolean // user eyeballed this row 已核对 — a review-progress aid, no submit effect
}

interface PositionDraft {
  key: string
  account_id: number
  account_label: string
  account_currency: string
  symbol: string
  quantity: string
  avg_cost: string
  cost_currency: string
  skip: boolean
  note: string
}

interface BillDraft {
  key: string
  account_id: number
  account_label: string
  currency: string
  statement_date: string
  amount_total: string
  paid: boolean
  paid_at: string
  payment_account_id: string
  note: string
}

interface TransactionDraft {
  key: string
  account_id: number
  account_label: string
  symbol: string
  action: 'buy' | 'sell'
  trade_date: string
  quantity: string
  price: string
  currency: string
  fee: string
  is_settled: boolean
  notes: string
}

interface CorporateActionDraft {
  key: string
  symbol: string
  action: 'split' | 'merge' | 'rights'
  event_date: string
  ratio_numerator: string
  ratio_denominator: string
  notes: string
}

interface TransferDraft {
  key: string
  from_account_id: string
  to_account_id: string
  from_amount: string
  to_amount: string
  transfer_date: string
  notes: string
}

interface IncomeDraft {
  key: string
  event_kind: 'dividend' | 'interest' | 'rebate' | 'other'
  event_date: string
  account_id: string
  symbol: string
  amount: string
  currency: string
  payment_account_id: string
  tax_withheld: string
  note: string
}

interface ReviewDraft {
  reviewDate: string
  balances: BalanceDraft[]
  positions: PositionDraft[]
  bills: BillDraft[]
  transactions: TransactionDraft[]
  corporateActions: CorporateActionDraft[]
  transfers: TransferDraft[]
  incomeEvents: IncomeDraft[]
}

export function ReviewWizard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const [step, setStep] = useState(1)
  const [reviewDate, setReviewDate] = useState(todayISO(timezone))
  const [balances, setBalances] = useState<BalanceDraft[]>([])
  const [positions, setPositions] = useState<PositionDraft[]>([])
  const [bills, setBills] = useState<BillDraft[]>([])
  const [transactions, setTransactions] = useState<TransactionDraft[]>([])
  const [corporateActions, setCorporateActions] = useState<CorporateActionDraft[]>([])
  const [transfers, setTransfers] = useState<TransferDraft[]>([])
  const [incomeEvents, setIncomeEvents] = useState<IncomeDraft[]>([])
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [reconciled, setReconciled] = useState(false)
  const [batchErrors, setBatchErrors] = useState<string[]>([])

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  })
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.is_archived), [accounts])
  const balanceAccounts = useMemo(
    () => activeAccounts.filter((a) => supportsBalanceSnapshots(a.kind)),
    [activeAccounts],
  )
  const positionAccounts = useMemo(
    () => activeAccounts.filter((a) => supportsPositionSnapshots(a.kind)),
    [activeAccounts],
  )
  const creditAccounts = useMemo(
    () => activeAccounts.filter((a) => a.kind === 'credit_card'),
    [activeAccounts],
  )
  const paymentAccounts = useMemo(
    () => activeAccounts.filter((a) => a.kind !== 'credit_card'),
    [activeAccounts],
  )

  const balanceQueries = useQueries({
    queries: balanceAccounts.map((a) => ({
      queryKey: ['balance-snapshots', a.id],
      queryFn: () => listBalanceSnapshots(a.id),
    })),
  })
  const positionQueries = useQueries({
    queries: positionAccounts.map((a) => ({
      queryKey: ['positions', a.id],
      queryFn: () => listPositions(a.id),
    })),
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as ReviewDraft
        if (d.reviewDate) setReviewDate(d.reviewDate)
        if (Array.isArray(d.balances)) setBalances(d.balances)
        if (Array.isArray(d.positions)) setPositions(d.positions)
        if (Array.isArray(d.bills)) setBills(d.bills)
        if (Array.isArray(d.transactions)) setTransactions(d.transactions)
        if (Array.isArray(d.corporateActions)) setCorporateActions(d.corporateActions)
        if (Array.isArray(d.transfers)) setTransfers(d.transfers)
        if (Array.isArray(d.incomeEvents)) setIncomeEvents(d.incomeEvents)
        setInitialized(true)
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    } finally {
      setDraftLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!draftLoaded || initialized || accountsLoading) return
    if (balanceQueries.some((q) => q.isLoading) || positionQueries.some((q) => q.isLoading)) return
    setBalances(
      balanceAccounts.map((account, index) => {
        const last = balanceQueries[index].data?.[0]?.balance ?? account.current_balance ?? ''
        return {
          account_id: account.id,
          account_label: accountLabel(account),
          currency: account.currency,
          last_balance: last,
          balance: last,
          skip: false,
          note: '',
        }
      }),
    )
    setPositions(
      positionAccounts.flatMap((account, index) =>
        (positionQueries[index].data ?? [])
          .filter((p) => Number(p.quantity) !== 0)
          .map((p) => ({
            key: `${account.id}:${p.symbol}`,
            account_id: account.id,
            account_label: accountLabel(account),
            account_currency: account.currency,
            symbol: p.symbol,
            quantity: p.quantity,
            avg_cost: p.avg_cost ?? '',
            cost_currency: p.cost_currency ?? account.currency,
            skip: false,
            note: '',
          })),
      ),
    )
    setBills([])
    setInitialized(true)
  }, [accountsLoading, balanceAccounts, balanceQueries, draftLoaded, initialized, positionAccounts, positionQueries])

  // Reconcile a restored draft against the LIVE active accounts: a draft can reference accounts
  // deleted/archived since it was saved (e.g. 招商银行) or miss newly added ones. The live list is
  // authoritative for WHICH balance rows exist; draft-entered values are kept by account_id.
  // Positions are pruned to still-active accounts. Runs once, after accounts + snapshots load.
  useEffect(() => {
    if (!draftLoaded || !initialized || reconciled || accountsLoading) return
    if (balanceQueries.some((q) => q.isLoading) || positionQueries.some((q) => q.isLoading)) return
    setBalances((prev) => {
      const byId = new Map(prev.map((r) => [r.account_id, r] as const))
      return balanceAccounts.map((account, index) => {
        const draftRow = byId.get(account.id)
        const last = balanceQueries[index].data?.[0]?.balance ?? account.current_balance ?? ''
        // Default to the CURRENT last value; keep a draft balance only if the user actually typed
        // one (touched). A stale unedited default — whose last value has since changed — resets,
        // instead of lingering as a phantom "changed" amount.
        const touched = !!draftRow?.touched
        return {
          account_id: account.id,
          account_label: accountLabel(account),
          currency: account.currency,
          last_balance: last,
          balance: touched ? draftRow!.balance : last,
          skip: draftRow?.skip ?? false,
          note: draftRow?.note ?? '',
          touched,
          confirmed: draftRow?.confirmed ?? false,
        }
      })
    })
    const liveIds = new Set(positionAccounts.map((a) => a.id))
    setPositions((prev) => prev.filter((p) => liveIds.has(p.account_id)))
    setReconciled(true)
  }, [accountsLoading, balanceAccounts, balanceQueries, draftLoaded, initialized, positionAccounts, positionQueries, reconciled])

  useEffect(() => {
    if (!draftLoaded || !initialized) return
    const payload: ReviewDraft = { reviewDate, balances, positions, bills, transactions, corporateActions, transfers, incomeEvents }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
  }, [balances, bills, corporateActions, draftLoaded, incomeEvents, initialized, positions, reviewDate, transactions, transfers])

  const submit = useMutation({
    mutationFn: () =>
      submitReviewBatch({
        review_date: reviewDate,
        balance_snapshots: balances
          .filter((b) => !b.skip && b.balance.trim() !== '')
          .map((b) => ({
            account_id: b.account_id,
            snapshot_date: reviewDate,
            balance: b.balance.trim(),
            note: b.note.trim() || undefined,
          })),
        position_snapshots: positions
          .filter((p) => !p.skip && p.symbol.trim() && p.quantity.trim())
          .map((p) => ({
            account_id: p.account_id,
            symbol: p.symbol.trim().toUpperCase(),
            quantity: p.quantity.trim(),
            avg_cost: p.avg_cost.trim() || undefined,
            cost_currency: p.avg_cost.trim() ? p.cost_currency : undefined,
            snapshot_date: reviewDate,
            note: p.note.trim() || undefined,
          })),
        credit_card_bills: bills
          .filter((b) => b.amount_total.trim() && Number(b.account_id) > 0)
          .map((b) => ({
            account_id: b.account_id,
            statement_date: b.statement_date || reviewDate,
            amount_total: b.amount_total.trim(),
            currency: b.currency,
            top_categories: [],
            // Repayment is recorded as a transfer into the card, not per-bill.
            paid_at: null,
            payment_account_id: null,
            note: b.note.trim() || null,
          })),
        transactions: transactions
          .filter((t) => t.account_id > 0 && t.symbol.trim() && t.quantity.trim() && t.price.trim())
          .map((t) => ({
            account_id: t.account_id,
            symbol: t.symbol.trim().toUpperCase(),
            action: t.action,
            trade_date: t.trade_date || reviewDate,
            quantity: t.quantity.trim(),
            price: t.price.trim(),
            currency: t.currency,
            fee: t.fee.trim() || null,
            is_settled: t.is_settled,
            notes: t.notes.trim() || null,
          })),
        transfers: transfers
          .filter((t) => t.from_account_id && t.to_account_id && t.from_amount.trim() && t.to_amount.trim())
          .map((t) => ({
            from_account_id: Number(t.from_account_id),
            to_account_id: Number(t.to_account_id),
            from_amount: t.from_amount.trim(),
            to_amount: t.to_amount.trim(),
            transfer_date: t.transfer_date || reviewDate,
            notes: t.notes.trim() || null,
          })),
        income_events: incomeEvents
          .filter((e) => e.account_id && e.amount.trim())
          .map((e) => ({
            event_kind: e.event_kind,
            event_date: e.event_date || reviewDate,
            account_id: Number(e.account_id),
            symbol: e.symbol.trim() || null,
            amount: e.amount.trim(),
            currency: e.currency,
            payment_account_id: e.payment_account_id ? Number(e.payment_account_id) : null,
            tax_withheld: e.tax_withheld.trim() || null,
            note: e.note.trim() || null,
          })),
        corporate_actions: corporateActions
          .filter((c) => c.symbol.trim() && c.ratio_numerator.trim() && c.ratio_denominator.trim())
          .map((c) => ({
            symbol: c.symbol.trim().toUpperCase(),
            action: c.action,
            event_date: c.event_date || reviewDate,
            ratio_numerator: c.ratio_numerator.trim(),
            ratio_denominator: c.ratio_denominator.trim(),
            notes: c.notes.trim() || null,
          })),
      }),
    onSuccess: (res) => {
      localStorage.removeItem(DRAFT_KEY)
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['account'] })
      invalidatePortfolio(qc)
      void qc.invalidateQueries({ queryKey: ['balance-snapshots'] })
      void qc.invalidateQueries({ queryKey: ['positions'] })
      void qc.invalidateQueries({ queryKey: ['credit-card-bills'] })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      void qc.invalidateQueries({ queryKey: ['income-events'] })
      void qc.invalidateQueries({ queryKey: ['corporate-actions'] })
      toast.success(`盘点已提交：${res.balance_snapshots + res.position_snapshots + res.credit_card_bills + res.transactions + res.transfers + res.income_events + res.corporate_actions} 条记录`)
      navigate('/dashboard')
    },
    onError: (e) => {
      if (e instanceof ApiError && Array.isArray(e.details)) {
        setBatchErrors(e.details.map(formatBatchErrorDetail))
      } else {
        setBatchErrors([e instanceof Error ? e.message : '提交失败'])
      }
    },
  })

  const current = STEPS.find((s) => s.id === step) ?? STEPS[0]
  const counts = {
    balances: balances.filter((b) => !b.skip && b.balance.trim()).length,
    positions: positions.filter((p) => !p.skip && p.symbol.trim() && p.quantity.trim()).length,
    bills: bills.filter((b) => b.amount_total.trim()).length,
    transactions: transactions.filter((t) => t.account_id > 0 && t.symbol.trim() && t.quantity.trim() && t.price.trim()).length,
    corporateActions: corporateActions.filter((c) => c.symbol.trim() && c.ratio_numerator.trim() && c.ratio_denominator.trim()).length,
    transfers: transfers.filter((t) => t.from_account_id && t.to_account_id && t.from_amount.trim() && t.to_amount.trim()).length,
    incomeEvents: incomeEvents.filter((e) => e.account_id && e.amount.trim()).length,
  }

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Icon name="clipboard-check" size={20} color="var(--accent)" />
        <h2 style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-strong)', margin: 0 }}>
          {reviewDate.slice(0, 4)} 年 {Number(reviewDate.slice(5, 7))} 月盘点
        </h2>
        <Badge tone="gold">草稿已自动保存</Badge>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>步骤 {step} / 9</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>退出</Button>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-inset)', margin: '12px 0 22px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(step / 9) * 100}%`, background: 'var(--gradient-gold)', transition: 'width .3s var(--ease-out)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '156px minmax(0, 1fr)', gap: 14, alignItems: 'flex-start' }}>
        <StepRail step={step} onStep={setStep} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card
            eyebrow={`步骤 ${step}`}
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name={current.icon} size={17} color="var(--accent)" />{current.label}</span>}
            subtitle={subtitleForStep(step)}
            actions={step === 2 ? (
              <Button variant="secondary" size="sm" iconLeft={<Icon name="copy" size={14} />} onClick={() => setBalances((items) => items.map((b) => ({ ...b, balance: b.last_balance, skip: false, touched: false })))}>
                全部保留上次
              </Button>
            ) : null}
          >
            {step === 1 ? (
              <DateStep reviewDate={reviewDate} onChange={setReviewDate} />
            ) : step === 2 ? (
              <BalanceStep rows={balances} setRows={setBalances} />
            ) : step === 3 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <PositionStep rows={positions} setRows={setPositions} accounts={positionAccounts} />
                <TransactionStep rows={transactions} setRows={setTransactions} accounts={positionAccounts} reviewDate={reviewDate} />
              </div>
            ) : step === 4 ? (
              <CorporateActionStep rows={corporateActions} setRows={setCorporateActions} reviewDate={reviewDate} />
            ) : step === 5 ? (
              <TransferStep rows={transfers} setRows={setTransfers} accounts={paymentAccounts} reviewDate={reviewDate} />
            ) : step === 6 ? (
              <BillStep rows={bills} setRows={setBills} creditAccounts={creditAccounts} reviewDate={reviewDate} />
            ) : step === 7 ? (
              <IncomeStep rows={incomeEvents} setRows={setIncomeEvents} accounts={activeAccounts} paymentAccounts={paymentAccounts} reviewDate={reviewDate} />
            ) : step === 8 ? (
              <DriftReview />
            ) : step === 9 ? (
              <PreviewStep
                balances={balances}
                positions={positions}
                transactions={transactions}
                corporateActions={corporateActions}
                transfers={transfers}
                bills={bills}
                incomeEvents={incomeEvents}
                accounts={activeAccounts}
                counts={counts}
                errors={batchErrors}
              />
            ) : (
              <PlaceholderStep step={current} />
            )}
          </Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
            <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))} iconLeft={<Icon name="arrow-left" size={15} />}>
              上一步
            </Button>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  localStorage.setItem(DRAFT_KEY, JSON.stringify({ reviewDate, balances, positions, bills, transactions, corporateActions, transfers, incomeEvents }))
                  toast.success('草稿已保存')
                }}
              >
                保存草稿
              </Button>
              <Button
                variant="primary"
                disabled={submit.isPending}
                onClick={() => {
                  setBatchErrors([])
                  if (step === 9) {
                    const errors = validateReviewDraft(balances, positions, bills, transactions, corporateActions, transfers, incomeEvents, timezone)
                    if (errors.length) {
                      setBatchErrors(errors)
                      return
                    }
                    submit.mutate()
                  } else {
                    setStep((s) => Math.min(9, s + 1))
                  }
                }}
                iconRight={<Icon name={step === 9 ? 'check' : 'arrow-right'} size={15} />}
              >
                {step === 9 ? (submit.isPending ? '提交中…' : '确认提交') : '下一步'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}

function StepRail({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <div style={{ width: 156, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {STEPS.map((s) => {
        const done = s.id < step
        const cur = s.id === step
        return (
          <button
            key={s.id}
            onClick={() => onStep(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
              background: cur ? 'var(--accent-bg)' : 'transparent',
              transition: 'var(--transition-control)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: done ? 'var(--accent)' : cur ? 'transparent' : 'var(--surface-inset)',
                border: cur ? '1.5px solid var(--accent)' : done ? 'none' : '1px solid var(--border-default)',
                color: done ? 'var(--accent-text)' : cur ? 'var(--accent-bright)' : 'var(--text-tertiary)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}
            >
              {done ? <Icon name="check" size={12} /> : s.id}
            </span>
            <span style={{ fontSize: 12, color: cur ? 'var(--accent-bright)' : done ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontWeight: cur ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DateStep({ reviewDate, onChange }: { reviewDate: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'start' }}>
      <DateField value={reviewDate} onChange={(v) => onChange(v)} />
      <SectionHint>盘点日期会作为本批余额和持仓记录的日期；同账户同日期提交会幂等覆盖。</SectionHint>
    </div>
  )
}

function BalanceStep({ rows, setRows }: { rows: BalanceDraft[]; setRows: (rows: BalanceDraft[] | ((rows: BalanceDraft[]) => BalanceDraft[])) => void }) {
  // Focused-row review: only ONE row is accent-highlighted at a time (the one being worked on),
  // not the whole list. Defaults to the first un-核对 row; follows clicks; auto-advances on confirm.
  const [focused, setFocused] = useState(() => Math.max(0, rows.findIndex((r) => !r.confirmed)))
  if (!rows.length) return <EmptyLine text="暂无金额型账户。" />
  const columns = 'minmax(180px, 1fr) minmax(96px, .56fr) minmax(170px, .86fr) 88px'
  const confirmedCount = rows.filter((r) => r.confirmed).length
  const allConfirmed = confirmedCount === rows.length

  // confirm a row (无变化 / 提交) then jump focus to the next still-un核对 row
  const confirm = (index: number) => {
    setRows((items) => items.map((it, i) => (i === index ? { ...it, confirmed: true, skip: false } : it)))
    const after = rows.findIndex((r, i) => i > index && !r.confirmed)
    setFocused(after >= 0 ? after : rows.findIndex((r, i) => i !== index && !r.confirmed))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
        <span style={{ fontSize: 11.5, color: confirmedCount ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
          已核对 <span className="fb-num" style={{ color: 'var(--accent-bright, var(--accent))' }}>{confirmedCount}</span> / {rows.length}
        </span>
        <Button variant="ghost" size="xs" onClick={() => setRows((items) => items.map((it) => ({ ...it, confirmed: !allConfirmed, skip: false })))}>
          {allConfirmed ? '全部取消' : '全部核对'}
        </Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, padding: '0 12px 2px', fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span>账户</span><span style={{ textAlign: 'right' }}>上次值</span><span>当日余额</span><span />
      </div>
      {rows.map((row, index) => {
        const isFocused = index === focused && !row.confirmed
        return (
          <div
            key={row.account_id}
            onClick={() => setFocused(index)}
            style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: `1px solid ${isFocused ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-md)', padding: '10px 12px', opacity: row.confirmed ? 0.5 : 1, transition: 'opacity .15s, border-color .15s', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setRows((items) => items.map((it, i) => (i === index ? { ...it, confirmed: !it.confirmed } : it))) }}
                title={row.confirmed ? '已核对 · 点击取消' : '标记已核对'}
                style={{ width: 20, height: 20, flexShrink: 0, borderRadius: '50%', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: row.confirmed ? 'none' : `1.5px solid ${isFocused ? 'var(--accent)' : 'var(--text-tertiary)'}`, background: row.confirmed ? 'var(--accent)' : 'transparent', color: 'var(--accent-text)' }}
              >
                {row.confirmed ? <Icon name="check" size={12} /> : null}
              </button>
              <span title={row.account_label} style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{row.account_label}</span>
              <Badge tone="neutral">{row.currency}</Badge>
            </div>
            <span className="fb-num" style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 12.5 }}>{native(row.last_balance, row.currency, 2)}</span>
            <Input
              numeric
              prefix={row.currency}
              value={row.balance}
              onFocus={() => setFocused(index)}
              onChange={(e) => setRows((items) => items.map((it, i) => (i === index ? { ...it, balance: e.target.value, touched: true, confirmed: false, skip: false } : it)))}
              size="sm"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {row.confirmed ? (
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>已核对</span>
              ) : (
                <Button variant={row.touched ? 'secondary' : 'ghost'} size="xs" onClick={(e) => { e.stopPropagation(); confirm(index) }}>
                  {row.touched ? '提交' : '无变化'}
                </Button>
              )}
            </div>
          </div>
        )
      })}
      <SectionHint>逐个核对：没改动点「无变化」、改了金额点「提交」即标记已核对(✓ 变暗),焦点自动跳下一个。缺失值不会提交;负余额仍按资产带符号计入。</SectionHint>
    </div>
  )
}

function PositionStep({
  rows,
  setRows,
  accounts,
}: {
  rows: PositionDraft[]
  setRows: (rows: PositionDraft[] | ((rows: PositionDraft[]) => PositionDraft[])) => void
  accounts: Account[]
}) {
  if (!accounts.length) return <EmptyLine text="暂无持仓型账户。" />
  function addRow(account: Account) {
    setRows((items) => [
      ...items,
      {
        key: `${account.id}:new:${Date.now()}`,
        account_id: account.id,
        account_label: accountLabel(account),
        account_currency: account.currency,
        symbol: '',
        quantity: '',
        avg_cost: '',
        cost_currency: account.currency,
        skip: false,
        note: '',
      },
    ])
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {accounts.map((account) => {
        const group = rows.filter((r) => r.account_id === account.id)
        return (
          <div key={account.id} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--divider)', background: 'var(--surface-inset)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{accountLabel(account)}</span>
              <Badge tone="neutral">{account.currency}</Badge>
              <Button variant="ghost" size="xs" iconLeft={<Icon name="plus" size={12} />} onClick={() => addRow(account)} style={{ marginLeft: 'auto' }}>
                添加标的
              </Button>
            </div>
            {group.length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.map((row) => (
                  <PositionDraftRow key={row.key} row={row} setRows={setRows} />
                ))}
              </div>
            ) : (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>暂无当前持仓，可添加新标的。</div>
            )}
          </div>
        )
      })}
      <SectionHint>数量填 0 表示本次盘点确认清仓；移除行只是不在本次批量提交。</SectionHint>
    </div>
  )
}

function PositionDraftRow({
  row,
  setRows,
}: {
  row: PositionDraft
  setRows: (rows: PositionDraft[] | ((rows: PositionDraft[]) => PositionDraft[])) => void
}) {
  function patch(next: Partial<PositionDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1.2fr) minmax(110px, .75fr) minmax(130px, .85fr) 108px 76px', gap: 8, alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--divider)' }}>
      <Input placeholder="GOOG / 0700.HK" value={row.symbol} disabled={row.skip} onChange={(e) => patch({ symbol: e.target.value.toUpperCase(), skip: false })} size="sm" />
      <Input numeric placeholder="数量" value={row.quantity} disabled={row.skip} onChange={(e) => patch({ quantity: e.target.value, skip: false })} size="sm" />
      <Input numeric placeholder="平均成本" value={row.avg_cost} disabled={row.skip} onChange={(e) => patch({ avg_cost: e.target.value, skip: false })} size="sm" />
      <Select
        size="sm"
        value={row.cost_currency}
        disabled={row.skip}
        onChange={(e) => patch({ cost_currency: e.target.value })}
        options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <IconButton aria-label="无变化" size="sm" onClick={() => patch({ skip: true })}>
          <Icon name="minus" size={13} />
        </IconButton>
        <IconButton aria-label="移除" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
          <Icon name="x" size={13} />
        </IconButton>
      </div>
    </div>
  )
}

function TransactionStep({
  rows,
  setRows,
  accounts,
  reviewDate,
}: {
  rows: TransactionDraft[]
  setRows: (rows: TransactionDraft[] | ((rows: TransactionDraft[]) => TransactionDraft[])) => void
  accounts: Account[]
  reviewDate: string
}) {
  function addRow() {
    const account = accounts[0]
    if (!account) return
    setRows((items) => [
      ...items,
      {
        key: `txn:${Date.now()}`,
        account_id: account.id,
        account_label: accountLabel(account),
        symbol: '',
        action: 'buy',
        trade_date: reviewDate,
        quantity: '',
        price: '',
        currency: account.currency,
        fee: '',
        is_settled: true,
        notes: '',
      },
    ])
  }
  if (!accounts.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle title="补录交易流水" hint="可选；买卖流水会参与持仓回放、已实现盈亏和净持有成本。" />
        <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={addRow}>新增交易</Button>
      </div>
      {rows.length ? rows.map((row) => (
        <TransactionDraftRow key={row.key} row={row} setRows={setRows} accounts={accounts} />
      )) : <EmptyLine text="本次盘点暂无待提交交易流水。" />}
    </div>
  )
}

function TransactionDraftRow({
  row,
  setRows,
  accounts,
}: {
  row: TransactionDraft
  setRows: (rows: TransactionDraft[] | ((rows: TransactionDraft[]) => TransactionDraft[])) => void
  accounts: Account[]
}) {
  const timezone = usePrefStore((s) => s.timezone)
  function patch(next: Partial<TransactionDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(148px, 1.1fr) 82px minmax(116px, .8fr) 102px 112px 78px 88px 62px 32px', gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <Select
        size="sm"
        value={String(row.account_id)}
        onChange={(e) => {
          const account = accounts.find((a) => String(a.id) === e.target.value)
          if (account) patch({ account_id: account.id, account_label: accountLabel(account), currency: account.currency })
        }}
        options={accounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))}
      />
      <Select size="sm" value={row.action} onChange={(e) => patch({ action: e.target.value as 'buy' | 'sell' })} options={[{ value: 'buy', label: '买入' }, { value: 'sell', label: '卖出' }]} />
      <Input placeholder="标的" value={row.symbol} onChange={(e) => patch({ symbol: e.target.value.toUpperCase() })} size="sm" />
      <Input numeric placeholder="数量" value={row.quantity} onChange={(e) => patch({ quantity: e.target.value })} size="sm" />
      <Input numeric placeholder="价格" value={row.price} onChange={(e) => patch({ price: e.target.value })} size="sm" />
      <Select size="sm" value={row.currency} onChange={(e) => patch({ currency: e.target.value })} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} />
      <Input numeric placeholder="手续费" value={row.fee} onChange={(e) => patch({ fee: e.target.value })} size="sm" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={row.is_settled} onChange={(e) => patch({ is_settled: e.target.checked })} /> 已交割
      </label>
      <IconButton aria-label="移除交易" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
        <Icon name="x" size={13} />
      </IconButton>
      <div style={{ gridColumn: '1 / 3' }}>
        <DateField value={row.trade_date} max={maxSnapshotDateISO(timezone)} onChange={(v) => patch({ trade_date: v })} size="sm" />
      </div>
      <div style={{ gridColumn: '3 / -1' }}>
        <Input placeholder="备注" value={row.notes} onChange={(e) => patch({ notes: e.target.value })} size="sm" />
      </div>
    </div>
  )
}

function CorporateActionStep({
  rows,
  setRows,
  reviewDate,
}: {
  rows: CorporateActionDraft[]
  setRows: (rows: CorporateActionDraft[] | ((rows: CorporateActionDraft[]) => CorporateActionDraft[])) => void
  reviewDate: string
}) {
  function addRow() {
    setRows((items) => [...items, { key: `ca:${Date.now()}`, symbol: '', action: 'split', event_date: reviewDate, ratio_numerator: '', ratio_denominator: '1', notes: '' }])
  }
  return (
    <DraftSection title="公司动作" hint="录入拆股、合股、配股等影响持仓回放的事件。" button="新增公司动作" onAdd={addRow}>
      {rows.length ? rows.map((row) => (
        <CorporateActionDraftRow key={row.key} row={row} setRows={setRows} />
      )) : <EmptyLine text="本次盘点暂无待提交公司动作。" />}
    </DraftSection>
  )
}

function CorporateActionDraftRow({
  row,
  setRows,
}: {
  row: CorporateActionDraft
  setRows: (rows: CorporateActionDraft[] | ((rows: CorporateActionDraft[]) => CorporateActionDraft[])) => void
}) {
  const timezone = usePrefStore((s) => s.timezone)
  function patch(next: Partial<CorporateActionDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) 94px 126px 112px 112px 32px', gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <Input placeholder="标的" value={row.symbol} onChange={(e) => patch({ symbol: e.target.value.toUpperCase() })} size="sm" />
      {/* 配股(rights) needs extra.{rights_price, base_share_ratio}, which this compact row can't capture —
          it goes through the dedicated 公司动作 screen. Offering it here only produced silently-dropped rows. */}
      <Select size="sm" value={row.action} onChange={(e) => patch({ action: e.target.value as 'split' | 'merge' | 'rights' })} options={[{ value: 'split', label: '拆股' }, { value: 'merge', label: '合股' }]} />
      <DateField value={row.event_date} max={maxSnapshotDateISO(timezone)} onChange={(v) => patch({ event_date: v })} size="sm" />
      <Input numeric placeholder="比例分子" value={row.ratio_numerator} onChange={(e) => patch({ ratio_numerator: e.target.value })} size="sm" />
      <Input numeric placeholder="比例分母" value={row.ratio_denominator} onChange={(e) => patch({ ratio_denominator: e.target.value })} size="sm" />
      <IconButton aria-label="移除公司动作" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
        <Icon name="x" size={13} />
      </IconButton>
      <div style={{ gridColumn: '1 / -1' }}>
        <Input placeholder="备注" value={row.notes} onChange={(e) => patch({ notes: e.target.value })} size="sm" />
      </div>
    </div>
  )
}

function TransferStep({
  rows,
  setRows,
  accounts,
  reviewDate,
}: {
  rows: TransferDraft[]
  setRows: (rows: TransferDraft[] | ((rows: TransferDraft[]) => TransferDraft[])) => void
  accounts: Account[]
  reviewDate: string
}) {
  function addRow() {
    setRows((items) => [...items, { key: `transfer:${Date.now()}`, from_account_id: '', to_account_id: '', from_amount: '', to_amount: '', transfer_date: reviewDate, notes: '' }])
  }
  return (
    <DraftSection title="账户转账" hint="录入账户间资金移动，净资产不变但会影响现金对账。" button="新增转账" onAdd={addRow}>
      {rows.length ? rows.map((row) => (
        <TransferDraftRow key={row.key} row={row} setRows={setRows} accounts={accounts} />
      )) : <EmptyLine text="本次盘点暂无待提交转账。" />}
    </DraftSection>
  )
}

function TransferDraftRow({
  row,
  setRows,
  accounts,
}: {
  row: TransferDraft
  setRows: (rows: TransferDraft[] | ((rows: TransferDraft[]) => TransferDraft[])) => void
  accounts: Account[]
}) {
  const timezone = usePrefStore((s) => s.timezone)
  function patch(next: Partial<TransferDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(150px, 1fr) 118px 118px 126px 32px', gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <Select size="sm" value={row.from_account_id} onChange={(e) => patch({ from_account_id: e.target.value })} placeholder="转出账户" options={accounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))} />
      <Select size="sm" value={row.to_account_id} onChange={(e) => patch({ to_account_id: e.target.value })} placeholder="转入账户" options={accounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))} />
      <Input numeric placeholder="转出金额" value={row.from_amount} onChange={(e) => patch({ from_amount: e.target.value })} size="sm" />
      <Input numeric placeholder="转入金额" value={row.to_amount} onChange={(e) => patch({ to_amount: e.target.value })} size="sm" />
      <DateField value={row.transfer_date} max={maxSnapshotDateISO(timezone)} onChange={(v) => patch({ transfer_date: v })} size="sm" />
      <IconButton aria-label="移除转账" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
        <Icon name="x" size={13} />
      </IconButton>
      <div style={{ gridColumn: '1 / -1' }}>
        <Input placeholder="备注" value={row.notes} onChange={(e) => patch({ notes: e.target.value })} size="sm" />
      </div>
    </div>
  )
}

function IncomeStep({
  rows,
  setRows,
  accounts,
  paymentAccounts,
  reviewDate,
}: {
  rows: IncomeDraft[]
  setRows: (rows: IncomeDraft[] | ((rows: IncomeDraft[]) => IncomeDraft[])) => void
  accounts: Account[]
  paymentAccounts: Account[]
  reviewDate: string
}) {
  function addRow() {
    const account = accounts[0]
    setRows((items) => [...items, { key: `income:${Date.now()}`, event_kind: 'dividend', event_date: reviewDate, account_id: account ? String(account.id) : '', symbol: '', amount: '', currency: account?.currency ?? 'USD', payment_account_id: '', tax_withheld: '', note: '' }])
  }
  return (
    <DraftSection title="收益事件" hint="录入分红、利息、返现等非买卖收益。" button="新增收益" onAdd={addRow}>
      {rows.length ? rows.map((row) => (
        <IncomeDraftRow key={row.key} row={row} setRows={setRows} accounts={accounts} paymentAccounts={paymentAccounts} />
      )) : <EmptyLine text="本次盘点暂无待提交收益事件。" />}
    </DraftSection>
  )
}

function IncomeDraftRow({
  row,
  setRows,
  accounts,
  paymentAccounts,
}: {
  row: IncomeDraft
  setRows: (rows: IncomeDraft[] | ((rows: IncomeDraft[]) => IncomeDraft[])) => void
  accounts: Account[]
  paymentAccounts: Account[]
}) {
  const timezone = usePrefStore((s) => s.timezone)
  function patch(next: Partial<IncomeDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(150px, 1fr) minmax(116px, .75fr) 112px 76px 126px 92px 32px', gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <Select size="sm" value={row.event_kind} onChange={(e) => patch({ event_kind: e.target.value as IncomeDraft['event_kind'] })} options={[{ value: 'dividend', label: '分红' }, { value: 'interest', label: '利息' }, { value: 'rebate', label: '返现' }, { value: 'other', label: '其他' }]} />
      <Select
        size="sm"
        value={row.account_id}
        onChange={(e) => {
          const account = accounts.find((a) => String(a.id) === e.target.value)
          patch({ account_id: e.target.value, currency: account?.currency ?? row.currency })
        }}
        placeholder="归属账户"
        options={accounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))}
      />
      <Input placeholder="标的可空" value={row.symbol} onChange={(e) => patch({ symbol: e.target.value.toUpperCase() })} size="sm" />
      <Input numeric placeholder="金额" value={row.amount} onChange={(e) => patch({ amount: e.target.value })} size="sm" />
      <Select size="sm" value={row.currency} onChange={(e) => {
        const c = e.target.value
        const pa = paymentAccounts.find((a) => String(a.id) === row.payment_account_id)
        patch(pa && pa.currency !== c ? { currency: c, payment_account_id: '' } : { currency: c })
      }} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} />
      <DateField value={row.event_date} max={maxSnapshotDateISO(timezone)} onChange={(v) => patch({ event_date: v })} size="sm" />
      <Input numeric placeholder="税费" value={row.tax_withheld} onChange={(e) => patch({ tax_withheld: e.target.value })} size="sm" />
      <IconButton aria-label="移除收益" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
        <Icon name="x" size={13} />
      </IconButton>
      <Select size="sm" value={row.payment_account_id} onChange={(e) => patch({ payment_account_id: e.target.value })} placeholder="收款账户可空" options={paymentAccounts.filter((a) => a.currency === row.currency).map((a) => ({ value: String(a.id), label: accountLabel(a) }))} wrapStyle={{ gridColumn: '1 / 4' }} />
      <div style={{ gridColumn: '4 / -1' }}>
        <Input placeholder="备注" value={row.note} onChange={(e) => patch({ note: e.target.value })} size="sm" />
      </div>
    </div>
  )
}

function DraftSection({ title, hint, button, onAdd, children }: { title: string; hint: string; button: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle title={title} hint={hint} />
        <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={onAdd}>{button}</Button>
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <div style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>
    </div>
  )
}

function BillStep({
  rows,
  setRows,
  creditAccounts,
  reviewDate,
}: {
  rows: BillDraft[]
  setRows: (rows: BillDraft[] | ((rows: BillDraft[]) => BillDraft[])) => void
  creditAccounts: Account[]
  reviewDate: string
}) {
  function addBill() {
    const account = creditAccounts[0]
    if (!account) return
    setRows((items) => [
      ...items,
      {
        key: `bill:${Date.now()}`,
        account_id: account.id,
        account_label: accountLabel(account),
        currency: account.currency,
        statement_date: reviewDate,
        amount_total: '',
        paid: false,
        paid_at: reviewDate,
        payment_account_id: '',
        note: '',
      },
    ])
  }
  if (!creditAccounts.length) {
    return <EmptyLine text="暂无信用卡账户。可先在「账户列表」新增一个信用卡账户。" />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHint>向导中录入本期账单总额；还款请在「转账」里转入信用卡账户。顶类目明细可在账户详情页补充。</SectionHint>
        <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={addBill}>新增账单</Button>
      </div>
      {rows.length ? rows.map((row) => (
        <BillDraftRow key={row.key} row={row} setRows={setRows} creditAccounts={creditAccounts} />
      )) : <EmptyLine text="本次盘点暂无待提交信用卡账单。" />}
    </div>
  )
}

function BillDraftRow({
  row,
  setRows,
  creditAccounts,
}: {
  row: BillDraft
  setRows: (rows: BillDraft[] | ((rows: BillDraft[]) => BillDraft[])) => void
  creditAccounts: Account[]
}) {
  const timezone = usePrefStore((s) => s.timezone)
  function patch(next: Partial<BillDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 118px minmax(140px, .9fr) 76px 32px', gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <Select
        size="sm"
        value={String(row.account_id)}
        onChange={(e) => {
          const account = creditAccounts.find((a) => String(a.id) === e.target.value)
          if (account) patch({ account_id: account.id, account_label: accountLabel(account), currency: account.currency })
        }}
        options={creditAccounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))}
      />
      <DateField value={row.statement_date} max={maxSnapshotDateISO(timezone)} onChange={(v) => patch({ statement_date: v })} size="sm" />
      <Input numeric prefix={row.currency} placeholder="账单总额" value={row.amount_total} min="0.01" onChange={(e) => patch({ amount_total: e.target.value })} size="sm" />
      <Select size="sm" value={row.currency} onChange={(e) => patch({ currency: e.target.value })} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} />
      <IconButton aria-label="移除账单" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
        <Icon name="x" size={13} />
      </IconButton>
    </div>
  )
}

function PreviewStep({
  balances,
  positions,
  transactions,
  corporateActions,
  transfers,
  bills,
  incomeEvents,
  accounts,
  counts,
  errors,
}: {
  balances: BalanceDraft[]
  positions: PositionDraft[]
  transactions: TransactionDraft[]
  corporateActions: CorporateActionDraft[]
  transfers: TransferDraft[]
  bills: BillDraft[]
  incomeEvents: IncomeDraft[]
  accounts: Account[]
  counts: { balances: number; positions: number; bills: number; transactions: number; corporateActions: number; transfers: number; incomeEvents: number }
  errors: string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fb-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <PreviewCard label="余额记录" value={counts.balances} />
        <PreviewCard label="持仓记录" value={counts.positions} />
        <PreviewCard label="交易流水" value={counts.transactions} />
        <PreviewCard label="公司动作" value={counts.corporateActions} />
        <PreviewCard label="账户转账" value={counts.transfers} />
        <PreviewCard label="信用卡账单" value={counts.bills} />
        <PreviewCard label="收益事件" value={counts.incomeEvents} />
      </div>
      {errors.length ? (
        <div style={{ background: 'var(--warning-bg)', border: '1px solid rgba(221,162,62,0.3)', borderRadius: 'var(--radius-md)', padding: 12 }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.7 }}>{e}</div>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <PreviewList title="余额" rows={balances.filter((b) => !b.skip && b.balance).map((b) => `${b.account_label} · ${native(b.balance, b.currency, 2)}`)} />
        <PreviewList title="持仓" rows={positions.filter((p) => !p.skip && p.symbol && p.quantity).map((p) => `${p.account_label} · ${p.symbol} · ${quantity(p.quantity)}`)} />
        <PreviewList title="交易" rows={transactions.filter((t) => t.symbol && t.quantity && t.price).map((t) => `${t.account_label} · ${t.action === 'buy' ? '买入' : '卖出'} ${t.symbol} · ${quantity(t.quantity)} @ ${t.price} ${t.currency}`)} />
        <PreviewList title="公司动作" rows={corporateActions.filter((c) => c.symbol && c.ratio_numerator && c.ratio_denominator).map((c) => `${c.event_date} · ${c.symbol} · ${CA_ACTION[c.action]} ${c.ratio_numerator}:${c.ratio_denominator}`)} />
        <PreviewList title="转账" rows={transfers.filter((t) => t.from_account_id && t.to_account_id && t.from_amount && t.to_amount).map((t) => `${accountNameByID(t.from_account_id, accounts)} → ${accountNameByID(t.to_account_id, accounts)} · ${t.from_amount}/${t.to_amount}`)} />
        <PreviewList title="账单" rows={bills.filter((b) => b.amount_total).map((b) => `${b.account_label} · ${native(b.amount_total, b.currency, 2)} · ${b.paid ? '已还' : '未还'}`)} />
        <PreviewList title="收益" rows={incomeEvents.filter((e) => e.account_id && e.amount).map((e) => `${INCOME_KIND[e.event_kind]}${e.symbol ? ' · ' + e.symbol : ''} · ${native(e.amount, e.currency, 2)}`)} />
      </div>
      <SectionHint>确认提交后，所有记录在同一个事务里写入；任一行失败会整批回滚。</SectionHint>
    </div>
  )
}

function PreviewCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="fb-stat">
      <div className="fb-stat__label">{label}</div>
      <div className="fb-stat__value"><span className="fb-num">{value}</span></div>
    </div>
  )
}

function PreviewList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12, minHeight: 120 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 8 }}>{title}</div>
      {rows.length ? rows.slice(0, 8).map((r, i) => (
        <div key={i} style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.8 }}>{r}</div>
      )) : <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>无待提交记录</div>}
    </div>
  )
}

// Compact labels used by preview and review summaries.
const CA_ACTION: Record<string, string> = { split: '拆股', merge: '合股', rights: '配股' }
const INCOME_KIND: Record<string, string> = { dividend: '分红', interest: '利息', rebate: '返现', other: '其他' }

function DriftReview() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['allocation-targets'], queryFn: () => listAllocationTargets() })
  const lines = (q.data ?? []).filter((s) => !s.is_archived).map((s) => `${s.name} · ${s.dimension} · 阈值 ±${s.drift_threshold_pct}%`)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHint>检视各目标配置的当前漂移（提醒为主，不阻塞提交）。</SectionHint>
      <div className="fb-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>目标配置</span>
          <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} iconRight={<Icon name="arrow-right" size={13} />} onClick={() => navigate('/targets')}>去目标配置</Button>
        </div>
        {lines.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lines.map((line, index) => <div key={index} style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '6px 0', borderBottom: '1px solid var(--divider)', fontFamily: 'var(--font-mono)' }}>{line}</div>)}
          </div>
        ) : <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>{q.isLoading ? '加载中…' : '暂无目标配置'}</span>}
      </div>
    </div>
  )
}

function PlaceholderStep({ step }: { step: { label: string; icon: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '44px 20px', textAlign: 'center', color: 'var(--text-tertiary)', gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={step.icon} size={24} color="var(--text-secondary)" />
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{step.label}步骤</div>
      <div style={{ fontSize: 12.5, maxWidth: 390, lineHeight: 1.6 }}>
        本阶段仅保留入口和草稿上下文，不参与批量写入；后续 P4/P5 回填真实计算。
      </div>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>{text}</div>
}

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '22px 18px', width: '100%', maxWidth: 1280, margin: '0 auto', boxSizing: 'border-box' }}>{children}</div>
}

function accountLabel(account: Account) {
  return `${account.institution} · ${account.name}`
}

function accountNameByID(id: string, accounts: Account[]) {
  const account = accounts.find((a) => String(a.id) === id)
  return account ? accountLabel(account) : `账户 ${id}`
}

function formatBatchErrorDetail(detail: any) {
  const entity = detail?.entity_type ?? detail?.resource ?? 'row'
  const rawIndex = typeof detail?.line_index === 'number' ? detail.line_index : detail?.index
  const indexText = typeof rawIndex === 'number' ? ` #${rawIndex + 1}` : ''
  const fieldText = detail?.field ? `.${detail.field}` : ''
  const codeText = detail?.error_code ? ` (${detail.error_code})` : ''
  const message = detail?.message ?? '无效行'
  return `${entity}${indexText}${fieldText}${codeText}: ${message}`
}

function validateReviewDraft(
  balances: BalanceDraft[],
  positions: PositionDraft[],
  bills: BillDraft[],
  transactions: TransactionDraft[],
  corporateActions: CorporateActionDraft[],
  transfers: TransferDraft[],
  incomeEvents: IncomeDraft[],
  timezone: string,
) {
  const errors: string[] = []
  const maxDate = maxSnapshotDateISO(timezone)
  balances.forEach((bal, index) => {
    if (bal.skip || !bal.balance.trim()) return
    const row = `balance_snapshots #${index + 1}`
    if (!isNumericString(bal.balance)) errors.push(`${row}: 余额必须为数字`)
  })
  positions.forEach((pos, index) => {
    if (pos.skip || (!pos.symbol.trim() && !pos.quantity.trim())) return
    const row = `position_snapshots #${index + 1}`
    if (!pos.symbol.trim()) errors.push(`${row}: 标的必填`)
    if (!isNumericString(pos.quantity) || Number(pos.quantity) < 0) errors.push(`${row}: 数量必须大于等于 0（0 = 清仓）`)
    if (pos.avg_cost.trim() && !isNumericString(pos.avg_cost)) errors.push(`${row}: 成本必须为数字`)
  })
  bills.forEach((bill, index) => {
    if (!bill.amount_total.trim()) return
    const row = `credit_card_bills #${index + 1}`
    if (!isNumericString(bill.amount_total) || Number(bill.amount_total) <= 0) {
      errors.push(`${row}: 账单总额必须为大于 0 的金额`)
    }
    if ((bill.statement_date || '') > maxDate) {
      errors.push(`${row}: 出账日不能晚于 ${maxDate}`)
    }
  })
  transactions.forEach((txn, index) => {
    if (!txn.symbol.trim() && !txn.quantity.trim() && !txn.price.trim()) return
    const row = `transactions #${index + 1}`
    if (!txn.symbol.trim()) errors.push(`${row}: 标的必填`)
    if (!isNumericString(txn.quantity) || Number(txn.quantity) <= 0) errors.push(`${row}: 数量必须大于 0`)
    if (!isNumericString(txn.price) || Number(txn.price) < 0) errors.push(`${row}: 价格必须大于等于 0`)
    if (txn.fee.trim() && (!isNumericString(txn.fee) || Number(txn.fee) < 0)) errors.push(`${row}: 手续费必须大于等于 0`)
    if ((txn.trade_date || '') > maxDate) errors.push(`${row}: 交易日不能晚于 ${maxDate}`)
  })
  corporateActions.forEach((action, index) => {
    if (!action.symbol.trim() && !action.ratio_numerator.trim() && !action.ratio_denominator.trim()) return
    const row = `corporate_actions #${index + 1}`
    if (!action.symbol.trim()) errors.push(`${row}: 标的必填`)
    if (!isNumericString(action.ratio_numerator) || Number(action.ratio_numerator) <= 0) errors.push(`${row}: 比例分子必须大于 0`)
    if (!isNumericString(action.ratio_denominator) || Number(action.ratio_denominator) <= 0) errors.push(`${row}: 比例分母必须大于 0`)
    if ((action.event_date || '') > maxDate) errors.push(`${row}: 事件日不能晚于 ${maxDate}`)
  })
  transfers.forEach((transfer, index) => {
    if (!transfer.from_account_id && !transfer.to_account_id && !transfer.from_amount.trim() && !transfer.to_amount.trim()) return
    const row = `transfers #${index + 1}`
    if (!transfer.from_account_id || !transfer.to_account_id) errors.push(`${row}: 转出和转入账户必填`)
    if (transfer.from_account_id && transfer.from_account_id === transfer.to_account_id) errors.push(`${row}: 转出与转入账户不能相同`)
    if (!isNumericString(transfer.from_amount) || Number(transfer.from_amount) <= 0) errors.push(`${row}: 转出金额必须大于 0`)
    if (!isNumericString(transfer.to_amount) || Number(transfer.to_amount) <= 0) errors.push(`${row}: 转入金额必须大于 0`)
    if ((transfer.transfer_date || '') > maxDate) errors.push(`${row}: 转账日不能晚于 ${maxDate}`)
  })
  incomeEvents.forEach((income, index) => {
    if (!income.account_id && !income.amount.trim() && !income.symbol.trim()) return
    const row = `income_events #${index + 1}`
    if (!income.account_id) errors.push(`${row}: 归属账户必填`)
    if (income.event_kind === 'dividend' && !income.symbol.trim()) errors.push(`${row}: 分红事件必须关联标的`)
    if (!isNumericString(income.amount) || Number(income.amount) <= 0) errors.push(`${row}: 金额必须大于 0`)
    if (income.tax_withheld.trim() && (!isNumericString(income.tax_withheld) || Number(income.tax_withheld) < 0)) errors.push(`${row}: 税费必须大于等于 0`)
    if ((income.event_date || '') > maxDate) errors.push(`${row}: 事件日不能晚于 ${maxDate}`)
  })
  return errors
}

function subtitleForStep(step: number) {
  if (step === 2) return '列出所有非信用卡的活跃金额型账户，逐个填入当日余额'
  if (step === 3) return '列出持仓型账户的当前持仓，确认数量、成本并可补录买卖流水'
  if (step === 4) return '补录会影响持仓回放的拆股、合股、配股'
  if (step === 5) return '补录账户间资金移动（含转入信用卡还款），供现金流回放使用'
  if (step === 6) return '信用卡账户不使用余额快照，本期未还账单会计入总负债'
  if (step === 7) return '补录分红、利息、返现等收益事件'
  if (step === 9) return '确认本批次将写入的记录'
  return null
}
