import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, DateField, Field, Icon, IconButton, Input, Select } from '../ds'
import { ConfirmDialog } from '../shell/ConfirmDialog'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { Row, Td, Th } from '../lib/ui'
import { invalidatePortfolio } from '../lib/invalidate'
import {
  ACCOUNT_CURRENCIES,
  isNumericString,
  maxSnapshotDateISO,
  native,
  todayISO,
} from '../lib/format'
import {
  deleteCreditCardBill,
  listAccountCreditCardBills,
  listAccounts,
  listTransfers,
  updateCreditCardBill,
  upsertCreditCardBill,
  type Account,
  type CreditCardBill,
  type CreditCardCategory,
} from '../api'
import { usePrefStore } from '../store'

export function CreditCardBillsSection({ account }: { account: Account }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<CreditCardBill | null | 'new'>(null)
  const [deleting, setDeleting] = useState<CreditCardBill | null>(null)
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['credit-card-bills', account.id],
    queryFn: () => listAccountCreditCardBills(account.id),
  })
  // Repayment is recorded as transfers INTO this card; the card's outstanding is Σ(unpaid bills) −
  // Σ(repayment transfers), matching the valuation netting. Negative = 溢出 (prepaid credit).
  const { data: transfers } = useQuery({
    queryKey: ['transfers', account.id],
    queryFn: () => listTransfers(account.id),
  })
  const repaidTotal = (transfers?.items ?? [])
    .filter((t) => t.to_account_id === account.id)
    .reduce((sum, t) => sum + Number(t.to_amount), 0)
  const unpaidBillsTotal = bills.filter((b) => !b.paid_at).reduce((sum, b) => sum + Number(b.amount_total), 0)
  const netOutstanding = unpaidBillsTotal - repaidTotal

  const remove = useMutation({
    mutationFn: (id: number) => deleteCreditCardBill(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-card-bills'] })
      void qc.invalidateQueries({ queryKey: ['account', account.id] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      invalidatePortfolio(qc)
      toast.success('账单已删除')
      setDeleting(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <Card
      eyebrow="信用卡账单"
      padded={false}
      actions={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="receipt" size={13} />}
          onClick={() => setEditing('new')}
        >
          录入账单
        </Button>
      }
    >
      {bills.length || repaidTotal > 0 ? (
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <SummaryStat label="未还账单" value={native(unpaidBillsTotal, account.currency, 2)} />
          <SummaryStat label="还款（转账）" value={native(repaidTotal, account.currency, 2)} />
          <SummaryStat
            label={netOutstanding < 0 ? '本卡溢出（预付）' : '本卡未还'}
            value={native(Math.abs(netOutstanding), account.currency, 2)}
            tone={netOutstanding < 0 ? 'var(--gain)' : netOutstanding > 0 ? 'var(--loss)' : undefined}
          />
        </div>
      ) : null}
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>加载中…</div>
      ) : !bills.length ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>
          暂无信用卡账单。未还账单会计入总负债；在「转账」里转入本卡即为还款。
        </div>
      ) : (
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>出账日</Th>
              <Th right>总额</Th>
              <Th>顶类目</Th>
              <Th>状态</Th>
              <Th w={88} />
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <Row key={b.id}>
                <Td mono dim>{b.statement_date}</Td>
                <Td right mono color="var(--loss)">{native(b.amount_total, b.currency, 2)}</Td>
                <Td dim>{categoryText(b.top_categories)}</Td>
                <Td>{b.paid_at ? <Badge tone="success">已还(旧)</Badge> : <Badge tone="warning" dot>计入未还</Badge>}</Td>
                <Td right>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <IconButton aria-label="编辑账单" size="sm" onClick={() => setEditing(b)}>
                      <Icon name="pencil" size={13} />
                    </IconButton>
                    <IconButton aria-label="删除账单" size="sm" onClick={() => setDeleting(b)}>
                      <Icon name="trash-2" size={13} />
                    </IconButton>
                  </div>
                </Td>
              </Row>
            ))}
          </tbody>
        </table>
      )}
      {editing ? (
        <CreditCardBillModal
          account={account}
          bill={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="删除信用卡账单"
          message={`删除 ${deleting.statement_date} 的信用卡账单？此操作不可撤销。`}
          confirmLabel="删除"
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      ) : null}
    </Card>
  )
}

