import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Icon, IconButton } from '../ds'
import { KindBadge, Row, SectionHint, Td, Th } from '../lib/ui'
import {
  KIND_TONE,
  native,
  quantity,
  supportsBalanceSnapshots,
  supportsPositionSnapshots,
} from '../lib/format'
import {
  ApiError,
  deleteAccount,
  deleteBalanceSnapshot,
  deletePositionSnapshot,
  getAccount,
  listBalanceSnapshots,
  listPositions,
  listPositionSnapshots,
  updateAccount,
  type Account,
  type PositionSnapshot,
} from '../api'
import { useToast } from '../shell/Toast'
import { ConfirmDialog } from '../shell/ConfirmDialog'
import { useUiStore } from '../uiStore'
import { EditAccountModal } from './EditAccount'
import { CreditCardBillsSection } from './CreditCardBills'

const detailTableStyle: CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
}

export function AccountDetail() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const openQuickEntry = useUiStore((s) => s.openQuickEntry)
  const [editing, setEditing] = useState(false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)

  const { data: account, isLoading, isError, error } = useQuery({
    queryKey: ['account', id],
    queryFn: () => getAccount(id),
    enabled: Number.isFinite(id),
  })

  const archiveMut = useMutation({
    mutationFn: (next: boolean) => updateAccount(id, { is_archived: next }),
    onSuccess: (acct) => {
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['account', id] })
      toast.success(acct.is_archived ? '账户已归档' : '账户已取消归档')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteAccount(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['institutions'] })
      toast.success('账户已删除')
      setConfirmDeleteAccount(false)
      navigate('/accounts')
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'conflict') {
        toast.error(`${e.message}（请改为归档）`)
      } else {
        toast.error(e instanceof Error ? e.message : '删除失败')
      }
    },
  })

  if (isLoading) {
    return (
      <Shell onBack={() => navigate('/accounts')}>
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>加载账户中…</div>
        </Card>
      </Shell>
    )
  }
  if (isError || !account) {
    return (
      <Shell onBack={() => navigate('/accounts')}>
        <Card>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            无法加载账户：{error instanceof Error ? error.message : '未找到'}
          </div>
        </Card>
      </Shell>
    )
  }

  const balanceKind = supportsBalanceSnapshots(account.kind)
  const holdingKind = supportsPositionSnapshots(account.kind)

  return (
    <Shell onBack={() => navigate('/accounts')}>
      {/* header */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'var(--surface-inset)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="landmark" size={22} color={KIND_TONE[account.kind]} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 19, fontWeight: 500, color: 'var(--text-strong)', margin: 0 }}>
                {account.institution} · {account.name}
              </h2>
              <KindBadge kind={account.kind} />
              <Badge tone="neutral">{account.currency}</Badge>
              {account.is_archived ? <Badge tone="warning">已归档</Badge> : null}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                marginTop: 5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              account #{account.id} · 最近更新 {account.last_snapshot_date ?? '无'}
            </div>
            {account.note ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                {account.note}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon name="plus" size={14} />}
              disabled={!balanceKind && !holdingKind}
              onClick={() =>
                openQuickEntry({
                  accountId: account.id,
                  type: holdingKind ? 'position' : 'balance',
                })
              }
            >
              更新当前情况
            </Button>
            <IconButton aria-label="编辑" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={15} />
            </IconButton>
            <IconButton
              aria-label={account.is_archived ? '取消归档' : '归档'}
              onClick={() => archiveMut.mutate(!account.is_archived)}
            >
              <Icon name={account.is_archived ? 'archive-restore' : 'archive'} size={15} />
            </IconButton>
            <IconButton
              aria-label="删除"
              onClick={() => setConfirmDeleteAccount(true)}
            >
              <Icon name="trash-2" size={15} />
            </IconButton>
          </div>
        </div>
      </Card>

      {balanceKind ? <BalanceSnapshots account={account} /> : null}
      {holdingKind ? (
        <Positions accountId={account.id} accountCurrency={account.currency} />
      ) : null}
      {account.kind === 'credit_card' ? <CreditCardBillsSection account={account} /> : null}
      {!balanceKind && !holdingKind ? <UnsupportedAccountKind account={account} /> : null}
      <PlaceholderSections />

      {editing ? (
        <EditAccountModal account={account} onClose={() => setEditing(false)} />
      ) : null}
      {confirmDeleteAccount ? (
        <ConfirmDialog
          title="删除账户"
          message={`确定删除账户「${account.name}」？此操作不可撤销。已有记录的账户会被后端拒绝删除，请改为归档。`}
          confirmLabel="删除"
          pending={deleteMut.isPending}
          onCancel={() => setConfirmDeleteAccount(false)}
          onConfirm={() => deleteMut.mutate()}
        />
      ) : null}
    </Shell>
  )
}

