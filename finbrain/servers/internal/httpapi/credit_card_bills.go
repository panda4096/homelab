package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listCreditCardBills(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListCreditCardBills(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listAccountCreditCardBills(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	items, err := s.store.ListAccountCreditCardBills(r.Context(), userOf(r), id)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) upsertCreditCardBill(w http.ResponseWriter, r *http.Request) {
	var b store.CreditCardBill
	if !decodeJSON(w, r, &b) {
		return
	}
	if msg := s.normalizeAndValidateCreditCardBill(r, &b); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateCreditCardBill(r.Context(), userOf(r), b)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该出账日已存在账单")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchCreditCardBill(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	current, err := s.store.GetCreditCardBill(r.Context(), userOf(r), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "账单不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	var b store.CreditCardBill
	if !decodeJSON(w, r, &b) {
		return
	}
	b.AccountID = current.AccountID
	if msg := s.normalizeAndValidateCreditCardBill(r, &b); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateCreditCardBill(r.Context(), userOf(r), id, b)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "账单不存在")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该出账日已存在账单")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteCreditCardBill(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteCreditCardBill(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "账单不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) submitReviewBatch(w http.ResponseWriter, r *http.Request) {
	var batch store.ReviewBatch
	if !decodeJSON(w, r, &batch) {
		return
	}
	batch.ReviewDate = strings.TrimSpace(batch.ReviewDate)
	if batch.ReviewDate == "" {
		batch.ReviewDate = s.today(r.Context())
	}
	if err := domain.ValidateSnapshotDate(batch.ReviewDate, s.location(r.Context())); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", err.Error())
		return
	}
	errs := s.normalizeAndValidateReviewBatch(r, &batch)
	if len(errs) > 0 {
		writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", "盘点批量提交存在无效行", errs)
		return
	}
	out, err := s.store.ApplyReviewBatch(r.Context(), userOf(r), batch)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) normalizeAndValidateReviewBatch(r *http.Request, batch *store.ReviewBatch) []batchRowError {
	errs := []batchRowError{}
	for i := range batch.BalanceSnapshots {
		b := &batch.BalanceSnapshots[i]
		if b.SnapshotDate == "" {
			b.SnapshotDate = batch.ReviewDate
		}
		if msg := s.validateBalanceSnapshotRow(r, b); msg != "" {
			errs = append(errs, newBatchRowError("balance_snapshots", i, "", "business_rule_violated", msg))
		}
	}
	for i := range batch.PositionSnapshots {
		p := &batch.PositionSnapshots[i]
		if p.SnapshotDate == "" {
			p.SnapshotDate = batch.ReviewDate
		}
		if msg := s.validatePositionSnapshotRow(r, p); msg != "" {
			errs = append(errs, newBatchRowError("position_snapshots", i, "", "business_rule_violated", msg))
		}
	}
	for i := range batch.Transactions {
		t := &batch.Transactions[i]
		if t.TradeDate == "" {
			t.TradeDate = batch.ReviewDate
		}
		if msg := s.normalizeAndValidateTransaction(r, t); msg != "" {
			errs = append(errs, newBatchRowError("transactions", i, "", "business_rule_violated", msg))
		}
	}
	for i := range batch.Transfers {
		t := &batch.Transfers[i]
		if t.TransferDate == "" {
			t.TransferDate = batch.ReviewDate
		}
		if msg := s.normalizeAndValidateTransfer(r, t); msg != "" {
			errs = append(errs, newBatchRowError("transfers", i, "", "business_rule_violated", msg))
		}
	}
	for i := range batch.IncomeEvents {
		e := &batch.IncomeEvents[i]
		if e.EventDate == "" {
			e.EventDate = batch.ReviewDate
		}
		if msg := s.normalizeAndValidateIncomeEvent(r, e); msg != "" {
			errs = append(errs, newBatchRowError("income_events", i, "", "business_rule_violated", msg))
		}
	}
	for i := range batch.CorporateActions {
		c := &batch.CorporateActions[i]
		if c.EventDate == "" {
			c.EventDate = batch.ReviewDate
		}
		if msg := s.normalizeAndValidateCorporateAction(r.Context(), c); msg != "" {
			errs = append(errs, newBatchRowError("corporate_actions", i, "", "business_rule_violated", msg))
		}
	}
	for i := range batch.CreditCardBills {
		b := &batch.CreditCardBills[i]
		if b.StatementDate == "" {
			b.StatementDate = batch.ReviewDate
		}
		if msg := s.normalizeAndValidateCreditCardBill(r, b); msg != "" {
			errs = append(errs, newBatchRowError("credit_card_bills", i, "", "business_rule_violated", msg))
		}
	}
	return errs
}

