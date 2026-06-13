/* finbrain UI kit — Dashboard screen. window.FBDashboard */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, StatCard, CurrencyValue, DeltaValue, Badge, Button, Segmented, Sparkline } = window.Finbrain_9e1a03;
  const { Donut, LineChart, BarChart, DriftBars } = window.FBCharts;
  const { useState } = React;

  function MiniCard({ children, ...rest }) {
    return <div className="fb-card" {...rest}>{children}</div>;
  }

  function Dashboard({ ccy }) {
    const [allocDim, setAllocDim] = useState("kind");
    const allocData = { kind: D.byKind, currency: D.byCurrency, quote: D.byQuoteCcy, institution: D.byInstitution }[allocDim];
    const cv = (v) => D.conv(v, "CNY", ccy);
    const yFmt = (v) => D.short(v, ccy);
    const series = D.nwSeries.map((d) => ({ ...d, v: cv(d.v) }));
    const ccData = D.ccSpend.map((d) => ({ ...d, v: cv(d.v) }));

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22, maxWidth: 1320, margin: "0 auto" }}>
        {/* Hero + summary row */}
        <div className="fb-grid db-hero">
          <div className="fb-card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "var(--gradient-sheen)", pointerEvents: "none" }} />
            <div>
              <div className="fb-eyebrow">净资产</div>
              <div style={{ marginTop: 10 }}>
                <CurrencyValue value={cv(D.kpis.netWorth)} currency={ccy} hero size="52px" compact decimals={ccy === "CNY" ? 0 : 2} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <DeltaValue value={cv(84770)} percent={D.kpis.nwDeltaPct} pill />
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>较上月 · 2026年6月盘点</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 26, marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--divider)" }}>
              <div><div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 4 }}>总资产</div><CurrencyValue value={cv(D.kpis.assets)} currency={ccy} size="17px" compact /></div>
              <div><div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 4 }}>总负债</div><span style={{ color: "var(--loss)" }}><CurrencyValue value={cv(-D.kpis.liabilities)} currency={ccy} size="17px" /></span></div>
            </div>
          </div>
          <div className="fb-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div className="fb-eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="trending-up" size={13} /> 持仓总市值</div>
              <div style={{ marginTop: 9 }}><CurrencyValue value={cv(D.kpis.posValueCny)} currency={ccy} compact size="30px" /></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9 }}>
                <DeltaValue percent={D.kpis.unrealPct} pill />
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>浮动盈亏</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Sparkline data={[128, 131, 129, 137, 134, 142, 145, 148]} width={300} height={34} dot={false} tone="auto" />
              <div style={{ display: "flex", gap: 24, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
                <div><div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>持仓总成本</div><CurrencyValue value={cv(134407)} currency={ccy} compact size="14px" /></div>
                <div><div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>占净资产</div><span className="fb-num" style={{ fontSize: 14, color: "var(--text-strong)" }}>{D.kpis.posShare}%</span></div>
              </div>
            </div>
          </div>
          <div className="fb-grid split-2">
            <div className="fb-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon name="badge-check" size={14} color="var(--text-tertiary)" /><span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>本年已实现盈亏</span></div>
              <div style={{ marginTop: 12 }}><span style={{ color: "var(--gain)" }}><CurrencyValue value={cv(D.kpis.realizedYtd)} currency={ccy} signed size="20px" compact /></span></div>
            </div>
            <div className="fb-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon name="coins" size={14} color="var(--text-tertiary)" /><span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>累计收益 · 本年</span></div>
              <div style={{ marginTop: 12 }}><CurrencyValue value={cv(D.kpis.incomeYtd)} currency={ccy} size="20px" compact /></div>
            </div>
          </div>
        </div>

        {/* Drift + reconciliation alert row */}
        <div className="fb-grid db-21">
          <Card eyebrow="配置漂移" title="按账户用途" tight
            actions={<Badge tone="warning" dot>1 项超阈值</Badge>}>
            <div style={{ padding: "4px 4px 6px" }}><DriftBars items={D.driftKind} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--divider)", fontSize: 12, color: "var(--text-tertiary)" }}>
              <Icon name="info" size={13} /> 白线为目标占比 · 再平衡建议：活期 减配 ¥54,200，理财 增配 ¥28,500
            </div>
          </Card>
          <div className="fb-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="fb-card__eyebrow">对账状态</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, background: "var(--warning-bg)", border: "1px solid rgba(221,162,62,0.3)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--warning)" }}><Icon name="triangle-alert" size={14} /><span className="fb-num" style={{ fontSize: 22, fontWeight: 600 }}>1</span></div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>现金差额超阈值账户</div>
              </div>
              <div style={{ flex: 1, background: "var(--surface-inset)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}><Icon name="clock" size={14} /><span className="fb-num" style={{ fontSize: 22, fontWeight: 600, color: "var(--text-strong)" }}>2</span></div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>未结算交易</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--text-secondary)" }}>{D.recon.sample.acct}</span> 预期 <span className="fb-num">${D.recon.sample.expected}</span> · 快照 <span className="fb-num">${D.recon.sample.snapshot}</span> · 差额 <span className="fb-num" style={{ color: "var(--warning)" }}>+${D.recon.sample.delta}</span>
            </div>
            <Button variant="secondary" size="sm" block iconRight={<Icon name="arrow-right" size={14} />}>前往现金对账</Button>
          </div>
        </div>

        {/* Allocation + trend */}
        <div className="fb-grid db-12">
          <Card eyebrow="资产配置"
            actions={<Segmented size="sm" value={allocDim} onChange={setAllocDim}
              options={[{ value: "kind", label: "用途" }, { value: "currency", label: "币种" }, { value: "quote", label: "暴露" }, { value: "institution", label: "机构" }]} />}>
            <Donut items={allocData} centerLabel={D.short(cv(D.kpis.netWorth), ccy)} centerSub={allocDim === "quote" ? "真实计价币种" : "净资产"} />
          </Card>
          <Card eyebrow="净资产趋势 · 12 个月" title={null}
            actions={<div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 2, background: "var(--accent)" }} />净资产</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 0, borderTop: "1.3px dashed var(--viz-3)" }} />恒生</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 0, borderTop: "1.3px dashed var(--viz-1)" }} />标普500</span>
            </div>}>
            <LineChart series={series} yFmt={yFmt}
              benchmarks={[{ name: "HSI", data: D.hsiSeries, color: "var(--viz-3)" }, { name: "SPX", data: D.spxSeries, color: "var(--viz-1)" }]}
              annotations={[{ i: 6 }, { i: 9 }]} />
          </Card>
        </div>

        {/* Credit card spend */}
        <Card eyebrow="信用卡当月支出 · 最近 6 月" title={null}
          actions={<div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>本期 <span className="fb-num" style={{ color: "var(--text-primary)" }}>{D.short(cv(18640), ccy)}</span> · 餐饮 / 网购 / 数码</div>}>
          <BarChart data={ccData} color="var(--viz-2)" yFmt={yFmt} />
        </Card>
      </div>
    );
  }

  window.FBDashboard = Dashboard;
})();
