package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listTransactions(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	items, truncated, err := s.store.ListTransactions(r.Context(), userOf(r), queryInt64(r, "account_id"), symbol, queryLimit(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse(items, truncated, queryLimit(r)))
}

func (s *Server) createTransaction(w http.ResponseWriter, r *http.Request) {
	var t store.Transaction
	if !decodeJSON(w, r, &t) {
		return
	}
	if msg := s.normalizeAndValidateTransaction(r, &t); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateTransaction(r.Context(), userOf(r), t)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	// A trade may introduce a new instrument → backfill its history (idempotent, non-blocking).
	s.market.TriggerEnsureBackfilled(out.Symbol)
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	current, err := s.store.GetTransaction(r.Context(), userOf(r), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "交易不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	var t store.Transaction
	if !decodeJSON(w, r, &t) {
		return
	}
	// Account & symbol are now editable (历史数据补录/纠错). A PATCH body that omits them
	// (legacy callers) falls back to the current values so behaviour is unchanged.
	if t.AccountID == 0 {
		t.AccountID = current.AccountID
	}
	if strings.TrimSpace(t.Symbol) == "" {
		t.Symbol = current.Symbol
	}
	if msg := s.normalizeAndValidateTransaction(r, &t); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateTransaction(r.Context(), userOf(r), id, t)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "交易不存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteTransaction(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "交易不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) normalizeAndValidateTransaction(r *http.Request, t *store.Transaction) string {
	t.Symbol = strings.ToUpper(strings.TrimSpace(t.Symbol))
	t.Action = strings.ToLower(strings.TrimSpace(t.Action))
	t.Currency = strings.ToUpper(strings.TrimSpace(t.Currency))
	t.TradeDate = strings.TrimSpace(t.TradeDate)
	t.Quantity = strings.TrimSpace(t.Quantity)
	t.Price = strings.TrimSpace(t.Price)
	if t.AccountID == 0 || t.Symbol == "" {
		return "account_id and symbol are required"
	}
	if msg := validateTextLen("symbol", t.Symbol, maxSymbolLen); msg != "" {
		return msg
	}
	if t.Action != "buy" && t.Action != "sell" {
		return "action must be buy or sell"
	}
	if !validDecimal(t.Quantity) || !positiveDecimal(t.Quantity) {
		return "quantity must be > 0"
	}
	if !validDecimal(t.Price) || isNegativeDecimal(t.Price) {
		return "price must be >= 0"
	}
	if t.Fee != nil {
		fee := strings.TrimSpace(*t.Fee)
		if fee == "" {
			t.Fee = nil
		} else {
			t.Fee = &fee
			if !validDecimal(fee) || isNegativeDecimal(fee) {
				return "fee must be >= 0"
			}
		}
	}
	if !currencyRe.MatchString(t.Currency) {
		return "currency must be a 3-letter ISO code"
	}
	if _, err := domain.ParseDate(t.TradeDate, s.location(r.Context())); err != nil {
		return "trade_date must be YYYY-MM-DD"
	}
	if t.SettleDate != nil {
		sd := strings.TrimSpace(*t.SettleDate)
		if sd == "" {
			t.SettleDate = nil
		} else {
			t.SettleDate = &sd
			if _, err := domain.ParseDate(sd, s.location(r.Context())); err != nil {
				return "settle_date must be YYYY-MM-DD"
			}
		}
	}
	if msg := validateOptionalTextLen("notes", t.Notes, maxNoteLen); msg != "" {
		return msg
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), t.AccountID, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		return "account not found"
	}
	if err != nil {
		return "account lookup failed"
	}
	if !supportsPositionSnapshots(acct.Kind) {
		return "该账户类型不支持持仓交易"
	}
	pay, msg := s.validateTradePaymentAccount(r.Context(), userOf(r), s.today(r.Context()), t.PaymentAccountID, t.AccountID, t.Currency)
	if msg != "" {
		return msg
	}
	t.PaymentAccountID = pay
	return ""
}

// validateTradePaymentAccount normalizes + validates the cash account a position trade is
// debited from (buy) / settled into (sell). Shared by the HTTP and agent write paths so the
// 联动扣款 rule can't drift between them. A position account never holds cash, so the trade's
// cash MUST land on a real cash account (required) — same currency (reconciliation posts the
// effect without FX) and with a balance-snapshot baseline (so the cash leg can anchor and is
// not silently dropped while the position still moves, inflating net worth). Returns the
// normalized id (==trade account / 0 → nil → rejected) and "" on success, else an error msg.
func (s *Server) validateTradePaymentAccount(ctx context.Context, userID int64, today string, pay *int64, tradeAccountID int64, tradeCurrency string) (*int64, string) {
	if pay != nil && (*pay == 0 || *pay == tradeAccountID) {
		pay = nil
	}
	if pay == nil {
		return nil, "持仓交易需指定扣款账户（现金从哪个账户扣 / 入）"
	}
	acct, err := s.store.GetAccount(ctx, userID, *pay, today)
	if errors.Is(err, store.ErrNotFound) {
		return nil, "扣款账户不存在"
	}
	if err != nil {
		return nil, "扣款账户查询失败"
	}
	if !supportsBalanceSnapshots(acct.Kind) {
		return nil, "扣款账户须为现金类账户"
	}
	if acct.Currency != tradeCurrency {
		return nil, "扣款账户币种需与交易币种一致"
	}
	has, err := s.store.AccountHasBalanceSnapshot(ctx, userID, *pay)
	if err != nil {
		return nil, "扣款账户查询失败"
	}
	if !has {
		return nil, "扣款账户需先建立现金快照基准（录一条余额后再用作扣款）"
	}
	return pay, ""
}
