import { useState, type DragEventHandler } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Field, Icon, IconButton, Input, Select } from '../ds'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'
import { Row, Td } from '../lib/ui'
import { INSTITUTION_KINDS, institutionKindLabel } from '../lib/format'
import {
  ApiError,
  createInstitution,
  deleteInstitution,
  listInstitutions,
  updateInstitution,
  type Institution,
} from '../api'

export function Institutions({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  const {
    data: institutions = [],
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['institutions'], queryFn: listInstitutions })

  // null = closed; { } = create; { ...inst } = edit
  const [editing, setEditing] = useState<Institution | 'new' | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const reorder = useMutation({
    mutationFn: async (ordered: Institution[]) => {
      await Promise.all(
        ordered.map((inst, index) =>
          updateInstitution(inst.id, { display_order: index * 10 }),
        ),
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institutions'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('机构顺序已更新')
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['institutions'] })
      toast.error(e instanceof Error ? e.message : '排序失败')
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteInstitution(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institutions'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('机构已删除')
    },
    // 409 when account_count > 0 — surface the backend message verbatim.
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  function onDelete(inst: Institution) {
    if (inst.account_count > 0) {
      toast.error(`该机构下还有 ${inst.account_count} 个账户，请先迁移或删除账户`)
      return
    }
    if (!window.confirm(`确认删除机构「${inst.name}」？`)) return
    remove.mutate(inst.id)
  }

  function onDropInstitution(targetId: number) {
    if (draggingId == null || draggingId === targetId) return
    const from = institutions.findIndex((i) => i.id === draggingId)
    const to = institutions.findIndex((i) => i.id === targetId)
    if (from < 0 || to < 0) return

    const next = [...institutions]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const normalized = next.map((inst, index) => ({ ...inst, display_order: index * 10 }))
    qc.setQueryData(['institutions'], normalized)
    reorder.mutate(normalized)
    setDraggingId(null)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: embedded ? 0 : 22,
        maxWidth: embedded ? undefined : 1320,
        margin: embedded ? undefined : '0 auto',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          {institutions.length} 家机构 · 拖动行调整显示顺序
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Icon name="plus" size={14} />}
            onClick={() => setEditing('new')}
          >
            新建机构
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            加载机构中…
          </div>
        </Card>
      ) : isError ? (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            无法加载机构：{error instanceof Error ? error.message : '后端未连接'}
          </div>
        </Card>
      ) : !institutions.length ? (
        <EmptyState onNew={() => setEditing('new')} />
      ) : (
        <Card padded={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {institutions.map((inst) => (
                <InstitutionRow
                  key={inst.id}
                  inst={inst}
                  dragging={draggingId === inst.id}
                  onDragStart={() => setDraggingId(inst.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropInstitution(inst.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onEdit={() => setEditing(inst)}
                  onDelete={() => onDelete(inst)}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon name="info" size={13} /> 拖动机构行调整顺序 ·
        含账户的机构需先迁移或删除其账户后才能删除
      </div>

      {editing ? (
        <InstitutionModal
          institution={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function InstitutionRow({
  inst,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete,
}: {
  inst: Institution
  dragging: boolean
  onDragStart: () => void
  onDragOver: DragEventHandler<HTMLTableRowElement>
  onDrop: () => void
  onDragEnd: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Row
      draggable
      highlight={dragging}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
    >
      <Td w={36}>
        <Icon name="grip-vertical" size={15} color="var(--text-tertiary)" />
      </Td>
      <Td w={36}>
        <Icon name="building-2" size={15} color="var(--text-tertiary)" />
      </Td>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 13, color: 'var(--text-strong)' }}>{inst.name}</span>
          <Badge tone="neutral">{institutionKindLabel(inst.kind)}</Badge>
        </div>
      </Td>
      <Td>
        <Badge tone="neutral">{inst.account_count} 账户</Badge>
      </Td>
      <Td dim>
        <span style={{ fontSize: 12 }}>{inst.note || '—'}</span>
      </Td>
      <Td right w={96}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <IconButton size="sm" aria-label="编辑" onClick={onEdit}>
            <Icon name="pencil" size={14} />
          </IconButton>
          <IconButton size="sm" aria-label="删除" onClick={onDelete}>
            <Icon name="trash-2" size={14} />
          </IconButton>
        </div>
      </Td>
    </Row>
  )
}

function InstitutionModal({
  institution,
  onClose,
}: {
  institution: Institution | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = institution != null

  const [name, setName] = useState(institution?.name ?? '')
  const [kind, setKind] = useState(institution?.kind ?? '')
  const [note, setNote] = useState(institution?.note ?? '')
  const [touched, setTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const errs: Record<string, string> = {}
  if (!name.trim()) errs.name = '请输入机构名'
  const valid = Object.keys(errs).length === 0

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        kind: kind.trim() ? kind.trim() : null,
        note: note.trim() ? note.trim() : null,
      }
      return isEdit
        ? updateInstitution(institution.id, payload)
        : createInstitution(payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institutions'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(isEdit ? '机构已更新' : '机构已创建')
      onClose()
    },
    onError: (e) => {
      // 409 conflict on duplicate name — show a friendly inline message.
      if (e instanceof ApiError && e.code === 'conflict') {
        setFormError('机构名已存在')
        return
      }
      setFormError(e instanceof Error ? e.message : '保存失败')
    },
  })

  function submit() {
    setTouched(true)
    setFormError(null)
    if (!valid) return
    save.mutate()
  }

  const KIND_OPTIONS = [
    { value: '', label: '（不指定）' },
    ...INSTITUTION_KINDS.map((k) => ({ value: k, label: institutionKindLabel(k) })),
  ]

  return (
    <Modal
      title={isEdit ? '编辑机构' : '新建机构'}
      icon="building-2"
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
        <Field label="机构名" error={touched ? errs.name : undefined}>
          <Input
            placeholder="如 招商银行 / 富途证券"
            value={name}
            invalid={touched && !!errs.name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="类型">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={KIND_OPTIONS}
          />
        </Field>
        <Field label="备注（可选）">
          <Input placeholder="可留空" value={note} onChange={(e) => setNote(e.target.value)} />
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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          textAlign: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'var(--surface-inset)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="building-2" size={28} color="var(--text-secondary)" />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-strong)', margin: 0 }}>
          还没有任何机构
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, maxWidth: 420 }}>
          先创建机构（如银行、券商），再把账户归属到对应机构。
        </p>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Icon name="plus" size={14} />}
          onClick={onNew}
        >
          新建机构
        </Button>
      </div>
    </Card>
  )
}
