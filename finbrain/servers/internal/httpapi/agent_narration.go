package httpapi

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func narrateSkillResult(sk Skill, params skillArgs, result any, rowCount int) string {
	if sk.Type == "draft" {
		return narrateDraftResult(result)
	}
	if sk.Type == "write" {
		if rowCount > 0 {
			return fmt.Sprintf("已写入账本，影响 %d 条记录。", rowCount)
		}
		return "已写入账本。"
	}

	switch v := result.(type) {
	case store.Valuation:
		return narrateValuation(v)
	case []store.ValuationPosition:
		return narrateValuationPositions(v, displayCurrency(params))
	case []store.PositionSnapshot:
		return narratePositionSnapshots(v)
	case []store.Account:
		return narrateAccounts(v)
	case store.Account:
		return narrateAccount(v)
	case []store.Institution:
		return narrateInstitutions(v)
	case store.PriceList:
		return narratePriceList(v)
	case store.FxRateList:
		return narrateFxRateList(v)
	case store.AccountReconciliation:
		return narrateReconciliation(v)
	case store.AttributionResult:
		return narrateAttribution(v)
	case store.AllocationTargetSet:
		return narrateTargetSet(v)
	case []any:
		return narrateAnyList(v, rowCount)
	}
	if rowCount == 0 {
		return "没有查到匹配结果。"
	}
	return fmt.Sprintf("查到 %d 条结果，结构化明细已放在详情里。", rowCount)
}

func narrateValuation(v store.Valuation) string {
	ccy := fallback(v.DisplayCurrency, "CNY")
	asOf := ""
	if v.AsOf != "" {
		asOf = "截至 " + v.AsOf + "，"
	}
	parts := []string{
		fmt.Sprintf("%s净资产 %s；总资产 %s，负债 %s。", asOf, moneyShort(v.NetWorth, ccy), moneyShort(v.TotalAssets, ccy), moneyShort(v.TotalLiabilities, ccy)),
	}

	structure := fmt.Sprintf("资产结构：现金 %s，持仓 %s。", moneyShort(v.CashValue, ccy), moneyShort(v.PositionValue, ccy))
	if v.PositionShare != nil && strings.TrimSpace(*v.PositionShare) != "" {
		structure = fmt.Sprintf("资产结构：现金 %s，持仓 %s（持仓占净资产 %s）。", moneyShort(v.CashValue, ccy), moneyShort(v.PositionValue, ccy), percentText(*v.PositionShare))
	}
	parts = append(parts, structure)

	if nonZeroDecimal(v.UnrealizedPL) || nonZeroDecimal(v.RealizedPLYtd) || nonZeroDecimal(v.IncomeYtd) {
		plPct := ""
		if v.UnrealizedPLPct != nil && strings.TrimSpace(*v.UnrealizedPLPct) != "" {
			plPct = "（" + signedPercentText(*v.UnrealizedPLPct) + "）"
		}
		parts = append(parts, fmt.Sprintf("持仓浮动盈亏 %s%s；今年已实现盈亏 %s，收益事件 %s。", signedMoneyShort(v.UnrealizedPL, ccy), plPct, signedMoneyShort(v.RealizedPLYtd, ccy), signedMoneyShort(v.IncomeYtd, ccy)))
	}

	if s := topAllocationText(v.Allocations); s != "" {
		parts = append(parts, s)
	}
	if len(v.Warnings) > 0 {
		msg := strings.TrimSpace(v.Warnings[0].Message)
		if msg == "" {
			msg = "存在需要核对的数据提醒"
		}
		if len(v.Warnings) == 1 {
			parts = append(parts, "另有 1 条数据提醒："+msg+"。")
		} else {
			parts = append(parts, fmt.Sprintf("另有 %d 条数据提醒，先看第一条：%s。", len(v.Warnings), msg))
		}
	}
	return strings.Join(parts, "\n")
}

