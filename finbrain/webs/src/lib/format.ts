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

export function todayISO(): string {
  const d = new Date()
  return toISODate(d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysSince(dateISO: string | null | undefined): number | null {
  if (!dateISO) return null
  const then = new Date(dateISO + 'T00:00:00')
  if (Number.isNaN(then.getTime())) return null
  const now = new Date(todayISO() + 'T00:00:00')
  return Math.round((now.getTime() - then.getTime()) / 86_400_000)
}

/** A snapshot date is stale if it's null or more than 35 days before today (PRD §7.2). */
export function isStale(lastSnapshotDate: string | null | undefined): boolean {
  if (!lastSnapshotDate) return true
  const d = daysSince(lastSnapshotDate)
  return d == null || d > 35
}

/** Max accepted snapshot date = today + 7 days (client mirror of backend rule). */
export function maxSnapshotDateISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return toISODate(d)
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
