import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Field, Icon, IconButton, Input, Segmented } from '../ds'
import { createApiKey, deleteApiKey, listApiKeys, listSkills, type AgentSkill, type APIKey } from '../api'
import { Row, SectionHint, Td, Th } from '../lib/ui'
import { Modal } from '../shell/Modal'
import { useToast } from '../shell/Toast'

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22, maxWidth: 1180, margin: '0 auto' }}>{children}</div>
}

const TYPE_TONE: Record<string, 'success' | 'gold' | 'warning'> = { read: 'success', draft: 'gold', write: 'warning' }
const TYPE_LABEL: Record<string, string> = { read: '读', draft: '草稿', write: '写' }

export function Skills() {
  const [tab, setTab] = useState<'catalog' | 'keys'>('catalog')
  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Segmented size="sm" value={tab} onChange={(v) => setTab(v as 'catalog' | 'keys')}
          options={[{ value: 'catalog', label: 'Skill 目录' }, { value: 'keys', label: 'API Keys' }]} />
      </div>
      {tab === 'catalog' ? <Catalog /> : <Keys />}
      <SectionHint>Agent / LLM 只能调用这些注册过的 skill(表达意图 + 参数),不能直接发 SQL、选表或访问基础表;读写均由后端统一鉴权、校验、限流并写入审计。外部 agent 用 API Key(Bearer)接入。</SectionHint>
    </Page>
  )
}

function Catalog() {
  const skills = useQuery({ queryKey: ['agent-skills'], queryFn: listSkills })
  const groups: Record<string, AgentSkill[]> = { read: [], draft: [], write: [] }
  for (const s of skills.data ?? []) (groups[s.type] ??= []).push(s)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {(['read', 'draft', 'write'] as const).map((t) => (
        <div key={t} className="fb-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge tone={TYPE_TONE[t]}>{TYPE_LABEL[t]}</Badge>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{t === 'read' ? '只读取数' : t === 'draft' ? '解析预览(不写库)' : '确认后写入'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>{(groups[t] ?? []).length}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {(groups[t] ?? []).map((s) => (
                <Row key={s.name}>
                  <Td mono color="var(--text-strong)">{s.name}</Td>
                  <Td dim>{s.description}</Td>
                  <Td>{s.requires_confirmation ? <Badge tone="warning">需确认</Badge> : null}</Td>
                  <Td right dim>{s.max_rows ? `≤${s.max_rows} 行` : ''}</Td>
                </Row>
              ))}
              {!(groups[t] ?? []).length ? <tr><Td dim>—</Td></tr> : null}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function Keys() {
  const qc = useQueryClient()
  const toast = useToast()
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: listApiKeys })
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null)

  const revoke = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('已吊销') },
    onError: (e) => toast.error(e instanceof Error ? e.message : '吊销失败'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex' }}>
        <Button variant="primary" size="sm" style={{ marginLeft: 'auto' }} iconLeft={<Icon name="plus" size={14} />} onClick={() => setCreating(true)}>新建 API Key</Button>
      </div>
      <div className="fb-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead><tr><Th>名称</Th><Th>前缀</Th><Th>权限</Th><Th>创建</Th><Th>最近使用</Th><Th>状态</Th><Th w={60}></Th></tr></thead>
          <tbody>
            {(keys.data ?? []).map((k: APIKey) => (
              <Row key={k.id}>
                <Td color="var(--text-strong)">{k.name}</Td>
                <Td mono dim>{k.prefix}…</Td>
                <Td><Badge tone={k.scopes === 'read_write' ? 'warning' : 'neutral'}>{k.scopes === 'read_write' ? '读写' : '只读'}</Badge></Td>
                <Td mono dim>{k.created_at.slice(0, 10)}</Td>
                <Td mono dim>{k.last_used_at ? k.last_used_at.slice(0, 10) : '—'}</Td>
                <Td>{k.revoked_at ? <Badge tone="neutral">已吊销</Badge> : <Badge tone="success">有效</Badge>}</Td>
                <Td right>{k.revoked_at ? null : <IconButton aria-label="吊销" size="sm" onClick={() => { if (confirm(`吊销 API Key「${k.name}」？`)) revoke.mutate(k.id) }}><Icon name="ban" size={13} /></IconButton>}</Td>
              </Row>
            ))}
            {!keys.isLoading && !(keys.data ?? []).length ? <tr><Td dim>暂无 API Key</Td></tr> : null}
          </tbody>
        </table>
      </div>
      {creating ? <CreateKeyModal onClose={() => setCreating(false)} onCreated={(name, sec) => { setCreating(false); setSecret({ name, secret: sec }) }} /> : null}
      {secret ? <SecretModal name={secret.name} secret={secret.secret} onClose={() => setSecret(null)} /> : null}
    </div>
  )
}

function CreateKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, secret: string) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<'read' | 'read_write'>('read')
  const [touched, setTouched] = useState(false)
  const save = useMutation({
    mutationFn: () => createApiKey(name.trim(), scopes),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['api-keys'] }); onCreated(r.key.name, r.secret) },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })
  return (
    <Modal title="新建 API Key" icon="key-round" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={save.isPending} onClick={() => { setTouched(true); if (name.trim()) save.mutate() }}>创建</Button></>}>
      <div className="fb-form form-2">
        <Field label="名称" error={touched && !name.trim() ? '必填' : undefined}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:数据分析 agent" /></Field>
        <Field label="权限"><Segmented size="sm" value={scopes} onChange={(v) => setScopes(v as 'read' | 'read_write')} options={[{ value: 'read', label: '只读' }, { value: 'read_write', label: '读写' }]} /></Field>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-tertiary)' }}>只读 key 只能调用 read/draft skill;读写 key 才能 /agent/apply 写入。密钥仅在创建后显示一次。</div>
    </Modal>
  )
}

function SecretModal({ name, secret, onClose }: { name: string; secret: string; onClose: () => void }) {
  const toast = useToast()
  return (
    <Modal title="API Key 已创建" icon="key-round" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>我已保存</Button>}>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>「{name}」的密钥如下,<strong style={{ color: 'var(--warning)' }}>只显示这一次</strong>,请立即复制保存:</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
        <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', color: 'var(--text-strong)' }}>{secret}</code>
        <IconButton aria-label="复制" size="sm" onClick={() => { void navigator.clipboard?.writeText(secret); toast.success('已复制') }}><Icon name="copy" size={14} /></IconButton>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-tertiary)' }}>调用:<code style={{ fontFamily: 'var(--font-mono)' }}>Authorization: Bearer {secret.slice(0, 12)}…</code> → POST /api/agent/run 等。</div>
    </Modal>
  )
}
