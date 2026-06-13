/* finbrain UI kit — 趋势分析 Trend Analysis. window.FBTrend */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Segmented, Select, Switch, Badge, Button, DeltaValue } = window.Finbrain_9e1a03;
  const { LineChart } = window.FBCharts;
  const { useState } = React;

  const cnyFmt = (v) => "¥" + (v / 1e4).toFixed(0) + "万";

  const annotations = [
    { i: 6, date: "2025-12", label: "加仓 NVDA", body: "12 股 @ $118，配置向 US 科技倾斜", color: "var(--gain)" },
    { i: 9, date: "2026-03", label: "白酒基金止损减配", body: "161725.OF 浮亏 −12%，再平衡至现金", color: "var(--loss)" },
    { i: 11, date: "2026-05", label: "腾讯分红入账", body: "0700.HK 现金分红 HK$1,840", color: "var(--accent)" },
  ];

  function Trend({ ccy }) {
    const [subject, setSubject] = useState("networth");
    const [gran, setGran] = useState("month");
    const [mode, setMode] = useState("rebase");
    const [showHsi, setShowHsi] = useState(true);
    const [showSpx, setShowSpx] = useState(true);
    const cv = (v) => D.conv(v, "CNY", ccy);
    const yFmt = (v) => D.short(v, ccy);
    const series = D.nwSeries.map((d) => ({ ...d, v: cv(d.v) }));
    const bms = [];
    if (showHsi) bms.push({ name: "HSI", data: D.hsiSeries, color: "var(--viz-3)" });
    if (showSpx) bms.push({ name: "SPX", data: D.spxSeries, color: "var(--viz-1)" });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22, maxWidth: 1320, margin: "0 auto" }}>
        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Select size="sm" value={subject} onChange={(e) => setSubject(e.target.value)}
            options={[{ value: "networth", label: "净资产" }, { value: "position", label: "持仓总市值" }, { value: "us", label: "美股配置桶" }]} />
          <Segmented size="sm" value={gran} onChange={setGran}
            options={[{ value: "day", label: "每日" }, { value: "month", label: "月度" }, { value: "quarter", label: "季度" }, { value: "year", label: "年度" }]} />
          <div style={{ width: 1, height: 22, background: "var(--divider)" }} />
          <Segmented size="sm" value={mode} onChange={setMode}
            options={[{ value: "absolute", label: "绝对值" }, { value: "rebase", label: "归一化 100" }, { value: "excess", label: "超额收益" }]} />
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Switch checked={showHsi} onChange={setShowHsi} label="恒生指数" />
            <Switch checked={showSpx} onChange={setShowSpx} label="标普500" />
          </div>
        </div>

        <div className="fb-grid trend-side">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 10 }}>
                <div>
                  <div className="fb-eyebrow">净资产 · 12 个月</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
                    <span className="fb-metric" style={{ fontSize: 30 }}>{D.SYM[ccy]}{cv(2847219).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <DeltaValue value={cv(461219)} percent={19.3} />
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>vs 12 月前</span>
                  </div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>较恒生超额</div>
                  <div style={{ color: "var(--gain)", fontFamily: "var(--font-num)", fontSize: 17, fontWeight: 600 }}>+3.6%</div>
                </div>
              </div>
              <LineChart series={series} yFmt={yFmt} benchmarks={bms} annotations={annotations.map((a) => ({ i: a.i }))} height={300} />
            </Card>
            <Card eyebrow="净资产按用途 · 堆叠面积" title={null}>
              <div style={{ display: "flex", height: 150, alignItems: "flex-end", gap: 3, padding: "8px 0" }}>
                {D.nwSeries.map((d, i) => {
                  const segs = [0.50, 0.21, 0.19, 0.074, 0.046];
                  const colors = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-6)", "var(--viz-5)"];
                  const h = 60 + (d.v - 2380000) / 470000 * 90;
                  return (
                    <div key={i} style={{ flex: 1, height: h, display: "flex", flexDirection: "column", borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                      {segs.map((s, j) => <div key={j} style={{ flex: s, background: colors[j], opacity: i === D.nwSeries.length - 1 ? 1 : 0.72 }} />)}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                {[["证券", "var(--viz-1)"], ["活期", "var(--viz-2)"], ["理财", "var(--viz-3)"], ["定期", "var(--viz-6)"], ["加密", "var(--viz-5)"]].map(([n, c]) => (
                  <span key={n} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-secondary)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{n}</span>
                ))}
              </div>
            </Card>
          </div>

          {/* Annotation sidebar */}
          <Card eyebrow="标注" title={null} tight
            actions={<button className="fb-iconbtn fb-iconbtn--sm" aria-label="新增标注"><Icon name="plus" size={15} /></button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {annotations.map((a, i) => (
                <div key={i} style={{ borderLeft: "2px solid " + a.color, paddingLeft: 11, paddingBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>{a.date}</span>
                    {i === 2 ? <Badge tone="gold">LLM</Badge> : null}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 3, fontWeight: 500 }}>{a.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.5 }}>{a.body}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-tertiary)" }}>
              <Icon name="sparkles" size={13} color="var(--accent)" /> 由阶段性总结自动生成的建议标注，业主确认后落库
            </div>
          </Card>
        </div>
      </div>
    );
  }

  window.FBTrend = Trend;
})();
