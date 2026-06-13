import { create } from 'zustand'

// Global UI state for the P1 overlays (quick-entry + build-account flow). Kept
// separate from the prefs store so the Topbar, Dashboard and Accounts screens can
// all open the same modals without prop-drilling.

export type QuickEntryType = 'balance' | 'position'

export interface QuickEntryState {
  accountId?: number
  type?: QuickEntryType
  // editing an existing snapshot: prefill + lock account/symbol; date can be changed.
  isEdit?: boolean
  lockType?: boolean
  lockAccount?: boolean
  lockSymbol?: boolean
  snapshotId?: number
  date?: string
  balance?: string
  symbol?: string
  quantity?: string
  avgCost?: string
  costCurrency?: string
  note?: string
}

interface UiState {
  quickEntry: QuickEntryState | null
  buildOpen: boolean

  openQuickEntry: (state?: QuickEntryState) => void
  closeQuickEntry: () => void
  openBuild: () => void
  closeBuild: () => void
}

export const useUiStore = create<UiState>((set) => ({
  quickEntry: null,
  buildOpen: false,

  openQuickEntry: (state) => set({ quickEntry: state ?? {} }),
  closeQuickEntry: () => set({ quickEntry: null }),
  openBuild: () => set({ buildOpen: true }),
  closeBuild: () => set({ buildOpen: false }),
}))
