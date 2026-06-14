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
  timezone: string
  updated_at: string
}

export type PreferencesPatch = Partial<
  Pick<
    Preferences,
    'display_currency' | 'fx_mode' | 'time_aggregation_default' | 'market_convention' | 'timezone'
  >
>

export interface AuthUser {
  id: number
  display_name: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export interface AuthMe {
  user: AuthUser
  timezone: string
}

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

export interface CreditCardCategory {
  name: string
  amount: string
}

export interface CreditCardBill {
  id: number
  account_id: number
  account_name?: string
  institution?: string
  statement_date: string
  amount_total: string
  currency: string
  top_categories: CreditCardCategory[]
  paid_at: string | null
  payment_account_id: number | null
  payment_account_name?: string | null
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

export interface CreateCreditCardBillInput {
  account_id: number
  statement_date: string
  amount_total: string
  currency?: string
  top_categories?: CreditCardCategory[]
  paid_at?: string | null
  payment_account_id?: number | null
  note?: string | null
}

export type UpdateCreditCardBillInput = Omit<CreateCreditCardBillInput, 'account_id'>

export interface ReviewBatchInput {
  review_date: string
  balance_snapshots: CreateBalanceSnapshotInput[]
  position_snapshots: CreatePositionSnapshotInput[]
  credit_card_bills: CreateCreditCardBillInput[]
  transactions?: CreateTransactionInput[]
  transfers?: CreateTransferInput[]
  income_events?: CreateIncomeEventInput[]
  corporate_actions?: CreateCorporateActionInput[]
}

export interface ReviewBatchResult {
  review_date: string
  balance_snapshots: number
  position_snapshots: number
  credit_card_bills: number
  transactions: number
  transfers: number
  income_events: number
  corporate_actions: number
}

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

export interface ValuationCash {
  account_id: number
  account_name: string
  account_currency: string
  account_kind: AccountKind
  institution: string
  snapshot_date: string
  balance: string
  balance_value_display: string
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
  asset_kind: string | null
  quantity: string
  avg_cost: string | null
  net_cost: string | null
  cost_currency: string
  snapshot_date: string
  price: string | null
  price_currency: string | null
  price_date: string | null
  market_value: string | null
  market_value_display: string | null
  cost_value_display: string | null
  net_cost_value_display: string | null
  realized_pl_display: string | null
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
  position_net_cost: string
  unrealized_pl: string
  unrealized_pl_pct: string | null
  position_share: string | null
  realized_pl_ytd: string
  income_ytd: string
  allocations: Record<string, ValuationBucket[]>
  cash_accounts: ValuationCash[]
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
  base?: string
  quote?: string
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
  details: unknown
  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  })
  if (!res.ok) {
    // Prefer the backend's { error: { code, message } } envelope so the surfaced
    // toast/inline message is the human-readable backend message.
    let code: ApiErrorCode = 'error'
    let message = `${init?.method ?? 'GET'} ${path} failed (${res.status})`
    let details: unknown
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
      if (body?.error?.message) message = body.error.message
      if (body?.error?.code) code = body.error.code
      details = body?.error?.details
    } catch {
      /* non-JSON body — keep the generic message */
    }
    if (res.status === 401 && !path.startsWith('/api/auth')) {
      window.dispatchEvent(new CustomEvent('finbrain:unauthorized'))
    }
    throw new ApiError(res.status, code, message, details)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function register(username: string, password: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function login(username: string, password: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' })
}

export function getMe(): Promise<AuthMe> {
  return request<AuthMe>('/api/auth/me')
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
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

// ---------- P3 credit-card bills + monthly review ----------

export function listCreditCardBills(): Promise<CreditCardBill[]> {
  return request<CreditCardBill[]>('/api/credit-card-bills')
}

export function listAccountCreditCardBills(accountId: number): Promise<CreditCardBill[]> {
  return request<CreditCardBill[]>(`/api/accounts/${accountId}/credit-card-bills`)
}

export function upsertCreditCardBill(input: CreateCreditCardBillInput): Promise<CreditCardBill> {
  return request<CreditCardBill>('/api/credit-card-bills', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateCreditCardBill(id: number, input: UpdateCreditCardBillInput): Promise<CreditCardBill> {
  return request<CreditCardBill>(`/api/credit-card-bills/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteCreditCardBill(id: number): Promise<void> {
  return request<void>(`/api/credit-card-bills/${id}`, { method: 'DELETE' })
}

export function submitReviewBatch(input: ReviewBatchInput): Promise<ReviewBatchResult> {
  return request<ReviewBatchResult>('/api/reviews/batch', {
    method: 'POST',
    body: JSON.stringify(input),
  })
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

// ---------- P4 transactions / transfers / income events / corporate actions ----------

export type TransactionAction = 'buy' | 'sell'

export interface Transaction {
  id: number
  account_id: number
  account_name?: string
  institution?: string
  symbol: string
  display_name?: string | null
  action: TransactionAction
  trade_date: string
  settle_date: string | null
  quantity: string
  price: string
  currency: string
  fee: string | null
  is_settled: boolean
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface CreateTransactionInput {
  account_id: number
  symbol: string
  action: TransactionAction
  trade_date: string
  settle_date?: string | null
  quantity: string
  price: string
  currency: string
  fee?: string | null
  is_settled?: boolean
  notes?: string | null
}

export type UpdateTransactionInput = Omit<CreateTransactionInput, 'account_id' | 'symbol'>

export interface Transfer {
  id: number
  from_account_id: number
  to_account_id: number
  from_account_name?: string | null
  to_account_name?: string | null
  from_currency?: string
  to_currency?: string
  from_amount: string
  to_amount: string
  transfer_date: string
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface CreateTransferInput {
  from_account_id: number
  to_account_id: number
  from_amount: string
  to_amount: string
  transfer_date: string
  notes?: string | null
}

export type UpdateTransferInput = CreateTransferInput

export type IncomeKind = 'dividend' | 'interest' | 'rebate' | 'other'

export interface IncomeEvent {
  id: number
  event_kind: IncomeKind
  event_date: string
  account_id: number
  account_name?: string
  institution?: string
  symbol: string | null
  amount: string
  currency: string
  payment_account_id: number | null
  payment_account_name?: string | null
  tax_withheld: string | null
  note: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface CreateIncomeEventInput {
  event_kind: IncomeKind
  event_date: string
  account_id: number
  symbol?: string | null
  amount: string
  currency: string
  payment_account_id?: number | null
  tax_withheld?: string | null
  note?: string | null
}

export type UpdateIncomeEventInput = CreateIncomeEventInput

export type CorporateActionKind = 'split' | 'merge' | 'rights'

export interface CorporateAction {
  id: number
  symbol: string
  display_name?: string | null
  action: CorporateActionKind
  event_date: string
  ratio_numerator: string
  ratio_denominator: string
  extra?: unknown
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface CreateCorporateActionInput {
  symbol: string
  action: CorporateActionKind
  event_date: string
  ratio_numerator: string
  ratio_denominator: string
  extra?: unknown
  notes?: string | null
}

export type UpdateCorporateActionInput = Omit<CreateCorporateActionInput, 'symbol'>

export interface ReconEvent {
  date: string
  kind: string
  label: string
  amount: string
  running: string
}

export interface PositionDelta {
  symbol: string
  replay_quantity: string
  snapshot_quantity: string
  delta: string
}

export interface AccountReconciliation {
  account_id: number
  account_name: string
  currency: string
  snapshot_date: string | null
  snapshot_balance: string
  expected_balance: string
  reconciliation_delta: string
  over_threshold: boolean
  settled_only: boolean
  events: ReconEvent[]
  position_deltas: PositionDelta[]
}

export interface TransactionFilter {
  account_id?: number
  symbol?: string
  limit?: number
}

function listQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== 0) q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function listTransactions(filter: TransactionFilter = {}): Promise<ListEnvelope<Transaction>> {
  return request<ListEnvelope<Transaction>>(`/api/transactions${listQuery(filter as Record<string, string | number | undefined>)}`)
}

export function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  return request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(input) })
}

export function updateTransaction(id: number, input: UpdateTransactionInput): Promise<Transaction> {
  return request<Transaction>(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteTransaction(id: number): Promise<void> {
  return request<void>(`/api/transactions/${id}`, { method: 'DELETE' })
}

export function listTransfers(accountId?: number): Promise<ListEnvelope<Transfer>> {
  return request<ListEnvelope<Transfer>>(`/api/transfers${listQuery({ account_id: accountId })}`)
}

export function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  return request<Transfer>('/api/transfers', { method: 'POST', body: JSON.stringify(input) })
}

export function updateTransfer(id: number, input: UpdateTransferInput): Promise<Transfer> {
  return request<Transfer>(`/api/transfers/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteTransfer(id: number): Promise<void> {
  return request<void>(`/api/transfers/${id}`, { method: 'DELETE' })
}

export function listIncomeEvents(filter: { account_id?: number; symbol?: string; event_kind?: string } = {}): Promise<ListEnvelope<IncomeEvent>> {
  return request<ListEnvelope<IncomeEvent>>(`/api/income-events${listQuery(filter)}`)
}

export function createIncomeEvent(input: CreateIncomeEventInput): Promise<IncomeEvent> {
  return request<IncomeEvent>('/api/income-events', { method: 'POST', body: JSON.stringify(input) })
}

export function updateIncomeEvent(id: number, input: UpdateIncomeEventInput): Promise<IncomeEvent> {
  return request<IncomeEvent>(`/api/income-events/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteIncomeEvent(id: number): Promise<void> {
  return request<void>(`/api/income-events/${id}`, { method: 'DELETE' })
}

export function listCorporateActions(symbol?: string): Promise<ListEnvelope<CorporateAction>> {
  return request<ListEnvelope<CorporateAction>>(`/api/corporate-actions${listQuery({ symbol })}`)
}

export function createCorporateAction(input: CreateCorporateActionInput): Promise<CorporateAction> {
  return request<CorporateAction>('/api/corporate-actions', { method: 'POST', body: JSON.stringify(input) })
}

export function updateCorporateAction(id: number, input: UpdateCorporateActionInput): Promise<CorporateAction> {
  return request<CorporateAction>(`/api/corporate-actions/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteCorporateAction(id: number): Promise<void> {
  return request<void>(`/api/corporate-actions/${id}`, { method: 'DELETE' })
}

export function getAccountReconciliation(
  accountId: number,
  params: { date?: string; settled_only?: boolean } = {},
): Promise<AccountReconciliation> {
  const qs = new URLSearchParams()
  if (params.date) qs.set('date', params.date)
  if (params.settled_only) qs.set('settled_only', 'true')
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<AccountReconciliation>(`/api/accounts/${accountId}/reconciliation${suffix}`)
}

// ---------- P5 trend / analysis ----------

export interface TrendPoint {
  date: string
  net_worth: string
  total_assets: string
  total_liabilities: string
  cash_value: string
  position_value: string
}

export interface TrendSeries {
  from: string
  to: string
  granularity: TimeAggregation
  display_currency: string
  fx_mode: FxMode
  points: TrendPoint[]
}

export function getTrend(params: {
  from?: string
  to?: string
  granularity?: TimeAggregation
  display_currency?: string
  fx_mode?: FxMode
} = {}): Promise<TrendSeries> {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, String(v)) })
  const s = q.toString()
  return request<TrendSeries>(`/api/trend${s ? `?${s}` : ''}`)
}

// ---------- P5 allocation targets ----------

export interface AllocationTargetItem {
  id?: number
  dimension_value: string
  target_pct: string
  actual_pct?: string
  drift?: string
  rebalance?: string
  over_threshold?: boolean
}

export interface AllocationTargetSet {
  id: number
  name: string
  dimension: string
  drift_threshold_pct: string
  is_dashboard_visible: boolean
  is_archived: boolean
  note: string | null
  items: AllocationTargetItem[]
  net_worth?: string
  created_at: string
  updated_at: string
}

export interface SaveAllocationTargetInput {
  name: string
  dimension: string
  drift_threshold_pct?: string
  is_dashboard_visible?: boolean
  is_archived?: boolean
  note?: string | null
  items: { dimension_value: string; target_pct: string }[]
}

export function listAllocationTargets(): Promise<AllocationTargetSet[]> {
  return request<AllocationTargetSet[]>('/api/allocation-targets')
}

export function createAllocationTarget(input: SaveAllocationTargetInput): Promise<AllocationTargetSet> {
  return request<AllocationTargetSet>('/api/allocation-targets', { method: 'POST', body: JSON.stringify(input) })
}

export function updateAllocationTarget(id: number, input: SaveAllocationTargetInput): Promise<AllocationTargetSet> {
  return request<AllocationTargetSet>(`/api/allocation-targets/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteAllocationTarget(id: number): Promise<void> {
  return request<void>(`/api/allocation-targets/${id}`, { method: 'DELETE' })
}

export function getAllocationTargetDrift(id: number, params: { display_currency?: string; fx_mode?: FxMode } = {}): Promise<AllocationTargetSet> {
  const q = new URLSearchParams()
  if (params.display_currency) q.set('display_currency', params.display_currency)
  if (params.fx_mode) q.set('fx_mode', params.fx_mode)
  const s = q.toString()
  return request<AllocationTargetSet>(`/api/allocation-targets/${id}/drift${s ? `?${s}` : ''}`)
}

// ---------- P6 LLM + summaries ----------

export interface LLMStatus {
  configured: boolean
  provider: string
  model: string
  available?: boolean
  error?: string
}

export interface Summary {
  id: number
  period_kind: 'month' | 'quarter' | 'year'
  period_start: string
  period_end: string
  display_currency: string
  content: string
  meta?: unknown
  created_at: string
}

export function getLLMStatus(probe = false): Promise<LLMStatus> {
  return request<LLMStatus>(`/api/llm/status${probe ? '?probe=1' : ''}`)
}

export function listSummaries(): Promise<Summary[]> {
  return request<Summary[]>('/api/summaries')
}

export function generateSummary(input: {
  period_kind: 'month' | 'quarter' | 'year'
  period_start: string
  period_end: string
  display_currency?: string
  fx_mode?: FxMode
}): Promise<Summary> {
  return request<Summary>('/api/summaries/generate', { method: 'POST', body: JSON.stringify(input) })
}

export function deleteSummary(id: number): Promise<void> {
  return request<void>(`/api/summaries/${id}`, { method: 'DELETE' })
}

// ---------- P5 annotations ----------

export type AnchorKind = 'date' | 'account' | 'symbol' | 'position'

export interface Annotation {
  id: number
  anchor_kind: AnchorKind
  anchor_keys: unknown
  event_date: string
  label: string
  body: string | null
  color: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface CreateAnnotationInput {
  anchor_kind?: AnchorKind
  anchor_keys?: unknown
  event_date: string
  label: string
  body?: string | null
  color?: string | null
}

export function listAnnotations(params: { from?: string; to?: string } = {}): Promise<Annotation[]> {
  const q = new URLSearchParams()
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  const s = q.toString()
  return request<Annotation[]>(`/api/annotations${s ? `?${s}` : ''}`)
}

export function createAnnotation(input: CreateAnnotationInput): Promise<Annotation> {
  return request<Annotation>('/api/annotations', { method: 'POST', body: JSON.stringify(input) })
}

export function deleteAnnotation(id: number): Promise<void> {
  return request<void>(`/api/annotations/${id}`, { method: 'DELETE' })
}

// ---------- P5 growth attribution (§6.12) ----------

export interface AttributionResult {
  from: string
  to: string
  display_currency: string
  net_change: string
  price_effect: string
  quantity_effect: string
  income_effect: string
  fx_effect: string
}

export function getAttribution(params: { from: string; to: string; display_currency?: string; fx_mode?: FxMode }): Promise<AttributionResult> {
  const q = new URLSearchParams({ from: params.from, to: params.to })
  if (params.display_currency) q.set('display_currency', params.display_currency)
  if (params.fx_mode) q.set('fx_mode', params.fx_mode)
  return request<AttributionResult>(`/api/attribution?${q.toString()}`)
}

// ---------- P8 agent skill layer (no SQL — agents call registered skills) ----------

export type SkillType = 'read' | 'draft' | 'write'

export interface AgentSkill {
  name: string
  type: SkillType
  description: string
  input_schema: unknown
  permission: string
  requires_confirmation: boolean
  max_rows?: number
  audit_enabled: boolean
}

export interface AgentRunResult {
  skill: string
  type: SkillType
  result: unknown
  row_count: number
  affected_entities?: string[]
  reply?: string
}

export interface AgentStep {
  key: string
  label: string
  status: 'done' | 'pending' | 'error' | string
  detail?: string
  skill?: string
  row_count?: number
}

export interface AgentUsage {
  calls?: number
  prompt_tokens?: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  completion_tokens?: number
  reasoning_tokens?: number
  total_tokens?: number
  cost_usd?: number
}

export interface AgentPlanResult {
  // chat path: no skill chosen; skill path may also include a human-readable reply.
  plan?: { skill: string; params: Record<string, unknown> }
  type: SkillType | 'chat'
  requires_confirmation?: boolean
  result?: unknown
  row_count?: number
  affected_entities?: string[]
  reply?: string
  steps?: AgentStep[]
  usage?: AgentUsage
}

export interface AgentPlanOptions {
  model?: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  thinking?: boolean
  history?: AgentChatMessage[]
}

export interface AgentChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface AgentStreamHandlers {
  onPhase?: (step: AgentStep) => void
  onAnswerDelta?: (text: string) => void
}

export interface APIKey {
  id: number
  name: string
  prefix: string
  scopes: 'read' | 'read_write'
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface AuditEvent {
  id: number
  request_id: string
  actor: string
  source: 'ui' | 'agent' | 'apikey'
  skill_name: string | null
  skill_type: string | null
  input_json?: unknown
  output_row_count: number | null
  affected_entities?: unknown
  natural_language_source: string | null
  confirmed_by_user: boolean
  status: 'ok' | 'error'
  error_code: string | null
  http_method: string | null
  http_path: string | null
  created_at: string
}

export function listSkills(): Promise<AgentSkill[]> {
  return request<{ skills: AgentSkill[] }>('/api/agent/skills').then((d) => d.skills)
}

export function planAgent(text: string, options?: AgentPlanOptions): Promise<AgentPlanResult> {
  return request<AgentPlanResult>('/api/agent/plan', { method: 'POST', body: JSON.stringify({ text, ...options }) })
}

export async function streamAgent(text: string, options: AgentPlanOptions | undefined, handlers: AgentStreamHandlers = {}): Promise<AgentPlanResult> {
  const res = await fetch('/api/agent/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ text, ...options }),
  })
  if (!res.ok) {
    let code: ApiErrorCode = 'error'
    let message = `POST /api/agent/stream failed (${res.status})`
    let details: unknown
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
      if (body?.error?.message) message = body.error.message
      if (body?.error?.code) code = body.error.code
      details = body?.error?.details
    } catch {
      /* keep generic message */
    }
    throw new ApiError(res.status, code, message, details)
  }
  if (!res.body) throw new ApiError(0, 'network', '浏览器不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: AgentPlanResult | undefined

  const dispatch = (chunk: string) => {
    const evt = parseSSEEvent(chunk)
    if (!evt) return
    if (evt.event === 'phase') {
      handlers.onPhase?.(JSON.parse(evt.data) as AgentStep)
      return
    }
    if (evt.event === 'answer_delta') {
      const delta = JSON.parse(evt.data) as { text?: string }
      if (delta.text) handlers.onAnswerDelta?.(delta.text)
      return
    }
    if (evt.event === 'final') {
      finalResult = JSON.parse(evt.data) as AgentPlanResult
      return
    }
    if (evt.event === 'error') {
      const err = JSON.parse(evt.data) as { code?: string; message?: string; details?: unknown }
      throw new ApiError(503, err.code ?? 'error', err.message ?? '请求失败', err.details)
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    let split = buffer.indexOf('\n\n')
    while (split >= 0) {
      const raw = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      dispatch(raw)
      split = buffer.indexOf('\n\n')
    }
    if (done) break
  }
  if (buffer.trim()) dispatch(buffer)
  if (!finalResult) throw new ApiError(0, 'stream_incomplete', 'Copilot 流式响应未完成')
  return finalResult
}

function parseSSEEvent(raw: string): { event: string; data: string } | null {
  let event = 'message'
  const data: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!data.length) return null
  return { event, data: data.join('\n') }
}

export function runSkill(skill: string, params: Record<string, unknown>, nlSource?: string): Promise<AgentRunResult> {
  return request<AgentRunResult>('/api/agent/run', { method: 'POST', body: JSON.stringify({ skill, params, nl_source: nlSource }) })
}

export function applySkill(skill: string, params: Record<string, unknown>, nlSource?: string): Promise<AgentRunResult> {
  return request<AgentRunResult>('/api/agent/apply', { method: 'POST', body: JSON.stringify({ skill, params, confirm: true, nl_source: nlSource }) })
}

export function listApiKeys(): Promise<APIKey[]> {
  return request<APIKey[]>('/api/api-keys')
}

export function createApiKey(name: string, scopes: 'read' | 'read_write'): Promise<{ key: APIKey; secret: string }> {
  return request<{ key: APIKey; secret: string }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) })
}

export function deleteApiKey(id: number): Promise<void> {
  return request<void>(`/api/api-keys/${id}`, { method: 'DELETE' })
}

export function listAudit(source?: string, limit?: number): Promise<AuditEvent[]> {
  const qs = new URLSearchParams()
  if (source) qs.set('source', source)
  if (limit) qs.set('limit', String(limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<AuditEvent[]>(`/api/audit${suffix}`)
}
