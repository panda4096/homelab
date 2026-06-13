import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar } from './shell/Sidebar'
import { Topbar } from './shell/Topbar'
import { NLModal } from './shell/NLModal'
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
import { TITLES } from './nav'
import { usePrefStore } from './store'
import { getAccount } from './api'

// Screens that are bespoke in P0/P1; everything else falls back to Placeholder.
const PLACEHOLDER_IDS = [
  'trend',
  'compare',
  'pivot',
  'transactions',
  'income',
  'transfers',
  'targets',
  'recon',
]

export function App() {
  const [copilot, setCopilot] = useState(false)
  const location = useLocation()
  const hydrate = usePrefStore((s) => s.hydrate)

  // Hydrate preferences from the backend once on mount.
  useEffect(() => {
    void hydrate()
  }, [hydrate])

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
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar title={title} onNL={() => setCopilot(true)} />
        <div className="fb-scroll" style={{ flex: 1 }}>
          <div key={route} className="fb-fade">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/institutions" element={<Navigate to="/accounts?tab=institutions" replace />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id/positions/:symbol" element={<PositionHistory />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/holdings" element={<Holdings />} />
              <Route path="/review" element={<ReviewWizard />} />
              <Route path="/market" element={<MarketData />} />
              <Route path="/settings" element={<Settings />} />
              {PLACEHOLDER_IDS.map((id) => (
                <Route key={id} path={`/${id}`} element={<Placeholder id={id} />} />
              ))}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </div>
      {copilot ? <NLModal onClose={() => setCopilot(false)} /> : null}
      <QuickEntry />
      <BuildAccount />
    </div>
  )
}
