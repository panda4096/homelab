import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Field, Icon, Input, Segmented, Select } from '../ds'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { useUiStore } from '../uiStore'
import {
  createAccount,
  createAccountsFromTemplate,
  createInstitution,
  listAccountTemplates,
  listInstitutions,
  type AccountKind,
  type AccountTemplate,
  type Institution,
} from '../api'
import {
  ACCOUNT_CURRENCIES,
  ACCOUNT_KINDS,
  currencyLabel,
  institutionKindLabel,
  KIND_LABEL,
} from '../lib/format'

const MODE_OPTIONS = [
  { value: 'template', label: '从模板建账' },
  { value: 'manual', label: '手动建账' },
]

const NEW_INSTITUTION = '__new__'

/**
 * Institution picker shared by both build flows: a Select of existing institutions
 * plus a "+ 新建机构" sentinel option that reveals a name input. Reports the chosen
 * institution_id (existing) or institution_name (new) to the parent.
 */
function InstitutionPicker({
  institutions,
  isLoading,
  mode,
  institutionId,
  newName,
  invalid,
  error,
  onModeChange,
  onSelect,
  onNewName,
}: {
  institutions: Institution[]
  isLoading: boolean
  mode: 'existing' | 'new'
  institutionId: string
  newName: string
  invalid?: boolean
  error?: string
  onModeChange: (m: 'existing' | 'new') => void
  onSelect: (id: string) => void
  onNewName: (name: string) => void
}) {
  const options = [
    ...institutions.map((i) => ({
      value: String(i.id),
      label:
        i.kind && institutionKindLabel(i.kind) !== '—'
          ? `${i.name} · ${institutionKindLabel(i.kind)}`
          : i.name,
    })),
    { value: NEW_INSTITUTION, label: '+ 新建机构…' },
  ]

  return (
    <Field
      label="机构"
      hint={mode === 'new' ? '将以此名称创建/复用机构' : '账户将归属此机构'}
      error={error}
    >
      <Select
        value={mode === 'new' ? NEW_INSTITUTION : institutionId}
        placeholder={isLoading ? '加载机构中…' : '请选择机构'}
        onChange={(e) => {
          const v = e.target.value
          if (v === NEW_INSTITUTION) {
            onModeChange('new')
          } else {
            onModeChange('existing')
            onSelect(v)
          }
        }}
        options={options}
      />
      {mode === 'new' ? (
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder="新机构名，如 招商银行"
            value={newName}
            invalid={invalid}
            onChange={(e) => onNewName(e.target.value)}
          />
        </div>
      ) : null}
    </Field>
  )
}

export function BuildAccount() {
  const open = useUiStore((s) => s.buildOpen)
  const close = useUiStore((s) => s.closeBuild)
  if (!open) return null
  return <BuildAccountInner onClose={close} />
}

