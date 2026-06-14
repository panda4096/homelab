package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// writeSkills are the draft (preview, no write) + apply (confirmed write) pairs.
// All writes reuse the same domain validation and store methods as the UI — the
// agent only supplies params; the backend owns口径/decimal/date/tx/audit.
func writeSkills() []Skill {
	return []Skill{
		{
			Name: "entry.draftBalanceSnapshot", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条余额快照(不写库),返回将要写入的实体与风险提示。",
			InputSchema: balanceSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				b, acct, msg := s.buildBalanceFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return balancePreview(b, acct), 0, nil, nil
			},
		},
		{
			Name: "entry.applyBalanceSnapshot", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条余额快照(同账户同日覆盖)。",
			InputSchema: balanceSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				b, _, msg := s.buildBalanceFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.UpsertBalanceSnapshot(ctx, b)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"balance_snapshot:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "entry.draftTransaction", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条持仓交易(买/卖,不写库)。",
			InputSchema: transactionSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				t, acct, msg := s.buildTransactionFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "transaction", "account": acctLite(acct), "fields": t}, 0, nil, nil
			},
		},
		{
			Name: "entry.applyTransaction", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条持仓交易;持仓与已实现盈亏按 §6.15 回放派生。",
			InputSchema: transactionSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				t, _, msg := s.buildTransactionFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.CreateTransaction(ctx, t)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"transaction:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "entry.draftCreditCardBill", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条信用卡账单(不写库)。",
			InputSchema: creditCardSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				b, acct, msg := s.buildCreditCardFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "credit_card_bill", "account": acctLite(acct), "fields": b}, 0, nil, nil
			},
		},
		{
			Name: "entry.applyCreditCardBill", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条信用卡账单(计入负债)。",
			InputSchema: creditCardSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				b, _, msg := s.buildCreditCardFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.CreateCreditCardBill(ctx, b)
				if isUniqueViolation(err) {
					return nil, 0, nil, errSkillInput{"该出账日已存在账单"}
				}
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"credit_card_bill:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
	}
}

var balanceSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"snapshot_date":{"type":"string","description":"YYYY-MM-DD, default today"},"balance":{"type":"string","description":"decimal, up to 2dp"},"note":{"type":"string"}},"required":["account_id","balance"],"additionalProperties":false}`)
var transactionSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"symbol":{"type":"string"},"action":{"type":"string","enum":["buy","sell"]},"trade_date":{"type":"string"},"settle_date":{"type":"string"},"quantity":{"type":"string"},"price":{"type":"string"},"currency":{"type":"string"},"fee":{"type":"string"},"is_settled":{"type":"boolean"},"notes":{"type":"string"}},"required":["account_id","symbol","action","quantity","price","currency"],"additionalProperties":false}`)
var creditCardSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"statement_date":{"type":"string"},"amount_total":{"type":"string"},"currency":{"type":"string"},"paid_at":{"type":"string"},"payment_account_id":{"type":"integer"},"top_categories":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"amount":{"type":"string"}}}},"note":{"type":"string"}},"required":["account_id","amount_total"],"additionalProperties":false}`)

func acctLite(a store.Account) map[string]any {
	return map[string]any{"id": a.ID, "name": a.Name, "institution": a.Institution, "currency": a.Currency, "kind": a.Kind}
}

func balancePreview(b store.BalanceSnapshot, acct store.Account) map[string]any {
	return map[string]any{"entity": "balance_snapshot", "account": acctLite(acct), "fields": b}
}

func optStr(a skillArgs, k string) *string {
	if v := argStr(a, k); v != "" {
		return &v
	}
	return nil
}

func (s *Server) buildBalanceFromArgs(ctx context.Context, a skillArgs) (store.BalanceSnapshot, store.Account, string) {
	b := store.BalanceSnapshot{AccountID: argInt(a, "account_id"), SnapshotDate: argStr(a, "snapshot_date"), Balance: argStr(a, "balance"), Note: optStr(a, "note")}
	if b.AccountID == 0 {
		return b, store.Account{}, "account_id is required"
	}
	if b.SnapshotDate == "" {
		b.SnapshotDate = s.today()
	}
	if !validMoneyDecimal(b.Balance) {
		return b, store.Account{}, "balance 必须是最多两位小数的数字"
	}
	if err := domain.ValidateSnapshotDate(b.SnapshotDate, s.cfg.Location); err != nil {
		return b, store.Account{}, err.Error()
	}
	acct, msg := s.lookupAccount(ctx, b.AccountID)
	if msg != "" {
		return b, acct, msg
	}
	if !supportsBalanceSnapshots(acct.Kind) {
		return b, acct, "该账户类型不支持录入余额"
	}
	return b, acct, ""
}

func (s *Server) buildTransactionFromArgs(ctx context.Context, a skillArgs) (store.Transaction, store.Account, string) {
	t := store.Transaction{
		AccountID: argInt(a, "account_id"), Symbol: strings.ToUpper(argStr(a, "symbol")),
		Action: strings.ToLower(argStr(a, "action")), TradeDate: argStr(a, "trade_date"),
		SettleDate: optStr(a, "settle_date"), Quantity: argStr(a, "quantity"), Price: argStr(a, "price"),
		Currency: strings.ToUpper(argStr(a, "currency")), Fee: optStr(a, "fee"),
		IsSettled: argBool(a, "is_settled"), Notes: optStr(a, "notes"),
	}
	if t.AccountID == 0 || t.Symbol == "" {
		return t, store.Account{}, "account_id 与 symbol 必填"
	}
	if t.Action != "buy" && t.Action != "sell" {
		return t, store.Account{}, "action 必须是 buy 或 sell"
	}
	if !validDecimal(t.Quantity) || !positiveDecimal(t.Quantity) {
		return t, store.Account{}, "quantity 必须 > 0"
	}
	if !validDecimal(t.Price) || isNegativeDecimal(t.Price) {
		return t, store.Account{}, "price 必须 >= 0"
	}
	if t.Fee != nil && (!validDecimal(*t.Fee) || isNegativeDecimal(*t.Fee)) {
		return t, store.Account{}, "fee 必须 >= 0"
	}
	if !currencyRe.MatchString(t.Currency) {
		return t, store.Account{}, "currency 必须是 3 位 ISO 代码"
	}
	if t.TradeDate == "" {
		t.TradeDate = s.today()
	}
	if _, err := domain.ParseDate(t.TradeDate, s.cfg.Location); err != nil {
		return t, store.Account{}, "trade_date 必须是 YYYY-MM-DD"
	}
	if t.SettleDate != nil {
		if _, err := domain.ParseDate(*t.SettleDate, s.cfg.Location); err != nil {
			return t, store.Account{}, "settle_date 必须是 YYYY-MM-DD"
		}
	}
	acct, msg := s.lookupAccount(ctx, t.AccountID)
	if msg != "" {
		return t, acct, msg
	}
	if !supportsPositionSnapshots(acct.Kind) {
		return t, acct, "该账户类型不支持持仓交易"
	}
	return t, acct, ""
}

func (s *Server) buildCreditCardFromArgs(ctx context.Context, a skillArgs) (store.CreditCardBill, store.Account, string) {
	b := store.CreditCardBill{
		AccountID: argInt(a, "account_id"), StatementDate: argStr(a, "statement_date"),
		AmountTotal: argStr(a, "amount_total"), Currency: strings.ToUpper(argStr(a, "currency")),
		PaidAt: optStr(a, "paid_at"), Note: optStr(a, "note"),
	}
	if id := argInt(a, "payment_account_id"); id != 0 {
		b.PaymentAccountID = &id
	}
	if raw, ok := a["top_categories"]; ok && raw != nil {
		blob, _ := json.Marshal(raw)
		_ = json.Unmarshal(blob, &b.TopCategories)
	}
	if b.AccountID == 0 {
		return b, store.Account{}, "account_id is required"
	}
	acct, msg := s.lookupAccount(ctx, b.AccountID)
	if msg != "" {
		return b, acct, msg
	}
	if acct.Kind != "credit_card" {
		return b, acct, "信用卡账单只能挂在信用卡账户下"
	}
	if b.Currency == "" {
		b.Currency = acct.Currency
	}
	if !currencyRe.MatchString(b.Currency) {
		return b, acct, "currency 必须是 3 位 ISO 代码"
	}
	if b.StatementDate == "" {
		b.StatementDate = s.today()
	}
	if err := domain.ValidateSnapshotDate(b.StatementDate, s.cfg.Location); err != nil {
		return b, acct, err.Error()
	}
	if !validMoneyDecimal(b.AmountTotal) || !positiveDecimal(b.AmountTotal) {
		return b, acct, "amount_total 必须 > 0 且最多两位小数"
	}
	if b.PaidAt != nil {
		if _, err := domain.ParseDate(*b.PaidAt, s.cfg.Location); err != nil {
			return b, acct, "paid_at 必须是 YYYY-MM-DD"
		}
	}
	if b.PaymentAccountID != nil {
		pay, m := s.lookupAccount(ctx, *b.PaymentAccountID)
		if m != "" {
			return b, acct, "payment_account_id " + m
		}
		if pay.Kind == "credit_card" {
			return b, acct, "还款账户不能是信用卡账户"
		}
	}
	return b, acct, ""
}

func (s *Server) lookupAccount(ctx context.Context, id int64) (store.Account, string) {
	acct, err := s.store.GetAccount(ctx, id, s.today())
	if errors.Is(err, store.ErrNotFound) {
		return store.Account{}, "account not found"
	}
	if err != nil {
		return store.Account{}, "account lookup failed"
	}
	return acct, ""
}
