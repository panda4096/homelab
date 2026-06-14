import { useMemo, useState, type CSSProperties, type DragEventHandler, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Icon, Segmented } from '../ds'
import { KindBadge, Row, Td } from '../lib/ui'
import { institutionKindLabel, isStale, KIND_TONE, kindSortIndex, native } from '../lib/format'
import { listAccounts, updateAccount, type Account } from '../api'
import { useUiStore } from '../uiStore'
import { useToast } from '../shell/Toast'
import { Institutions } from './Institutions'
import { usePrefStore } from '../store'

interface Group {
  institutionId: number
  institution: string
  institutionKind: string | null
  items: Account[]
}

const accountTableStyle: CSSProperties = {
  width: '100%',
  minWidth: 760,
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
}

const ACCOUNT_PAGE_TABS = [
  { value: 'accounts', label: '账户' },
  { value: 'institutions', label: '机构' },
]

// Group by institution_id (the entity), using the joined `institution` name +
// `institution_kind` for the header. Preserves the API's institution ordering
// (display_order) by keying off first-seen order in the account list.
function groupByInstitution(accounts: Account[]): Group[] {
  const map = new Map<number, Group>()
  for (const a of accounts) {
    let grp = map.get(a.institution_id)
    if (!grp) {
      grp = {
        institutionId: a.institution_id,
        institution: a.institution,
        institutionKind: a.institution_kind,
        items: [],
      }
      map.set(a.institution_id, grp)
    }
    grp.items.push(a)
  }
  const groups = [...map.values()]
  for (const grp of groups) {
    grp.items.sort((x, y) => {
      const order = x.display_order - y.display_order
      if (order !== 0) return order
      const k = kindSortIndex(x.kind) - kindSortIndex(y.kind)
      return k !== 0 ? k : x.name.localeCompare(y.name)
    })
  }
  return groups
}

function AccountTable({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={accountTableStyle}>
        <colgroup>
          <col style={{ width: 32 }} />
          <col style={{ width: 32 }} />
          <col />
          <col style={{ width: 96 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 40 }} />
        </colgroup>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Accounts() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const openBuild = useUiStore((s) => s.openBuild)
  const [draggingAccountId, setDraggingAccountId] = useState<number | null>(null)
  const activeTab = searchParams.get('tab') === 'institutions' ? 'institutions' : 'accounts'
  const { data: accounts = [], isLoading, isError, error } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  })

  const reorder = useMutation({
    mutationFn: async (ordered: Account[]) => {
      await Promise.all(
        ordered.map((account, index) =>
          updateAccount(account.id, { display_order: index * 10 }),
        ),
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('账户顺序已更新')
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.error(e instanceof Error ? e.message : '排序失败')
    },
  })

  const active = useMemo(() => accounts.filter((a) => !a.is_archived), [accounts])
  const archived = useMemo(() => accounts.filter((a) => a.is_archived), [accounts])
  const groups = useMemo(() => groupByInstitution(active), [active])

  function switchTab(next: string) {
    const params = new URLSearchParams(searchParams)
    if (next === 'institutions') {
      params.set('tab', 'institutions')
    } else {
      params.delete('tab')
    }
    setSearchParams(params, { replace: true })
  }

  function onDropAccount(group: Group, targetId: number) {
    if (draggingAccountId == null || draggingAccountId === targetId) return
    const from = group.items.findIndex((a) => a.id === draggingAccountId)
    const to = group.items.findIndex((a) => a.id === targetId)
    if (from < 0 || to < 0) return

    const next = [...group.items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const normalized = next.map((account, index) => ({
      ...account,
      display_order: index * 10,
    }))

    qc.setQueryData<Account[]>(['accounts'], (old = []) =>
      old.map((account) => {
        const changed = normalized.find((a) => a.id === account.id)
        return changed ?? account
      }),
    )
    reorder.mutate(normalized)
    setDraggingAccountId(null)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 22,
        maxWidth: 1320,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented
          size="sm"
          options={ACCOUNT_PAGE_TABS}
          value={activeTab}
          onChange={switchTab}
        />
        <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          {activeTab === 'accounts'
            ? `${groups.length} 家机构 · ${active.length} 个账户 · 按机构分组，机构内拖动排序`
            : '机构用于账户归属和展示顺序，通常只在建账或调整分组时使用'}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {activeTab === 'accounts' ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Icon name="plus" size={14} />}
              onClick={openBuild}
            >
              新增账户
            </Button>
          ) : null}
        </div>
      </div>

      {activeTab === 'institutions' ? (
        <Institutions embedded />
      ) : isLoading ? (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            加载账户中…
          </div>
        </Card>
      ) : isError ? (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>
            无法加载账户：{error instanceof Error ? error.message : '后端未连接'}
          </div>
        </Card>
      ) : !active.length && !archived.length ? (
        <EmptyState onBuild={openBuild} />
      ) : (
        <>
          {groups.map((grp) => (
            <InstitutionGroup
              key={grp.institutionId}
              group={grp}
              draggingAccountId={draggingAccountId}
              onDragAccount={setDraggingAccountId}
              onDropAccount={(targetId) => onDropAccount(grp, targetId)}
              onOpen={(id) => navigate(`/accounts/${id}`)}
            />
          ))}

          {archived.length ? (
            <ArchivedSection
              accounts={archived}
              onOpen={(id) => navigate(`/accounts/${id}`)}
            />
          ) : null}

          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="info" size={13} /> 超过 35 天未更新的账户在最近更新日期上标灰提示 ·
            信用卡账户不使用余额快照，可在详情页录入账单
          </div>
        </>
      )}
    </div>
  )
}

