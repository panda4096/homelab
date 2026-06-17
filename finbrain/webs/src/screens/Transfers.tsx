import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DateField, Field, Icon, IconButton, Input, Select } from '../ds'
import {
  createTransfer,
  deleteTransfer,
  listAccounts,
  listTransfers,
  updateTransfer,
  type Account,
  type CreateTransferInput,
  type Transfer,
} from '../api'
import { native, todayISO } from '../lib/format'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { usePrefStore } from '../store'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1200, margin: '0 auto' }}>{children}</div>
}

export function Transfers() {
  const [editor, setEditor] = useState<{ item?: Transfer } | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const transfers = useQuery({ queryKey: ['transfers'], queryFn: () => listTransfers() })

  const remove = useMutation({
    mutationFn: deleteTransfer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('转账已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Button variant="primary" size="sm" style={{ marginLeft: 'auto' }} iconLeft={<Icon name="plus" size={14} />} onClick={() => setEditor({})}>新增转账</Button>
      </div>
      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead><tr><Th>日期</Th><Th>转出</Th><Th right>转出额</Th><Th>转入</Th><Th right>转入额</Th><Th w={88}></Th></tr></thead>
          <tbody>
            {(transfers.data?.items ?? []).map((t) => (
              <Row key={t.id}>
                <Td mono dim>{t.transfer_date}</Td>
                <Td>{t.from_account_name}</Td>
                <Td right mono color="var(--loss)">−{native(t.from_amount, t.from_currency ?? 'CNY')}</Td>
                <Td>{t.to_account_name}</Td>
                <Td right mono color="var(--gain)">+{native(t.to_amount, t.to_currency ?? 'CNY')}</Td>
                <Td right>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <IconButton aria-label="编辑" size="sm" onClick={() => setEditor({ item: t })}><Icon name="pencil" size={13} /></IconButton>
                    <IconButton aria-label="删除" size="sm" onClick={() => { if (confirm('删除这笔转账？')) remove.mutate(t.id) }}><Icon name="trash-2" size={13} /></IconButton>
                  </div>
                </Td>
              </Row>
            ))}
            {!transfers.isLoading && !(transfers.data?.items ?? []).length ? <tr><Td dim>暂无转账</Td></tr> : null}
          </tbody>
        </table>
      </div>
      <SectionHint>转账不改变净资产，仅影响账户 / 币种分布（§6.18）；跨币种请分别填两侧实际到账金额，系统不算汇率。</SectionHint>
      {editor ? <TransferModal item={editor.item} accounts={(accounts.data ?? []).filter((a) => !a.is_archived)} onClose={() => setEditor(null)} /> : null}
    </Page>
  )
}

function TransferModal({ item, accounts, onClose }: { item?: Transfer; accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const timezone = usePrefStore((s) => s.timezone)
  const [fromId, setFromId] = useState(item ? String(item.from_account_id) : accounts[0] ? String(accounts[0].id) : '')
  const [toId, setToId] = useState(item ? String(item.to_account_id) : accounts[1] ? String(accounts[1].id) : '')
  const [date, setDate] = useState(item?.transfer_date ?? todayISO(timezone))
  const [fromAmt, setFromAmt] = useState(item?.from_amount ?? '')
  const [toAmt, setToAmt] = useState(item?.to_amount ?? '')
  const [touched, setTouched] = useState(false)

  const fromAcct = accounts.find((a) => String(a.id) === fromId)
  const toAcct = accounts.find((a) => String(a.id) === toId)
  const sameCcy = fromAcct && toAcct && fromAcct.currency === toAcct.currency

  const save = useMutation({
    mutationFn: () => {
      const body: CreateTransferInput = {
        from_account_id: Number(fromId), to_account_id: Number(toId), transfer_date: date,
        from_amount: fromAmt.trim(), to_amount: (sameCcy ? fromAmt : toAmt).trim(),
      }
      return item ? updateTransfer(item.id, body) : createTransfer(body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success(item ? '已更新' : '已记录')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const invalid = touched && (!fromId || !toId || fromId === toId || !fromAmt.trim() || (!sameCcy && !toAmt.trim()))

  return (
    <Modal
      title={item ? '编辑转账' : '新增转账'}
      icon="repeat"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={save.isPending} onClick={() => { setTouched(true); if (fromId && toId && fromId !== toId && fromAmt.trim() && (sameCcy || toAmt.trim())) save.mutate() }}>保存</Button></>}
    >
      <div className="fb-form form-4">
        <Field label="转出账户" error={invalid && fromId === toId ? '不能相同' : undefined}>
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)} options={accounts.map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name + ' (' + a.currency + ')' }))} />
        </Field>
        <Field label="转入账户" error={invalid && fromId === toId ? '不能相同' : undefined}>
          <Select value={toId} onChange={(e) => setToId(e.target.value)} options={accounts.map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name + ' (' + a.currency + ')' }))} />
        </Field>
        <Field label="转账日期"><DateField value={date} onChange={setDate} /></Field>
        <Field label={`转出额 ${fromAcct ? '(' + fromAcct.currency + ')' : ''}`} error={invalid && !fromAmt.trim() ? '必填' : undefined}>
          <Input numeric value={fromAmt} onChange={(e) => setFromAmt(e.target.value)} placeholder="10000" />
        </Field>
      </div>
      {!sameCcy ? (
        <div style={{ marginTop: 12 }}>
          <Field label={`转入额 ${toAcct ? '(' + toAcct.currency + ')' : ''} · 跨币种手填实际到账`} error={invalid && !toAmt.trim() ? '必填' : undefined}>
            <Input numeric value={toAmt} onChange={(e) => setToAmt(e.target.value)} placeholder="实际到账金额" />
          </Field>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="info" size={13} /> 同币种转账，转入额自动等于转出额。<Badge tone="neutral">{fromAcct?.currency}</Badge>
        </div>
      )}
    </Modal>
  )
}
