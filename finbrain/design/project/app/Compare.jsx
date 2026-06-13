/* finbrain UI kit — 期间对比 (§7.16). window.FBCompare */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Segmented, Select, Badge, DeltaValue, CurrencyValue } = window.Finbrain_9e1a03;
  const { Page, Th, Td, Row, SectionHint } = window.FBUI;
  const { useState } = React;

  function Compare({ ccy }) {
    const [preset, setPreset] = useState("mom");
    const cv = (v) => D.conv(v, "CNY", ccy);
    const rows = D.compareRows;
    const start = rows.reduce((s, r) => s + r.v1, 0);
    const end = rows.reduce((s, r) => s + r.v2, 0);
    const delta = end - start;
    const rate = (delta / start) * 100;

    const enriched = rows.map((r) => ({ ...r, d: r.v2 - r.v1, rate: ((r.v2 - r.v1) / r.v1) * 100, contrib: ((r.v2 - r.v1) / delta) * 100 }));
    const up = [...enriched].filter((r) => r.d > 0).sort((a, b) => b.d - a.d).slice(0, 5);
    const down = [...enriched].filter((r) => r.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);
    const attrMax = Math.max(...D.attribution.map((a) => Math.abs(a.value)));

    const PERIOD = { mom: ["2026-05-31", "2026-06-13"], qoq: ["2026-03-31", "2026-06-13"], yoy: ["2025-06-30", "2026-06-13"] };
    const [p1, p2] = PERIOD[preset];

    return (
      <Page>
        {/* period selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Segmented size="sm" value={preset} onChange={setPreset}
            options={[{ value: "mom", label: "本月 vs 上月" }, { value: "qoq", label: "本季 vs 上季" }, { value: "yoy", label: "本年 vs 去年" }]} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            <Badge tone="neutral">{p1}</Badge> <Icon name="arrow-right" size={13} /> <Badge tone="neutral">{p2}</Badge>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-tertiary)" }}>口径：净资产 · fx_mode = current</div>
        </div>

        {/* big numbers */}
        <div className="fb-grid fb-grid--g14 kpi-4">
          <div className="fb-card" style={{ padding: "14px 18px" }}><div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>净资产期初</div><div style={{ marginTop: 4 }}><CurrencyValue value={cv(start)} currency={ccy} compact size="22px" /></div></div>
          <div className="fb-card" style={{ padding: "14px 18px" }}><div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>净资产期末</div><div style={{ marginTop: 4 }}><CurrencyValue value={cv(end)} currency={ccy} compact size="22px" /></div></div>
          <div className="fb-card" style={{ padding: "14px 18px" }}><div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>变化值</div><div style={{ marginTop: 6 }}><span style={{ color: "var(--gain)" }}><CurrencyValue value={cv(delta)} currency={ccy} signed compact size="22px" /></span></div></div>
          <div className="fb-card" style={{ padding: "14px 18px" }}><div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>变化率</div><div style={{ marginTop: 6 }}><DeltaValue percent={rate} pill /></div></div>
        </div>

        <div className="fb-grid split-32">
          {/* detail table */}
          <Card eyebrow="按用途明细" title={null} padded={false}
            actions={null}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>用途</Th><Th right>期初</Th><Th right>期末</Th><Th right>变化值</Th><Th right>变化率</Th><Th right>贡献占比</Th></tr></thead>
              <tbody>
                {enriched.map((r) => (
                  <Row key={r.name}>
                    <Td><span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.name}</span></Td>
                    <Td right mono dim>{D.short(cv(r.v1), ccy)}</Td>
                    <Td right mono color="var(--text-strong)">{D.short(cv(r.v2), ccy)}</Td>
                    <Td right mono color={r.d > 0 ? "var(--gain)" : "var(--loss)"}>{r.d > 0 ? "+" : "−"}{D.short(Math.abs(cv(r.d)), ccy).replace(/^[−]/, "")}</Td>
                    <Td right><DeltaValue percent={r.rate} /></Td>
                    <Td right mono dim>{r.contrib > 0 ? "+" : ""}{r.contrib.toFixed(0)}%</Td>
                  </Row>
                ))}
              </tbody>
            </table>
          </Card>

          {/* attribution */}
          <Card eyebrow="增长来源分解" title={null}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {D.attribution.map((a) => (
                <div key={a.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{a.name}</span>
                    <span className="fb-num" style={{ color: a.value < 0 ? "var(--loss)" : "var(--text-strong)", whiteSpace: "nowrap", flexShrink: 0 }}>{a.value > 0 ? "+" : "−"}{D.short(Math.abs(cv(a.value)), ccy).replace(/^[−]/, "")}</span>
                  </div>
                  <div style={{ height: 8, background: "var(--surface-inset)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", left: a.value < 0 ? "auto" : "50%", right: a.value < 0 ? "50%" : "auto", height: "100%", width: `${(Math.abs(a.value) / attrMax) * 48}%`, background: a.value < 0 ? "var(--loss)" : a.color, borderRadius: 4 }} />
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border-strong)" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-tertiary)" }}>四桶之和 = 净值变化</span>
              <span className="fb-num" style={{ color: "var(--gain)" }}>+{D.short(cv(delta), ccy).replace(/^[−]/, "")}</span>
            </div>
          </Card>
        </div>

        {/* buckets */}
        <div className="fb-grid split-2">
          <Card eyebrow="增长前列" title={null} tight>
            {up.map((r) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--divider)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gain)" }} />
                <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{r.name}</span>
                <span style={{ marginLeft: "auto" }}><DeltaValue value={cv(r.d)} percent={r.rate} /></span>
              </div>
            ))}
          </Card>
          <Card eyebrow="下跌前列" title={null} tight>
            {down.length ? down.map((r) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--divider)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--loss)" }} />
                <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{r.name}</span>
                <span style={{ marginLeft: "auto" }}><DeltaValue value={cv(r.d)} percent={r.rate} /></span>
              </div>
            )) : <div style={{ padding: "18px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>本期无下跌项</div>}
          </Card>
        </div>
        <SectionHint>数量贡献把加仓/减仓影响独立成桶，不与价格变动混淆 · 汇率贡献仅在 fx_mode = historical 下输出</SectionHint>
      </Page>
    );
  }

  window.FBCompare = Compare;
})();