func narrateValuationPositions(rows []store.ValuationPosition, ccy string) string {
	if len(rows) == 0 {
		return "当前没有持仓。"
	}
	sorted := append([]store.ValuationPosition(nil), rows...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return decimalValue(ptrString(sorted[i].MarketValueDisplay)) > decimalValue(ptrString(sorted[j].MarketValueDisplay))
	})

	total := 0.0
	hasValue := false
	missing := 0
	for _, r := range rows {
		if r.MissingPrice {
			missing++
		}
		if r.MarketValueDisplay != nil {
			total += decimalValue(*r.MarketValueDisplay)
			hasValue = true
		}
	}
	head := fmt.Sprintf("当前共有 %d 个持仓项。", len(rows))
	if hasValue {
		head = fmt.Sprintf("当前共有 %d 个持仓项，总市值约 %s。", len(rows), moneyShort(strconv.FormatFloat(total, 'f', 2, 64), ccy))
	}
	tops := make([]string, 0, 3)
	for _, r := range sorted {
		if len(tops) >= 3 {
			break
		}
		label := positionLabel(r)
		if r.Weight != nil && strings.TrimSpace(*r.Weight) != "" {
			label += " " + percentText(*r.Weight)
		} else if r.MarketValueDisplay != nil {
			label += " " + moneyShort(*r.MarketValueDisplay, ccy)
		}
		tops = append(tops, label)
	}
	if len(tops) > 0 {
		head += " 权重靠前的是 " + strings.Join(tops, "、") + "。"
	}
	if missing > 0 {
		head += fmt.Sprintf(" 其中 %d 项缺价格，估值需要先补价格数据。", missing)
	}
	return head
}

func narratePositionSnapshots(rows []store.PositionSnapshot) string {
	if len(rows) == 0 {
		return "这个账户当前没有持仓快照。"
	}
	labels := make([]string, 0, minInt(3, len(rows)))
	for _, r := range rows {
		if len(labels) >= 3 {
			break
		}
		labels = append(labels, fmt.Sprintf("%s %s 股/份", r.Symbol, trimDecimal(r.Quantity)))
	}
	return fmt.Sprintf("这个账户查到 %d 条持仓快照，主要包括 %s。", len(rows), strings.Join(labels, "、"))
}

func narrateAccounts(rows []store.Account) string {
	if len(rows) == 0 {
		return "当前还没有账户。"
	}
	archived := 0
	byKind := map[string]int{}
	for _, r := range rows {
		if r.IsArchived {
			archived++
		}
		byKind[r.Kind]++
	}
	return fmt.Sprintf("当前共有 %d 个账户，%d 个在用、%d 个已归档。类型分布：%s。", len(rows), len(rows)-archived, archived, countMapText(byKind))
}

func narrateAccount(a store.Account) string {
	status := "在用"
	if a.IsArchived {
		status = "已归档"
	}
	bal := "暂无余额快照"
	if a.CurrentBalance != nil && strings.TrimSpace(*a.CurrentBalance) != "" {
		bal = "当前余额 " + moneyShort(*a.CurrentBalance, a.Currency)
	}
	return fmt.Sprintf("%s · %s 是一个%s账户，币种 %s，状态为%s；%s。", a.Institution, a.Name, friendlyKey(a.Kind), a.Currency, status, bal)
}

func narrateInstitutions(rows []store.Institution) string {
	if len(rows) == 0 {
		return "当前还没有机构。"
	}
	sorted := append([]store.Institution(nil), rows...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].AccountCount > sorted[j].AccountCount })
	tops := make([]string, 0, minInt(3, len(sorted)))
	for _, r := range sorted {
		if len(tops) >= 3 {
			break
		}
		tops = append(tops, fmt.Sprintf("%s %d 个账户", r.Name, r.AccountCount))
	}
	return fmt.Sprintf("当前共有 %d 家机构；账户较多的是 %s。", len(rows), strings.Join(tops, "、"))
}

func narratePriceList(list store.PriceList) string {
	items := append([]store.Price(nil), list.Items...)
	if len(items) == 0 {
		return "没有查到这个标的的价格记录。"
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].PriceDate < items[j].PriceDate })
	first, latest := items[0], items[len(items)-1]
	extra := ""
	if list.Truncated {
		extra = " 返回结果被截断，详情里只包含部分记录。"
	}
	return fmt.Sprintf("%s 查到 %d 个价格点，覆盖 %s 至 %s；最新价是 %s %s，来源 %s。%s", latest.Symbol, len(items), first.PriceDate, latest.PriceDate, latest.Currency, trimDecimal(latest.Price), fallback(latest.Source, "未标注"), extra)
}

