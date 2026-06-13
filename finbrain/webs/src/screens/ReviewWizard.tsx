import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Icon, IconButton, Input, Select } from '../ds'
import { SectionHint } from '../lib/ui'
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
  listCorporateActions,
  listIncomeEvents,
  listPositions,
  listTransfers,
  submitReviewBatch,
  type Account,
} from '../api'
import { useToast } from '../shell/Toast'

const DRAFT_KEY = 'finbrain.reviewDraft.v1'

const STEPS = [
  { id: 1, label: '盘点日期', icon: 'calendar' },
  { id: 2, label: '金额型账户', icon: 'wallet' },
  { id: 3, label: '持仓型账户', icon: 'trending-up' },
  { id: 4, label: '公司动作', icon: 'split' },
  { id: 5, label: '账户转账', icon: 'repeat' },
  { id: 6, label: '信用卡账单', icon: 'receipt' },
  { id: 7, label: '收益事件', icon: 'coins' },
  { id: 8, label: '现金对账', icon: 'scale' },
  { id: 9, label: '漂移检视', icon: 'target' },
  { id: 10, label: '预览确认', icon: 'clipboard-check' },
]

interface BalanceDraft {
  account_id: number
  account_label: string
  currency: string
  last_balance: string
  balance: string
  skip: boolean
  note: string
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

interface ReviewDraft {
  reviewDate: string
  balances: BalanceDraft[]
  positions: PositionDraft[]
  bills: BillDraft[]
}

export function ReviewWizard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [reviewDate, setReviewDate] = useState(todayISO())
  const [balances, setBalances] = useState<BalanceDraft[]>([])
  const [positions, setPositions] = useState<PositionDraft[]>([])
  const [bills, setBills] = useState<BillDraft[]>([])
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [initialized, setInitialized] = useState(false)
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

