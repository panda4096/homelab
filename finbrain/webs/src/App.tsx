import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './shell/Sidebar'
import { Topbar } from './shell/Topbar'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { Placeholder } from './screens/Placeholder'
import { Settings } from './screens/Settings'
import { Dashboard } from './screens/Dashboard'
import { Accounts } from './screens/Accounts'
import { AccountDetail, PositionHistory } from './screens/AccountDetail'
import { Holdings } from './screens/Holdings'
import { MarketData } from './screens/MarketData'
import { ReviewWizard } from './screens/ReviewWizard'
import { QuickEntry } from './screens/QuickEntry'
import { BuildAccount } from './screens/BuildAccount'
import { Transactions } from './screens/Transactions'
import { IncomeEvents } from './screens/IncomeEvents'
import { Transfers } from './screens/Transfers'
import { CorporateActions } from './screens/CorporateActions'
import { Reconciliation } from './screens/Reconciliation'
import { TrendAnalysis } from './screens/TrendAnalysis'
import { Targets } from './screens/Targets'
import { Pivot } from './screens/Pivot'
import { Compare } from './screens/Compare'
import { Summaries } from './screens/Summaries'
import { Skills } from './screens/Skills'
import { AuditLog } from './screens/AuditLog'
import { Login } from './screens/Login'
import { TITLES } from './nav'
import { usePrefStore } from './store'
import { ApiError, getAccount, getMe, logout } from './api'
import { useAuthStore } from './authStore'

// Screens that are bespoke in P0/P1; everything else falls back to Placeholder.
const PLACEHOLDER_IDS: string[] = []

export function App() {
  const [copilot, setCopilot] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const hydrate = usePrefStore((s) => s.hydrate)
  const auth = useAuthStore()

  // Resolve application session once on mount.
  useEffect(() => {
    let cancelled = false
    getMe()
      .then((me) => {
        if (!cancelled) auth.setAuthenticated(me.user)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          auth.setAnonymous()
          return
        }
        auth.setAnonymous()
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const h = () => {
      auth.setAnonymous()
      navigate('/login', { replace: true })
    }
    window.addEventListener('finbrain:unauthorized', h)
    return () => window.removeEventListener('finbrain:unauthorized', h)
  }, [auth, navigate])

  // Hydrate preferences only after the user is known.
  useEffect(() => {
    if (auth.status === 'authenticated') void hydrate()
  }, [auth.status, hydrate])

  // ⌘K / Ctrl-K toggles the NL modal; Esc closes it. (Ported from the HTML.)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCopilot((c) => !c)
      }
      if (e.key === 'Escape') setCopilot(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const segments = location.pathname.replace(/^\//, '').split('/').filter(Boolean)
  const route = segments[0] || 'dashboard'
  const accountId =
    route === 'accounts' && segments[1] && Number.isFinite(Number(segments[1]))
      ? Number(segments[1])
      : null
  const accountTab = new URLSearchParams(location.search).get('tab')
  const { data: titleAccount } = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId ?? 0),
    enabled: accountId != null,
  })
  const symbol = segments[2] === 'positions' && segments[3] ? decodeURIComponent(segments[3]) : ''

  async function handleLogout() {
    try {
      await logout()
    } finally {
      auth.setAnonymous()
      navigate('/login', { replace: true })
    }
  }

  if (auth.status === 'loading') {
    return <div className="auth-page"><div className="auth-panel">正在载入...</div></div>
  }
  if (auth.status === 'anonymous') {
    if (location.pathname !== '/login') return <Navigate to="/login" replace />
    return <Login onAuthenticated={auth.setAuthenticated} />
  }
  if (auth.user?.must_change_password) {
    return <Login user={auth.user} onAuthenticated={auth.setAuthenticated} />
  }

  let title = TITLES[route] ?? TITLES.dashboard
  if (route === 'accounts' && accountTab === 'institutions' && accountId == null) {
    title = '机构'
  } else if (route === 'accounts' && accountId != null && symbol) {
    title = `${symbol} 持仓历史`
  } else if (route === 'accounts' && accountId != null) {
    title = titleAccount ? `${titleAccount.institution} · ${titleAccount.name}` : '账户详情'
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar copilotOpen={copilot} onCopilotChange={setCopilot} user={auth.user} onLogout={handleLogout} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar title={title} onNL={() => setCopilot(true)} />
        <div className="fb-scroll" style={{ flex: 1 }}>
          <div key={route} className="fb-fade">
            <ErrorBoundary key={route}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/institutions" element={<Navigate to="/accounts?tab=institutions" replace />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id/positions/:symbol" element={<PositionHistory />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/holdings" element={<Holdings />} />
              <Route path="/trend" element={<TrendAnalysis />} />
              <Route path="/review" element={<ReviewWizard />} />
              <Route path="/market" element={<MarketData />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/income" element={<IncomeEvents />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/corporate-actions" element={<CorporateActions />} />
              <Route path="/recon" element={<Reconciliation />} />
              <Route path="/targets" element={<Targets />} />
              <Route path="/pivot" element={<Pivot />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/summaries" element={<Summaries />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/settings" element={<Settings />} />
              {PLACEHOLDER_IDS.map((id) => (
                <Route key={id} path={`/${id}`} element={<Placeholder id={id} />} />
              ))}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <QuickEntry />
      <BuildAccount />
    </div>
  )
}