func narrateFxRateList(list store.FxRateList) string {
	items := append([]store.FxRate(nil), list.Items...)
	if len(items) == 0 {
		return "没有查到这组货币的汇率记录。"
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].RateDate < items[j].RateDate })
	first, latest := items[0], items[len(items)-1]
	extra := ""
	if list.Truncated {
		extra = " 返回结果被截断，详情里只包含部分记录。"
	}
	return fmt.Sprintf("%s/%s 查到 %d 个汇率点，覆盖 %s 至 %s；最新汇率是 %s，来源 %s。%s", latest.BaseCurrency, latest.QuoteCurrency, len(items), first.RateDate, latest.RateDate, trimDecimal(latest.Rate), fallback(latest.Source, "未标注"), extra)
}

func narrateReconciliation(v store.AccountReconciliation) string {
	status := "差额在阈值内"
	if v.OverThreshold {
		status = "差额超过阈值，需要核对"
	}
	snap := "无快照基准"
	if v.SnapshotDate != nil {
		snap = "快照日 " + *v.SnapshotDate
	}
	parts := []string{
		fmt.Sprintf("%s 的现金对账：%s，快照余额 %s，按流水回放应为 %s，差额 %s，%s。", v.AccountName, snap, moneyShort(v.SnapshotBalance, v.Currency), moneyShort(v.Expected, v.Currency), signedMoneyShort(v.Delta, v.Currency), status),
	}
	if len(v.Events) > 0 {
		parts = append(parts, fmt.Sprintf("回放中包含 %d 条现金事件。", len(v.Events)))
	}
	if len(v.PositionDeltas) > 0 {
		parts = append(parts, fmt.Sprintf("另有 %d 个标的的回放数量与快照不一致。", len(v.PositionDeltas)))
	}
	return strings.Join(parts, " ")
}

func narrateAttribution(v store.AttributionResult) string {
	ccy := fallback(v.DisplayCurrency, "CNY")
	return fmt.Sprintf("%s 到 %s 净资产变化 %s；归因拆分为价格 %s、数量/现金流 %s、收益 %s、汇率 %s。", v.From, v.To, signedMoneyShort(v.NetChange, ccy), signedMoneyShort(v.PriceEffect, ccy), signedMoneyShort(v.QuantityEffect, ccy), signedMoneyShort(v.IncomeEffect, ccy), signedMoneyShort(v.FxEffect, ccy))
}

func narrateAnyList(rows []any, rowCount int) string {
	if len(rows) == 0 {
		return "没有查到匹配结果。"
	}
	if _, ok := rows[0].(store.AllocationTargetSet); ok {
		over := 0
		names := []string{}
		for _, raw := range rows {
			s, ok := raw.(store.AllocationTargetSet)
			if !ok {
				continue
			}
			names = append(names, s.Name)
			for _, it := range s.Items {
				if it.OverThreshold != nil && *it.OverThreshold {
					over++
				}
			}
		}
		if over > 0 {
			return fmt.Sprintf("共有 %d 套目标配置，当前有 %d 项超过漂移阈值；目标集包括 %s。", len(rows), over, strings.Join(limitStrings(names, 3), "、"))
		}
		return fmt.Sprintf("共有 %d 套目标配置，目前没有项目超过漂移阈值；目标集包括 %s。", len(rows), strings.Join(limitStrings(names, 3), "、"))
	}
	return fmt.Sprintf("查到 %d 条结果，结构化明细已放在详情里。", maxInt(rowCount, len(rows)))
}

func narrateTargetSet(set store.AllocationTargetSet) string {
	over := []store.AllocationTargetItem{}
	var largest *store.AllocationTargetItem
	largestAbs := -1.0
	for i := range set.Items {
		it := &set.Items[i]
		if it.OverThreshold != nil && *it.OverThreshold {
			over = append(over, *it)
		}
		if it.Drift != nil {
			abs := math.Abs(decimalValue(*it.Drift))
			if abs > largestAbs {
				largestAbs = abs
				largest = it
			}
		}
	}
	head := fmt.Sprintf("目标「%s」按%s管理，共 %d 项。", set.Name, friendlyKey(set.Dimension), len(set.Items))
	if len(over) == 0 {
		head += "当前没有项目超过漂移阈值。"
	} else {
		head += fmt.Sprintf("有 %d 项超过 %.2f%% 的漂移阈值。", len(over), decimalValue(set.DriftThresholdPct))
	}
	if largest != nil && largest.Drift != nil {
		actual := ""
		if largest.ActualPct != nil {
			actual = "，当前 " + percentText(*largest.ActualPct)
		}
		rebalance := ""
		if largest.Rebalance != nil && nonZeroDecimal(*largest.Rebalance) && set.NetWorth != nil {
			rebalance = "，建议调整约 " + signedMoneyShort(*largest.Rebalance, "CNY")
		}
		head += fmt.Sprintf(" 偏离最大的是 %s：目标 %s%s，偏离 %s%s。", friendlyKey(largest.DimensionValue), percentText(largest.TargetPct), actual, signedPercentText(*largest.Drift), rebalance)
	}
	return head
}

