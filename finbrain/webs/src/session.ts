import { useAuthStore } from './authStore'
import { queryClient } from './queryClient'
import { usePrefStore } from './store'
import { useUiStore } from './uiStore'

export function clearClientSession() {
  queryClient.clear()
  useUiStore.getState().reset()
  usePrefStore.getState().reset()
  useAuthStore.getState().reset()
}
