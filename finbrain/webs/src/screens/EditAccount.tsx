import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Icon, Input, Select } from '../ds'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { updateAccount, type Account, type AccountKind } from '../api'
import { ACCOUNT_KINDS, currencyLabel, KIND_LABEL } from '../lib/format'

export function EditAccountModal({
  account,
  onClose,
}: {
  account: Account
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()

  const [name, setName] = useState(account.name)
  const [kind, setKind] = useState<AccountKind>(account.kind)
  const [note, setNote] = useState(account.note ?? '')
  const [touched, setTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Institution and account currency are fixed at creation; changing either would
  // reinterpret existing snapshots.
  const errs: Record<string, string> = {}
  if (!name.trim()) errs.name = '请输入账户名'
  const valid = Object.keys(errs).length === 0

  const save = useMutation({
    mutationFn: () =>
      updateAccount(account.id, {
        name: name.trim(),
        kind,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['account', account.id] })
      toast.success('账户已更新')
      onClose()
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : '更新失败'),
  })

  function submit() {
    setTouched(true)
    setFormError(null)
    if (!valid) return
    save.mutate()
  }

  return (
    <Modal
      title="编辑账户"
      icon="pencil"
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
            disabled={save.isPending || (touched && !valid)}
            onClick={submit}
          >
            {save.isPending ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="账户名" error={touched ? errs.name : undefined}>
            <Input
              value={name}
              invalid={touched && !!errs.name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="机构（创建后不可改）">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 34,
                padding: '0 10px',
                fontSize: 13,
                color: 'var(--text-secondary)',
                background: 'var(--surface-inset)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {account.institution}
            </div>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="类型">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
              options={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))}
            />
          </Field>
          <Field label="币种（创建后不可改）">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 34,
                padding: '0 10px',
                fontSize: 13,
                color: 'var(--text-secondary)',
                background: 'var(--surface-inset)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {currencyLabel(account.currency)}
            </div>
          </Field>
        </div>
        <Field label="备注（可选）">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
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