func narrateDraftResult(result any) string {
	m, ok := resultMap(result)
	if !ok {
		return "我已整理成一条待确认草稿；确认后才会写入账本。"
	}
	entity := mapString(m, "entity")
	label := draftEntityLabel(entity)
	accountText := draftAccountText(m["account"])
	fields, _ := resultMap(m["fields"])
	main := "我已整理成一条待确认的「" + label + "」草稿"
	if accountText != "" {
		main += "，账户是 " + accountText
	}
	if text := draftFieldsText(entity, fields); text != "" {
		main += "；" + text
	}
	return main + "。确认后才会写入账本。"
}

func resultMap(v any) (map[string]any, bool) {
	if m, ok := v.(map[string]any); ok {
		return m, true
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, false
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, false
	}
	return out, true
}

func draftFieldsText(entity string, fields map[string]any) string {
	if len(fields) == 0 {
		return ""
	}
	keys := map[string][]string{
		"balance_snapshot":      {"snapshot_date", "balance"},
		"transaction":           {"trade_date", "action", "symbol", "quantity", "price", "currency"},
		"credit_card_bill":      {"statement_date", "amount_total", "currency", "paid_at"},
		"position_snapshot":     {"snapshot_date", "symbol", "quantity", "avg_cost", "cost_currency"},
		"transfer":              {"transfer_date", "from_amount", "to_amount"},
		"income_event":          {"event_date", "event_kind", "symbol", "amount", "currency"},
		"corporate_action":      {"event_date", "symbol", "action", "ratio_numerator", "ratio_denominator"},
		"price":                 {"price_date", "symbol", "price", "currency", "source"},
		"fx_rate":               {"rate_date", "base_currency", "quote_currency", "rate", "source"},
		"allocation_target_set": {"name", "dimension", "drift_threshold_pct"},
		"annotation":            {"event_date", "label", "anchor_kind"},
	}
	use := keys[entity]
	if len(use) == 0 {
		for k := range fields {
			use = append(use, k)
		}
		sort.Strings(use)
	}
	parts := []string{}
	for _, k := range use {
		if len(parts) >= 5 {
			break
		}
		v, ok := fields[k]
		if !ok || v == nil || fmt.Sprint(v) == "" {
			continue
		}
		parts = append(parts, fieldLabel(k)+" "+draftValue(k, v))
	}
	if len(parts) == 0 {
		return ""
	}
	return "关键字段为 " + strings.Join(parts, "、")
}

func draftAccountText(v any) string {
	m, ok := resultMap(v)
	if !ok {
		return ""
	}
	inst, name, ccy := mapString(m, "institution"), mapString(m, "name"), mapString(m, "currency")
	parts := []string{}
	if inst != "" {
		parts = append(parts, inst)
	}
	if name != "" {
		parts = append(parts, name)
	}
	out := strings.Join(parts, " · ")
	if ccy != "" {
		out += "（" + ccy + "）"
	}
	return strings.TrimSpace(out)
}