export function CreditCardBillModal({
  account,
  bill,
  onClose,
}: {
  account?: Account
  bill?: CreditCardBill
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const creditAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.kind === 'credit_card'),
    [accounts],
  )
  const initialAccountId = account?.id ?? bill?.account_id ?? creditAccounts[0]?.id ?? 0
  const [accountId, setAccountId] = useState(String(initialAccountId || ''))
  const selectedAccount =
    account ?? accounts.find((a) => String(a.id) === accountId) ?? creditAccounts[0]
  const [statementDate, setStatementDate] = useState(bill?.statement_date ?? todayISO(timezone))
  const [amountTotal, setAmountTotal] = useState(bill?.amount_total ?? '')
  const [currency, setCurrency] = useState(bill?.currency ?? selectedAccount?.currency ?? 'CNY')
  const [note, setNote] = useState(bill?.note ?? '')
  const [categories, setCategories] = useState<CreditCardCategory[]>(
    bill?.top_categories?.length ? bill.top_categories : [{ name: '', amount: '' }],
  )
  const [touched, setTouched] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        account_id: Number(accountId),
        statement_date: statementDate,
        amount_total: amountTotal.trim(),
        currency,
        top_categories: categories
          .map((c) => ({ name: c.name.trim(), amount: c.amount.trim() }))
          .filter((c) => c.name || c.amount),
        // Repayment is recorded as a transfer INTO this card (nets the liability), not per-bill.
        // Preserve any legacy paid_at/payment_account on existing bills; new bills carry neither.
        paid_at: bill?.paid_at ?? null,
        payment_account_id: bill?.payment_account_id ?? null,
        note: note.trim() || null,
      }
      return bill ? updateCreditCardBill(bill.id, payload) : upsertCreditCardBill(payload)
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['credit-card-bills'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['account', saved.account_id] })
      invalidatePortfolio(qc)
      toast.success('账单已保存')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const categoryError = categories.some((c) => (c.name.trim() || c.amount.trim()) && (!c.name.trim() || !isNumericString(c.amount)))
  const valid =
    Number(accountId) > 0 &&
    Boolean(statementDate) &&
    isNumericString(amountTotal) &&
    Number(amountTotal) > 0 &&
    !categoryError

  function updateCategory(index: number, patch: Partial<CreditCardCategory>) {
    setCategories((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeCategory(index: number) {
    setCategories((items) => (items.length <= 1 ? [{ name: '', amount: '' }] : items.filter((_, i) => i !== index)))
  }

  return (
    <Modal
      title={bill ? '编辑信用卡账单' : '录入信用卡账单'}
      icon="receipt"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Icon name="check" size={14} />}
            disabled={save.isPending || (touched && !valid)}
            onClick={() => {
              setTouched(true)
              if (valid) save.mutate()
            }}
          >
            {save.isPending ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="信用卡账户">
          <Select
            value={accountId}
            disabled={Boolean(account)}
            onChange={(e) => {
              const next = e.target.value
              setAccountId(next)
              const acct = accounts.find((a) => String(a.id) === next)
              if (acct) setCurrency(acct.currency)
            }}
            options={(account ? [account] : creditAccounts).map((a) => ({
              value: String(a.id),
              label: `${a.institution} · ${a.name} (${a.currency})`,
            }))}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="出账日">
            <DateField value={statementDate} max={maxSnapshotDateISO(timezone)} onChange={setStatementDate} />
          </Field>
          <Field label="账单总额" error={touched && (!isNumericString(amountTotal) || Number(amountTotal) <= 0) ? '请输入大于 0 的金额' : undefined}>
            <Input numeric prefix={currency} placeholder="0.00" value={amountTotal} onChange={(e) => setAmountTotal(e.target.value)} />
          </Field>
        </div>
        <Field label="币种">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>顶类目</div>
          {categories.map((cat, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 32px', gap: 8 }}>
              <Input placeholder="餐饮 / 网购 / 数码" value={cat.name} onChange={(e) => updateCategory(index, { name: e.target.value })} />
              <Input numeric placeholder="0.00" value={cat.amount} onChange={(e) => updateCategory(index, { amount: e.target.value })} />
              <IconButton aria-label="删除类目" onClick={() => removeCategory(index)}>
                <Icon name="x" size={14} />
              </IconButton>
            </div>
          ))}
          <Button
            variant="ghost"
            size="xs"
            iconLeft={<Icon name="plus" size={12} />}
            onClick={() => setCategories((items) => [...items, { name: '', amount: '' }])}
          >
            添加类目
          </Button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          还款请在「转账」里转入本信用卡账户即可,系统按「Σ账单 − Σ还款转账」实时计算本卡未还/溢出。
        </div>
        <Field label="备注">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
        </Field>
      </div>
    </Modal>
  )
}

function categoryText(categories: CreditCardCategory[]) {
  if (!categories.length) return '—'
  return categories.map((c) => c.name).filter(Boolean).join(' · ') || '—'
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
      <span className="fb-num" style={{ fontSize: 16, fontWeight: 600, color: tone ?? 'var(--text-strong)' }}>{value}</span>
    </div>
  )
}