function Shell({
  children,
  onBack,
  backLabel = '返回账户列表',
}: {
  children: React.ReactNode
  onBack: () => void
  backLabel?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 22,
        maxWidth: 1180,
        margin: '0 auto',
      }}
    >
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          fontSize: 12.5,
          padding: 0,
          alignSelf: 'flex-start',
        }}
      >
        <Icon name="arrow-left" size={15} /> {backLabel}
      </button>
      {children}
    </div>
  )
}

function DetailTable({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100%' }}>
      <table style={detailTableStyle}>{children}</table>
    </div>
  )
}

// ---------- balance records ----------

function BalanceSnapshots({ account }: { account: Account }) {
  const qc = useQueryClient()
  const toast = useToast()
  const openQuickEntry = useUiStore((s) => s.openQuickEntry)
  const [deleting, setDeleting] = useState<{ id: number; date: string } | null>(null)
  const { data: snaps = [], isLoading } = useQuery({
    queryKey: ['balance-snapshots', account.id],
    queryFn: () => listBalanceSnapshots(account.id),
  })

  const del = useMutation({
    mutationFn: (sid: number) => deleteBalanceSnapshot(sid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['balance-snapshots', account.id] })
      void qc.invalidateQueries({ queryKey: ['account', account.id] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('余额记录已删除')
      setDeleting(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  return (
    <Card
      eyebrow="余额记录 · 时间倒序"
      padded={false}
      actions={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="plus" size={13} />}
          onClick={() => openQuickEntry({ accountId: account.id, type: 'balance' })}
        >
          录入余额
        </Button>
      }
    >
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>加载中…</div>
      ) : !snaps.length ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>
          暂无余额记录。点击「录入余额」添加第一条。
        </div>
      ) : (
        <DetailTable>
          <thead>
            <tr>
              <Th>日期</Th>
              <Th right>余额（{account.currency}）</Th>
              <Th>备注</Th>
              <Th w={88} />
            </tr>
          </thead>
          <tbody>
            {snaps.map((s) => (
              <Row key={s.id}>
                <Td mono>{s.snapshot_date}</Td>
                <Td right mono color="var(--text-strong)">
                  {native(s.balance, account.currency, 2)}
                </Td>
                <Td dim>{s.note || '—'}</Td>
                <Td right>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <IconButton
                      aria-label="编辑余额记录"
                      size="sm"
                      onClick={() =>
                        openQuickEntry({
                          accountId: account.id,
                          type: 'balance',
                          isEdit: true,
                          snapshotId: s.id,
                          date: s.snapshot_date,
                          balance: s.balance,
                          note: s.note ?? '',
                        })
                      }
                    >
                      <Icon name="pencil" size={13} />
                    </IconButton>
                    <IconButton
                      aria-label="删除"
                      size="sm"
                      onClick={() => setDeleting({ id: s.id, date: s.snapshot_date })}
                    >
                      <Icon name="trash-2" size={13} />
                    </IconButton>
                  </div>
                </Td>
              </Row>
            ))}
          </tbody>
        </DetailTable>
      )}
      {deleting ? (
        <ConfirmDialog
          title="删除余额记录"
          message={`删除 ${deleting.date} 的余额记录？此操作不可撤销。`}
          confirmLabel="删除"
          pending={del.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => del.mutate(deleting.id)}
        />
      ) : null}
    </Card>
  )
}

// ---------- holdings ----------

