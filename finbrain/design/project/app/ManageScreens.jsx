/* finbrain UI kit — 目标配置 / 现金对账 / 市场维护 / 设置. window.FBTargets / FBRecon / FBMarket / FBSettings */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Button, Input, Select, Segmented, Switch, Badge, Tag, IconButton } = window.Finbrain_9e1a03;
  const { DriftBars } = window.FBCharts;
  const { Page, Th, Td, Row, native, SectionHint } = window.FBUI;
  const { useState } = React;

  /* ============ 目标配置 §7.14 ============ */
  function Targets({ ccy }) {
    const [activeId, setActiveId] = useState(D.targetSets[0].id);
    const set = D.targetSets.find((s) => s.id === activeId);
    const [items, setItems] = useState(set.items.map((i) => ({ ...i })));
    React.useEffect(() => { setItems(set.items.map((i) => ({ ...i }))); }, [activeId]);
    const sum = items.reduce((s, i) => s + (+i.target || 0), 0);
    const sumOk = Math.abs(sum - 100) < 0.01;

    function setTarget(name, v) { setItems((arr) => arr.map((i) => i.name === name ? { ...i, target: v === "" ? 0 : +v } : i)); }

    return (
      <Page>
        <div className="fb-grid targets-2">
          {/* set list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {D.targetSets.map((s) => (
              <button key={s.id} onClick={() => setActiveId(s.id)}
                style={{ textAlign: "left", padding: "13px 15px", borderRadius: "var(--radius-lg)", cursor: "pointer",
                  background: s.id === activeId ? "var(--accent-bg)" : "var(--surface-card)",
                  border: "1px solid " + (s.id === activeId ? "var(--accent)" : "var(--border-default)") }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: s.id === activeId ? "var(--accent-bright)" : "var(--text-strong)" }}>{s.name}</span>
                  {s.visible ? <Badge tone="gold">仪表盘</Badge> : null}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{({ kind: "账户用途", quote_currency: "真实计价币种", market: "市场", currency: "账户币种", institution: "机构" }[s.dimension] || s.dimension)} · 阈值 ±{s.threshold}%</div>
              </button>
            ))}
            <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={14} />}>新建目标配置</Button>
          </div>

          {/* editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card eyebrow={"目标维度"} title={set.name}
              actions={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Switch checked={set.visible} onChange={() => {}} label="仪表盘可见" />
                <IconButton aria-label="复制"><Icon name="copy" size={15} /></IconButton>
                <IconButton aria-label="归档"><Icon name="archive" size={15} /></IconButton>
              </div>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 1fr 1fr 1.1fr", gap: 12, padding: "0 4px 4px", fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>维度值</span><span style={{ textAlign: "right" }}>目标 %</span><span style={{ textAlign: "right" }}>实际 %</span><span style={{ textAlign: "right" }}>漂移</span><span style={{ textAlign: "right" }}>再平衡建议</span>
                </div>
                {items.map((it) => {
                  const drift = +(it.actual - it.target).toFixed(1);
                  const hit = Math.abs(drift) > set.threshold;
                  const rebal = drift / 100 * D.conv(D.kpis.netWorth, "CNY", ccy);
                  return (
                    <div key={it.name} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 1fr 1fr 1.1fr", gap: 12, alignItems: "center",
                      background: "var(--surface-inset)", border: "1px solid " + (hit ? "rgba(221,162,62,0.4)" : "var(--border-default)"), borderRadius: "var(--radius-md)", padding: "8px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />
                        <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{it.name}</span>
                      </div>
                      <Input numeric suffix="%" value={it.target} onChange={(e) => setTarget(it.name, e.target.value)} size="sm" />
                      <span className="fb-num" style={{ textAlign: "right", fontSize: 12.5, color: "var(--text-primary)" }}>{it.actual}%</span>
                      <span className="fb-num" style={{ textAlign: "right", fontSize: 12.5, color: hit ? (drift > 0 ? "var(--gain)" : "var(--loss)") : "var(--text-tertiary)" }}>{drift > 0 ? "+" : "−"}{Math.abs(drift)}%</span>
                      <span className="fb-num" style={{ textAlign: "right", fontSize: 11.5, color: "var(--text-secondary)" }}>{drift > 0 ? "减配 " : "增配 "}{D.short(Math.abs(rebal), ccy)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>目标总和</span>
                <span className="fb-num" style={{ fontSize: 15, fontWeight: 600, color: sumOk ? "var(--gain)" : "var(--warning)" }}>{sum.toFixed(1)}%</span>
                {sumOk ? <Icon name="check" size={15} color="var(--gain)" /> : <span style={{ fontSize: 11.5, color: "var(--warning)" }}>需等于 100%</span>}
                <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} disabled={!sumOk}>保存目标</Button>
              </div>
            </Card>

            <Card eyebrow="当前与目标" title={null}>
              <div style={{ padding: "4px 4px 2px" }}><DriftBars items={items} /></div>
            </Card>
          </div>
        </div>
      </Page>
    );
  }

  /* ============ 现金对账 §7.12 ============ */
  const KIND_ICON = { snapshot: "camera", buy: "arrow-down-left", sell: "arrow-up-right", income: "coins", transfer: "repeat" };
  function Recon({ ccy }) {
    const f = D.reconFlow;
    const [settledOnly, setSettledOnly] = useState(false);
    const [acctId, setAcctId] = useState(String(f.acctId));
    const events = f.events.filter((e) => !settledOnly || e.kind === "snapshot" || e.settled);
    const delta = f.expected - f.snapshot;
    const hit = Math.abs(delta) / f.expected > 0.005;

    const reasons = ["未录入的交易（最常见）", "未录入的转账", "未录入的分红 / 利息", "未结算交易的费用估算偏差", "银行 / 券商小额费用"];

    return (
      <Page max={1100}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 240 }}>
            <Select size="sm" value={acctId} onChange={(e) => setAcctId(e.target.value)}
              options={D.flatAccounts.filter((a) => a.kind === "brokerage" || a.kind === "crypto_wallet" || a.kind === "cash").map((a) => ({ value: String(a.id), label: a.inst + "·" + a.name }))} />
          </div>
          <Switch checked={settledOnly} onChange={setSettledOnly} label="仅含已结算" />
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-tertiary)" }}>阈值 0.5% · 可在设置中调整</div>
        </div>

        {/* result banner */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>预期余额</div><span className="fb-num" style={{ fontSize: 24, fontWeight: 600, color: "var(--text-strong)" }}>{native(f.expected, f.ccy)}</span></div>
            <Icon name="minus" size={16} color="var(--text-tertiary)" />
            <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>最新快照</div><span className="fb-num" style={{ fontSize: 24, fontWeight: 600, color: "var(--text-strong)" }}>{native(f.snapshot, f.ccy)}</span></div>
            <Icon name="equal" size={16} color="var(--text-tertiary)" />
            <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>对账差额</div><span className="fb-num" style={{ fontSize: 24, fontWeight: 700, color: hit ? "var(--warning)" : "var(--gain)" }}>{delta > 0 ? "+" : "−"}{native(Math.abs(delta), f.ccy)}</span></div>
            {hit ? <Badge tone="warning" dot>超阈值 ({((delta / f.expected) * 100).toFixed(1)}%)</Badge> : <Badge tone="success">在阈值内</Badge>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm">用预期覆盖快照</Button>
              <Button variant="primary" size="sm">新建今日快照</Button>
            </div>
          </div>
        </Card>

        <div className="fb-grid split-32">
          {/* event flow */}
          <Card eyebrow="事件流 · 自最近现金快照起" title={null}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {events.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < events.length - 1 ? "1px solid var(--divider)" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-inset)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Icon name={KIND_ICON[e.kind] || "circle"} size={14} color={e.kind === "snapshot" ? "var(--accent)" : e.amount < 0 ? "var(--loss)" : "var(--gain)"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text-primary)" }}>{e.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{e.date}</div>
                  </div>
                  {e.kind !== "snapshot" ? <span className="fb-num" style={{ fontSize: 12.5, color: e.amount < 0 ? "var(--loss)" : "var(--gain)" }}>{e.amount < 0 ? "−" : "+"}{native(Math.abs(e.amount), f.ccy)}</span> : <Badge tone="neutral">基准</Badge>}
                  <span className="fb-num" style={{ fontSize: 11.5, color: "var(--text-tertiary)", width: 90, textAlign: "right" }}>{native(e.running, f.ccy)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* reasons */}
          <Card eyebrow="差额排查清单 · 按可能性" title={null} tight>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {reasons.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < reasons.length - 1 ? "1px solid var(--divider)" : "none" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--surface-inset)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", flex: "none" }}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{r}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Page>
    );
  }

  /* ============ 价格 / 汇率 / 标的 / 基准 §7.18 ============ */
  function Market({ ccy }) {
    const [tab, setTab] = useState("prices");
    return (
      <Page>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Segmented value={tab} onChange={setTab} size="sm"
            options={[{ value: "prices", label: "价格" }, { value: "fx", label: "汇率" }, { value: "instruments", label: "标的" }, { value: "benchmarks", label: "基准" }]} />
          <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} iconLeft={<Icon name="plus" size={14} />}>新增{{ prices: "价格", fx: "汇率", instruments: "标的", benchmarks: "基准" }[tab]}</Button>
        </div>
        <Card padded={false}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {tab === "prices" ? (<>
              <thead><tr><Th>标的</Th><Th>日期</Th><Th right>价格</Th><Th>币种</Th><Th>来源</Th><Th w="50"></Th></tr></thead>
              <tbody>{D.prices.map((p, i) => (
                <Row key={i}><Td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{p.sym}</span></Td><Td mono dim>{p.date}</Td>
                  <Td right mono color="var(--text-strong)">{native(p.price, p.ccy)}</Td><Td><Badge tone="neutral">{p.ccy}</Badge></Td>
                  <Td><span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{p.source}</span></Td>
                  <Td><IconButton aria-label="编辑" size="sm"><Icon name="pencil" size={13} /></IconButton></Td></Row>
              ))}</tbody>
            </>) : tab === "fx" ? (<>
              <thead><tr><Th>币种对</Th><Th>日期</Th><Th right>汇率</Th><Th>来源</Th><Th w="50"></Th></tr></thead>
              <tbody>{D.fxRates.map((r, i) => (
                <Row key={i}><Td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.base}/{r.quote}</span></Td><Td mono dim>{r.date}</Td>
                  <Td right mono color="var(--text-strong)">{r.rate}</Td>
                  <Td><span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{r.source}</span></Td>
                  <Td><IconButton aria-label="编辑" size="sm"><Icon name="pencil" size={13} /></IconButton></Td></Row>
              ))}</tbody>
            </>) : tab === "instruments" ? (<>
              <thead><tr><Th>标的</Th><Th>名称</Th><Th>市场</Th><Th>计价币种</Th><Th>资产类型</Th><Th>基准</Th><Th w="50"></Th></tr></thead>
              <tbody>{D.instruments.map((m, i) => (
                <Row key={i}><Td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.sym}</span></Td><Td>{m.name}</Td>
                  <Td><span className="fb-badge fb-badge--neutral" style={{ color: window.FBUI.MARKET_TONE[m.market] || "var(--text-secondary)" }}><span className="fb-badge__dot" style={{ background: window.FBUI.MARKET_TONE[m.market] || "var(--text-secondary)" }} />{m.market}</span></Td>
                  <Td><Badge tone="neutral">{m.qccy}</Badge></Td><Td><span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{D.ASSET_CN[m.assetKind] || m.assetKind}</span></Td>
                  <Td>{m.bench ? <Badge tone="gold">基准</Badge> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</Td>
                  <Td><IconButton aria-label="编辑" size="sm"><Icon name="pencil" size={13} /></IconButton></Td></Row>
              ))}</tbody>
            </>) : (<>
              <thead><tr><Th>标的</Th><Th>显示名</Th><Th>默认叠加</Th><Th right>排序</Th><Th w="50"></Th></tr></thead>
              <tbody>{D.benchmarks.map((b, i) => (
                <Row key={i}><Td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{b.sym}</span></Td><Td>{b.name}</Td>
                  <Td>{b.defaultVisible ? <Badge tone="success">默认</Badge> : <Badge tone="neutral">关</Badge>}</Td><Td right mono dim>{b.order}</Td>
                  <Td><IconButton aria-label="编辑" size="sm"><Icon name="pencil" size={13} /></IconButton></Td></Row>
              ))}</tbody>
            </>)}
          </table>
        </Card>
        <SectionHint>{tab === "fx" ? "反向汇率自动互换：USD/CNY=7.2 ⇄ CNY/USD=1/7.2 · 缺失时按 1:1 降级并提示" : "市价手动维护或后续接入自动数据源；无价格时市值显示「无价格」，不阻塞其他计算"}</SectionHint>
      </Page>
    );
  }

  /* ============ 设置 §7.20 ============ */
  function Field({ label, hint, children }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{label}</div>
          {hint ? <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>{hint}</div> : null}
        </div>
        {children}
      </div>
    );
  }
  function Settings({ ccy, onCcy, convention, onConvention }) {
    const [fxMode, setFxMode] = useState("current");
    const [gran, setGran] = useState("month");
    const [llm, setLlm] = useState(true);
    return (
      <Page max={760}>
        <Card eyebrow="偏好" title="显示与折算">
          <Field label="默认展示币种" hint="所有含金额视图的统一展示口径，可在任意视图临时切换">
            <Segmented value={ccy} onChange={onCcy} size="sm" options={["CNY", "HKD", "USD"]} />
          </Field>
          <Field label="涨跌颜色约定" hint="红涨绿跌（A 股 / 内地习惯）· 绿涨红跌（欧美习惯）· 全局联动">
            <Segmented value={convention} onChange={onConvention} size="sm"
              options={[{ value: "western", label: "绿涨红跌" }, { value: "cn", label: "红涨绿跌" }]} />
          </Field>
          <Field label="汇率折算模式" hint="current = 当前汇率折算 · historical = 按快照日汇率">
            <div style={{ width: 200 }}><Select size="sm" value={fxMode} onChange={(e) => setFxMode(e.target.value)}
              options={[{ value: "current", label: "当前汇率" }, { value: "historical", label: "按快照日汇率" }]} /></div>
          </Field>
          <Field label="时间轴默认粒度">
            <Segmented value={gran} onChange={setGran} size="sm" options={[{ value: "day", label: "日" }, { value: "month", label: "月" }, { value: "quarter", label: "季" }, { value: "year", label: "年" }]} />
          </Field>
          <Field label="现金对账阈值" hint="差额 / 预期余额 超过该比例时账户卡片高亮">
            <div style={{ width: 120 }}><Input numeric suffix="%" defaultValue="0.5" size="sm" /></div>
          </Field>
        </Card>
        <Card eyebrow="智能" title="自然语言能力">
          <Field label="自然语言录入 / 查询 / 总结" hint="关闭后应用退化为纯手工模式 · 所有写入均经 JSON Schema 校验 + 业主确认">
            <Switch checked={llm} onChange={setLlm} label={llm ? "已启用" : "已关闭"} />
          </Field>
          <Field label="Anthropic Claude API Key" hint="存储于 infra/.secrets/finbrain.env，经环境变量读取">
            <Badge tone="success" dot>已配置</Badge>
          </Field>
        </Card>
        <Card eyebrow="数据" title="导出与关于">
          <Field label="全量数据导出" hint="所有表的 CSV 包，按表分文件"><Button variant="secondary" size="sm" iconLeft={<Icon name="download" size={14} />}>导出 CSV</Button></Field>
          <Field label="建账模板管理" hint="内置模板 + 自定义模板"><Button variant="secondary" size="sm">管理模板</Button></Field>
          <Field label="关于 finbrain"><span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>v1.0 · self-hosted · k3s</span></Field>
        </Card>
      </Page>
    );
  }

  window.FBTargets = Targets;
  window.FBRecon = Recon;
  window.FBMarket = Market;
  window.FBSettings = Settings;
})();
