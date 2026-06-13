import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar } from './shell/Sidebar'
import { Topbar } from './shell/Topbar'
import { NLModal } from './shell/NLModal'
import { Placeholder } from './screens/Placeholder'
import { Settings } from './screens/Settings'
import { Dashboard } from './screens/Dashboard'
import { Accounts } from './screens/Accounts'
import { AccountDetail, PositionHistory } from './screens/AccountDetail'
import { QuickEntry } from './screens/QuickEntry'
import { BuildAccount } from './screens/BuildAccount'
import { TITLES } from './nav'
import { usePrefStore } from './store'

// Screens that are bespoke in P0/P1; everything else falls back to Placeholder.
const PLACEHOLDER_IDS = [
  'holdings',
  'trend',
  'review',
  'compare',
  'pivot',
  'transactions',
  'income',
  'transfers',
  'targets',
  'recon',
  'market',
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

  // top-level segment drives both the placeholder fallback and the topbar title,
  // so /accounts/5 still resolves to the 「账户列表」 title.
  const route = location.pathname.replace(/^\//, '').split('/')[0] || 'dashboard'
  const title = TITLES[route] ?? TITLES.dashboard

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