func topAllocationText(alloc map[string][]store.ValuationBucket) string {
	if len(alloc) == 0 {
		return ""
	}
	buckets := alloc["kind"]
	dim := "账户用途"
	if len(buckets) == 0 {
		keys := make([]string, 0, len(alloc))
		for k := range alloc {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buckets = alloc[keys[0]]
		dim = friendlyKey(keys[0])
	}
	if len(buckets) == 0 {
		return ""
	}
	sorted := append([]store.ValuationBucket(nil), buckets...)
	sort.SliceStable(sorted, func(i, j int) bool { return decimalValue(sorted[i].Percent) > decimalValue(sorted[j].Percent) })
	parts := make([]string, 0, minInt(3, len(sorted)))
	for _, b := range sorted {
		if len(parts) >= 3 {
			break
		}
		name := friendlyKey(fallback(b.Name, b.Key))
		parts = append(parts, fmt.Sprintf("%s %s", name, percentText(b.Percent)))
	}
	return fmt.Sprintf("按%s看，前三项是 %s。", dim, strings.Join(parts, "、"))
}

func positionLabel(p store.ValuationPosition) string {
	name := ""
	if p.DisplayName != nil {
		name = strings.TrimSpace(*p.DisplayName)
	}
	if name == "" {
		return p.Symbol
	}
	return p.Symbol + " " + name
}

func countMapText(m map[string]int) string {
	type row struct {
		key string
		n   int
	}
	rows := make([]row, 0, len(m))
	for k, n := range m {
		rows = append(rows, row{k, n})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].n == rows[j].n {
			return rows[i].key < rows[j].key
		}
		return rows[i].n > rows[j].n
	})
	parts := make([]string, 0, minInt(4, len(rows)))
	for _, r := range rows {
		if len(parts) >= 4 {
			break
		}
		parts = append(parts, fmt.Sprintf("%s %d 个", friendlyKey(r.key), r.n))
	}
	return strings.Join(parts, "、")
}

func displayCurrency(params skillArgs) string {
	if params == nil {
		return "CNY"
	}
	if s := strings.ToUpper(argStr(params, "display_currency")); s != "" {
		return s
	}
	return "CNY"
}

func moneyShort(s, ccy string) string {
	n, ok := parseNumber(s)
	if !ok {
		if strings.TrimSpace(s) == "" {
			return ccySymbol(ccy) + "0"
		}
		return strings.TrimSpace(ccy + " " + s)
	}
	return ccySymbol(ccy) + shortAbs(n)
}

func signedMoneyShort(s, ccy string) string {
	n, ok := parseNumber(s)
	if !ok {
		return moneyShort(s, ccy)
	}
	if math.Abs(n) < 0.000001 {
		return ccySymbol(ccy) + "0"
	}
	if n > 0 {
		return "+" + ccySymbol(ccy) + shortAbs(n)
	}
	return "-" + ccySymbol(ccy) + shortAbs(n)
}

func shortAbs(n float64) string {
	n = math.Abs(n)
	switch {
	case n >= 100000000:
		return fmt.Sprintf("%.2f亿", n/100000000)
	case n >= 10000:
		return fmt.Sprintf("%.2f万", n/10000)
	case n >= 1000:
		return commaNumber(n, 2)
	default:
		return trimDecimal(fmt.Sprintf("%.2f", n))
	}
}

func commaNumber(n float64, decimals int) string {
	s := fmt.Sprintf("%.*f", decimals, n)
	parts := strings.SplitN(s, ".", 2)
	intPart := parts[0]
	out := ""
	for len(intPart) > 3 {
		out = "," + intPart[len(intPart)-3:] + out
		intPart = intPart[:len(intPart)-3]
	}
	out = intPart + out
	if len(parts) == 2 {
		out += "." + parts[1]
	}
	return out
}

func ccySymbol(ccy string) string {
	switch strings.ToUpper(strings.TrimSpace(ccy)) {
	case "CNY":
		return "¥"
	case "USD":
		return "$"
	case "HKD":
		return "HK$"
	case "JPY":
		return "¥"
	default:
		if strings.TrimSpace(ccy) == "" {
			return ""
		}
		return strings.ToUpper(strings.TrimSpace(ccy)) + " "
	}
}

func percentText(s string) string {
	n, ok := parseNumber(s)
	if !ok {
		return strings.TrimSpace(s)
	}
	return trimDecimal(fmt.Sprintf("%.2f", n)) + "%"
}

func signedPercentText(s string) string {
	n, ok := parseNumber(s)
	if !ok {
		return percentText(s)
	}
	if math.Abs(n) < 0.000001 {
		return "0%"
	}
	if n > 0 {
		return "+" + percentText(s)
	}
	return "-" + percentText(strconv.FormatFloat(math.Abs(n), 'f', 4, 64))
}

