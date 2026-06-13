/* finbrain UI kit — mock data (single owner, multi-institution, multi-currency).
   Attached to window for sharing across Babel script files. Figures in display
   currency CNY unless a native currency is noted. */
(function () {
  // ---- FX (display helper) — 1 unit base = rate CNY ----
  const FX = { CNY: 1, USD: 7.20, HKD: 0.918, JPY: 0.048, EUR: 7.78 };
  const SYM = { CNY: "¥", USD: "$", HKD: "HK$", JPY: "¥", EUR: "€" };
  // display-only label maps — underlying `kind` / `asset_kind` codes stay English for logic
  const KIND_CN = { cash: "活期", time_deposit: "定期", wealth_product: "理财", fund: "基金", brokerage: "证券", credit_card: "信用卡", crypto_wallet: "加密钱包" };
  const ASSET_CN = { equity: "股票", fund: "基金", etf: "ETF", crypto: "加密", bond: "债券", index: "指数", other: "其他" };
  // convert a native amount into a display currency
  function conv(amount, fromCcy, toCcy) {
    if (fromCcy === toCcy) return amount;
    const cny = amount * (FX[fromCcy] || 1);
    return cny / (FX[toCcy] || 1);
  }
  // compact label for an amount ALREADY in display ccy
  function short(v, ccy) {
    const s = SYM[ccy] || (ccy + " ");
    const a = Math.abs(v);
    if (ccy === "CNY") {
      if (a >= 1e8) return (v < 0 ? "−" : "") + s + (a / 1e8).toFixed(2) + "亿";
      if (a >= 1e4) return (v < 0 ? "−" : "") + s + (a / 1e4).toFixed(a >= 1e6 ? 0 : 1) + "万";
      return (v < 0 ? "−" : "") + s + a.toFixed(0);
    }
    if (a >= 1e6) return (v < 0 ? "−" : "") + s + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (v < 0 ? "−" : "") + s + (a / 1e3).toFixed(1) + "K";
    return (v < 0 ? "−" : "") + s + a.toFixed(0);
  }
  // convert a CNY figure into display ccy (for components that just format)
  function disp(cnyVal, ccy) { return conv(cnyVal, "CNY", ccy); }

  // ---- Net-worth monthly series (CNY), last 13 months ----
  const nwSeries = [
    { m: "2025-06", v: 2386000 }, { m: "2025-07", v: 2421500 }, { m: "2025-08", v: 2398200 },
    { m: "2025-09", v: 2452800 }, { m: "2025-10", v: 2510400 }, { m: "2025-11", v: 2488900 },
    { m: "2025-12", v: 2563200 }, { m: "2026-01", v: 2604700 }, { m: "2026-02", v: 2641000 },
    { m: "2026-03", v: 2702300 }, { m: "2026-04", v: 2761800 }, { m: "2026-05", v: 2762450 },
    { m: "2026-06", v: 2847219.5 },
  ];
  const hsiSeries = [100, 101.4, 99.2, 102.8, 105.1, 103.0, 106.9, 108.2, 107.0, 110.4, 113.8, 112.0, 115.7];
  const spxSeries = [100, 102.1, 103.0, 101.2, 104.8, 106.9, 109.2, 111.0, 113.4, 112.1, 116.8, 119.2, 121.5];

  // ---- Allocation by dimension (CNY) ----
  const byKind = [
    { name: "证券", value: 1486000, color: "var(--viz-1)" },
    { name: "活期", value: 624000, color: "var(--viz-2)" },
    { name: "理财", value: 540000, color: "var(--viz-3)" },
    { name: "定期", value: 210000, color: "var(--viz-6)" },
    { name: "基金", value: 113781, color: "var(--viz-4)" },
    { name: "加密钱包", value: 132219, color: "var(--viz-5)" },
  ];
  const byCurrency = [
    { name: "CNY", value: 1180000, color: "var(--viz-2)" },
    { name: "USD", value: 980000, color: "var(--viz-1)" },
    { name: "HKD", value: 612219, color: "var(--viz-3)" },
    { name: "其他", value: 75000, color: "var(--viz-8)" },
  ];
  const byQuoteCcy = [
    { name: "USD", value: 1240000, color: "var(--viz-1)" },
    { name: "CNY", value: 940000, color: "var(--viz-2)" },
    { name: "HKD", value: 560219, color: "var(--viz-3)" },
    { name: "其他", value: 107000, color: "var(--viz-8)" },
  ];
  const byInstitution = [
    { name: "富途证券", value: 1180000, color: "var(--viz-1)" },
    { name: "汇丰 HK", value: 690000, color: "var(--viz-4)" },
    { name: "招商银行", value: 612000, color: "var(--viz-2)" },
    { name: "中银香港", value: 233000, color: "var(--viz-6)" },
    { name: "Binance", value: 132219, color: "var(--viz-5)" },
  ];
  const byMarket = [
    { name: "US", value: 1240000, color: "var(--viz-1)" },
    { name: "HK", value: 412000, color: "var(--viz-3)" },
    { name: "CN", value: 286000, color: "var(--viz-2)" },
    { name: "CRYPTO", value: 132219, color: "var(--viz-5)" },
  ];

  // ---- Accounts grouped by institution ----
  const accounts = [
    { inst: "富途证券", items: [
      { id: 1, name: "美股账户", kind: "brokerage", ccy: "USD", balance: 237.62, value: 712400, updated: "2026-06-05", mode: "txn", spark: [62,64,63,67,70,69,72] },
      { id: 2, name: "港股账户", kind: "brokerage", ccy: "HKD", balance: 4820, value: 318600, updated: "2026-06-05", mode: "txn", spark: [40,39,41,38,37,39,42] },
    ]},
    { inst: "汇丰 HK", items: [
      { id: 3, name: "港币活期", kind: "cash", ccy: "HKD", balance: 286400, value: 263488, updated: "2026-06-01", mode: "snapshot", spark: [26,26,25,26,26,26,26] },
      { id: 4, name: "美元定期", kind: "time_deposit", ccy: "USD", balance: 29200, value: 210240, updated: "2026-05-31", mode: "snapshot", spark: [21,21,21,21,21,21,21] },
      { id: 5, name: "结构性理财", kind: "wealth_product", ccy: "USD", balance: 30100, value: 216720, updated: "2026-05-28", mode: "snapshot", spark: [20,21,21,22,22,21,22] },
    ]},
    { inst: "招商银行", items: [
      { id: 6, name: "活期 6231", kind: "cash", ccy: "CNY", balance: 348000, value: 348000, updated: "2026-06-08", mode: "snapshot", spark: [33,34,34,35,34,35,35] },
      { id: 7, name: "朝朝盈理财", kind: "wealth_product", ccy: "CNY", balance: 323280, value: 323280, updated: "2026-06-02", mode: "snapshot", spark: [31,32,32,32,32,32,32] },
      { id: 10, name: "基金账户", kind: "fund", ccy: "CNY", balance: 0, value: 113781, updated: "2026-06-02", mode: "snapshot", spark: [13,12,12,11,11,11,11] },
      { id: 8, name: "信用卡合计", kind: "credit_card", ccy: "CNY", balance: 18640, value: -18640, updated: "2026-06-03", isLiability: true, mode: "bill", spark: [12,15,11,18,14,16,19] },
    ]},
    { inst: "中银香港", items: [
      { id: 11, name: "港元储蓄", kind: "cash", ccy: "HKD", balance: 253812, value: 233000, updated: "2026-05-20", mode: "snapshot", spark: [23,23,23,23,23,23,23] },
    ]},
    { inst: "Binance", items: [
      { id: 9, name: "现货钱包", kind: "crypto_wallet", ccy: "USD", balance: 1240, value: 132219, updated: "2026-06-10", mode: "txn", spark: [9,11,10,13,12,14,13] },
    ]},
  ];
  const flatAccounts = accounts.flatMap((g) => g.items.map((a) => ({ ...a, inst: g.inst })));
  const accountById = Object.fromEntries(flatAccounts.map((a) => [a.id, a]));

  // ---- Holdings (positions) — full metric set; native figures in qccy ----
  const holdings = [
    { sym: "GOOG", name: "Alphabet", acctId: 1, acct: "富途·美股", inst: "富途证券", market: "US", qccy: "USD", qty: 18, avgCost: 142.30, effCost: 128.10, price: 184.25, costBasis: 2561.4, mktVal: 3316.5, plPct: 29.5, realized: 1280, income: 312, weight: 22.4, hasPrice: true, settled: true, spark:[142,150,148,162,170,178,184], lastTx:"2026-04-12", first:"2024-08-15" },
    { sym: "NVDA", name: "NVIDIA", acctId: 1, acct: "富途·美股", inst: "富途证券", market: "US", qccy: "USD", qty: 12, avgCost: 118.00, effCost: 118.00, price: 168.40, costBasis: 1416, mktVal: 2020.8, plPct: 42.7, realized: 0, income: 0, weight: 13.6, hasPrice: true, settled: true, spark:[118,124,130,142,151,160,168], lastTx:"2026-05-02", first:"2025-12-03" },
    { sym: "NTDOY", name: "任天堂", acctId: 1, acct: "富途·美股", inst: "富途证券", market: "US", qccy: "USD", qty: 60, avgCost: 17.115, effCost: 15.90, price: 19.80, costBasis: 1026.9, mktVal: 1188, plPct: 15.7, realized: 240, income: 88, weight: 8.0, hasPrice: true, settled: false, spark:[17,17.5,18,18.4,19,19.2,19.8], lastTx:"2026-03-21", first:"2025-09-10" },
    { sym: "0700.HK", name: "腾讯控股", acctId: 2, acct: "富途·港股", inst: "富途证券", market: "HK", qccy: "HKD", qty: 200, avgCost: 372.80, effCost: 372.80, price: 401.20, costBasis: 74560, mktVal: 80240, plPct: 7.6, realized: 0, income: 1840, weight: 30.4, hasPrice: true, settled: true, spark:[372,368,375,382,390,395,401], lastTx:"2026-02-18", first:"2025-07-22" },
    { sym: "9988.HK", name: "阿里巴巴", acctId: 2, acct: "富途·港股", inst: "富途证券", market: "HK", qccy: "HKD", qty: 300, avgCost: 78.40, effCost: 81.20, price: 74.90, costBasis: 23520, mktVal: 22470, plPct: -4.5, realized: -620, income: 0, weight: 8.5, hasPrice: true, settled: true, spark:[78,80,77,75,76,74,74.9], lastTx:"2026-05-19", first:"2026-01-08" },
    { sym: "161725.OF", name: "招商中证白酒", acctId: 10, acct: "招行·基金", inst: "招商银行", market: "CN", qccy: "CNY", qty: 12000, avgCost: 1.082, effCost: 1.082, price: 0.948, costBasis: 12984, mktVal: 11376, plPct: -12.4, realized: 0, income: 0, weight: 4.3, hasPrice: true, settled: true, spark:[1.08,1.05,1.02,0.99,0.97,0.95,0.948], lastTx:"2025-11-08", first:"2025-06-30" },
    { sym: "BTC", name: "Bitcoin", acctId: 9, acct: "Binance·现货", inst: "Binance", market: "CRYPTO", qccy: "USD", qty: 0.42, avgCost: 38200, effCost: 31400, price: 43800, costBasis: 16044, mktVal: 18396, plPct: 14.7, realized: 2860, income: 0, weight: 7.0, hasPrice: true, settled: true, spark:[38,40,39,42,41,43,43.8], lastTx:"2026-06-01", first:"2025-10-12" },
    { sym: "MU", name: "美光科技", acctId: 1, acct: "富途·美股", inst: "富途证券", market: "US", qccy: "USD", qty: 6, avgCost: 399.75, effCost: 399.75, price: null, costBasis: 2398.5, mktVal: null, plPct: null, realized: 0, income: 0, weight: null, hasPrice: false, settled: false, spark:[], lastTx:"2026-05-05", first:"2026-05-05" },
  ];

  // ---- Transactions (持仓交易) ----
  const transactions = [
    { id: 101, acctId: 1, acct: "富途·美股", sym: "GOOG", action: "buy", date: "2026-04-12", settle: "2026-04-15", qty: 6, price: 168.40, ccy: "USD", fee: 1.20, settled: true },
    { id: 102, acctId: 1, acct: "富途·美股", sym: "NVDA", action: "buy", date: "2026-05-02", settle: "2026-05-05", qty: 12, price: 118.00, ccy: "USD", fee: 1.50, settled: true },
    { id: 103, acctId: 1, acct: "富途·美股", sym: "NTDOY", action: "sell", date: "2026-03-21", settle: "2026-03-24", qty: 20, price: 18.20, ccy: "USD", fee: 0.80, settled: true },
    { id: 104, acctId: 1, acct: "富途·美股", sym: "MU", action: "buy", date: "2026-05-05", settle: null, qty: 6, price: 399.75, ccy: "USD", fee: null, settled: false },
    { id: 105, acctId: 2, acct: "富途·港股", sym: "0700.HK", action: "buy", date: "2026-02-18", settle: "2026-02-20", qty: 100, price: 368.00, ccy: "HKD", fee: 22.00, settled: true },
    { id: 106, acctId: 2, acct: "富途·港股", sym: "9988.HK", action: "sell", date: "2026-05-19", settle: "2026-05-21", qty: 100, price: 75.10, ccy: "HKD", fee: 18.40, settled: true },
    { id: 107, acctId: 9, acct: "Binance·现货", sym: "BTC", action: "buy", date: "2026-06-01", settle: "2026-06-01", qty: 0.12, price: 41200, ccy: "USD", fee: 4.94, settled: true },
    { id: 108, acctId: 9, acct: "Binance·现货", sym: "BTC", action: "sell", date: "2026-04-08", settle: "2026-04-08", qty: 0.08, price: 44600, ccy: "USD", fee: 3.10, settled: true },
    { id: 109, acctId: 1, acct: "富途·美股", sym: "NVDA", action: "buy", date: "2025-12-03", settle: "2025-12-05", qty: 12, price: 118.00, ccy: "USD", fee: 1.40, settled: true },
    { id: 110, acctId: 2, acct: "富途·港股", sym: "0700.HK", action: "buy", date: "2025-07-22", settle: "2025-07-24", qty: 100, price: 377.60, ccy: "HKD", fee: 23.50, settled: true },
  ];

  // ---- Transfers (账户转账) ----
  const transfers = [
    { id: 201, fromId: 6, from: "招行·活期 6231", toId: 1, to: "富途·美股账户", fromAmt: 72000, fromCcy: "CNY", toAmt: 10000, toCcy: "USD", date: "2026-04-10", note: "换汇加仓美股" },
    { id: 202, fromId: 3, from: "汇丰·港币活期", toId: 2, to: "富途·港股账户", fromAmt: 40000, fromCcy: "HKD", toAmt: 40000, toCcy: "HKD", date: "2026-02-15", note: "" },
    { id: 203, fromId: 6, from: "招行·活期 6231", toId: 8, to: "招行·信用卡合计", fromAmt: 16400, fromCcy: "CNY", toAmt: 16400, toCcy: "CNY", date: "2026-05-12", note: "信用卡还款" },
    { id: 204, fromId: 11, from: "中银香港·港元储蓄", toId: 3, to: "汇丰·港币活期", fromAmt: 30000, fromCcy: "HKD", toAmt: 30000, toCcy: "HKD", date: "2026-03-28", note: "" },
  ];

  // ---- Income events (收益事件) ----
  const incomeEvents = [
    { id: 301, kind: "dividend", date: "2026-05-14", acctId: 2, acct: "富途·港股", sym: "0700.HK", amount: 1840, ccy: "HKD", tax: 0, note: "腾讯末期息" },
    { id: 302, kind: "dividend", date: "2026-04-02", acctId: 1, acct: "富途·美股", sym: "GOOG", amount: 312, ccy: "USD", tax: 47, note: "" },
    { id: 303, kind: "interest", date: "2026-05-31", acctId: 4, acct: "汇丰·美元定期", sym: null, amount: 486, ccy: "USD", tax: 0, note: "定存到期利息" },
    { id: 304, kind: "interest", date: "2026-06-02", acctId: 7, acct: "招行·朝朝盈理财", sym: null, amount: 1280, ccy: "CNY", tax: 0, note: "" },
    { id: 305, kind: "rebate", date: "2026-05-08", acctId: 8, acct: "招行·信用卡合计", sym: null, amount: 218, ccy: "CNY", tax: 0, note: "刷卡返现" },
    { id: 306, kind: "dividend", date: "2026-03-19", acctId: 1, acct: "富途·美股", sym: "NTDOY", amount: 88, ccy: "USD", tax: 13, note: "" },
    { id: 307, kind: "other", date: "2026-04-30", acctId: 4, acct: "汇丰·美元定期", sym: null, amount: -32, ccy: "USD", tax: 0, note: "账户管理费（负向）" },
  ];

  // ---- Prices / FX / instruments / benchmarks ----
  const prices = [
    { sym: "GOOG", date: "2026-06-12", price: 184.25, ccy: "USD", source: "manual" },
    { sym: "NVDA", date: "2026-06-12", price: 168.40, ccy: "USD", source: "manual" },
    { sym: "0700.HK", date: "2026-06-12", price: 401.20, ccy: "HKD", source: "manual" },
    { sym: "9988.HK", date: "2026-06-12", price: 74.90, ccy: "HKD", source: "manual" },
    { sym: "BTC", date: "2026-06-12", price: 43800, ccy: "USD", source: "manual" },
    { sym: "161725.OF", date: "2026-06-11", price: 0.948, ccy: "CNY", source: "manual" },
    { sym: "NTDOY", date: "2026-06-10", price: 19.80, ccy: "USD", source: "manual" },
  ];
  const fxRates = [
    { base: "USD", quote: "CNY", date: "2026-06-12", rate: 7.20, source: "manual" },
    { base: "HKD", quote: "CNY", date: "2026-06-12", rate: 0.918, source: "manual" },
    { base: "USD", quote: "HKD", date: "2026-06-12", rate: 7.842, source: "manual" },
    { base: "EUR", quote: "CNY", date: "2026-06-10", rate: 7.78, source: "manual" },
  ];
  const instruments = [
    { sym: "GOOG", name: "Alphabet", market: "US", qccy: "USD", assetKind: "equity", bench: false },
    { sym: "NVDA", name: "NVIDIA", market: "US", qccy: "USD", assetKind: "equity", bench: false },
    { sym: "NTDOY", name: "任天堂", market: "US", qccy: "USD", assetKind: "equity", bench: false },
    { sym: "0700.HK", name: "腾讯控股", market: "HK", qccy: "HKD", assetKind: "equity", bench: false },
    { sym: "9988.HK", name: "阿里巴巴", market: "HK", qccy: "HKD", assetKind: "equity", bench: false },
    { sym: "161725.OF", name: "招商中证白酒", market: "CN", qccy: "CNY", assetKind: "fund", bench: false },
    { sym: "BTC", name: "Bitcoin", market: "CRYPTO", qccy: "USD", assetKind: "crypto", bench: false },
    { sym: "MU", name: "美光科技", market: "US", qccy: "USD", assetKind: "equity", bench: false },
    { sym: "^HSI", name: "恒生指数", market: "INDEX", qccy: "HKD", assetKind: "index", bench: true },
    { sym: "^GSPC", name: "S&P 500", market: "INDEX", qccy: "USD", assetKind: "index", bench: true },
    { sym: "000300.SH", name: "沪深 300", market: "INDEX", qccy: "CNY", assetKind: "index", bench: true },
  ];
  const benchmarks = [
    { sym: "^HSI", name: "恒生指数", defaultVisible: true, order: 1 },
    { sym: "^GSPC", name: "S&P 500", defaultVisible: true, order: 2 },
    { sym: "000300.SH", name: "沪深 300", defaultVisible: false, order: 3 },
  ];

  // ---- Allocation target sets ----
  const targetSets = [
    { id: 1, name: "按账户用途", dimension: "kind", threshold: 5, visible: true, items: [
      { name: "证券", actual: 50.2, target: 50, color: "var(--viz-1)" },
      { name: "活期", actual: 21.9, target: 20, color: "var(--viz-2)" },
      { name: "理财", actual: 19.0, target: 18, color: "var(--viz-3)" },
      { name: "定期", actual: 7.4, target: 7, color: "var(--viz-6)" },
      { name: "加密钱包", actual: 4.6, target: 5, color: "var(--viz-5)" },
    ]},
    { id: 2, name: "按真实计价币种", dimension: "quote_currency", threshold: 4, visible: true, items: [
      { name: "USD", actual: 43.6, target: 40, color: "var(--viz-1)" },
      { name: "CNY", actual: 33.0, target: 40, color: "var(--viz-2)" },
      { name: "HKD", actual: 19.7, target: 20, color: "var(--viz-3)" },
    ]},
    { id: 3, name: "按市场", dimension: "market", threshold: 6, visible: false, items: [
      { name: "US", actual: 60.1, target: 50, color: "var(--viz-1)" },
      { name: "HK", actual: 20.0, target: 30, color: "var(--viz-3)" },
      { name: "CN", actual: 13.9, target: 15, color: "var(--viz-2)" },
      { name: "CRYPTO", actual: 6.0, target: 5, color: "var(--viz-5)" },
    ]},
  ];
  const driftKind = targetSets[0].items;

  // ---- Period compare (本月 vs 上月) by 用途 ----
  const compareRows = [
    { name: "证券", v1: 1432000, v2: 1486000 },
    { name: "活期", v1: 598000, v2: 624000 },
    { name: "理财", v1: 536000, v2: 540000 },
    { name: "定期", v1: 209000, v2: 210000 },
    { name: "基金", v1: 129600, v2: 113781 },
    { name: "加密钱包", v1: 118200, v2: 132219 },
  ];
  const attribution = [
    { name: "价格变动", value: 41200, color: "var(--viz-1)" },
    { name: "数量/余额变动", value: 38600, color: "var(--viz-2)" },
    { name: "收益事件", value: 6420, color: "var(--viz-3)" },
    { name: "汇率变动", value: -1450, color: "var(--viz-6)" },
  ];

  // ---- Credit-card monthly spend (CNY) ----
  const ccSpend = [
    { m: "01", v: 14200 }, { m: "02", v: 21800 }, { m: "03", v: 12600 }, { m: "04", v: 18900 },
    { m: "05", v: 16400 }, { m: "06", v: 18640 },
  ];
  const ccBills = [
    { date: "2026-06-03", total: 18640, ccy: "CNY", paid: false, cats: [{name:"餐饮",amount:4200},{name:"网购",amount:5800},{name:"数码",amount:4100},{name:"其他",amount:4540}] },
    { date: "2026-05-03", total: 16400, ccy: "CNY", paid: true, cats: [{name:"餐饮",amount:3800},{name:"超市",amount:3200},{name:"差旅",amount:6100},{name:"其他",amount:3300}] },
    { date: "2026-04-03", total: 18900, ccy: "CNY", paid: true, cats: [{name:"网购",amount:6400},{name:"餐饮",amount:4100},{name:"娱乐",amount:3200},{name:"其他",amount:5200}] },
  ];

  // ---- Reconciliation ----
  const recon = { driftAccounts: 1, unsettled: 2, sample: { acct: "富途·美股", expected: 312.40, snapshot: 237.62, delta: 74.78 } };
  const reconFlow = {
    acctId: 1, acct: "富途·美股账户", ccy: "USD", base: 237.62, baseDate: "2026-06-05",
    events: [
      { date: "2026-06-05", kind: "snapshot", label: "最近现金快照", amount: 237.62, running: 237.62 },
      { date: "2026-06-01", kind: "sell", label: "卖出 GOOG 已结算", amount: 1010.40, running: 1247.02, settled: true },
      { date: "2026-05-02", kind: "buy", label: "买入 NVDA 已结算", amount: -1417.50, running: -170.48, settled: true },
      { date: "2026-04-02", kind: "income", label: "GOOG 分红入账", amount: 312.00, running: 141.52, settled: true },
      { date: "2026-04-10", kind: "transfer", label: "招行换汇转入", amount: 10000, running: 10141.52, settled: true },
    ],
    expected: 312.40, snapshot: 237.62,
  };

  // balance histories per account (native ccy)
  const balanceHistory = {
    1: [{date:"2026-06-05",bal:237.62},{date:"2026-05-05",bal:312.40},{date:"2026-04-05",bal:198.10},{date:"2026-03-05",bal:402.55}],
    3: [{date:"2026-06-01",bal:286400},{date:"2026-05-01",bal:284100},{date:"2026-04-01",bal:281900}],
    6: [{date:"2026-06-08",bal:348000},{date:"2026-05-08",bal:332000},{date:"2026-04-08",bal:318400}],
  };

  // pivot source — flat rows with all dimensions, value in CNY (and native)
  const pivotRows = [
    ...holdings.filter((h) => h.hasPrice).map((h) => ({
      account: h.acct, institution: h.inst, currency: accountById[h.acctId].ccy, qccy: h.qccy,
      market: h.market, kind: KIND_CN[accountById[h.acctId].kind] || accountById[h.acctId].kind, symbol: h.sym,
      valueCny: conv(h.mktVal, h.qccy, "CNY"), valueNative: h.mktVal, isPos: true,
    })),
    ...flatAccounts.filter((a) => !a.isLiability && a.kind !== "fund").map((a) => ({
      account: a.inst + "·" + a.name, institution: a.inst, currency: a.ccy, qccy: a.ccy,
      market: "—", kind: KIND_CN[a.kind] || a.kind, symbol: "现金",
      valueCny: conv(a.balance, a.ccy, "CNY"), valueNative: a.balance, isPos: false,
    })),
  ];

  window.FBData = {
    FX, SYM, conv, short, disp, KIND_CN, ASSET_CN,
    nwSeries, hsiSeries, spxSeries, byKind, byCurrency, byQuoteCcy, byInstitution, byMarket,
    accounts, flatAccounts, accountById, holdings, transactions, transfers, incomeEvents,
    prices, fxRates, instruments, benchmarks, targetSets, driftKind, compareRows, attribution,
    ccSpend, ccBills, recon, reconFlow, balanceHistory, pivotRows,
    kpis: {
      netWorth: 2847219.5, nwDeltaPct: 3.1, assets: 2865859.5, liabilities: 18640,
      posValueCny: 1486000, unrealPct: 18.4, unrealAbs: 231000,
      realizedYtd: 24800, incomeYtd: 6420, posShare: 52.2,
    },
  };
})();
