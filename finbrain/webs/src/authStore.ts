import { create } from 'zustand'
import type { AuthUser } from './api'

// 'unavailable' = the session check failed with a server/network error (5xx, offline), NOT a
// 401 — so we keep the (still-valid) session cookie and show a retry screen instead of treating
// a backend outage as a logout.
type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  setAuthenticated: (user: AuthUser) => void
  patchUser: (patch: Partial<AuthUser>) => void
  setAnonymous: () => void
  setLoading: () => void
  setUnavailable: () => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  setAuthenticated: (user) => set({ status: 'authenticated', user }),
  patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
  setAnonymous: () => set({ status: 'anonymous', user: null }),
  setLoading: () => set({ status: 'loading' }),
  setUnavailable: () => set({ status: 'unavailable' }),
  reset: () => set({ status: 'anonymous', user: null }),
}))
