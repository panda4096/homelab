/* finbrain UI kit — 多维聚合 / 透视表 (§7.17). window.FBPivot */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Select, Segmented, Badge, Button } = window.Finbrain_9e1a03;
  const { Page, SectionHint } = window.FBUI;
  const { useState, useMemo } = React;

  const DIMS = [
    { value: "institution", label: "机构" },
    { value: "kind", label: "用途" },
    { value: "currency", label: "账户币种" },
    { value: "qccy", label: "真实计价币种" },
    { value: "market", label: "市场" },
    { value: "symbol", label: "标的" },
    { value: "account", label: "账户" },
  ];
  const DIM_LABEL = Object.fromEntries(DIMS.map((d) => [d.value, d.label]));

  const PRESETS = [
    { label: "机构 × 用途 = 金额", row: "institution", col: "kind", val: "amount" },
    { label: "用途 × 当前 = 金额 + 占比", row: "kind", col: "none", val: "amount" },
    { label: "标的 × 市场 = 市值", row: "symbol", col: "market", val: "amount" },
    { label: "真实计价币种 × 当前 = 占比", row: "qccy", col: "none", val: "share" },
    { label: "市场 × 用途 = 市值", row: "market", col: "kind", val: "amount" },
  ];

  function Pivot({ ccy }) {
    const [row, setRow] = useState("institution");
    const [col, setCol] = useState("kind");
    const [val, setVal] = useState("amount");

    const { rowKeys, colKeys, cells, rowTot, colTot, grand } = useMemo(() => {
      const rows = D.pivotRows;
      const rk = [...new Set(rows.map((r) => r[row]))].filter((x) => x !== "—" || row === "market");
      const ck = col === "none" ? ["合计"] : [...new Set(rows.map((r) => r[col]))].filter((x) => x !== "—" || col === "market");
      const cells = {}; const rowTot = {}; const colTot = {}; let grand = 0;
      rk.forEach((r) => { rowTot[r] = 0; });
      ck.forEach((c) => { colTot[c] = 0; });
      rows.forEach((r) => {
        const rkey = r[row]; const ckey = col === "none" ? "合计" : r[col];
        if (!rk.includes(rkey) || !ck.includes(ckey)) return;
        const key = rkey + "||" + ckey;
        const amt = D.conv(r.valueCny, "CNY", ccy);
        if (!cells[key]) cells[key] = { amount: 0, count: 0 };
        cells[key].amount += amt; cells[key].count += 1;
        rowTot[rkey] = (rowTot[rkey] || 0) + amt; colTot[ckey] = (colTot[ckey] || 0) + amt; grand += amt;
      });
      rk.sort((a, b) => (rowTot[b] || 0) - (rowTot[a] || 0));
      return { rowKeys: rk, colKeys: ck, cells, rowTot, colTot, grand };
    }, [row, col, val, ccy]);

    function fmt(cell, rTotForShare) {
      if (!cell || (val === "amount" && !cell.amount)) return <span style={{ color: "var(--text-tertiary)" }}>·</span>;
      if (val === "count") return <span>{cell.count}</span>;
      if (val === "share") return <span>{((cell.amount / grand) * 100).toFixed(1)}%</span>;
      return <span>{D.short(cell.amount, ccy)}</span>;
    }
    function applyPreset(p) { setRow(p.row); setCol(p.col); setVal(p.val); }

    return (
      <Page>
        {/* controls */}
        <Card tight>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div className="fb-field" style={{ minWidth: 150 }}>
              <label className="fb-field__label">行维度</label>
              <Select value={row} onChange={(e) => setRow(e.target.value)} options={DIMS} />
            </div>
            <Icon name="x" size={14} color="var(--text-tertiary)" style={{ marginBottom: 10 }} />
            <div className="fb-field" style={{ minWidth: 150 }}>
              <label className="fb-field__label">列维度</label>
              <Select value={col} onChange={(e) => setCol(e.target.value)} options={[{ value: "none", label: "当前（合计）" }, ...DIMS]} />
            </div>
            <div className="fb-field" style={{ minWidth: 140 }}>
              <label className="fb-field__label">值</label>
              <Segmented value={val} onChange={setVal} size="sm"
                options={[{ value: "amount", label: "金额" }, { value: "share", label: "占比" }, { value: "count", label: "计数" }]} />
            </div>
            <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
              <Icon name="download" size={14} /> 导出 CSV
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", alignSelf: "center", marginRight: 2 }}>预设</span>
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => applyPreset(p)} className="fb-tag fb-tag--clickable" style={{ fontSize: 11 }}>{p.label}</button>
            ))}
          </div>
        </Card>

        {/* pivot table */}
        <Card padded={false}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "11px 14px", fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", position: "sticky", left: 0, background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                    {DIM_LABEL[row]} <span style={{ color: "var(--text-tertiary)" }}>＼</span> {col === "none" ? "" : DIM_LABEL[col]}
                  </th>
                  {colKeys.map((c) => (
                    <th key={c} style={{ textAlign: "right", padding: "11px 14px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>{c}</th>
                  ))}
                  <th style={{ textAlign: "right", padding: "11px 14px", fontSize: 11, fontWeight: 600, color: "var(--accent-bright)", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>合计</th>
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((r) => (
                  <tr key={r} style={{ borderBottom: "1px solid var(--divider)" }}>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: "var(--text-strong)", position: "sticky", left: 0, background: "var(--surface-card)", whiteSpace: "nowrap", fontWeight: 500 }}>{r}</td>
                    {colKeys.map((c) => (
                      <td key={c} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12.5, fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
                        {fmt(cells[r + "||" + c])}
                      </td>
                    ))}
                    <td style={{ textAlign: "right", padding: "10px 14px", fontSize: 12.5, fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums", color: "var(--text-strong)", fontWeight: 600 }}>
                      {val === "count" ? D.pivotRows.filter((x) => x[row] === r).length : val === "share" ? ((rowTot[r] / grand) * 100).toFixed(1) + "%" : D.short(rowTot[r], ccy)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1.5px solid var(--border-default)" }}>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--accent-bright)", fontWeight: 600, position: "sticky", left: 0, background: "var(--surface-card)" }}>合计</td>
                  {colKeys.map((c) => (
                    <td key={c} style={{ textAlign: "right", padding: "11px 14px", fontSize: 12.5, fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums", color: "var(--text-strong)", fontWeight: 600 }}>
                      {val === "count" ? "" : val === "share" ? ((colTot[c] / grand) * 100).toFixed(1) + "%" : D.short(colTot[c], ccy)}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", padding: "11px 14px", fontSize: 13, fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums", color: "var(--accent-bright)", fontWeight: 700 }}>{val === "share" ? "100%" : D.short(grand, ccy)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <SectionHint>透视基于当前截面（最近一次盘点）· 金额按展示币种 {ccy} 折算 · 时间维度透视使用每月截面取值（见 §6.5）</SectionHint>
      </Page>
    );
  }

  window.FBPivot = Pivot;
})();
