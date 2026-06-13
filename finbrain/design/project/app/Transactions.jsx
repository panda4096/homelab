/* finbrain UI kit — 持仓交易录入 + 列表 (§7.9). window.FBTransactions */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Button, Input, Select, Segmented, Switch, Badge, Tag, IconButton } = window.Finbrain_9e1a03;
  const { Page, Th, Td, Row, native } = window.FBUI;
  const { useState, useMemo } = React;

  const holdAccts = D.flatAccounts.filter((a) => a.kind === "brokerage" || a.kind === "crypto_wallet");
  const symList = D.instruments.filter((i) => !i.bench).map((i) => i.sym);

  function EntryForm({ onAdd }) {
    const [action, setAction] = useState("buy");
    const [acctId, setAcctId] = useState(String(holdAccts[0].id));
    const [sym, setSym] = useState("");
    const [date, setDate] = useState("2026-06-13");
    const [settle, setSettle] = useState("");
    const [qty, setQty] = useState("");
    const [price, setPrice] = useState("");
    const [fee, setFee] = useState("");
    const [settled, setSettled] = useState(false);
    const [touched, setTouched] = useState(false);

    const acct = D.accountById[+acctId];
    const inst = D.instruments.find((i) => i.sym === sym.toUpperCase());
    const ccy = inst ? inst.qccy : acct.ccy;
    const known = symList.includes(sym.toUpperCase());

    const errs = {};
    if (!sym.trim()) errs.sym = "请填写标的";
    if (!(+qty > 0)) errs.qty = "数量必须 > 0";
    if (price === "" || +price < 0) errs.price = "单价必须 ≥ 0";
    if (fee !== "" && +fee < 0) errs.fee = "手续费不能为负";
    const valid = Object.keys(errs).length === 0;

    const gross = (+qty || 0) * (+price || 0);
    const cashEffect = action === "buy" ? -(gross + (+fee || 0)) : gross - (+fee || 0);

    function submit() {
      setTouched(true);
      if (!valid) return;
      onAdd({
        id: Date.now(), acctId: +acctId, acct: acct.inst.replace("证券", "").replace(" HK", "") + "·" + acct.name.replace("账户", ""),
        sym: sym.toUpperCase(), action, date, settle: settle || null, qty: +qty, price: +price, ccy,
        fee: fee === "" ? null : +fee, settled,
      });
      setSym(""); setQty(""); setPrice(""); setFee(""); setSettled(false); setTouched(false);
    }

    return (
      <Card eyebrow="录入交易" title={null}
        actions={<Segmented size="sm" value={action} onChange={setAction}
          options={[{ value: "buy", label: "买入" }, { value: "sell", label: "卖出" }]} />}>
        <div className="fb-form form-4">
          <div className="fb-field">
            <label className="fb-field__label">账户（仅持仓型）</label>
            <Select value={acctId} onChange={(e) => setAcctId(e.target.value)}
              options={holdAccts.map((a) => ({ value: String(a.id), label: a.inst + "·" + a.name + " (" + a.ccy + ")" }))} />
          </div>
          <div>
            <Input label="标的" icon={<Icon name="search" size={14} />} placeholder="GOOG / 0700.HK" value={sym}
              onChange={(e) => setSym(e.target.value)} list="fb-syms" error={touched && errs.sym} />
            <datalist id="fb-syms">{symList.map((s) => <option key={s} value={s} />)}</datalist>
            {sym && !known ? <span style={{ fontSize: 10.5, color: "var(--warning)", display: "block", marginTop: 3 }}>新标的，提交后补全元数据</span> : null}
          </div>
          <Input label="成交日" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="结算日（可选）" type="date" value={settle} onChange={(e) => setSettle(e.target.value)} />
        </div>
        <div className="fb-form form-4" style={{ marginTop: 12 }}>
          <Input label="数量" numeric placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} error={touched && errs.qty} />
          <Input label="单价" numeric prefix={D.SYM[ccy]} placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} error={touched && errs.price} />
          <Input label="手续费（可选）" numeric prefix={D.SYM[ccy]} placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} error={touched && errs.fee} />
          <div className="fb-field">
            <label className="fb-field__label">对账状态</label>
            <div style={{ height: 34, display: "flex", alignItems: "center" }}><Switch checked={settled} onChange={setSettled} label={settled ? "已结算" : "未结算"} /></div>
          </div>
        </div>

        {/* impact preview */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, padding: "11px 14px", background: "var(--surface-inset)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>影响预览</span>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>成交额 <span className="fb-num" style={{ color: "var(--text-strong)" }}>{native(gross, ccy)}</span></div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>现金影响 <span className="fb-num" style={{ color: cashEffect < 0 ? "var(--loss)" : "var(--gain)" }}>{cashEffect < 0 ? "−" : "+"}{native(Math.abs(cashEffect), ccy)}</span></div>
          {inst && inst.qccy !== acct.ccy ? <Badge tone="warning" dot>币种与账户不一致</Badge> : null}
          <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} iconLeft={<Icon name="check" size={14} />} onClick={submit} disabled={touched && !valid}>添加交易</Button>
        </div>
      </Card>
    );
  }

  function Transactions({ ccy }) {
    const [extra, setExtra] = useState([]);
    const [acctFilter, setAcctFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [overrides, setOverrides] = useState({});
    const [sort, setSort] = useState({ key: "date", dir: -1 });

    const all = useMemo(() => [...extra, ...D.transactions].map((t) => ({ ...t, settled: overrides[t.id] != null ? overrides[t.id] : t.settled })), [extra, overrides]);
    let rows = all.filter((t) => (acctFilter === "all" || t.acctId === +acctFilter) && (statusFilter === "all" || (statusFilter === "settled" ? t.settled : !t.settled)));
    rows = [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
    const onSort = (key) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
    const toggle = (t) => setOverrides((o) => ({ ...o, [t.id]: !t.settled }));
    const del = (t) => { setExtra((e) => e.filter((x) => x.id !== t.id)); };
    const unsettledCount = all.filter((t) => !t.settled).length;

    return (
      <Page>
        <EntryForm onAdd={(t) => setExtra((e) => [t, ...e])} />

        {/* filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 200 }}>
            <Select size="sm" value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)}
              options={[{ value: "all", label: "全部账户" }, ...holdAccts.map((a) => ({ value: String(a.id), label: a.inst + "·" + a.name }))]} />
          </div>
          <Segmented size="sm" value={statusFilter} onChange={setStatusFilter}
            options={[{ value: "all", label: "全部" }, { value: "settled", label: "已结算" }, { value: "unsettled", label: "未结算" }]} />
          {unsettledCount ? <Badge tone="warning" dot>{unsettledCount} 笔未结算</Badge> : null}
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-tertiary)" }}>{rows.length} 笔 · 任意字段可 in-place 修改，无 reversal 单</span>
        </div>

        <Card padded={false}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead><tr>
              <Th sortKey="date" sort={sort} onSort={onSort}>成交日</Th>
              <Th>账户</Th>
              <Th sortKey="sym" sort={sort} onSort={onSort}>标的</Th>
              <Th>方向</Th>
              <Th right sortKey="qty" sort={sort} onSort={onSort}>数量</Th>
              <Th right sortKey="price" sort={sort} onSort={onSort}>单价</Th>
              <Th right>手续费</Th>
              <Th right>成交额</Th>
              <Th>结算日</Th>
              <Th>状态</Th>
              <Th w="60"></Th>
            </tr></thead>
            <tbody>
              {rows.map((t) => (
                <Row key={t.id}>
                  <Td mono dim>{t.date}</Td>
                  <Td><span style={{ fontSize: 12 }}>{t.acct}</span></Td>
                  <Td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{t.sym}</span></Td>
                  <Td><span style={{ color: t.action === "buy" ? "var(--gain)" : "var(--loss)", fontWeight: 500 }}>{t.action === "buy" ? "买入" : "卖出"}</span></Td>
                  <Td right mono>{t.qty}</Td>
                  <Td right mono>{native(t.price, t.ccy)}</Td>
                  <Td right mono dim>{t.fee == null ? "—" : native(t.fee, t.ccy)}</Td>
                  <Td right mono color="var(--text-strong)">{native(t.qty * t.price, t.ccy, 0)}</Td>
                  <Td mono dim>{t.settle || "—"}</Td>
                  <Td><button onClick={() => toggle(t)} title="双击切换状态" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                    {t.settled ? <Badge tone="success">已结算</Badge> : <Badge tone="warning" dot>未结算</Badge>}
                  </button></Td>
                  <Td><IconButton aria-label="删除" size="sm" onClick={() => del(t)}><Icon name="trash-2" size={13} /></IconButton></Td>
                </Row>
              ))}
            </tbody>
          </table>
        </Card>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="info" size={13} /> 点击状态徽章在「已结算 / 未结算」间切换 · 跨币种买卖请先用账户转账换汇至同币种子户
        </div>
      </Page>
    );
  }

  window.FBTransactions = Transactions;
})();