func parseNumber(s string) (float64, bool) {
	t := strings.TrimSpace(strings.ReplaceAll(s, ",", ""))
	if t == "" {
		return 0, false
	}
	n, err := strconv.ParseFloat(t, 64)
	return n, err == nil
}

func decimalValue(s string) float64 {
	n, _ := parseNumber(s)
	return n
}

func nonZeroDecimal(s string) bool {
	return math.Abs(decimalValue(s)) >= 0.000001
}

func trimDecimal(s string) string {
	s = strings.TrimSpace(s)
	if !strings.Contains(s, ".") {
		return s
	}
	s = strings.TrimRight(s, "0")
	return strings.TrimRight(s, ".")
}

func ptrString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func fallback(s, alt string) string {
	if strings.TrimSpace(s) == "" {
		return alt
	}
	return strings.TrimSpace(s)
}

func friendlyKey(s string) string {
	labels := map[string]string{
		"brokerage":        "证券",
		"wealth_product":   "理财",
		"cash":             "现金",
		"fund":             "基金",
		"credit_card":      "信用卡",
		"time_deposit":     "定期",
		"crypto_wallet":    "加密钱包",
		"bank":             "银行",
		"broker":           "券商",
		"exchange":         "交易所",
		"wallet":           "钱包",
		"kind":             "账户用途",
		"asset_kind":       "资产类型",
		"currency":         "账户币种",
		"quote_currency":   "真实计价币种",
		"market":           "市场",
		"institution":      "机构",
		"equity":           "股票",
		"bond":             "债券",
		"fund_asset":       "基金",
		"buy":              "买入",
		"sell":             "卖出",
		"dividend":         "分红",
		"interest":         "利息",
		"rebate":           "返现",
		"other":            "其他",
		"split":            "拆股",
		"merge":            "合股",
		"rights":           "配股",
		"balance_snapshot": "余额快照",
	}
	if v, ok := labels[strings.TrimSpace(s)]; ok {
		return v
	}
	return strings.TrimSpace(s)
}

func draftEntityLabel(entity string) string {
	labels := map[string]string{
		"balance_snapshot":      "余额快照",
		"transaction":           "持仓交易",
		"credit_card_bill":      "信用卡账单",
		"position_snapshot":     "持仓快照",
		"transfer":              "账户转账",
		"income_event":          "收益事件",
		"corporate_action":      "公司动作",
		"price":                 "标的价格",
		"fx_rate":               "汇率",
		"allocation_target_set": "资产配置目标",
		"annotation":            "时间线标注",
	}
	if v, ok := labels[entity]; ok {
		return v
	}
	return fallback(entity, "记录")
}

func fieldLabel(k string) string {
	labels := map[string]string{
		"snapshot_date":       "日期",
		"balance":             "余额",
		"trade_date":          "交易日",
		"action":              "方向",
		"symbol":              "标的",
		"quantity":            "数量",
		"price":               "价格",
		"currency":            "币种",
		"statement_date":      "出账日",
		"amount_total":        "账单金额",
		"paid_at":             "还款日",
		"avg_cost":            "成本价",
		"cost_currency":       "成本币种",
		"transfer_date":       "转账日",
		"from_amount":         "转出金额",
		"to_amount":           "转入金额",
		"event_date":          "事件日",
		"event_kind":          "类型",
		"amount":              "金额",
		"ratio_numerator":     "比例分子",
		"ratio_denominator":   "比例分母",
		"price_date":          "价格日",
		"source":              "来源",
		"rate_date":           "汇率日",
		"base_currency":       "基准币种",
		"quote_currency":      "目标币种",
		"rate":                "汇率",
		"name":                "名称",
		"dimension":           "维度",
		"drift_threshold_pct": "漂移阈值",
		"label":               "标题",
		"anchor_kind":         "锚点",
	}
	if v, ok := labels[k]; ok {
		return v
	}
	return k
}

func draftValue(k string, v any) string {
	s := strings.TrimSpace(fmt.Sprint(v))
	switch k {
	case "action", "event_kind", "dimension", "anchor_kind":
		return friendlyKey(s)
	default:
		return trimDecimal(s)
	}
}

func mapString(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

func limitStrings(in []string, n int) []string {
	out := []string{}
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		out = append(out, s)
		if len(out) >= n {
			break
		}
	}
	return out
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
