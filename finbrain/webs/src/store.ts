import { create } from 'zustand'
import {
  getPreferences,
  putPreferences,
  type DisplayCurrency,
  type FxMode,
  type MarketConvention,
  type Preferences,
  type TimeAggregation,
} from './api'

interface PrefState {
  displayCurrency: DisplayCurrency
  fxMode: FxMode
  marketConvention: MarketConvention
  timeAggregationDefault: TimeAggregation
  hydrated: boolean

  hydrate: () => Promise<void>
  setDisplayCurrency: (v: DisplayCurrency) => Promise<void>
  setFxMode: (v: FxMode) => Promise<void>
  setMarketConvention: (v: MarketConvention) => Promise<void>
  setTimeAggregationDefault: (v: TimeAggregation) => Promise<void>
}

// Keep the <html data-market-convention> attribute in sync so the design system's
// gain/loss color tokens flip (see tokens/colors.css).
function applyConvention(conv: MarketConvention) {
  document.documentElement.setAttribute('data-market-convention', conv)
}

function fromPrefs(p: Preferences) {
  return {
    displayCurrency: p.display_currency,
    fxMode: p.fx_mode,
    marketConvention: p.market_convention,
    timeAggregationDefault: p.time_aggregation_default,
  }
}

export const usePrefStore = create<PrefState>((set, get) => ({
  displayCurrency: 'CNY',
  fxMode: 'current',
  marketConvention: 'western',
  timeAggregationDefault: 'month',
  hydrated: false,

  hydrate: async () => {
    // apply the default convention immediately so colors are right pre-fetch
    applyConvention(get().marketConvention)
    try {
      const p = await getPreferences()
      set({ ...fromPrefs(p), hydrated: true })
      applyConvention(p.market_convention)
    } catch {
      // backend unavailable (e.g. no dev server) — fall back to defaults
      set({ hydrated: true })
    }
  },

  setDisplayCurrency: async (v) => {
    set({ displayCurrency: v })
    const p = await putPreferences({ display_currency: v })
    set(fromPrefs(p))
    applyConvention(p.market_convention)
  },

  setFxMode: async (v) => {
    set({ fxMode: v })
    const p = await putPreferences({ fx_mode: v })
    set(fromPrefs(p))
    applyConvention(p.market_convention)
  },

  setMarketConvention: async (v) => {
    set({ marketConvention: v })
    applyConvention(v)
    const p = await putPreferences({ market_convention: v })
    set(fromPrefs(p))
    applyConvention(p.market_convention)
  },

  setTimeAggregationDefault: async (v) => {
    set({ timeAggregationDefault: v })
    const p = await putPreferences({ time_aggregation_default: v })
    set(fromPrefs(p))
    applyConvention(p.market_convention)
  },
}))