function BuildAccountInner({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'template' | 'manual'>('template')
  const [formError, setFormError] = useState<string | null>(null)

  const afterCreate = () => {
    void qc.invalidateQueries({ queryKey: ['accounts'] })
    void qc.invalidateQueries({ queryKey: ['institutions'] })
    onClose()
    navigate('/accounts')
  }

  return (
    <Modal
      title="新增账户"
      icon="building-2"
      width={620}
      onClose={onClose}
      footer={null}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Segmented
          options={MODE_OPTIONS}
          value={mode}
          onChange={(v) => {
            setMode(v as 'template' | 'manual')
            setFormError(null)
          }}
        />
        {mode === 'template' ? (
          <TemplateForm
            onError={setFormError}
            onDone={afterCreate}
            onCancel={onClose}
          />
        ) : (
          <ManualForm onError={setFormError} onDone={afterCreate} onCancel={onClose} />
        )}
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

function TemplateForm({
  onError,
  onDone,
  onCancel,
}: {
  onError: (m: string | null) => void
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['account-templates'],
    queryFn: listAccountTemplates,
  })
  const { data: institutions = [], isLoading: instLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: listInstitutions,
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [instMode, setInstMode] = useState<'existing' | 'new'>('existing')
  const [institutionId, setInstitutionId] = useState('')
  const [newName, setNewName] = useState('')
  const [touched, setTouched] = useState(false)

  const instValid =
    instMode === 'existing' ? institutionId !== '' : newName.trim().length > 0

  const create = useMutation({
    mutationFn: () =>
      createAccountsFromTemplate(
        selectedId!,
        instMode === 'existing'
          ? { institution_id: Number(institutionId) }
          : { institution_name: newName.trim() },
      ),
    onSuccess: (accts) => {
      toast.success(`已创建 ${accts.length} 个账户`)
      onDone()
    },
    onError: (e) => onError(e instanceof Error ? e.message : '建账失败'),
  })

  const valid = selectedId != null && instValid

  function submit() {
    setTouched(true)
    onError(null)
    if (!valid) return
    create.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <InstitutionPicker
        institutions={institutions}
        isLoading={instLoading}
        mode={instMode}
        institutionId={institutionId}
        newName={newName}
        invalid={touched && instMode === 'new' && !newName.trim()}
        error={touched && !instValid ? '请选择或新建机构' : undefined}
        onModeChange={setInstMode}
        onSelect={setInstitutionId}
        onNewName={setNewName}
      />

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>选择模板</div>
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>加载模板中…</div>
      ) : !templates.length ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>暂无可用模板。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map((tpl: AccountTemplate) => {
            const active = tpl.id === selectedId
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedId(tpl.id)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: active ? 'var(--accent-bg)' : 'var(--surface-inset)',
                  border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon
                    name={active ? 'circle-check-big' : 'layers'}
                    size={15}
                    color={active ? 'var(--accent-bright)' : 'var(--accent)'}
                  />
                  <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 500 }}>
                    {tpl.name}
                  </span>
                  {tpl.is_builtin ? <Badge tone="gold">内置</Badge> : null}
                </div>
                {tpl.description ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    {tpl.description}
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tpl.account_blueprints.map((bp, i) => (
                    <span key={i} className="fb-tag" style={{ fontSize: 11 }}>
                      {bp.name_suffix}
                      <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
                        {KIND_LABEL[bp.kind] ?? bp.kind} · {bp.currency}
                      </span>
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 2 }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Icon name="check" size={14} />}
          disabled={create.isPending || (touched && !valid)}
          onClick={submit}
        >
          {create.isPending ? '创建中…' : '创建账户组'}
        </Button>
      </div>
    </div>
  )
}

function ManualForm({
  onError,
  onDone,
  onCancel,
}: {
  onError: (m: string | null) => void
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const { data: institutions = [], isLoading: instLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: listInstitutions,
  })
  const [name, setName] = useState('')
  const [instMode, setInstMode] = useState<'existing' | 'new'>('existing')
  const [institutionId, setInstitutionId] = useState('')
  const [newName, setNewName] = useState('')
  const [currency, setCurrency] = useState('CNY')
  const [kind, setKind] = useState<AccountKind>('cash')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const instValid =
    instMode === 'existing' ? institutionId !== '' : newName.trim().length > 0

  const errs: Record<string, string> = {}
  if (!name.trim()) errs.name = '请输入账户名'
  if (!ACCOUNT_CURRENCIES.includes(currency as (typeof ACCOUNT_CURRENCIES)[number])) {
    errs.currency = '请选择账户币种'
  }
  const valid = Object.keys(errs).length === 0 && instValid

  const create = useMutation({
    mutationFn: async () => {
      // Resolve to an institution_id: create the institution first if the user
      // typed a new name, then build the account against it.
      let resolvedId: number
      if (instMode === 'new') {
        const inst = await createInstitution({ name: newName.trim() })
        resolvedId = inst.id
      } else {
        resolvedId = Number(institutionId)
      }
      return createAccount({
        name: name.trim(),
        institution_id: resolvedId,
        currency: currency.trim().toUpperCase(),
        kind,
        note: note.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success('账户已创建')
      onDone()
    },
    onError: (e) => onError(e instanceof Error ? e.message : '建账失败'),
  })

  function submit() {
    setTouched(true)
    onError(null)
    if (!valid) return
    create.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="账户名" error={touched ? errs.name : undefined}>
          <Input
            placeholder="如 储蓄卡 6231"
            value={name}
            invalid={touched && !!errs.name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <InstitutionPicker
          institutions={institutions}
          isLoading={instLoading}
          mode={instMode}
          institutionId={institutionId}
          newName={newName}
          invalid={touched && instMode === 'new' && !newName.trim()}
          error={touched && !instValid ? '请选择或新建机构' : undefined}
          onModeChange={setInstMode}
          onSelect={setInstitutionId}
          onNewName={setNewName}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="类型">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as AccountKind)}
            options={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))}
          />
        </Field>
        <Field
          label="币种"
          hint="创建后不可修改"
          error={touched ? errs.currency : undefined}
        >
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={ACCOUNT_CURRENCIES.map((ccy) => ({
              value: ccy,
              label: currencyLabel(ccy),
            }))}
          />
        </Field>
      </div>
      <Field label="备注（可选）">
        <Input placeholder="可留空" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 2 }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Icon name="check" size={14} />}
          disabled={create.isPending || (touched && !valid)}
          onClick={submit}
        >
          {create.isPending ? '创建中…' : '创建账户'}
        </Button>
      </div>
    </div>
  )
}