func (s *Server) validateBalanceSnapshotRow(r *http.Request, b *store.BalanceSnapshot) string {
	if b.AccountID == 0 || !validMoneyDecimal(b.Balance) {
		return "account_id and balance with up to 2 decimal places are required"
	}
	if msg := validateOptionalTextLen("note", b.Note, maxNoteLen); msg != "" {
		return msg
	}
	if err := domain.ValidateSnapshotDate(b.SnapshotDate, s.location(r.Context())); err != nil {
		return err.Error()
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), b.AccountID, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		return "account not found"
	}
	if err != nil {
		return "account lookup failed"
	}
	if !supportsBalanceSnapshots(acct.Kind) {
		return "该账户类型不支持录入余额"
	}
	return ""
}

func (s *Server) validatePositionSnapshotRow(r *http.Request, p *store.PositionSnapshot) string {
	p.Symbol = strings.ToUpper(strings.TrimSpace(p.Symbol))
	if p.AccountID == 0 || p.Symbol == "" {
		return "account_id and symbol are required"
	}
	if msg := validateTextLen("symbol", p.Symbol, maxSymbolLen); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("note", p.Note, maxNoteLen); msg != "" {
		return msg
	}
	if !validDecimal(p.Quantity) {
		return "quantity must be numeric"
	}
	if isNegativeDecimal(p.Quantity) {
		return "quantity must be >= 0 (0 = 清仓)"
	}
	if p.AvgCost != nil && !validDecimal(*p.AvgCost) {
		return "avg_cost must be numeric"
	}
	if err := domain.ValidateSnapshotDate(p.SnapshotDate, s.location(r.Context())); err != nil {
		return err.Error()
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), p.AccountID, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		return "account not found"
	}
	if err != nil {
		return "account lookup failed"
	}
	if !supportsPositionSnapshots(acct.Kind) {
		return "该账户类型不支持录入持仓"
	}
	return ""
}

func (s *Server) normalizeAndValidateCreditCardBill(r *http.Request, b *store.CreditCardBill) string {
	b.Currency = strings.ToUpper(strings.TrimSpace(b.Currency))
	b.StatementDate = strings.TrimSpace(b.StatementDate)
	b.AmountTotal = strings.TrimSpace(b.AmountTotal)
	if b.PaymentAccountID != nil && *b.PaymentAccountID == 0 {
		b.PaymentAccountID = nil
	}
	if b.AccountID == 0 {
		return "account_id is required"
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), b.AccountID, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		return "account not found"
	}
	if err != nil {
		return "account lookup failed"
	}
	if acct.Kind != "credit_card" {
		return "信用卡账单只能挂在信用卡账户下"
	}
	if b.Currency == "" {
		b.Currency = acct.Currency
	}
	if !currencyRe.MatchString(b.Currency) {
		return "currency must be a 3-letter ISO code"
	}
	if err := domain.ValidateSnapshotDate(b.StatementDate, s.location(r.Context())); err != nil {
		return err.Error()
	}
	if b.PaidAt != nil {
		paid := strings.TrimSpace(*b.PaidAt)
		if paid == "" {
			b.PaidAt = nil
		} else {
			b.PaidAt = &paid
			if err := domain.ValidateSnapshotDate(paid, s.location(r.Context())); err != nil {
				return err.Error()
			}
		}
	}
	if !validMoneyDecimal(b.AmountTotal) || !positiveDecimal(b.AmountTotal) {
		return "amount_total must be > 0 with up to 2 decimal places"
	}
	if msg := validateCategories(b.TopCategories); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("note", b.Note, maxNoteLen); msg != "" {
		return msg
	}
	if b.PaymentAccountID != nil {
		payAcct, err := s.store.GetAccount(r.Context(), userOf(r), *b.PaymentAccountID, s.today(r.Context()))
		if errors.Is(err, store.ErrNotFound) {
			return "payment_account_id 不存在"
		}
		if err != nil {
			return "payment account lookup failed"
		}
		if payAcct.Kind == "credit_card" {
			return "还款账户不能是信用卡账户"
		}
	}
	return ""
}

func validateCategories(cats []store.CreditCardCategory) string {
	for i := range cats {
		cats[i].Name = strings.TrimSpace(cats[i].Name)
		cats[i].Amount = strings.TrimSpace(cats[i].Amount)
		if cats[i].Name == "" {
			return "top_categories.name is required"
		}
		if msg := validateTextLen("top_categories.name", cats[i].Name, maxNameLen); msg != "" {
			return msg
		}
		if !validMoneyDecimal(cats[i].Amount) || !positiveDecimal(cats[i].Amount) {
			return "top_categories.amount must be > 0 with up to 2 decimal places"
		}
	}
	return ""
}
