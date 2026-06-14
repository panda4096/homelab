import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Segmented } from '../ds'
import { listAudit, type AuditEvent } from '../api'
import { Row, SectionHint, Td, Th } from '../lib/ui'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1280, margin: '0 auto' }}>{children}</div>
}

const SOURCE_TONE: Record<string, 'neutral' | 'success' | 'gold'> = { ui: 'neutral', agent: 'success', apikey: 'gold' }
const SOURCE_LABEL: Record<string, string> = { ui: '人工', agent: 'Copilot', apikey: '外部 Agent' }

export function AuditLog() {
  const [source, setSource] = useState('')
  const audit = useQuery({ queryKey: ['audit', source], queryFn: () => listAudit(source || undefined, 200) })

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
                <Td mono color="var(--text-strong)">
                  {e.skill_name ? e.skill_name : `${e.http_method ?? ''} ${e.http_path ?? ''}`}
                </Td>
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