  useEffect(() => {
    if (!draftLoaded || !initialized) return
    const payload: ReviewDraft = { reviewDate, balances, positions, bills }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
  }, [balances, bills, draftLoaded, initialized, positions, reviewDate])

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
            paid_at: b.paid ? b.paid_at : null,
            payment_account_id: b.paid && b.payment_account_id ? Number(b.payment_account_id) : null,
            note: b.note.trim() || null,
          })),
      }),
    onSuccess: (res) => {
      localStorage.removeItem(DRAFT_KEY)
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['account'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      void qc.invalidateQueries({ queryKey: ['balance-snapshots'] })
      void qc.invalidateQueries({ queryKey: ['positions'] })
      void qc.invalidateQueries({ queryKey: ['credit-card-bills'] })
      toast.success(`盘点已提交：${res.balance_snapshots + res.position_snapshots + res.credit_card_bills} 条记录`)
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
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>步骤 {step} / 10</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>退出</Button>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-inset)', margin: '12px 0 22px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(step / 10) * 100}%`, background: 'var(--gradient-gold)', transition: 'width .3s var(--ease-out)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '156px minmax(0, 1fr)', gap: 14, alignItems: 'flex-start' }}>
        <StepRail step={step} onStep={setStep} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card
            eyebrow={`步骤 ${step}`}
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name={current.icon} size={17} color="var(--accent)" />{current.label}</span>}
            subtitle={subtitleForStep(step)}
            actions={step === 2 ? (
              <Button variant="secondary" size="sm" iconLeft={<Icon name="copy" size={14} />} onClick={() => setBalances((items) => items.map((b) => ({ ...b, balance: b.last_balance, skip: false })))}>
                全部保留上次
              </Button>
            ) : null}
          >
            {step === 1 ? (
              <DateStep reviewDate={reviewDate} onChange={setReviewDate} />
            ) : step === 2 ? (
              <BalanceStep rows={balances} setRows={setBalances} />
            ) : step === 3 ? (
              <PositionStep rows={positions} setRows={setPositions} accounts={positionAccounts} />
            ) : step === 6 ? (
              <BillStep rows={bills} setRows={setBills} creditAccounts={creditAccounts} paymentAccounts={paymentAccounts} reviewDate={reviewDate} />
            ) : step === 10 ? (
              <PreviewStep balances={balances} positions={positions} bills={bills} counts={counts} errors={batchErrors} />
            ) : step === 4 ? (
              <CorporateActionsReview />
            ) : step === 5 ? (
              <TransfersReview />
            ) : step === 7 ? (
              <IncomeReview />
            ) : step === 8 ? (
              <ReconReview />
            ) : step === 9 ? (
              <DriftReview />
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
                  localStorage.setItem(DRAFT_KEY, JSON.stringify({ reviewDate, balances, positions, bills }))
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
                  if (step === 10) {
                    const errors = validateReviewDraft(bills)
                    if (errors.length) {
                      setBatchErrors(errors)
                      return
                    }
                    submit.mutate()
                  } else {
                    setStep((s) => Math.min(10, s + 1))
                  }
                }}
                iconRight={<Icon name={step === 10 ? 'check' : 'arrow-right'} size={15} />}
              >
                {step === 10 ? (submit.isPending ? '提交中…' : '确认提交') : '下一步'}
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
      <Input type="date" value={reviewDate} onChange={(e) => onChange(e.target.value)} />
      <SectionHint>盘点日期会作为本批余额和持仓记录的日期；同账户同日期提交会幂等覆盖。</SectionHint>
    </div>
  )
}

function BalanceStep({ rows, setRows }: { rows: BalanceDraft[]; setRows: (rows: BalanceDraft[] | ((rows: BalanceDraft[]) => BalanceDraft[])) => void }) {
  if (!rows.length) return <EmptyLine text="暂无金额型账户。" />
  const columns = 'minmax(150px, 1fr) minmax(104px, .64fr) minmax(188px, .92fr) 112px'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, padding: '0 12px 6px', fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span>账户</span><span style={{ textAlign: 'right' }}>上次值</span><span>当日余额</span><span />
      </div>
      {rows.map((row, index) => (
        <div key={row.account_id} style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, alignItems: 'center', background: row.skip ? 'transparent' : 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span title={row.account_label} style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{row.account_label}</span>
            <Badge tone="neutral">{row.currency}</Badge>
            {row.skip ? <Badge tone="neutral">无变化</Badge> : null}
          </div>
          <span className="fb-num" style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 12.5 }}>{native(row.last_balance, row.currency, 2)}</span>
          <Input
            numeric
            prefix={row.currency}
            value={row.balance}
            disabled={row.skip}
            onChange={(e) => setRows((items) => items.map((it, i) => (i === index ? { ...it, balance: e.target.value, skip: false } : it)))}
            size="sm"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <Button variant="ghost" size="xs" onClick={() => setRows((items) => items.map((it, i) => (i === index ? { ...it, balance: it.last_balance, skip: false } : it)))}>
              保留上次
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setRows((items) => items.map((it, i) => (i === index ? { ...it, skip: true } : it)))}>
              无变化
            </Button>
          </div>
        </div>
      ))}
      <SectionHint>缺失值不会提交；负余额仍按资产带符号计入。</SectionHint>
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

function BillStep({
  rows,
  setRows,
  creditAccounts,
  paymentAccounts,
  reviewDate,
}: {
  rows: BillDraft[]
  setRows: (rows: BillDraft[] | ((rows: BillDraft[]) => BillDraft[])) => void
  creditAccounts: Account[]
  paymentAccounts: Account[]
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
    return <EmptyLine text="暂无信用卡账户。可先在账户列表创建 kind=credit_card 的信用卡合计账户。" />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHint>向导中录入本期总额与还款状态；顶类目明细可在信用卡账户详情页补充。</SectionHint>
        <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={13} />} onClick={addBill}>新增账单</Button>
      </div>
      {rows.length ? rows.map((row) => (
        <BillDraftRow key={row.key} row={row} setRows={setRows} creditAccounts={creditAccounts} paymentAccounts={paymentAccounts} />
      )) : <EmptyLine text="本次盘点暂无待提交信用卡账单。" />}
    </div>
  )
}

function BillDraftRow({
  row,
  setRows,
  creditAccounts,
  paymentAccounts,
}: {
  row: BillDraft
  setRows: (rows: BillDraft[] | ((rows: BillDraft[]) => BillDraft[])) => void
  creditAccounts: Account[]
  paymentAccounts: Account[]
}) {
  function patch(next: Partial<BillDraft>) {
    setRows((items) => items.map((it) => (it.key === row.key ? { ...it, ...next } : it)))
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 118px minmax(140px, .9fr) 76px 72px 32px', gap: 8, alignItems: 'center', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <Select
        size="sm"
        value={String(row.account_id)}
        onChange={(e) => {
          const account = creditAccounts.find((a) => String(a.id) === e.target.value)
          if (account) patch({ account_id: account.id, account_label: accountLabel(account), currency: account.currency })
        }}
        options={creditAccounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))}
      />
      <Input type="date" value={row.statement_date} max={maxSnapshotDateISO()} onChange={(e) => patch({ statement_date: e.target.value })} size="sm" />
      <Input numeric prefix={row.currency} placeholder="账单总额" value={row.amount_total} min="0.01" onChange={(e) => patch({ amount_total: e.target.value })} size="sm" />
      <Select size="sm" value={row.currency} onChange={(e) => patch({ currency: e.target.value })} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={row.paid} onChange={(e) => patch({ paid: e.target.checked })} /> 已还
      </label>
      <Select
        size="sm"
        value={row.payment_account_id}
        disabled={!row.paid}
        placeholder="还款账户"
        wrapStyle={{ gridColumn: '1 / -1' }}
        onChange={(e) => patch({ payment_account_id: e.target.value })}
        options={paymentAccounts.map((a) => ({ value: String(a.id), label: accountLabel(a) }))}
      />
      <IconButton aria-label="移除账单" size="sm" onClick={() => setRows((items) => items.filter((it) => it.key !== row.key))}>
        <Icon name="x" size={13} />
      </IconButton>
    </div>
  )
}

function PreviewStep({
  balances,
  positions,
  bills,
  counts,
  errors,
}: {
  balances: BalanceDraft[]
  positions: PositionDraft[]
  bills: BillDraft[]
  counts: { balances: number; positions: number; bills: number }
  errors: string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fb-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <PreviewCard label="余额记录" value={counts.balances} />
        <PreviewCard label="持仓记录" value={counts.positions} />
        <PreviewCard label="信用卡账单" value={counts.bills} />
      </div>
      {errors.length ? (
        <div style={{ background: 'var(--warning-bg)', border: '1px solid rgba(221,162,62,0.3)', borderRadius: 'var(--radius-md)', padding: 12 }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.7 }}>{e}</div>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <PreviewList title="余额" rows={balances.filter((b) => !b.skip && b.balance).map((b) => `${b.account_label} · ${native(b.balance, b.currency, 2)}`)} />
        <PreviewList title="持仓" rows={positions.filter((p) => !p.skip && p.symbol && p.quantity).map((p) => `${p.account_label} · ${p.symbol} · ${quantity(p.quantity)}`)} />
        <PreviewList title="账单" rows={bills.filter((b) => b.amount_total).map((b) => `${b.account_label} · ${native(b.amount_total, b.currency, 2)} · ${b.paid ? '已还' : '未还'}`)} />
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

// Review steps (4/5/7/8/9) are read-only "since last review" prompts — they don't
// add to the batch (those entities are recorded on their own screens), they remind
// the owner to backfill what's missing before confirming (§7.5).
const CA_ACTION: Record<string, string> = { split: '拆股', merge: '合股', rights: '配股' }
const INCOME_KIND: Record<string, string> = { dividend: '分红', interest: '利息', rebate: '返现', other: '其他' }

function ReviewListCard({ title, hint, cta, to, loading, lines }: { title: string; hint: string; cta: string; to: string; loading: boolean; lines: string[] }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHint>{hint}</SectionHint>
      <div className="fb-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>{title}</span>
          <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} iconRight={<Icon name="arrow-right" size={13} />} onClick={() => navigate(to)}>{cta}</Button>
        </div>
        {lines.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lines.map((l, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '6px 0', borderBottom: '1px solid var(--divider)', fontFamily: 'var(--font-mono)' }}>{l}</div>)}
          </div>
        ) : <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>{loading ? '加载中…' : '近期无记录 — 如有遗漏请点右上角补录'}</span>}
      </div>
    </div>
  )
}

function CorporateActionsReview() {
  const q = useQuery({ queryKey: ['corporate-actions', ''], queryFn: () => listCorporateActions() })
  const lines = (q.data?.items ?? []).slice(0, 8).map((c) => `${c.event_date} · ${c.symbol} · ${CA_ACTION[c.action] ?? c.action} ${c.ratio_numerator}:${c.ratio_denominator}`)
  return <ReviewListCard title="公司动作回顾" hint="确认本期间的拆股 / 合股 / 配股是否已录入（影响持仓回放）" cta="去公司动作" to="/corporate-actions" loading={q.isLoading} lines={lines} />
}

function TransfersReview() {
  const q = useQuery({ queryKey: ['transfers'], queryFn: () => listTransfers() })
  const lines = (q.data?.items ?? []).slice(0, 8).map((t) => `${t.transfer_date} · ${t.from_account_name} → ${t.to_account_name} · ${t.from_amount}/${t.to_amount}`)
  return <ReviewListCard title="账户转账回顾" hint="确认本期间的账户间转账是否已录入（现金对账差额常源于漏录转账）" cta="去转账" to="/transfers" loading={q.isLoading} lines={lines} />
}

function IncomeReview() {
  const q = useQuery({ queryKey: ['income-events', ''], queryFn: () => listIncomeEvents() })
  const lines = (q.data?.items ?? []).slice(0, 8).map((e) => `${e.event_date} · ${INCOME_KIND[e.event_kind] ?? e.event_kind}${e.symbol ? ' · ' + e.symbol : ''} · ${e.amount} ${e.currency}`)
  return <ReviewListCard title="收益事件回顾" hint="确认本期间的分红 / 利息 / 返现是否已录入（计入累计收益）" cta="去收益事件" to="/income" loading={q.isLoading} lines={lines} />
}

function ReconReview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHint>每个现金 / 持仓账户的预期余额与最新快照的差额；超阈值表示可能漏录交易或转账（§6.19）。</SectionHint>
      <div className="fb-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="scale" size={18} color="var(--accent)" />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>逐账户对账请到「现金对账」页核对差额。</span>
        <ReconLink />
      </div>
    </div>
  )
}

function ReconLink() {
  const navigate = useNavigate()
  return <Button size="sm" variant="secondary" style={{ marginLeft: 'auto' }} iconRight={<Icon name="arrow-right" size={13} />} onClick={() => navigate('/recon')}>去现金对账</Button>
}

function DriftReview() {
  const q = useQuery({ queryKey: ['allocation-targets'], queryFn: () => listAllocationTargets() })
  const lines = (q.data ?? []).filter((s) => !s.is_archived).map((s) => `${s.name} · ${s.dimension} · 阈值 ±${s.drift_threshold_pct}%`)
  return <ReviewListCard title="目标漂移检视" hint="检视各目标配置的当前漂移（提醒为主，不阻塞提交）" cta="去目标配置" to="/targets" loading={q.isLoading} lines={lines} />
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

function formatBatchErrorDetail(detail: any) {
  const entity = detail?.entity_type ?? detail?.resource ?? 'row'
  const rawIndex = typeof detail?.line_index === 'number' ? detail.line_index : detail?.index
  const indexText = typeof rawIndex === 'number' ? ` #${rawIndex + 1}` : ''
  const fieldText = detail?.field ? `.${detail.field}` : ''
  const codeText = detail?.error_code ? ` (${detail.error_code})` : ''
  const message = detail?.message ?? '无效行'
  return `${entity}${indexText}${fieldText}${codeText}: ${message}`
}

function validateReviewDraft(bills: BillDraft[]) {
  const errors: string[] = []
  const maxDate = maxSnapshotDateISO()
  bills.forEach((bill, index) => {
    if (!bill.amount_total.trim()) return
    const row = `credit_card_bills #${index + 1}`
    if (!isNumericString(bill.amount_total) || Number(bill.amount_total) <= 0) {
      errors.push(`${row}: 账单总额必须为大于 0 的金额`)
    }
    if ((bill.statement_date || '') > maxDate) {
      errors.push(`${row}: 出账日不能晚于 ${maxDate}`)
    }
    if (bill.paid && bill.paid_at && bill.paid_at > maxDate) {
      errors.push(`${row}: 还款日不能晚于 ${maxDate}`)
    }
  })
  return errors
}

function subtitleForStep(step: number) {
  if (step === 2) return '列出所有非信用卡的活跃金额型账户，逐个填入当日余额'
  if (step === 3) return '列出持仓型账户的当前持仓，确认数量、成本或新增标的'
  if (step === 6) return '信用卡账户不使用余额快照，本期未还账单会计入总负债'
  if (step === 10) return '确认本批次将写入的记录'
  return null
}