function AccountRow({
  account,
  draggable,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onOpen,
}: {
  account: Account
  draggable?: boolean
  dragging?: boolean
  onDragStart?: () => void
  onDragOver?: DragEventHandler<HTMLTableRowElement>
  onDrop?: () => void
  onDragEnd?: () => void
  onOpen: (id: number) => void
}) {
  const a = account
  const timezone = usePrefStore((s) => s.timezone)
  const stale = isStale(a.last_snapshot_date, timezone)
  const tone = a.kind === 'credit_card' ? 'var(--loss)' : 'var(--text-strong)'
  return (
    <Row
      onClick={() => onOpen(a.id)}
      draggable={draggable}
      highlight={dragging}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault()
        onDrop?.()
      }}
      onDragEnd={onDragEnd}
    >
      <Td w={32}>
        {draggable ? (
          <Icon name="grip-vertical" size={14} color="var(--text-tertiary)" />
        ) : null}
      </Td>
      <Td w={32}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: KIND_TONE[a.kind] ?? 'var(--viz-1)',
          }}
        />
      </Td>
      <Td style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: 13,
              color: 'var(--text-strong)',
            }}
          >
            {a.name}
          </span>
          <span style={{ flex: '0 0 auto' }}>
            <KindBadge kind={a.kind} />
          </span>
        </div>
      </Td>
      <Td w={96}>
        <Badge tone="neutral">{a.currency}</Badge>
      </Td>
      <Td w={180} right mono color={tone}>
        {a.kind === 'credit_card' && a.current_balance == null
          ? '—'
          : native(a.current_balance, a.currency, 2)}
      </Td>
      <Td w={150} right>
        <span
          className="fb-num"
          style={{
            fontSize: 11.5,
            color: stale ? 'var(--warning)' : 'var(--text-tertiary)',
          }}
        >
          {a.last_snapshot_date ?? '未更新'}
          {stale && a.last_snapshot_date ? ' ·需更新' : ''}
        </span>
      </Td>
      <Td w={40} right>
        <Icon name="chevron-right" size={15} color="var(--text-tertiary)" />
      </Td>
    </Row>
  )
}

function InstitutionGroup({
  group,
  draggingAccountId,
  onDragAccount,
  onDropAccount,
  onOpen,
}: {
  group: Group
  draggingAccountId: number | null
  onDragAccount: (id: number | null) => void
  onDropAccount: (targetId: number) => void
  onOpen: (id: number) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '13px 16px',
          width: '100%',
          background: 'none',
          border: 'none',
          borderBottom: open ? '1px solid var(--divider)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          size={15}
          color="var(--text-tertiary)"
        />
        <Icon name="landmark" size={15} color="var(--text-tertiary)" />
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: 'var(--text-strong)',
            whiteSpace: 'nowrap',
          }}
        >
          {group.institution}
        </span>
        {group.institutionKind && institutionKindLabel(group.institutionKind) !== '—' ? (
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            {institutionKindLabel(group.institutionKind)}
          </span>
        ) : null}
        <Badge tone="neutral">{group.items.length} 账户</Badge>
      </button>
      {open ? (
        <AccountTable>
          {group.items.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              draggable
              dragging={draggingAccountId === a.id}
              onDragStart={() => onDragAccount(a.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropAccount(a.id)}
              onDragEnd={() => onDragAccount(null)}
              onOpen={onOpen}
            />
          ))}
        </AccountTable>
      ) : null}
    </Card>
  )
}

function ArchivedSection({
  accounts,
  onOpen,
}: {
  accounts: Account[]
  onOpen: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '13px 16px',
          borderBottom: open ? '1px solid var(--divider)' : 'none',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          size={15}
          color="var(--text-tertiary)"
        />
        <Icon name="archive" size={15} color="var(--text-tertiary)" />
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
          已归档
        </span>
        <Badge tone="neutral">{accounts.length}</Badge>
      </button>
      {open ? (
        <AccountTable>
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onOpen={onOpen} />
          ))}
        </AccountTable>
      ) : null}
    </Card>
  )
}

function EmptyState({ onBuild }: { onBuild: () => void }) {
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
          <Icon name="landmark" size={28} color="var(--text-secondary)" />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-strong)', margin: 0 }}>
          还没有任何账户
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, maxWidth: 420 }}>
          从模板快速创建一组关联账户，或手动添加单个账户。
        </p>
        <Button variant="primary" size="sm" iconLeft={<Icon name="plus" size={14} />} onClick={onBuild}>
          新增账户
        </Button>
      </div>
    </Card>
  )
}
