import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Select } from '../ds'
import { getAccountReconciliation, listAccounts } from '../api'
import { native, quantity } from '../lib/format'
import { Row, SectionHint, Td, Th } from '../lib/ui'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1100, margin: '0 auto' }}>{children}</div>
}

const KIND_LABEL: Record<string, string> = {
  snapshot: '快照基准', buy: '买入', sell: '卖出', transfer_in: '转入', transfer_out: '转出',
  income: '收益', bill_payment: '信用卡还款',
}

export function Reconciliation() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const reconcilable = (accounts.data ?? []).filter((a) => a.kind !== 'credit_card' && !a.is_archived)
  const [acctId, setAcctId] = useState('')
  const [settledOnly, setSettledOnly] = useState(false)

  const id = acctId ? Number(acctId) : reconcilable[0]?.id
  const recon = useQuery({
    queryKey: ['reconciliation', id, settledOnly],
    queryFn: () => getAccountReconciliation(id as number, { settled_only: settledOnly }),
    enabled: !!id,
  })

  const r = recon.data
  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Select size="sm" value={acctId || (id ? String(id) : '')} onChange={(e) => setAcctId(e.target.value)} style={{ maxWidth: 260 }}
          options={reconcilable.map((a) => ({ value: String(a.id), label: a.institution + '·' + a.name }))} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={settledOnly} onChange={(e) => setSettledOnly(e.target.checked)} /> 仅含已结算
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-tertiary)' }}>余额随记账实时联动</span>
      </div>

      {!id ? (
        <div className="fb-card" style={{ padding: 24, color: 'var(--text-tertiary)' }}>没有可对账的现金 / 持仓账户。</div>
      ) : r ? (
        <>
          <div className="fb-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <Metric label="当前余额（实时）" value={native(r.expected_balance, r.currency)} />
              <Metric label={r.snapshot_date ? `上次盘点 · ${r.snapshot_date}` : '上次盘点'} value={native(r.snapshot_balance, r.currency)} />
            </div>
          </div>

          <div className="fb-card" style={{ overflowX: 'auto' }}>
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--divider)' }}>现金事件流 · 自上次盘点起（§6.19）</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr><Th>日期</Th><Th>事件</Th><Th right>金额</Th><Th right>累计</Th></tr></thead>
              <tbody>
                {r.events.map((e, i) => (
                  <Row key={i}>
                    <Td mono dim>{e.date}</Td>
                    <Td>{KIND_LABEL[e.kind] ?? e.kind}{e.label && e.kind !== 'snapshot' ? ` · ${e.label}` : ''}</Td>
                    <Td right mono color={e.amount.startsWith('-') ? 'var(--loss)' : e.amount.startsWith('+') ? 'var(--gain)' : 'var(--text-tertiary)'}>{e.amount || '—'}</Td>
                    <Td right mono dim>{e.running}</Td>
                  </Row>
                ))}
                {!r.events.length ? <tr><Td dim>区间内无现金事件</Td></tr> : null}
              </tbody>
            </table>
          </div>

          {r.position_deltas.length ? (
            <div className="fb-card" style={{ overflowX: 'auto' }}>
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--divider)' }}>持仓对账 · 交易回放 vs 快照（§6.20）</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr><Th>标的</Th><Th right>回放数量</Th><Th right>快照数量</Th><Th right>差额</Th></tr></thead>
                <tbody>
                  {r.position_deltas.map((d) => {
                    const off = Number(d.delta) !== 0
                    return (
                      <Row key={d.symbol}>
                        <Td mono color="var(--text-strong)">{d.symbol}</Td>
                        <Td right mono>{quantity(d.replay_quantity)}</Td>
                        <Td right mono>{quantity(d.snapshot_quantity)}</Td>
                        <Td right mono color={off ? 'var(--warning)' : 'var(--text-tertiary)'}>{off ? quantity(d.delta) : '0'}</Td>
                      </Row>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : recon.isError ? (
        <div className="fb-card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)' }}>
          <span>对账数据加载失败：{recon.error instanceof Error ? recon.error.message : '后端未连接'}</span>
          <Button size="sm" variant="ghost" onClick={() => void recon.refetch()}>重试</Button>
        </div>
      ) : (
        <div className="fb-card" style={{ padding: 24, color: 'var(--text-tertiary)' }}>加载中…</div>
      )}
      <SectionHint>当前余额 = 上次盘点 + 期间交易 / 转账 / 收益 / 信用卡还款（§6.19），随记账实时联动；漏记了直接录一条新的余额快照即可重置基准。</SectionHint>
    </Page>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
      <span className="fb-num" style={{ fontSize: 22, fontWeight: 600, color: tone ?? 'var(--text-strong)' }}>{value}</span>
    </div>
  )
}
