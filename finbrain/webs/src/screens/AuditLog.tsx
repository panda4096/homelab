import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Segmented } from '../ds'
import { listAudit, listSkills, type AuditEvent } from '../api'
import { Row, SectionHint, Td, Th } from '../lib/ui'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1280, margin: '0 auto' }}>{children}</div>
}

const SOURCE_TONE: Record<string, 'neutral' | 'success' | 'gold'> = { ui: 'neutral', agent: 'success', apikey: 'gold' }
const SOURCE_LABEL: Record<string, string> = { ui: '人工', agent: 'Copilot', apikey: '外部 Agent' }

// Human-readable Chinese for UI mutations — derived from the audited HTTP verb + the first path
// segment, so the audit log never shows raw route names like "POST /api/transactions".
const ENTITY_LABEL: Record<string, string> = {
  instruments: '标的',
  institutions: '机构',
  accounts: '账户',
  'balance-snapshots': '余额快照',
  'position-snapshots': '持仓快照',
  prices: '价格',
  'fx-rates': '汇率',
  'credit-card-bills': '信用卡账单',
  transactions: '持仓交易',
  transfers: '转账还款',
  'income-events': '收益事件',
  'corporate-actions': '公司动作',
  'allocation-targets': '仓位配置',
  annotations: '标注',
  'api-keys': 'API 密钥',
  reviews: '月度盘点',
  summaries: '阶段总结',
  llm: '大模型配置',
  preferences: '偏好设置',
}
const VERB_LABEL: Record<string, string> = { POST: '新增', PUT: '修改', PATCH: '修改', DELETE: '删除', GET: '查看' }
// full-path special cases where verb+entity wouldn't read naturally
const SPECIAL_ACTION: Record<string, string> = {
  'POST /api/auth/change-password': '修改登录密码',
  'PATCH /api/auth/profile': '修改个人资料',
  'POST /api/auth/avatar': '更换头像',
  'POST /api/reviews/batch': '提交月度盘点',
  'POST /api/prices/batch': '批量导入价格',
  'POST /api/fx-rates/batch': '批量导入汇率',
  'PUT /api/preferences': '修改偏好设置',
  'GET /api/export': '导出全量数据',
}

function describeAction(e: AuditEvent, skillLabels: Map<string, string>): string {
  if (e.skill_name) return skillLabels.get(e.skill_name) ?? e.skill_name
  const method = (e.http_method ?? '').toUpperCase()
  const path = e.http_path ?? ''
  const key = `${method} ${path.split('?')[0]}`
  if (SPECIAL_ACTION[key]) return SPECIAL_ACTION[key]
  const seg = path.replace(/^\/api\//, '').split(/[/?]/)[0]
  const entity = ENTITY_LABEL[seg]
  const verb = VERB_LABEL[method]
  if (entity && verb) return `${verb}${entity}`
  return key.trim() || '—'
}

export function AuditLog() {
  const [source, setSource] = useState('')
  const audit = useQuery({ queryKey: ['audit', source], queryFn: () => listAudit(source || undefined, 200) })
  // skill name → Chinese description, so Copilot / 外部 Agent rows read in Chinese too.
  const skills = useQuery({ queryKey: ['agent-skills'], queryFn: listSkills, staleTime: 5 * 60_000 })
  const skillLabels = new Map((skills.data ?? []).map((s) => [s.name, s.description]))

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Segmented size="sm" value={source} onChange={setSource}
          options={[{ value: '', label: '全部' }, { value: 'ui', label: '人工' }, { value: 'agent', label: 'Copilot' }, { value: 'apikey', label: '外部 Agent' }]} />
      </div>
      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead><tr><Th>时间</Th><Th>来源</Th><Th>操作者</Th><Th>动作</Th><Th right>行数</Th><Th>确认</Th><Th>状态</Th></tr></thead>
          <tbody>
            {(audit.data ?? []).map((e: AuditEvent) => (
              <Row key={e.id}>
                <Td mono dim>{e.created_at.replace('T', ' ').slice(0, 19)}</Td>
                <Td><Badge tone={SOURCE_TONE[e.source] ?? 'neutral'}>{SOURCE_LABEL[e.source] ?? e.source}</Badge></Td>
                <Td dim>{e.actor}</Td>
                <Td color="var(--text-strong)">{describeAction(e, skillLabels)}</Td>
                <Td right mono dim>{e.output_row_count ?? '—'}</Td>
                <Td>{e.confirmed_by_user ? <Badge tone="warning">已确认写入</Badge> : null}</Td>
                <Td>{e.status === 'error' ? <Badge tone="danger">{e.error_code ?? 'error'}</Badge> : <Badge tone="success">ok</Badge>}</Td>
              </Row>
            ))}
            {!audit.isLoading && !(audit.data ?? []).length ? <tr><Td dim>暂无审计记录</Td></tr> : null}
          </tbody>
        </table>
      </div>
      <SectionHint>统一审计:人工(UI)写操作与 Copilot / 外部 Agent 的 skill 调用都记录在此,含操作者、动作、行数、是否确认写入与状态;读操作也会记录(便于追溯谁取了什么)。</SectionHint>
    </Page>
  )
}
