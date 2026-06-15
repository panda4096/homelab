import { create } from 'zustand'
import type { AuthUser } from './api'

type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  setAuthenticated: (user: AuthUser) => void
  patchUser: (patch: Partial<AuthUser>) => void
  setAnonymous: () => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  setAuthenticated: (user) => set({ status: 'authenticated', user }),
  patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
  setAnonymous: () => set({ status: 'anonymous', user: null }),
  reset: () => set({ status: 'anonymous', user: null }),
}))
