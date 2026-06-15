import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Field, Icon, IconButton, Input, Segmented, Select } from '../ds'
import {
  createTransaction,
  deleteTransaction,
  listAccounts,
  listInstruments,
  listTransactions,
  updateTransaction,
  type Account,
  type CreateTransactionInput,
  type Transaction,
  type TransactionAction,
} from '../api'
import { ACCOUNT_CURRENCIES, native, quantity, supportsPositionSnapshots, todayISO } from '../lib/format'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { usePrefStore } from '../store'

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1320, margin: '0 auto' }}>
      {children}
    </div>
  )
}

export function Transactions() {
  const [acct, setAcct] = useState('')
  const [symbol, setSymbol] = useState('')
  const [editor, setEditor] = useState<{ item?: Transaction } | null>(null)
  const qc = useQueryClient()
  const toast = useToast()

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const txns = useQuery({
    queryKey: ['transactions', acct, symbol],
    queryFn: () =>
      listTransactions({ account_id: acct ? Number(acct) : undefined, symbol: symbol.trim() || undefined }),
  })

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('交易已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const positionAccounts = (accounts.data ?? []).filter((a) => supportsPositionSnapshots(a.kind) && !a.is_archived)

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Select size="sm" value={acct} onChange={(e) => setAcct(e.target.value)} style={{ maxWidth: 220 }}
          options={[{ value: '', label: '全部账户' }, ...positionAccounts.map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name }))]} />
        <Input size="sm" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="按标的过滤" style={{ maxWidth: 180 }} />
        <Button variant="primary" size="sm" style={{ marginLeft: 'auto' }} iconLeft={<Icon name="plus" size={14} />} onClick={() => setEditor({})}>
          新增交易
        </Button>
      </div>

      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr>
              <Th>方向</Th><Th>标的</Th><Th>账户</Th><Th>成交日</Th><Th right>数量</Th><Th right>单价</Th>
              <Th right>金额</Th><Th>结算</Th><Th w={88}></Th>
            </tr>
          </thead>
          <tbody>
            {(txns.data?.items ?? []).map((t) => (
              <Row key={t.id}>
                <Td><Badge tone={t.action === 'buy' ? 'success' : 'warning'}>{t.action === 'buy' ? '买入' : '卖出'}</Badge></Td>
                <Td mono color="var(--text-strong)">{t.symbol}</Td>
                <Td dim>{t.account_name}</Td>
                <Td mono dim>{t.trade_date}</Td>
                <Td right mono>{quantity(t.quantity)}</Td>
                <Td right mono>{native(t.price, t.currency, 4)}</Td>
                <Td right mono color="var(--text-strong)">{native(String(Number(t.quantity) * Number(t.price)), t.currency)}</Td>
                <Td>{t.is_settled ? <Badge tone="neutral">已结算</Badge> : <Badge tone="warning">未结算</Badge>}</Td>
                <Td right>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <IconButton aria-label="编辑" size="sm" onClick={() => setEditor({ item: t })}><Icon name="pencil" size={13} /></IconButton>
                    <IconButton aria-label="删除" size="sm" onClick={() => { if (confirm('删除这笔交易？')) remove.mutate(t.id) }}><Icon name="trash-2" size={13} /></IconButton>
                  </div>
                </Td>
              </Row>
            ))}
            {!txns.isLoading && !(txns.data?.items ?? []).length ? (
              <tr><Td dim>暂无交易，点「新增交易」录入第一笔</Td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <SectionHint>交易回放派生持仓数量、加权成本与已实现盈亏（§6.15）；卖出手续费扣减已实现盈亏。现金影响在账户「对账」中体现（§6.19）。</SectionHint>

      {editor ? (
        <TxnModal item={editor.item} accounts={positionAccounts} onClose={() => setEditor(null)} />
      ) : null}
    </Page>
  )
}

function TxnModal({
  item,
  accounts,
  onClose,
}: {
  item?: Transaction
  accounts: Account[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments })
  const [accountId, setAccountId] = useState(item ? String(item.account_id) : accounts[0] ? String(accounts[0].id) : '')
  const [symbol, setSymbol] = useState(item?.symbol ?? '')
  const [action, setAction] = useState<TransactionAction>(item?.action ?? 'buy')
  const [tradeDate, setTradeDate] = useState(item?.trade_date ?? todayISO(timezone))
  const [settleDate, setSettleDate] = useState(item?.settle_date ?? '')
  const [qty, setQty] = useState(item?.quantity ?? '')
  const [price, setPrice] = useState(item?.price ?? '')
  const [currency, setCurrency] = useState(item?.currency ?? 'USD')
  const [fee, setFee] = useState(item?.fee ?? '')
  const [settled, setSettled] = useState(item?.is_settled ?? true)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [touched, setTouched] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const body: CreateTransactionInput = {
        account_id: Number(accountId), symbol: symbol.trim().toUpperCase(), action,
        trade_date: tradeDate, settle_date: settleDate || null, quantity: qty.trim(), price: price.trim(),
        currency, fee: fee.trim() || null, is_settled: settled, notes: notes.trim() || null,
      }
      return item
        ? updateTransaction(item.id, { action, trade_date: tradeDate, settle_date: settleDate || null, quantity: qty.trim(), price: price.trim(), currency, fee: fee.trim() || null, is_settled: settled, notes: notes.trim() || null })
        : createTransaction(body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      void qc.invalidateQueries({ queryKey: ['instruments'] })
      toast.success(item ? '交易已更新' : '交易已记录')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const invalid = touched && (!accountId || !symbol.trim() || !qty.trim() || !price.trim())

  return (
    <Modal
      title={item ? '编辑交易' : '新增交易'}
      icon="arrow-left-right"
      width={660}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => { setTouched(true); if (accountId && symbol.trim() && qty.trim() && price.trim()) save.mutate() }}>保存</Button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <Segmented value={action} onChange={(v) => setAction(v as TransactionAction)} size="sm"
          options={[{ value: 'buy', label: '买入' }, { value: 'sell', label: '卖出' }]} />
      </div>
      <div className="fb-form form-4 form-lead">
        <Field label="账户" error={invalid && !accountId ? '必填' : undefined}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!!item}
            options={accounts.map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name }))} />
        </Field>
        <Field label="标的" error={invalid && !symbol.trim() ? '必填' : undefined}>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} disabled={!!item} list="fb-tx-instruments" placeholder="GOOG" />
          <datalist id="fb-tx-instruments">
            {(instruments.data ?? []).map((i) => <option key={i.symbol} value={i.symbol} />)}
          </datalist>
        </Field>
        <Field label="成交日"><Input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} /></Field>
        <Field label="结算日（可选）"><Input type="date" value={settleDate} onChange={(e) => setSettleDate(e.target.value)} /></Field>
      </div>
      <div className="fb-form form-4 form-lead" style={{ marginTop: 12 }}>
        <Field label="数量" error={invalid && !qty.trim() ? '必填' : undefined}><Input numeric value={qty} onChange={(e) => setQty(e.target.value)} placeholder="100" /></Field>
        <Field label="单价" error={invalid && !price.trim() ? '必填' : undefined}><Input numeric value={price} onChange={(e) => setPrice(e.target.value)} placeholder="184.25" /></Field>
        <Field label="币种"><Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="手续费（可选）"><Input numeric value={fee} onChange={(e) => setFee(e.target.value)} placeholder="1.20" /></Field>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} /> 已结算
        </label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="备注（可选）" style={{ flex: 1 }} />
      </div>
    </Modal>
  )
}
