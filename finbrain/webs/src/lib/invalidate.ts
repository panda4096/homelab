import type { QueryClient } from '@tanstack/react-query'

// Query keys for views derived from the whole portfolio. A write that changes valuation also
// changes all of these, but they are cached under their own keys — so invalidating only
// ['valuation'] leaves the net-worth trend / attribution / target-drift / reconciliation screens
// showing data that predates the write (made worse by the global staleTime of 60s +
// refetchOnWindowFocus:false). Always invalidate them together.
const PORTFOLIO_KEYS = ['valuation', 'trend', 'attribution', 'target-drift', 'reconciliation'] as const

// invalidatePortfolio invalidates valuation and every portfolio-derived view. The queryKey is a
// prefix match, so parameterized keys like ['trend', from, to, ...] are covered.
export function invalidatePortfolio(qc: QueryClient) {
  for (const key of PORTFOLIO_KEYS) void qc.invalidateQueries({ queryKey: [key] })
}
