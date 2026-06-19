import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DateField, Field, Icon, IconButton, Input, Segmented, Select } from '../ds'
import {
  createIncomeEvent,
  deleteIncomeEvent,
  listAccounts,
  listIncomeEvents,
  listInstruments,
  updateIncomeEvent,
  type Account,
  type CreateIncomeEventInput,
  type IncomeEvent,
  type IncomeKind,
} from '../api'
import { ACCOUNT_CURRENCIES, native, todayISO } from '../lib/format'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { invalidatePortfolio } from '../lib/invalidate'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { usePrefStore } from '../store'

const KIND_LABEL: Record<IncomeKind, string> = { dividend: '分红', interest: '利息', rebate: '返现', other: '其他' }

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1280, margin: '0 auto' }}>{children}</div>
}

export function IncomeEvents() {
  const [kind, setKind] = useState('')
  const [editor, setEditor] = useState<{ item?: IncomeEvent } | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const events = useQuery({ queryKey: ['income-events', kind], queryFn: () => listIncomeEvents({ event_kind: kind || undefined }) })

  const remove = useMutation({
    mutationFn: deleteIncomeEvent,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['income-events'] })
      invalidatePortfolio(qc)
      toast.success('收益事件已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segmented size="sm" value={kind} onChange={setKind}
          options={[{ value: '', label: '全部' }, { value: 'dividend', label: '分红' }, { value: 'interest', label: '利息' }, { value: 'rebate', label: '返现' }, { value: 'other', label: '其他' }]} />
        <Button variant="primary" size="sm" style={{ marginLeft: 'auto' }} iconLeft={<Icon name="plus" size={14} />} onClick={() => setEditor({})}>新增收益事件</Button>
      </div>
      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr><Th>类型</Th><Th>标的</Th><Th>账户</Th><Th>日期</Th><Th right>金额</Th><Th right>已扣税</Th><Th w={88}></Th></tr>
          </thead>
          <tbody>
            {(events.data?.items ?? []).map((e) => (
              <Row key={e.id}>
                <Td><Badge tone="gold">{KIND_LABEL[e.event_kind] ?? e.event_kind}</Badge></Td>
                <Td mono color="var(--text-strong)">{e.symbol ?? '—'}</Td>
                <Td dim>{e.account_name}</Td>
                <Td mono dim>{e.event_date}</Td>
                <Td right mono color="var(--text-strong)">{native(e.amount, e.currency)}</Td>
                <Td right mono dim>{e.tax_withheld ? native(e.tax_withheld, e.currency) : '—'}</Td>
                <Td right>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <IconButton aria-label="编辑" size="sm" onClick={() => setEditor({ item: e })}><Icon name="pencil" size={13} /></IconButton>
                    <IconButton aria-label="删除" size="sm" onClick={() => { if (confirm('删除这条收益事件？')) remove.mutate(e.id) }}><Icon name="trash-2" size={13} /></IconButton>
                  </div>
                </Td>
              </Row>
            ))}
            {!events.isLoading && !(events.data?.items ?? []).length ? <tr><Td dim>暂无收益事件</Td></tr> : null}
          </tbody>
        </table>
      </div>
      <SectionHint>收益事件独立于快照，不修改持仓数量、成本或余额（§4.5）；累计金额计入总盈亏与仪表盘「累计收益」（§6.11）。</SectionHint>
      {editor ? <IncomeModal item={editor.item} accounts={(accounts.data ?? []).filter((a) => !a.is_archived)} onClose={() => setEditor(null)} /> : null}
    </Page>
  )
}

function IncomeModal({ item, accounts, onClose }: { item?: IncomeEvent; accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments })
  const [kind, setKind] = useState<IncomeKind>(item?.event_kind ?? 'dividend')
  const [accountId, setAccountId] = useState(item ? String(item.account_id) : accounts[0] ? String(accounts[0].id) : '')
  const [symbol, setSymbol] = useState(item?.symbol ?? '')
  const [date, setDate] = useState(item?.event_date ?? todayISO(timezone))
  const [amount, setAmount] = useState(item?.amount ?? '')
  const [currency, setCurrency] = useState(item?.currency ?? 'USD')
  const [payAcct, setPayAcct] = useState(item?.payment_account_id ? String(item.payment_account_id) : '')
  const [tax, setTax] = useState(item?.tax_withheld ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [touched, setTouched] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const body: CreateIncomeEventInput = {
        event_kind: kind, event_date: date, account_id: Number(accountId),
        symbol: symbol.trim() ? symbol.trim().toUpperCase() : null, amount: amount.trim(), currency,
        payment_account_id: payAcct ? Number(payAcct) : null, tax_withheld: tax.trim() || null, note: note.trim() || null,
      }
      return item ? updateIncomeEvent(item.id, body) : createIncomeEvent(body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['income-events'] })
      invalidatePortfolio(qc)
      toast.success(item ? '已更新' : '已记录')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const needSymbol = kind === 'dividend'
  const invalid = touched && (!accountId || !amount.trim() || (needSymbol && !symbol.trim()))

  return (
    <Modal
      title={item ? '编辑收益事件' : '新增收益事件'}
      icon="coins"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={save.isPending} onClick={() => { setTouched(true); if (accountId && amount.trim() && !(needSymbol && !symbol.trim())) save.mutate() }}>保存</Button></>}
    >
      <div style={{ marginBottom: 12 }}>
        <Segmented size="sm" value={kind} onChange={(v) => setKind(v as IncomeKind)}
          options={[{ value: 'dividend', label: '分红' }, { value: 'interest', label: '利息' }, { value: 'rebate', label: '返现' }, { value: 'other', label: '其他' }]} />
      </div>
      <div className="fb-form form-4">
        <Field label="关联账户" error={invalid && !accountId ? '必填' : undefined}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name }))} />
        </Field>
        <Field label={needSymbol ? '标的（分红必填）' : '标的（可选）'} error={invalid && needSymbol && !symbol.trim() ? '必填' : undefined}>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} list="fb-inc-instruments" placeholder="GOOG" />
          <datalist id="fb-inc-instruments">{(instruments.data ?? []).map((i) => <option key={i.symbol} value={i.symbol} />)}</datalist>
        </Field>
        <Field label="事件日期"><DateField value={date} onChange={setDate} /></Field>
        <Field label="金额" error={invalid && !amount.trim() ? '必填' : undefined}><Input numeric value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="312.00" /></Field>
      </div>
      <div className="fb-form form-4" style={{ marginTop: 12 }}>
        <Field label="币种"><Select value={currency} onChange={(e) => {
          const c = e.target.value
          setCurrency(c)
          // The cash landing account must match the event currency (reconciliation posts without FX),
          // so drop a now-mismatched selection.
          const pa = accounts.find((a) => String(a.id) === payAcct)
          if (pa && pa.currency !== c) setPayAcct('')
        }} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="现金落地账户（可选）"><Select value={payAcct} onChange={(e) => setPayAcct(e.target.value)} options={[{ value: '', label: '不指定' }, ...accounts.filter((a) => a.currency === currency).map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name }))]} /></Field>
        <Field label="已扣税额（可选）"><Input numeric value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" /></Field>
        <Field label="备注"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" /></Field>
      </div>
    </Modal>
  )
}