function Positions({
  accountId,
  accountCurrency,
}: {
  accountId: number
  accountCurrency: string
}) {
  const navigate = useNavigate()
  const openQuickEntry = useUiStore((s) => s.openQuickEntry)
  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['positions', accountId],
    queryFn: () => listPositions(accountId),
  })

  // current holdings: hide cleared (quantity "0") positions
  const current = useMemo(
    () => positions.filter((p) => Number(p.quantity) !== 0),
    [positions],
  )

  return (
    <Card
      eyebrow="当前持仓 · 按标的"
      padded={false}
      actions={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="plus" size={13} />}
          onClick={() => openQuickEntry({ accountId, type: 'position' })}
        >
          新增持仓
        </Button>
      }
    >
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>加载中…</div>
      ) : !current.length ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>
          暂无持仓。点击「新增持仓」添加第一条。
        </div>
      ) : (
        <DetailTable>
          <thead>
            <tr>
              <Th w={36} />
              <Th>标的</Th>
              <Th right>当前数量</Th>
              <Th right>平均成本</Th>
              <Th right>持仓成本</Th>
              <Th right>最近更新</Th>
              <Th right w={88} />
            </tr>
          </thead>
          <tbody>
            {current.map((p) => (
              <PositionRow
                key={p.symbol}
                position={p}
                accountId={accountId}
                accountCurrency={accountCurrency}
                onHistory={() =>
                  navigate(`/accounts/${accountId}/positions/${encodeURIComponent(p.symbol)}`)
                }
              />
            ))}
          </tbody>
        </DetailTable>
      )}
    </Card>
  )
}

