/* finbrain UI kit — 收益事件 (§7.8) + 账户转账 (§7.11). window.FBIncome / window.FBTransfers */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Button, Input, Select, Segmented, Badge, Tag, IconButton } = window.Finbrain_9e1a03;
  const { Page, Th, Td, Row, native, SectionHint } = window.FBUI;
  const { useState, useMemo } = React;

  const KIND_LABEL = { dividend: "分红", interest: "利息", rebate: "返现", other: "其他" };
  const allAccts = D.flatAccounts;

  /* ============ 收益事件 ============ */
  function IncomeForm({ onAdd }) {
    const [kind, setKind] = useState("dividend");
    const [acctId, setAcctId] = useState(String(allAccts[0].id));
    const [sym, setSym] = useState("");
    const [date, setDate] = useState("2026-06-13");
    const [amount, setAmount] = useState("");
    const [tax, setTax] = useState("");
    const [touched, setTouched] = useState(false);
    const acct = D.accountById[+acctId];
    const ccy = acct.ccy;

    const errs = {};
    if (kind === "dividend" && !sym.trim()) errs.sym = "分红必须关联标的";
    if (!(+amount > 0)) errs.amount = "金额必须 > 0";
    const valid = Object.keys(errs).length === 0;

    function submit() {
      setTouched(true); if (!valid) return;
      onAdd({ id: Date.now(), kind, acctId: +acctId, acct: acct.inst + "·" + acct.name, sym: sym.toUpperCase() || null, date, amount: +amount, ccy, tax: tax === "" ? 0 : +tax, note: "" });
      setSym(""); setAmount(""); setTax(""); setTouched(false);
    }

    return (
      <Card eyebrow="录入收益事件" title={null}
        actions={<Segmented size="sm" value={kind} onChange={setKind}
          options={[{ value: "dividend", label: "分红" }, { value: "interest", label: "利息" }, { value: "rebate", label: "返现" }, { value: "other", label: "其他" }]} />}>
        <div className="fb-form form-5">
          <div className="fb-field">
            <label className="fb-field__label">关联账户</label>
            <Select value={acctId} onChange={(e) => setAcctId(e.target.value)} options={allAccts.map((a) => ({ value: String(a.id), label: a.inst + "·" + a.name }))} />
          </div>
          <Input label={kind === "dividend" ? "标的（必填）" : "标的（可选）"} placeholder="0700.HK" value={sym} onChange={(e) => setSym(e.target.value)} error={touched && errs.sym} />
          <Input label="事件日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="金额" numeric prefix={D.SYM[ccy]} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} error={touched && errs.amount} />
          <Input label="已扣税（可选）" numeric prefix={D.SYM[ccy]} placeholder="0.00" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <SectionHint>收益事件不修改持仓数量、平均成本或余额 · 如需反映现金到账，请另行录入余额快照</SectionHint>
          <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} iconLeft={<Icon name="check" size={14} />} onClick={submit} disabled={touched && !valid}>添加事件</Button>
        </div>
      </Card>
    );
  }

  function Income({ ccy }) {
    const [extra, setExtra] = useState([]);
    const [filter, setFilter] = useState("all");
    const all = useMemo(() => [...extra, ...D.incomeEvents], [extra]);
    const rows = all.filter((e) => filter === "all" || e.kind === filter).sort((a, b) => a.date < b.date ? 1 : -1);
    const ytdCny = all.reduce((s, e) => s + D.conv(e.amount, e.ccy, "CNY"), 0);

    return (
      <Page>
        <IncomeForm onAdd={(e) => setExtra((x) => [e, ...x])} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 7 }}>
            <Tag clickable active={filter === "all"} onClick={() => setFilter("all")}>全部 {all.length}</Tag>
            {Object.entries(KIND_LABEL).map(([k, l]) => <Tag key={k} clickable active={filter === k} onClick={() => setFilter(k)}>{l}</Tag>)}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>累计收益（折算）<span className="fb-num" style={{ color: "var(--gain)", marginLeft: 6 }}>+{D.short(D.conv(ytdCny, "CNY", ccy), ccy)}</span></div>
        </div>
        <Card padded={false}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><Th>日期</Th><Th>类型</Th><Th>账户</Th><Th>标的</Th><Th right>金额</Th><Th right>已扣税</Th><Th right>折算 {ccy}</Th><Th>备注</Th><Th w="50"></Th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <Row key={e.id}>
                  <Td mono dim>{e.date}</Td>
                  <Td><Badge tone={e.kind === "dividend" ? "gold" : "neutral"}>{KIND_LABEL[e.kind]}</Badge></Td>
                  <Td><span style={{ fontSize: 12 }}>{e.acct}</span></Td>
                  <Td><span style={{ fontFamily: "var(--font-mono)" }}>{e.sym || "—"}</span></Td>
                  <Td right mono color={e.amount < 0 ? "var(--loss)" : "var(--gain)"}>{e.amount < 0 ? "−" : "+"}{native(Math.abs(e.amount), e.ccy)}</Td>
                  <Td right mono dim>{e.tax ? native(e.tax, e.ccy) : "—"}</Td>
                  <Td right mono dim>{D.short(D.conv(e.amount, e.ccy, ccy), ccy)}</Td>
                  <Td><span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.note || "—"}</span></Td>
                  <Td><IconButton aria-label="删除" size="sm" onClick={() => setExtra((x) => x.filter((y) => y.id !== e.id))}><Icon name="trash-2" size={13} /></IconButton></Td>
                </Row>
              ))}
            </tbody>
          </table>
        </Card>
      </Page>
    );
  }

  /* ============ 账户转账 ============ */
  function TransferForm({ onAdd }) {
    const [fromId, setFromId] = useState(String(allAccts[0].id));
    const [toId, setToId] = useState(String(allAccts[1].id));
    const [fromAmt, setFromAmt] = useState("");
    const [toAmt, setToAmt] = useState("");
    const [date, setDate] = useState("2026-06-13");
    const [touched, setTouched] = useState(false);
    const from = D.accountById[+fromId], to = D.accountById[+toId];
    const sameCcy = from.ccy === to.ccy;

    // same-ccy: auto-sync to=from
    const effToAmt = sameCcy ? fromAmt : toAmt;
    const errs = {};
    if (fromId === toId) errs.to = "转出与转入账户不能相同";
    if (!(+fromAmt > 0)) errs.fromAmt = "金额必须 > 0";
    if (!sameCcy && !(+toAmt > 0)) errs.toAmt = "请填写到账金额";
    const valid = Object.keys(errs).length === 0;
    const impliedRate = !sameCcy && +fromAmt > 0 && +toAmt > 0 ? (+toAmt / +fromAmt).toFixed(4) : null;

    function submit() {
      setTouched(true); if (!valid) return;
      onAdd({ id: Date.now(), fromId: +fromId, from: from.inst + "·" + from.name, toId: +toId, to: to.inst + "·" + to.name,
        fromAmt: +fromAmt, fromCcy: from.ccy, toAmt: sameCcy ? +fromAmt : +toAmt, toCcy: to.ccy, date, note: "" });
      setFromAmt(""); setToAmt(""); setTouched(false);
    }

    return (
      <Card eyebrow="录入转账" title={null}>
        <div className="xfer">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="fb-field"><label className="fb-field__label">转出账户</label>
              <Select value={fromId} onChange={(e) => setFromId(e.target.value)} options={allAccts.map((a) => ({ value: String(a.id), label: a.inst + "·" + a.name + " (" + a.ccy + ")" }))} /></div>
            <Input label="转出金额" numeric prefix={D.SYM[from.ccy]} placeholder="0.00" value={fromAmt} onChange={(e) => setFromAmt(e.target.value)} error={touched && errs.fromAmt} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="arrow-right" size={18} color="var(--accent)" />
            </div>
            {impliedRate ? <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>≈ {impliedRate}</span> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="fb-field"><label className="fb-field__label">转入账户</label>
              <Select value={toId} onChange={(e) => setToId(e.target.value)} options={allAccts.map((a) => ({ value: String(a.id), label: a.inst + "·" + a.name + " (" + a.ccy + ")" }))} /></div>
            <Input label={sameCcy ? "转入金额（自动同步）" : "转入金额（手填）"} numeric prefix={D.SYM[to.ccy]} placeholder="0.00"
              value={sameCcy ? fromAmt : toAmt} disabled={sameCcy} onChange={(e) => setToAmt(e.target.value)} error={touched && errs.toAmt} />
          </div>
        </div>
        {touched && errs.to ? <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 8 }}>{errs.to}</div> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} size="sm" />
          {!sameCcy ? <Badge tone="warning" dot>跨币种 · 隐含成交汇率不写入 fx_rates</Badge> : <Badge tone="neutral">同币种</Badge>}
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>转账不影响净资产</span>
          <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} iconLeft={<Icon name="check" size={14} />} onClick={submit} disabled={touched && !valid}>添加转账</Button>
        </div>
      </Card>
    );
  }

  function Transfers({ ccy }) {
    const [extra, setExtra] = useState([]);
    const all = useMemo(() => [...extra, ...D.transfers].sort((a, b) => a.date < b.date ? 1 : -1), [extra]);
    return (
      <Page>
        <TransferForm onAdd={(t) => setExtra((x) => [t, ...x])} />
        <Card padded={false}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><Th>日期</Th><Th>资金流向</Th><Th right>转出</Th><Th right>转入</Th><Th>隐含汇率</Th><Th>备注</Th><Th w="50"></Th></tr></thead>
            <tbody>
              {all.map((t) => {
                const cross = t.fromCcy !== t.toCcy;
                return (
                  <Row key={t.id}>
                    <Td mono dim>{t.date}</Td>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                        <span style={{ color: "var(--text-primary)" }}>{t.from}</span>
                        <Icon name="arrow-right" size={13} color="var(--accent)" />
                        <span style={{ color: "var(--text-primary)" }}>{t.to}</span>
                      </div>
                    </Td>
                    <Td right mono color="var(--loss)">−{native(t.fromAmt, t.fromCcy, 0)}</Td>
                    <Td right mono color="var(--gain)">+{native(t.toAmt, t.toCcy, 0)}</Td>
                    <Td mono dim>{cross ? (t.toAmt / t.fromAmt).toFixed(4) : "—"}</Td>
                    <Td><span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.note || "—"}</span></Td>
                    <Td><IconButton aria-label="删除" size="sm" onClick={() => setExtra((x) => x.filter((y) => y.id !== t.id))}><Icon name="trash-2" size={13} /></IconButton></Td>
                  </Row>
                );
              })}
            </tbody>
          </table>
        </Card>
        <SectionHint>转账与交易/收益事件明确区分 · 信用卡还款走「标记已还 + payment_account_id」路径，不要求额外录一条转账</SectionHint>
      </Page>
    );
  }

  window.FBIncome = Income;
  window.FBTransfers = Transfers;
})();
