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
		{
			Name: "entry.draftPositionSnapshot", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条持仓快照(不写库)。",
			InputSchema: positionSnapshotSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				p, acct, msg := s.buildPositionSnapshotFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "position_snapshot", "account": acctLite(acct), "fields": p}, 0, nil, nil
			},
		},
		{
			Name: "entry.applyPositionSnapshot", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条持仓快照(同账户/标的/日期覆盖)。",
			InputSchema: positionSnapshotSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				p, _, msg := s.buildPositionSnapshotFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.UpsertPositionSnapshot(ctx, p)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"position_snapshot:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "entry.draftTransfer", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条账户转账(不写库)。",
			InputSchema: transferSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				t, msg := s.buildTransferFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "transfer", "fields": t}, 0, nil, nil
			},
		},
		{
			Name: "entry.applyTransfer", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条账户转账。",
			InputSchema: transferSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				t, msg := s.buildTransferFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.CreateTransfer(ctx, t)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"transfer:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "entry.draftIncomeEvent", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条收益事件(分红/利息/返现/其他,不写库)。",
			InputSchema: incomeEventSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				e, acct, msg := s.buildIncomeEventFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "income_event", "account": acctLite(acct), "fields": e}, 0, nil, nil
			},
		},
		{
			Name: "entry.applyIncomeEvent", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条收益事件。",
			InputSchema: incomeEventSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				e, _, msg := s.buildIncomeEventFromArgs(ctx, a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.CreateIncomeEvent(ctx, e)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"income_event:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "entry.draftCorporateAction", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条公司动作(拆股/合股/配股,不写库)。",
			InputSchema: corporateActionSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				c, msg := s.buildCorporateActionFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "corporate_action", "fields": c}, 0, nil, nil
			},
		},
		{
			Name: "entry.applyCorporateAction", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条公司动作;持仓数量/成本按回放派生。",
			InputSchema: corporateActionSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				c, msg := s.buildCorporateActionFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.CreateCorporateAction(ctx, c)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"corporate_action:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "marketData.draftPrice", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条标的价格(不写库)。",
			InputSchema: priceSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				p, msg := s.buildPriceFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "price", "fields": p}, 0, nil, nil
			},
		},
		{
			Name: "marketData.applyPrice", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入/覆盖一条标的价格。",
			InputSchema: priceSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				p, msg := s.buildPriceFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.UpsertPrice(ctx, p)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"price:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "marketData.draftFxRate", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条汇率(不写库)。",
			InputSchema: fxRateSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				f, msg := s.buildFxRateFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "fx_rate", "fields": f}, 0, nil, nil
			},
		},
		{
			Name: "marketData.applyFxRate", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入/覆盖一条汇率。",
			InputSchema: fxRateSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				f, msg := s.buildFxRateFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.UpsertFxRate(ctx, f)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"fx_rate:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "planning.draftAllocationTargetSet", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一套资产配置目标(不写库; id>0 表示更新)。",
			InputSchema: allocationTargetSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				set, msg := s.buildAllocationTargetFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "allocation_target_set", "fields": set}, 0, nil, nil
			},
		},
		{
			Name: "planning.applyAllocationTargetSet", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后创建或更新一套资产配置目标。",
			InputSchema: allocationTargetSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				set, msg := s.buildAllocationTargetFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.SaveAllocationTargetSet(ctx, set)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"allocation_target_set:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
		{
			Name: "timeline.draftAnnotation", Type: "draft", Permission: "read", AuditEnabled: true,
			Description: "校验并预览一条时间线标注(不写库)。",
			InputSchema: annotationSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				ann, msg := s.buildAnnotationFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				return map[string]any{"entity": "annotation", "fields": ann}, 0, nil, nil
			},
		},
		{
			Name: "timeline.applyAnnotation", Type: "write", Permission: "read_write", RequiresConfirmation: true, AuditEnabled: true,
			Description: "确认后写入一条时间线标注。",
			InputSchema: annotationSchema,
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				ann, msg := s.buildAnnotationFromArgs(a)
				if msg != "" {
					return nil, 0, nil, errSkillInput{msg}
				}
				out, err := s.store.CreateAnnotation(ctx, ann)
				if err != nil {
					return nil, 0, nil, err
				}
				return out, 1, []string{"annotation:" + strconv.FormatInt(out.ID, 10)}, nil
			},
		},
	}
}

var balanceSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"snapshot_date":{"type":"string","description":"YYYY-MM-DD, default today"},"balance":{"type":"string","description":"decimal, up to 2dp"},"note":{"type":"string"}},"required":["account_id","balance"],"additionalProperties":false}`)
var transactionSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"symbol":{"type":"string"},"action":{"type":"string","enum":["buy","sell"]},"trade_date":{"type":"string"},"settle_date":{"type":"string"},"quantity":{"type":"string"},"price":{"type":"string"},"currency":{"type":"string"},"fee":{"type":"string"},"is_settled":{"type":"boolean"},"notes":{"type":"string"}},"required":["account_id","symbol","action","quantity","price","currency"],"additionalProperties":false}`)
var creditCardSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"statement_date":{"type":"string"},"amount_total":{"type":"string"},"currency":{"type":"string"},"paid_at":{"type":"string"},"payment_account_id":{"type":"integer"},"top_categories":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"amount":{"type":"string"}}}},"note":{"type":"string"}},"required":["account_id","amount_total"],"additionalProperties":false}`)
var positionSnapshotSchema = sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"symbol":{"type":"string"},"snapshot_date":{"type":"string"},"quantity":{"type":"string"},"avg_cost":{"type":"string"},"cost_currency":{"type":"string"},"note":{"type":"string"}},"required":["account_id","symbol","quantity"],"additionalProperties":false}`)
var transferSchema = sch(`{"type":"object","properties":{"from_account_id":{"type":"integer"},"to_account_id":{"type":"integer"},"from_amount":{"type":"string"},"to_amount":{"type":"string"},"transfer_date":{"type":"string"},"notes":{"type":"string"}},"required":["from_account_id","to_account_id","from_amount","to_amount"],"additionalProperties":false}`)
var incomeEventSchema = sch(`{"type":"object","properties":{"event_kind":{"type":"string","enum":["dividend","interest","rebate","other"]},"event_date":{"type":"string"},"account_id":{"type":"integer"},"symbol":{"type":"string"},"amount":{"type":"string"},"currency":{"type":"string"},"payment_account_id":{"type":"integer"},"tax_withheld":{"type":"string"},"note":{"type":"string"}},"required":["event_kind","account_id","amount"],"additionalProperties":false}`)
var corporateActionSchema = sch(`{"type":"object","properties":{"symbol":{"type":"string"},"action":{"type":"string","enum":["split","merge","rights"]},"event_date":{"type":"string"},"ratio_numerator":{"type":"string"},"ratio_denominator":{"type":"string"},"extra":{"type":"object"},"notes":{"type":"string"}},"required":["symbol","action","ratio_numerator","ratio_denominator"],"additionalProperties":false}`)
var priceSchema = sch(`{"type":"object","properties":{"symbol":{"type":"string"},"price_date":{"type":"string"},"price":{"type":"string"},"currency":{"type":"string"},"source":{"type":"string"},"note":{"type":"string"}},"required":["symbol","price","currency"],"additionalProperties":false}`)
var fxRateSchema = sch(`{"type":"object","properties":{"base_currency":{"type":"string"},"quote_currency":{"type":"string"},"rate_date":{"type":"string"},"rate":{"type":"string"},"source":{"type":"string"},"note":{"type":"string"}},"required":["base_currency","quote_currency","rate"],"additionalProperties":false}`)
var allocationTargetSchema = sch(`{"type":"object","properties":{"id":{"type":"integer"},"name":{"type":"string"},"dimension":{"type":"string","description":"kind|asset_kind|currency|quote_currency|market|institution"},"drift_threshold_pct":{"type":"string"},"is_dashboard_visible":{"type":"boolean"},"is_archived":{"type":"boolean"},"note":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"dimension_value":{"type":"string"},"target_pct":{"type":"string"}},"required":["dimension_value","target_pct"],"additionalProperties":false}}},"required":["name","dimension","items"],"additionalProperties":false}`)
var annotationSchema = sch(`{"type":"object","properties":{"anchor_kind":{"type":"string","enum":["date","account","symbol","position"]},"anchor_keys":{"type":"object"},"event_date":{"type":"string"},"label":{"type":"string"},"body":{"type":"string"},"color":{"type":"string"}},"required":["event_date","label"],"additionalProperties":false}`)

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
	if _, ok := a["is_settled"]; !ok {
		t.IsSettled = true
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

func (s *Server) buildPositionSnapshotFromArgs(ctx context.Context, a skillArgs) (store.PositionSnapshot, store.Account, string) {
	p := store.PositionSnapshot{
		AccountID: argInt(a, "account_id"), Symbol: strings.ToUpper(argStr(a, "symbol")),
		SnapshotDate: argStr(a, "snapshot_date"), Quantity: argStr(a, "quantity"),
		AvgCost: optStr(a, "avg_cost"), CostCurrency: optStr(a, "cost_currency"), Note: optStr(a, "note"),
	}
	if p.AccountID == 0 || p.Symbol == "" {
		return p, store.Account{}, "account_id 与 symbol 必填"
	}
	if p.SnapshotDate == "" {
		p.SnapshotDate = s.today()
	}
	if !validDecimal(p.Quantity) || isNegativeDecimal(p.Quantity) {
		return p, store.Account{}, "quantity 必须是 >= 0 的数字"
	}
	if p.AvgCost != nil && !validDecimal(*p.AvgCost) {
		return p, store.Account{}, "avg_cost 必须是数字"
	}
	if err := domain.ValidateSnapshotDate(p.SnapshotDate, s.cfg.Location); err != nil {
		return p, store.Account{}, err.Error()
	}
	acct, msg := s.lookupAccount(ctx, p.AccountID)
	if msg != "" {
		return p, acct, msg
	}
	if !supportsPositionSnapshots(acct.Kind) {
		return p, acct, "该账户类型不支持录入持仓"
	}
	if p.CostCurrency == nil || strings.TrimSpace(*p.CostCurrency) == "" {
		ccy := acct.Currency
		p.CostCurrency = &ccy
	} else {
		ccy := strings.ToUpper(strings.TrimSpace(*p.CostCurrency))
		if !currencyRe.MatchString(ccy) {
			return p, acct, "cost_currency 必须是 3 位 ISO 代码"
		}
		p.CostCurrency = &ccy
	}
	return p, acct, ""
}

func (s *Server) buildTransferFromArgs(ctx context.Context, a skillArgs) (store.Transfer, string) {
	t := store.Transfer{
		FromAccountID: argInt(a, "from_account_id"), ToAccountID: argInt(a, "to_account_id"),
		FromAmount: argStr(a, "from_amount"), ToAmount: argStr(a, "to_amount"),
		TransferDate: argStr(a, "transfer_date"), Notes: optStr(a, "notes"),
	}
	if t.TransferDate == "" {
		t.TransferDate = s.today()
	}
	if t.FromAccountID == 0 || t.ToAccountID == 0 {
		return t, "from_account_id 与 to_account_id 必填"
	}
	if t.FromAccountID == t.ToAccountID {
		return t, "转出与转入账户不能相同"
	}
	if !validDecimal(t.FromAmount) || !positiveDecimal(t.FromAmount) {
		return t, "from_amount 必须 > 0"
	}
	if !validDecimal(t.ToAmount) || !positiveDecimal(t.ToAmount) {
		return t, "to_amount 必须 > 0"
	}
	if _, err := domain.ParseDate(t.TransferDate, s.cfg.Location); err != nil {
		return t, "transfer_date 必须是 YYYY-MM-DD"
	}
	for _, id := range []int64{t.FromAccountID, t.ToAccountID} {
		if _, msg := s.lookupAccount(ctx, id); msg != "" {
			return t, msg
		}
	}
	return t, ""
}

func (s *Server) buildIncomeEventFromArgs(ctx context.Context, a skillArgs) (store.IncomeEvent, store.Account, string) {
	e := store.IncomeEvent{
		EventKind: strings.ToLower(argStr(a, "event_kind")), EventDate: argStr(a, "event_date"),
		AccountID: argInt(a, "account_id"), Symbol: optStr(a, "symbol"),
		Amount: argStr(a, "amount"), Currency: strings.ToUpper(argStr(a, "currency")),
		TaxWithheld: optStr(a, "tax_withheld"), Note: optStr(a, "note"),
	}
	if id := argInt(a, "payment_account_id"); id != 0 {
		e.PaymentAccountID = &id
	}
	if e.EventDate == "" {
		e.EventDate = s.today()
	}
	if e.Symbol != nil {
		sym := strings.ToUpper(strings.TrimSpace(*e.Symbol))
		if sym == "" {
			e.Symbol = nil
		} else {
			e.Symbol = &sym
		}
	}
	if !incomeKinds[e.EventKind] {
		return e, store.Account{}, "event_kind 必须是 dividend / interest / rebate / other"
	}
	if e.AccountID == 0 {
		return e, store.Account{}, "account_id is required"
	}
	acct, msg := s.lookupAccount(ctx, e.AccountID)
	if msg != "" {
		return e, acct, msg
	}
	if e.Currency == "" {
		e.Currency = acct.Currency
	}
	if e.EventKind == "dividend" && e.Symbol == nil {
		return e, acct, "分红事件必须关联标的"
	}
	if !validMoneyDecimal(e.Amount) || !positiveDecimal(e.Amount) {
		return e, acct, "amount 必须 > 0 且最多两位小数"
	}
	if e.TaxWithheld != nil && (!validMoneyDecimal(*e.TaxWithheld) || isNegativeDecimal(*e.TaxWithheld)) {
		return e, acct, "tax_withheld 必须 >= 0 且最多两位小数"
	}
	if !currencyRe.MatchString(e.Currency) {
		return e, acct, "currency 必须是 3 位 ISO 代码"
	}
	if _, err := domain.ParseDate(e.EventDate, s.cfg.Location); err != nil {
		return e, acct, "event_date 必须是 YYYY-MM-DD"
	}
	if e.PaymentAccountID != nil {
		if _, msg := s.lookupAccount(ctx, *e.PaymentAccountID); msg != "" {
			return e, acct, "payment_account_id " + msg
		}
	}
	return e, acct, ""
}

func (s *Server) buildCorporateActionFromArgs(a skillArgs) (store.CorporateAction, string) {
	c := store.CorporateAction{
		Symbol: strings.ToUpper(argStr(a, "symbol")), Action: strings.ToLower(argStr(a, "action")),
		EventDate: argStr(a, "event_date"), RatioNumerator: argStr(a, "ratio_numerator"),
		RatioDenominator: argStr(a, "ratio_denominator"), Notes: optStr(a, "notes"),
	}
	if c.EventDate == "" {
		c.EventDate = s.today()
	}
	if raw, ok := a["extra"]; ok && raw != nil {
		blob, _ := json.Marshal(raw)
		c.Extra = json.RawMessage(blob)
	}
	if msg := s.normalizeAndValidateCorporateAction(nil, &c); msg != "" {
		return c, msg
	}
	return c, ""
}

func (s *Server) buildPriceFromArgs(a skillArgs) (store.Price, string) {
	p := store.Price{
		Symbol: argStr(a, "symbol"), PriceDate: argStr(a, "price_date"),
		Price: argStr(a, "price"), Currency: argStr(a, "currency"),
		Source: argStr(a, "source"), Note: optStr(a, "note"),
	}
	if p.PriceDate == "" {
		p.PriceDate = s.today()
	}
	normalizePrice(&p)
	if msg := validatePrice(p, s.cfg.Location); msg != "" {
		return p, msg
	}
	return p, ""
}

func (s *Server) buildFxRateFromArgs(a skillArgs) (store.FxRate, string) {
	f := store.FxRate{
		BaseCurrency: argStr(a, "base_currency"), QuoteCurrency: argStr(a, "quote_currency"),
		RateDate: argStr(a, "rate_date"), Rate: argStr(a, "rate"),
		Source: argStr(a, "source"), Note: optStr(a, "note"),
	}
	if f.RateDate == "" {
		f.RateDate = s.today()
	}
	normalizeFxRate(&f)
	if msg := validateFxRate(f, s.cfg.Location); msg != "" {
		return f, msg
	}
	return f, ""
}

func (s *Server) buildAllocationTargetFromArgs(a skillArgs) (store.AllocationTargetSet, string) {
	set := store.AllocationTargetSet{
		ID: argInt(a, "id"), Name: argStr(a, "name"), Dimension: argStr(a, "dimension"),
		DriftThresholdPct: argStr(a, "drift_threshold_pct"), IsDashboardVisible: true,
		IsArchived: argBool(a, "is_archived"), Note: optStr(a, "note"),
	}
	if _, ok := a["is_dashboard_visible"]; ok {
		set.IsDashboardVisible = argBool(a, "is_dashboard_visible")
	}
	if raw, ok := a["items"]; ok && raw != nil {
		blob, _ := json.Marshal(raw)
		_ = json.Unmarshal(blob, &set.Items)
	}
	if msg := normalizeAndValidateTargetSet(&set); msg != "" {
		return set, msg
	}
	return set, ""
}

func (s *Server) buildAnnotationFromArgs(a skillArgs) (store.Annotation, string) {
	ann := store.Annotation{
		AnchorKind: argStr(a, "anchor_kind"), EventDate: argStr(a, "event_date"),
		Label: argStr(a, "label"), Body: optStr(a, "body"), Color: optStr(a, "color"),
	}
	if raw, ok := a["anchor_keys"]; ok && raw != nil {
		blob, _ := json.Marshal(raw)
		ann.AnchorKeys = json.RawMessage(blob)
	}
	if msg := s.normalizeAndValidateAnnotation(&ann); msg != "" {
		return ann, msg
	}
	return ann, ""
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