function PositionRow({
  position,
  accountId,
  accountCurrency,
  onHistory,
}: {
  position: PositionSnapshot
  accountId: number
  accountCurrency: string
  onHistory: () => void
}) {
  const openQuickEntry = useUiStore((s) => s.openQuickEntry)
  const costCcy = position.cost_currency || ''
  const valueCcy = costCcy || accountCurrency
  const value =
    position.avg_cost != null
      ? Number(position.quantity) * Number(position.avg_cost)
      : null

  return (
    <Row onClick={onHistory}>
      <Td w={36}>
        <Icon name="chevron-right" size={14} color="var(--text-tertiary)" />
      </Td>
      <Td>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)', fontSize: 13 }}>
          {position.symbol}
        </span>
      </Td>
      <Td right mono>
        {quantity(position.quantity)}
      </Td>
      <Td right mono dim>
        {position.avg_cost != null ? native(position.avg_cost, valueCcy) : '—'}
      </Td>
      <Td right mono color="var(--text-strong)">
        {value == null || !Number.isFinite(value) ? '—' : native(value, valueCcy, 2)}
      </Td>
      <Td right dim>
        <span className="fb-num">{position.snapshot_date}</span>
      </Td>
      <Td w={88} right>
        <div
          style={{ display: 'inline-flex', justifyContent: 'flex-end', gap: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            size="sm"
            aria-label="更新持仓"
            onClick={() =>
              openQuickEntry({
                accountId,
                type: 'position',
                lockType: true,
                lockAccount: true,
                lockSymbol: true,
                symbol: position.symbol,
                quantity: position.quantity,
                avgCost: position.avg_cost ?? '',
                costCurrency: position.cost_currency ?? accountCurrency,
              })
            }
          >
            <Icon name="pencil" size={13} />
          </IconButton>
          <IconButton size="sm" aria-label="查看历史" onClick={onHistory}>
            <Icon name="history" size={13} />
          </IconButton>
        </div>
      </Td>
    </Row>
  )
}

export function PositionHistory() {
  const params = useParams<{ id: string; symbol: string }>()
  const accountId = Number(params.id)
  const symbol = decodeURIComponent(params.symbol ?? '')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const openQuickEntry = useUiStore((s) => s.openQuickEntry)
  const [deleting, setDeleting] = useState<{ id: number; symbol: string; date: string } | null>(null)

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId),
    enabled: Number.isFinite(accountId),
  })
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['position-snapshots', accountId],
    queryFn: () => listPositionSnapshots(accountId),
    enabled: Number.isFinite(accountId),
  })

  const rows = useMemo(
    () => history.filter((p) => p.symbol === symbol),
    [history, symbol],
  )
  const latest = rows[0]
  const accountCurrency = account?.currency ?? latest?.cost_currency ?? 'CNY'

  const del = useMutation({
    mutationFn: (sid: number) => deletePositionSnapshot(sid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['positions', accountId] })
      void qc.invalidateQueries({ queryKey: ['position-snapshots', accountId] })
      void qc.invalidateQueries({ queryKey: ['account', accountId] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      void qc.invalidateQueries({ queryKey: ['valuation'] })
      toast.success('持仓记录已删除')
      setDeleting(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  function openCurrentUpdate() {
    openQuickEntry({
      accountId,
      type: 'position',
      lockType: true,
      lockAccount: true,
      lockSymbol: true,
      symbol,
      quantity: latest?.quantity ?? '',
      avgCost: latest?.avg_cost ?? '',
      costCurrency: latest?.cost_currency ?? accountCurrency,
    })
  }

  return (
    <Shell onBack={() => navigate(`/accounts/${accountId}`)} backLabel="返回账户详情">
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: 'var(--surface-inset)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="history" size={21} color="var(--text-secondary)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-strong)', margin: 0 }}>
              {symbol} 持仓历史
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 5 }}>
              {account ? `${account.institution} · ${account.name}` : `account #${accountId}`}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Icon name="pencil" size={13} />}
            onClick={openCurrentUpdate}
            disabled={accountLoading}
          >
            更新当前持仓
          </Button>
        </div>
      </Card>

      <Card eyebrow="历史记录 · 时间倒序" padded={false}>
        {accountLoading || historyLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>加载中…</div>
        ) : !rows.length ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 16 }}>
            暂无历史记录。
          </div>
        ) : (
          <DetailTable>
            <thead>
              <tr>
                <Th>日期</Th>
                <Th right>数量</Th>
                <Th right>平均成本</Th>
                <Th right>持仓成本</Th>
                <Th>备注</Th>
                <Th right w={88} />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const cleared = Number(h.quantity) === 0
                const costCcy = h.cost_currency || accountCurrency
                const value =
                  h.avg_cost != null ? Number(h.quantity) * Number(h.avg_cost) : null
                return (
                  <Row key={h.id}>
                    <Td mono>{h.snapshot_date}</Td>
                    <Td right mono color={cleared ? 'var(--text-tertiary)' : undefined}>
                      {cleared ? '清仓' : quantity(h.quantity)}
                    </Td>
                    <Td right mono dim>
                      {h.avg_cost != null ? native(h.avg_cost, costCcy) : '—'}
                    </Td>
                    <Td right mono color="var(--text-strong)">
                      {value == null || !Number.isFinite(value) ? '—' : native(value, costCcy, 2)}
                    </Td>
                    <Td dim>{h.note || '—'}</Td>
                    <Td right>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <IconButton
                          aria-label="编辑持仓记录"
                          size="sm"
                          onClick={() =>
                            openQuickEntry({
                              accountId,
                              type: 'position',
                              isEdit: true,
                              snapshotId: h.id,
                              date: h.snapshot_date,
                              symbol: h.symbol,
                              quantity: h.quantity,
                              avgCost: h.avg_cost ?? '',
                              costCurrency: h.cost_currency ?? '',
                              note: h.note ?? '',
                            })
                          }
                        >
                          <Icon name="pencil" size={13} />
                        </IconButton>
                        <IconButton
                          aria-label="删除"
                          size="sm"
                          onClick={() =>
                            setDeleting({ id: h.id, symbol: h.symbol, date: h.snapshot_date })
                          }
                        >
                          <Icon name="trash-2" size={13} />
                        </IconButton>
                      </div>
                    </Td>
                  </Row>
                )
              })}
            </tbody>
          </DetailTable>
        )}
      </Card>
      {deleting ? (
        <ConfirmDialog
          title="删除持仓记录"
          message={`删除 ${deleting.symbol} 在 ${deleting.date} 的持仓记录？此操作不可撤销。`}
          confirmLabel="删除"
          pending={del.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => del.mutate(deleting.id)}
        />
      ) : null}
    </Shell>
  )
}

function UnsupportedAccountKind({ account }: { account: Account }) {
  return (
    <Card eyebrow="记录入口">
      <SectionHint>
        {account.kind === 'credit_card'
          ? '信用卡账户不录入余额或持仓；账单记录用于计算总负债。'
          : '当前账户类型暂未配置录入入口。'}
      </SectionHint>
    </Card>
  )
}

// ---------- placeholder sub-sections ----------

function PlaceholderSections() {
  const sections: Array<[string, string]> = [
    ['交易', 'P3 起'],
    ['收益事件', 'P4 起'],
    ['转账', 'P4 起'],
    ['信用卡账单', 'P3 已开放'],
  ]
  return (
    <Card eyebrow="更多记录">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {sections.map(([label, when]) => (
          <div
            key={label}
            style={{
              background: 'var(--surface-inset)',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {label}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{when}开放</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
