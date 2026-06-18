// Shared formatting + label helpers, ported from design/project/app/ui.jsx and
// data.js. Money/quantity are DECIMAL STRINGS over the wire — keep them as strings
// and only parse for display formatting here.

import type { AccountKind } from '../api'

// currency symbol map (data.js SYM)
export const SYM: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
  JPY: '¥',
  EUR: '€',
}

export const ACCOUNT_CURRENCIES = ['CNY', 'HKD', 'USD'] as const

export const CURRENCY_LABEL: Record<string, string> = {
  CNY: '人民币',
  HKD: '港币',
  USD: '美元',
  JPY: '日元',
  EUR: '欧元',
}

export function currencyLabel(ccy: string): string {
  return CURRENCY_LABEL[ccy] ? `${ccy} · ${CURRENCY_LABEL[ccy]}` : ccy
}

export const KIND_LABEL: Record<string, string> = {
  cash: '活期',
  time_deposit: '定期',
  wealth_product: '理财',
  fund: '基金',
  brokerage: '证券',
  credit_card: '信用卡',
  crypto_wallet: '加密钱包',
}

// Market (exchange) labels. Shared by Holdings/Pivot/MarketData/Compare so no screen ships its
// own copy. Unknown keys fall back to the raw code; empty/null renders as "—".
export const MARKET_LABEL: Record<string, string> = {
  CASH: '现金',
  US: '美股',
  HK: '港股',
  CN: 'A股',
  CRYPTO: '加密',
  INDEX: '指数',
  UNKNOWN: '—',
}

export function marketLabel(market: string | null | undefined): string {
  if (!market) return '—'
  return MARKET_LABEL[market] ?? market
}

// Tradable markets offered in the transaction form (drives the 市场 selector +
// instrument filtering + default trade currency). INDEX/CASH aren't tradable here.
export const TRADE_MARKETS = ['US', 'HK', 'CN', 'CRYPTO'] as const

// Default trade currency per market. Selecting a market auto-switches 币种 to this
// (the user can still override). Unknown markets leave the currency untouched.
export const MARKET_DEFAULT_CURRENCY: Record<string, string> = {
  US: 'USD',
  HK: 'HKD',
  CN: 'CNY',
  CRYPTO: 'USD',
}

// Localized label for an allocation bucket across the standard valuation dimensions
// (kind/currency/quote_currency/market/...). Falls back to the bucket's own name. Shared by
// the dashboard donut and the compare table so raw codes (brokerage, cash, …) never leak.
export function bucketName(dim: string, key: string, name: string): string {
  if (dim === 'kind') return KIND_LABEL[key] ?? name
  if (dim === 'currency' || dim === 'quote_currency') return currencyLabel(key).replace(`${key} · `, '')
  if (dim === 'market') return marketLabel(key)
  return name
}

// Institution kind labels (open enum). Unknown/empty renders as "—".
export const INSTITUTION_KIND_LABEL: Record<string, string> = {
  bank: '银行',
  broker: '券商',
  exchange: '交易所',
  wallet: '钱包',
  other: '其他',
}

// The 5 known institution kinds, in display order (drives the kind <select>).
export const INSTITUTION_KINDS = ['bank', 'broker', 'exchange', 'wallet', 'other'] as const

/** zh label for an institution kind; null/empty/unknown → "—". */
export function institutionKindLabel(kind: string | null | undefined): string {
  if (!kind) return '—'
  return INSTITUTION_KIND_LABEL[kind] ?? '—'
}

export const KIND_TONE: Record<string, string> = {
  cash: 'var(--viz-2)',
  time_deposit: 'var(--viz-6)',
  wealth_product: 'var(--viz-3)',
  fund: 'var(--viz-4)',
  brokerage: 'var(--viz-1)',
  credit_card: 'var(--loss)',
  crypto_wallet: 'var(--viz-5)',
}

