// Tiny fetch wrapper for the finbrain Go backend. All paths are relative
// (/api/...), so the Vite dev proxy (vite.config.ts) forwards them to :8000.

export type DisplayCurrency = 'CNY' | 'HKD' | 'USD'
export type FxMode = 'current' | 'historical'
export type MarketConvention = 'western' | 'cn'
export type TimeAggregation = 'day' | 'month' | 'quarter' | 'year'

export interface Preferences {
  display_currency: DisplayCurrency
  fx_mode: FxMode
  time_aggregation_default: TimeAggregation
  market_convention: MarketConvention
  updated_at: string
}

export type PreferencesPatch = Partial<
  Pick<
    Preferences,
    'display_currency' | 'fx_mode' | 'time_aggregation_default' | 'market_convention'
  >
>

export interface Instrument {
  symbol: string
  display_name: string | null
  market: string | null
  quote_currency: string | null
  asset_kind: string | null
  is_benchmark: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export interface UpsertInstrumentInput {
  symbol: string
  display_name?: string | null
  market?: string | null
  quote_currency?: string | null
  asset_kind?: string | null
  is_benchmark?: boolean
  note?: string | null
}

export type UpdateInstrumentInput = Partial<Omit<UpsertInstrumentInput, 'symbol'>>

export type AccountKind =
  | 'cash'
  | 'time_deposit'
  | 'wealth_product'
  | 'fund'
  | 'brokerage'
  | 'credit_card'
  | 'crypto_wallet'

// Institution `kind` is an open enum on the backend; these are the known values.
export type InstitutionKind = 'bank' | 'broker' | 'exchange' | 'wallet' | 'other'

export interface Institution {
  id: number
  name: string
  kind: string | null
  note: string | null
  display_order: number
  created_at: string
  updated_at: string
  account_count: number
}

export interface CreateInstitutionInput {
  name: string
  kind?: string | null
  note?: string | null
  display_order?: number
}

export type UpdateInstitutionInput = Partial<{
  name: string
  kind: string | null
  note: string | null
  display_order: number
}>

export interface Account {
  id: number
  name: string
  // institution is now a real entity referenced by id; `institution` (joined name)
  // and `institution_kind` are read-only convenience fields returned by the backend.
  institution_id: number
  institution: string
  institution_kind: string | null
  currency: string
  kind: AccountKind
  display_order: number
  is_archived: boolean
  note: string | null
  created_at: string
  updated_at: string
  // computed fields (native account currency; display-ccy conversion is P2)
  current_balance: string | null
  last_snapshot_date: string | null
}

export interface CreateAccountInput {
  name: string
  institution_id: number
  currency: string
  kind: AccountKind
  note?: string
}

// institution_id is intentionally absent — an account's institution is fixed at
// creation (PRD §4.1); the backend ignores it on PATCH.
export type UpdateAccountInput = Partial<{
  name: string
  kind: AccountKind
  display_order: number
  note: string | null
  is_archived: boolean
}>

export interface BalanceSnapshot {
  id: number
  account_id: number
  snapshot_date: string
  balance: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface PositionSnapshot {
  id: number
  account_id: number
  symbol: string
  quantity: string
  avg_cost: string | null
  cost_currency: string | null
  snapshot_date: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface CreateBalanceSnapshotInput {
  account_id: number
  snapshot_date: string
  balance: string
  note?: string
}

export type UpdateBalanceSnapshotInput = Pick<
  CreateBalanceSnapshotInput,
  'snapshot_date' | 'balance' | 'note'
>

export interface CreatePositionSnapshotInput {
  account_id: number
  symbol: string
  quantity: string
  avg_cost?: string
  cost_currency?: string
  snapshot_date: string
  note?: string
}

export type UpdatePositionSnapshotInput = Pick<
  CreatePositionSnapshotInput,
  'snapshot_date' | 'quantity' | 'avg_cost' | 'cost_currency' | 'note'
>

export interface AccountBlueprint {
  name_suffix: string
  kind: string
  currency: string
  note?: string
}

export interface AccountTemplate {
  id: number
  name: string
  description: string | null
  is_builtin: boolean
  account_blueprints: AccountBlueprint[]
  created_at: string
  updated_at: string
}

export interface Price {
  id: number
  symbol: string
  price_date: string
  price: string
  currency: string
  source: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface CreatePriceInput {
  symbol: string
  price_date: string
  price: string
  currency: string
  source?: string | null
  note?: string | null
}

export type UpdatePriceInput = Pick<
  CreatePriceInput,
  'price_date' | 'price' | 'currency' | 'source' | 'note'
>

export interface FxRate {
  id: number
  base_currency: string
  quote_currency: string
  rate_date: string
  rate: string
  source: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface CreateFxRateInput {
  base_currency: string
  quote_currency: string
  rate_date: string
  rate: string
  source?: string | null
  note?: string | null
}

export type UpdateFxRateInput = Pick<CreateFxRateInput, 'rate_date' | 'rate' | 'source' | 'note'>

export interface ValuationBucket {
  key: string
  name: string
  value: string
  percent: string
}

export interface ValuationWarning {
  kind: 'missing_price' | 'fx_fallback' | string
  key: string
  message: string
}

export interface ValuationPosition {
  account_id: number
  account_name: string
  account_currency: string
  account_kind: AccountKind
  institution: string
  symbol: string
  display_name: string | null
  market: string | null
  quote_currency: string
  quantity: string
  avg_cost: string | null
  cost_currency: string
  snapshot_date: string
  price: string | null
  price_currency: string | null
  price_date: string | null
  market_value: string | null
  market_value_display: string | null
  cost_value_display: string | null
  unrealized_pl_display: string | null
  unrealized_pl_pct: string | null
  weight: string | null
  asset_weight: string | null
  holding_start_date: string | null
  holding_days: number | null
  missing_price: boolean
  fx_fallback: boolean
}

export interface Valuation {
  as_of: string
  display_currency: string
  fx_mode: FxMode
  net_worth: string
  total_assets: string
  total_liabilities: string
  cash_value: string
  position_value: string
  position_cost: string
  unrealized_pl: string
  unrealized_pl_pct: string | null
  position_share: string | null
  allocations: Record<string, ValuationBucket[]>
  positions: ValuationPosition[]
  position_groups: ValuationPosition[]
  warnings: ValuationWarning[]
}

export interface ListEnvelope<T> {
  items: T[]
  truncated: boolean
  limit: number
}

export interface PriceFilter {
  symbol?: string
  date_from?: string
  date_to?: string
  sort?: 'date_desc' | 'date_asc'
}

export interface FxRateFilter {
  base_currency?: string
  quote_currency?: string
  date_from?: string
  date_to?: string
  sort?: 'date_desc' | 'date_asc'
}

// Backend error envelope: { error: { code, message } }.
export type ApiErrorCode =
  | 'validation_failed'
  | 'business_rule_violated'
  | 'not_found'
  | 'conflict'
  | string

export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    // Prefer the backend's { error: { code, message } } envelope so the surfaced
    // toast/inline message is the human-readable backend message.
    let code: ApiErrorCode = 'error'
    let message = `${init?.method ?? 'GET'} ${path} failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body?.error?.message) message = body.error.message
      if (body?.error?.code) code = body.error.code
    } catch {
      /* non-JSON body — keep the generic message */
    }
    throw new ApiError(res.status, code, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function getPreferences(): Promise<Preferences> {
  return request<Preferences>('/api/preferences')
}

export function putPreferences(partial: PreferencesPatch): Promise<Preferences> {
  return request<Preferences>('/api/preferences', {
    method: 'PUT',
    body: JSON.stringify(partial),
  })
}

export function listInstruments(): Promise<Instrument[]> {
  return request<Instrument[]>('/api/instruments')
}

export function upsertInstrument(input: UpsertInstrumentInput): Promise<Instrument> {
  return request<Instrument>('/api/instruments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateInstrument(symbol: string, patch: UpdateInstrumentInput): Promise<Instrument> {
  return request<Instrument>(`/api/instruments/${encodeURIComponent(symbol)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteInstrument(symbol: string): Promise<void> {
  return request<void>(`/api/instruments/${encodeURIComponent(symbol)}`, { method: 'DELETE' })
}

export function listAccountTemplates(): Promise<AccountTemplate[]> {
  return request<AccountTemplate[]>('/api/account-templates')
}

// ---------- Institutions ----------

export function listInstitutions(): Promise<Institution[]> {
  return request<Institution[]>('/api/institutions')
}

export function getInstitution(id: number): Promise<Institution> {
  return request<Institution>(`/api/institutions/${id}`)
}

export function createInstitution(input: CreateInstitutionInput): Promise<Institution> {
  return request<Institution>('/api/institutions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateInstitution(
  id: number,
  patch: UpdateInstitutionInput,
): Promise<Institution> {
  return request<Institution>(`/api/institutions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteInstitution(id: number): Promise<void> {
  return request<void>(`/api/institutions/${id}`, { method: 'DELETE' })
}

// ---------- Accounts ----------

export function listAccounts(): Promise<Account[]> {
  return request<Account[]>('/api/accounts')
}

export function getAccount(id: number): Promise<Account> {
  return request<Account>(`/api/accounts/${id}`)
}

export function createAccount(input: CreateAccountInput): Promise<Account> {
  return request<Account>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// from-template accepts EITHER an existing institution_id OR an institution_name
// (which the backend creates/reuses by name). Exactly one of the two is provided.
export type FromTemplateInstitution =
  | { institution_id: number }
  | { institution_name: string }

export function createAccountsFromTemplate(
  templateId: number,
  institution: FromTemplateInstitution,
): Promise<Account[]> {
  return request<Account[]>('/api/accounts/from-template', {
    method: 'POST',
    body: JSON.stringify({ template_id: templateId, ...institution }),
  })
}

export function updateAccount(id: number, patch: UpdateAccountInput): Promise<Account> {
  return request<Account>(`/api/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteAccount(id: number): Promise<void> {
  return request<void>(`/api/accounts/${id}`, { method: 'DELETE' })
}

// ---------- Snapshots ----------

export function listBalanceSnapshots(accountId: number): Promise<BalanceSnapshot[]> {
  return request<BalanceSnapshot[]>(`/api/accounts/${accountId}/balance-snapshots`)
}

export function listPositionSnapshots(accountId: number): Promise<PositionSnapshot[]> {
  return request<PositionSnapshot[]>(`/api/accounts/${accountId}/position-snapshots`)
}

/** Current holding per symbol (latest as of today; may include quantity "0"). */
export function listPositions(accountId: number): Promise<PositionSnapshot[]> {
  return request<PositionSnapshot[]>(`/api/accounts/${accountId}/positions`)
}

export function upsertBalanceSnapshot(
  input: CreateBalanceSnapshotInput,
): Promise<BalanceSnapshot> {
  return request<BalanceSnapshot>('/api/balance-snapshots', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateBalanceSnapshot(
  id: number,
  input: UpdateBalanceSnapshotInput,
): Promise<BalanceSnapshot> {
  return request<BalanceSnapshot>(`/api/balance-snapshots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteBalanceSnapshot(id: number): Promise<void> {
  return request<void>(`/api/balance-snapshots/${id}`, { method: 'DELETE' })
}

export function upsertPositionSnapshot(
  input: CreatePositionSnapshotInput,
): Promise<PositionSnapshot> {
  return request<PositionSnapshot>('/api/position-snapshots', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePositionSnapshot(
  id: number,
  input: UpdatePositionSnapshotInput,
): Promise<PositionSnapshot> {
  return request<PositionSnapshot>(`/api/position-snapshots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deletePositionSnapshot(id: number): Promise<void> {
  return request<void>(`/api/position-snapshots/${id}`, { method: 'DELETE' })
}

// ---------- P2 market data + valuation ----------

function queryString(params: Record<string, string | undefined> | PriceFilter | FxRateFilter) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v)
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function listPrices(filter: PriceFilter = {}): Promise<ListEnvelope<Price>> {
  return request<ListEnvelope<Price>>(`/api/prices${queryString(filter)}`)
}

export function upsertPrice(input: CreatePriceInput): Promise<Price> {
  return request<Price>('/api/prices', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePrice(id: number, input: UpdatePriceInput): Promise<Price> {
  return request<Price>(`/api/prices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deletePrice(id: number): Promise<void> {
  return request<void>(`/api/prices/${id}`, { method: 'DELETE' })
}

export function listFxRates(filter: FxRateFilter = {}): Promise<ListEnvelope<FxRate>> {
  return request<ListEnvelope<FxRate>>(`/api/fx-rates${queryString(filter)}`)
}

export function upsertFxRate(input: CreateFxRateInput): Promise<FxRate> {
  return request<FxRate>('/api/fx-rates', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateFxRate(id: number, input: UpdateFxRateInput): Promise<FxRate> {
  return request<FxRate>(`/api/fx-rates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteFxRate(id: number): Promise<void> {
  return request<void>(`/api/fx-rates/${id}`, { method: 'DELETE' })
}

export function getValuation(params?: {
  date?: string
  display_currency?: string
  fx_mode?: FxMode
}): Promise<Valuation> {
  const qs = new URLSearchParams()
  if (params?.date) qs.set('date', params.date)
  if (params?.display_currency) qs.set('display_currency', params.display_currency)
  if (params?.fx_mode) qs.set('fx_mode', params.fx_mode)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<Valuation>(`/api/valuation${suffix}`)
}
