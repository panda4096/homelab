import { FormEvent, useState } from 'react'
import { ApiError, changePassword, login, register, type AuthUser } from '../api'
import { Button, Icon, Input } from '../ds'
import wordmark from '../assets/logo/finbrain-wordmark.svg'

export function Login({
  user,
  onAuthenticated,
}: {
  user?: AuthUser | null
  onAuthenticated: (user: AuthUser) => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        await register(username, password)
        setMode('login')
        setPassword('')
        setError('注册成功，请登录。')
        return
      }
      const res = await login(username, password)
      onAuthenticated(res.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '请求失败')
    } finally {
      setBusy(false)
    }
  }

  async function submitPasswordChange(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      if (user) onAuthenticated({ ...user, must_change_password: false })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '请求失败')
    } finally {
      setBusy(false)
    }
  }

  const mustChange = Boolean(user?.must_change_password)

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <img src={wordmark} height={34} alt="finbrain" />
        <div>
          <h1>{mustChange ? '修改临时密码' : mode === 'login' ? '登录' : '注册账号'}</h1>
          <p>{mustChange ? '首次登录后需要先设置新密码。' : '使用你的 finbrain 账号继续。'}</p>
        </div>

        {mustChange ? (
          <form onSubmit={submitPasswordChange} className="auth-form">
            <label>
              当前密码
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
            </label>
            <label>
              新密码
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
            <Button type="submit" variant="primary" disabled={busy || !currentPassword || newPassword.length < 8}>
              <Icon name="check" size={16} />
              保存新密码
            </Button>
          </form>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label>
              用户名
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </label>
            <label>
              密码
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error ? <div className={error.includes('成功') ? 'auth-note' : 'auth-error'}>{error}</div> : null}
            <Button type="submit" variant="primary" disabled={busy || username.trim().length < 3 || password.length < 8}>
              <Icon name={mode === 'login' ? 'log-in' : 'user-plus'} size={16} />
              {mode === 'login' ? '登录' : '注册'}
            </Button>
            <button type="button" className="auth-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '没有账号，去注册' : '已有账号，去登录'}
            </button>
            {mode === 'login' ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', margin: '2px 0 0' }}>
                忘记密码？请联系管理员重置；登录后可在「设置 · 账号与安全」自助修改。
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  )
}