export const MARKET_TONE: Record<string, string> = {
  US: 'var(--viz-1)',
  HK: 'var(--viz-3)',
  CN: 'var(--viz-2)',
  CRYPTO: 'var(--viz-5)',
  INDEX: 'var(--viz-8)',
}

// All account kinds, in the order used for grouping/sorting + the kind <select>.
export const ACCOUNT_KINDS: AccountKind[] = [
  'cash',
  'time_deposit',
  'wealth_product',
  'fund',
  'brokerage',
  'credit_card',
  'crypto_wallet',
]

export const BALANCE_ACCOUNT_KINDS = ['cash', 'time_deposit', 'wealth_product'] as const
export const POSITION_ACCOUNT_KINDS = ['brokerage', 'fund', 'crypto_wallet'] as const

export function supportsBalanceSnapshots(kind: string): boolean {
  return (BALANCE_ACCOUNT_KINDS as readonly string[]).includes(kind)
}

export function supportsPositionSnapshots(kind: string): boolean {
  return (POSITION_ACCOUNT_KINDS as readonly string[]).includes(kind)
}

const KIND_ORDER: Record<string, number> = Object.fromEntries(
  ACCOUNT_KINDS.map((k, i) => [k, i]),
)

export function kindSortIndex(kind: string): number {
  return KIND_ORDER[kind] ?? ACCOUNT_KINDS.length
}

/**
 * Native amount with its own currency symbol — port of ui.jsx `native(v, ccy, decimals)`.
 * Accepts the wire decimal string (or number/null). Returns "—" for null/blank/NaN.
 */
export function native(
  v: string | number | null | undefined,
  ccy: string,
  decimals?: number,
): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '—'
  const s = SYM[ccy] || ccy + ' '
  const neg = n < 0
  return (
    (neg ? '−' : '') +
    s +
    Math.abs(n).toLocaleString(undefined, {
      maximumFractionDigits: decimals == null ? 2 : decimals,
      minimumFractionDigits: decimals == null ? 0 : decimals,
    })
  )
}

/** Format a bare quantity decimal string for display, trimming trailing zeros. */
export function quantity(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString(undefined, { maximumFractionDigits: 8, minimumFractionDigits: 0 })
}

// ---- dates ----

export function todayISO(timeZone?: string): string {
  const d = new Date()
  return timeZone ? toISODateInTimeZone(d, timeZone) : toISODate(d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toISODateInTimeZone(d: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const y = get('year')
    const m = get('month')
    const day = get('day')
    if (y && m && day) return `${y}-${m}-${day}`
  } catch {
    // Invalid or unsupported timezone should not break the UI; backend remains authoritative.
  }
  return toISODate(d)
}

function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map((v) => Number(v))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dateISO
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function daysSince(dateISO: string | null | undefined, timeZone?: string): number | null {
  if (!dateISO) return null
  const then = new Date(dateISO + 'T00:00:00')
  if (Number.isNaN(then.getTime())) return null
  const now = new Date(todayISO(timeZone) + 'T00:00:00')
  return Math.round((now.getTime() - then.getTime()) / 86_400_000)
}

/** A snapshot date is stale if it's null or more than 35 days before today (PRD §7.2). */
export function isStale(lastSnapshotDate: string | null | undefined, timeZone?: string): boolean {
  if (!lastSnapshotDate) return true
  const d = daysSince(lastSnapshotDate, timeZone)
  return d == null || d > 35
}

/** Max accepted snapshot date = today + 7 days (client mirror of backend rule). */
export function maxSnapshotDateISO(timeZone?: string): string {
  return addDaysISO(todayISO(timeZone), 7)
}

// ---- validation (client-side mirror of backend) ----

const CCY_RE = /^[A-Z]{3}$/

export function isValidCurrency(v: string): boolean {
  return CCY_RE.test(v.trim())
}

export function isNumericString(v: string): boolean {
  if (v.trim() === '') return false
  return Number.isFinite(Number(v))
}
