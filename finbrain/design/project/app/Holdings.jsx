/* finbrain UI kit — Holdings overview (持仓总览). window.FBHoldings */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, StatCard, CurrencyValue, DeltaValue, Badge, Tag, Segmented, Sparkline } = window.Finbrain_9e1a03;
  const { useState } = React;

  const MARKET_TONE = { US: "var(--viz-1)", HK: "var(--viz-3)", CN: "var(--viz-2)", CRYPTO: "var(--viz-5)" };

  function Th({ children, right, w, sortKey, sort, onSort }) {
    const active = sort && sort.key === sortKey;
    return <th onClick={sortKey ? () => onSort(sortKey) : undefined}
      style={{ textAlign: right ? "right" : "left", padding: "9px 12px", fontSize: 11, fontWeight: 500,
      color: active ? "var(--text-primary)" : "var(--text-tertiary)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-default)", width: w, cursor: sortKey ? "pointer" : "default", userSelect: "none" }}>
      {children}{active ? <span style={{ marginLeft: 3, color: "var(--accent)" }}>{sort.dir > 0 ? "▲" : "▼"}</span> : sortKey ? <span style={{ marginLeft: 3, opacity: 0.3 }}>⇅</span> : null}</th>;
  }
  function Td({ children, right, mono, color, dim }) {
    return <td style={{ textAlign: right ? "right" : "left", padding: "10px 12px", fontSize: 12.5,
      fontFamily: mono ? "var(--font-num)" : "var(--font-sans)", fontVariantNumeric: mono ? "tabular-nums" : undefined,
      color: color || (dim ? "var(--text-tertiary)" : "var(--text-primary)"), whiteSpace: "nowrap" }}>{children}</td>;
  }

  function Holdings({ ccy }) {
    const [group, setGroup] = useState("account");
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState({ key: null, dir: 1 });
    const cv = (v) => D.conv(v, "CNY", ccy);
    let rows = D.holdings.filter((h) => filter === "all" || (filter === "profit" ? h.plPct > 0 : filter === "noprice" ? !h.hasPrice : h.market === filter));
    if (sort.key) {
      rows = [...rows].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        if (av == null) return 1; if (bv == null) return -1;
        return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
      });
    }
    const onSort = (key) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22, maxWidth: 1320, margin: "0 auto" }}>
        {/* Summary */}
        <div className="fb-grid fb-grid--g14 kpi-5">
          <StatCard label="持仓总市值" value={cv(161196)} currency={ccy} compact />
          <StatCard label="持仓总成本" value={cv(134407)} currency={ccy} compact />
          <StatCard label="总浮动盈亏" raw={<span style={{ color: "var(--gain)" }}><CurrencyValue value={cv(26789)} currency={ccy} signed size="var(--text-3xl)" compact /></span>} deltaPercent={19.9} />
          <StatCard label="总已实现盈亏" raw={<span style={{ color: "var(--gain)" }}><CurrencyValue value={cv(4760)} currency={ccy} signed size="var(--text-3xl)" compact /></span>} caption="含 7 笔卖出" />
          <StatCard label="持仓占净资产" raw={<span className="fb-num" style={{ fontSize: "var(--text-3xl)", color: "var(--text-strong)" }}>52.2%</span>} />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Segmented value={group} onChange={setGroup} size="sm"
            options={[{ value: "account", label: "按账户" }, { value: "symbol", label: "按标的合并" }, { value: "market", label: "按市场" }, { value: "quote", label: "按计价币种" }]} />
          <div style={{ width: 1, height: 22, background: "var(--divider)" }} />
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Tag clickable active={filter === "all"} onClick={() => setFilter("all")}>全部 {D.holdings.length}</Tag>
            <Tag clickable active={filter === "US"} onClick={() => setFilter("US")} dotColor="var(--viz-1)">美股</Tag>
            <Tag clickable active={filter === "HK"} onClick={() => setFilter("HK")} dotColor="var(--viz-3)">港股</Tag>
            <Tag clickable active={filter === "profit"} onClick={() => setFilter("profit")}>盈利中</Tag>
            <Tag clickable active={filter === "noprice"} onClick={() => setFilter("noprice")}>无价格</Tag>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            <Icon name="columns-3" size={14} /> 成本口径：加权买入
          </div>
        </div>

        {/* Table */}
        <Card padded={false}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr>
                  <Th w="200">标的 / 账户</Th>
                  <Th>市场</Th>
                  <Th right sortKey="qty" sort={sort} onSort={onSort}>数量</Th>
                  <Th right sortKey="avgCost" sort={sort} onSort={onSort}>加权买入</Th>
                  <Th right sortKey="price" sort={sort} onSort={onSort}>现价</Th>
                  <Th right sortKey="mktVal" sort={sort} onSort={onSort}>持仓市值</Th>
                  <Th right sortKey="plPct" sort={sort} onSort={onSort}>浮动盈亏率</Th>
                  <Th right sortKey="realized" sort={sort} onSort={onSort}>已实现</Th>
                  <Th right sortKey="income" sort={sort} onSort={onSort}>累计收益</Th>
                  <Th right sortKey="weight" sort={sort} onSort={onSort}>仓位权重</Th>
                  <Th w="96">趋势</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--divider)", background: !h.hasPrice ? "var(--surface-inset)" : "transparent", transition: "var(--transition-control)", cursor: "default" }}
                    onMouseEnter={(e) => { if (h.hasPrice) e.currentTarget.style.background = "var(--surface-raised)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = !h.hasPrice ? "var(--surface-inset)" : "transparent"; }}>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)", fontSize: 13 }}>{h.sym}</span>
                            {!h.settled ? <Badge tone="warning">未结算</Badge> : null}
                            {!h.hasPrice ? <Badge tone="danger">无价格</Badge> : null}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{h.name} · {h.acct}</div>
                        </div>
                      </div>
                    </Td>
                    <Td><span className="fb-badge fb-badge--neutral" style={{ color: MARKET_TONE[h.market] }}><span className="fb-badge__dot" style={{ background: MARKET_TONE[h.market] }} />{h.market}</span></Td>
                    <Td right mono>{h.qty}</Td>
                    <Td right mono dim>{h.qccy === "USD" ? "$" : h.qccy === "HKD" ? "HK$" : "¥"}{h.avgCost}</Td>
                    <Td right mono color={h.hasPrice ? "var(--text-strong)" : "var(--text-tertiary)"}>{h.hasPrice ? (h.qccy === "USD" ? "$" : h.qccy === "HKD" ? "HK$" : "¥") + h.price : "—"}</Td>
                    <Td right mono color="var(--text-strong)">{h.hasPrice ? (h.qccy === "USD" ? "$" : h.qccy === "HKD" ? "HK$" : "¥") + h.mktVal.toLocaleString() : "—"}</Td>
                    <Td right>{h.plPct == null ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : <DeltaValue percent={h.plPct} />}</Td>
                    <Td right mono color={h.realized > 0 ? "var(--gain)" : h.realized < 0 ? "var(--loss)" : "var(--text-tertiary)"}>{h.realized ? (h.realized > 0 ? "+" : "−") + Math.abs(h.realized) : "—"}</Td>
                    <Td right mono dim>{h.income ? "+" + h.income : "—"}</Td>
                    <Td right mono>{h.weight == null ? "—" : h.weight + "%"}</Td>
                    <Td>{h.hasPrice && h.spark.length ? <Sparkline data={h.spark} width={84} height={24} dot={false} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="info" size={13} /> 浮动盈亏率按原币口径计算，避免汇率波动污染单标的真实涨跌 · MU 缺最新价格，单列且不计入汇总
        </div>
      </div>
    );
  }

  window.FBHoldings = Holdings;
})();
