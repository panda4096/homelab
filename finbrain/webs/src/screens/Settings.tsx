import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Icon, Input, Segmented } from '../ds'
import { usePrefStore } from '../store'
import { useAuthStore } from '../authStore'
import { ApiError, avatarUrl, changePassword, getLLMStatus, updateProfile, uploadAvatar } from '../api'
import { useToast } from '../shell/Toast'
import type {
  DisplayCurrency,
  FxMode,
  MarketConvention,
  TimeAggregation,
} from '../api'

// Center-crop + downscale any picked image to a 256² JPEG before upload, so the stored
// avatar stays small (well under the server's 512KB cap) and square regardless of source.
async function fileToAvatarBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('读取图片失败'))
    fr.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('图片无法解析'))
    im.src = dataUrl
  })
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持图片处理')
  const scale = Math.max(size / img.width, size / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('生成头像失败'))), 'image/jpeg', 0.85)
  })
}

interface RowProps {
  label: string
  hint?: string
  children: React.ReactNode
}

function Row({ label, hint, children }: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid var(--divider)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{label}</div>
        {hint ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{hint}</div>
        ) : null}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  )
}

// Minimal real Settings screen. Every control persists the changed field via
// PUT /api/preferences (the store handles the request + merge).
export function Settings() {
  const {
    displayCurrency,
    fxMode,
    marketConvention,
    timeAggregationDefault,
    timezone,
    setDisplayCurrency,
    setFxMode,
    setMarketConvention,
    setTimeAggregationDefault,
    setTimezone,
  } = usePrefStore()
  const llm = useQuery({ queryKey: ['llm-status'], queryFn: () => getLLMStatus() })

  return (
    <div style={{ padding: 22, maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card eyebrow="PREFERENCES" title="显示偏好" subtitle="更改后立即写入后端 · 单用户全局生效">
        <Row label="显示货币" hint="所有金额折算到该货币展示">
          <Segmented
            size="sm"
            options={['CNY', 'HKD', 'USD']}
            value={displayCurrency}
            onChange={(v) => void setDisplayCurrency(v as DisplayCurrency)}
          />
        </Row>
        <Row label="汇率口径" hint="历史记录使用当时汇率，或统一用当前汇率重估">
          <Segmented
            size="sm"
            options={[
              { value: 'current', label: '当前汇率' },
              { value: 'historical', label: '历史汇率' },
            ]}
            value={fxMode}
            onChange={(v) => void setFxMode(v as FxMode)}
          />
        </Row>
        <Row label="涨跌约定" hint="绿涨红跌（西方）或红涨绿跌（A 股习惯）">
          <Segmented
            size="sm"
            options={[
              { value: 'western', label: '绿涨红跌' },
              { value: 'cn', label: '红涨绿跌' },
            ]}
            value={marketConvention}
            onChange={(v) => void setMarketConvention(v as MarketConvention)}
          />
        </Row>
        <Row label="默认时间聚合" hint="趋势 / 对比等视图的默认时间粒度">
          <Segmented
            size="sm"
            options={[
              { value: 'day', label: '日' },
              { value: 'month', label: '月' },
              { value: 'quarter', label: '季' },
              { value: 'year', label: '年' },
            ]}
            value={timeAggregationDefault}
            onChange={(v) => void setTimeAggregationDefault(v as TimeAggregation)}
          />
        </Row>
        <Row label="时区" hint="影响默认今天、盘点日期和未来日期校验">
          <Segmented
            size="sm"
            options={[
              { value: 'Asia/Shanghai', label: '上海' },
              { value: 'Asia/Hong_Kong', label: '香港' },
              { value: 'Pacific/Honolulu', label: '檀香山' },
              { value: 'America/Los_Angeles', label: '洛杉矶' },
              { value: 'America/New_York', label: '纽约' },
            ]}
            value={timezone}
            onChange={(v) => void setTimezone(v)}
          />
        </Row>
      </Card>

      <Card eyebrow="DATA & AI" title="数据与智能">
        <Row label="自然语言能力" hint="⌘K 录入 / 查询 / 阶段总结，默认 DeepSeek（DEEPSEEK_API_KEY）">
          {llm.data?.configured
            ? <Badge tone="success" dot>{llm.data.provider} · {llm.data.model}</Badge>
            : <Badge tone="neutral">未配置</Badge>}
        </Row>
        <Row label="全量数据导出" hint="所有业务表打包为 CSV（zip）">
          <Button size="sm" variant="secondary" iconLeft={<Icon name="download" size={14} />} onClick={() => { window.location.href = '/api/export' }}>导出 CSV</Button>
        </Row>
        <Row label="关于 finbrain" hint="个人资产快照管理 · 自托管">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>P0–P7</span>
        </Row>
      </Card>

      <ProfileCard />

      <ChangePasswordCard />
    </div>
  )
}

// Edit the logged-in user's nickname + avatar. The login username is NOT editable here
// (it's the sign-in identifier); display name is the UI nickname.
function ProfileCard() {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const patchUser = useAuthStore((s) => s.patchUser)
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(user?.display_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [uploading, setUploading] = useState(false)
  const dirty = name.trim().length > 0 && name.trim() !== (user?.display_name ?? '')

  async function saveName() {
    if (!dirty || savingName) return
    setSavingName(true)
    try {
      const res = await updateProfile(name.trim())
      patchUser({ display_name: res.user.display_name })
      toast.success('名称已更新')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '更新失败')
    } finally {
      setSavingName(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error('请选择 PNG 或 JPEG 图片')
      return
    }
    setUploading(true)
    try {
      const blob = await fileToAvatarBlob(file)
      const res = await uploadAvatar(blob)
      patchUser({ avatar_updated_at: res.avatar_updated_at })
      toast.success('头像已更新')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const initial = (user?.display_name ?? '用').trim().charAt(0).toUpperCase()
  return (
    <Card eyebrow="PROFILE" title="个人资料" subtitle="昵称与头像 · 登录用户名不在此修改">
      <Row label="头像" hint="上传 PNG / JPEG，自动裁剪为方形（≤512KB）">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              overflow: 'hidden',
              background: 'var(--gradient-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
              fontWeight: 700,
              fontSize: 16,
              flex: 'none',
            }}
          >
            {user?.avatar_updated_at ? (
              <img src={avatarUrl(user.avatar_updated_at)} alt="头像" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={(e) => void onPickFile(e)} />
          <Button size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? '上传中…' : '更换头像'}
          </Button>
        </div>
      </Row>
      <Row label="显示名称" hint="界面展示用的昵称">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 180 }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
          </div>
          <Button size="sm" variant="primary" disabled={!dirty || savingName} onClick={() => void saveName()}>
            {savingName ? '保存中…' : '保存'}
          </Button>
        </div>
      </Row>
      <Row label="登录用户名" hint="用于登录；如需修改请联系管理员">
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{user?.username || '—'}</span>
      </Row>
    </Card>
  )
}

// Self-service password change for the logged-in user. Verifies the current password,
// sets the new one, and (server-side) revokes all other sessions. Forgotten-password
// recovery is admin-side (finbrain-admin set-password), not self-service — see PRD §9.3.
function ChangePasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm
  const valid = current.length > 0 && next.length >= 8 && next === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('密码已更新，其他设备上的登录已退出')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '修改密码失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card eyebrow="ACCOUNT" title="账号与安全" subtitle="修改登录密码 · 保存后其他会话将自动退出">
      <form onSubmit={submit}>
        <Row label="当前密码">
          <div style={{ width: 220 }}>
            <Input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
          </div>
        </Row>
        <Row label="新密码" hint="至少 8 位">
          <div style={{ width: 220 }}>
            <Input type="password" value={next} invalid={mismatch} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
          </div>
        </Row>
        <Row label="确认新密码">
          <div style={{ width: 220 }}>
            <Input type="password" value={confirm} invalid={mismatch} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </Row>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 14 }}>
          {mismatch ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>两次输入的新密码不一致</span> : null}
          <Button type="submit" variant="primary" disabled={!valid || busy} iconLeft={<Icon name="check" size={14} />}>
            {busy ? '保存中…' : '保存新密码'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
