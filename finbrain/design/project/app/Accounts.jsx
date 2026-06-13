/* finbrain UI kit — 账户列表 + 账户详情 (§7.2 / §7.3). window.FBAccounts */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, StatCard, Badge, Button, CurrencyValue, DeltaValue, Sparkline, IconButton } = window.Finbrain_9e1a03;
  const { Page, Th, Td, Row, native, KIND_LABEL, KIND_TONE } = window.FBUI;
  const { useState } = React;

  function daysSince(d) {
    return Math.round((new Date("2026-06-13") - new Date(d)) / 86400000);
  }

  function KindBadge({ kind }) {
    return (
      <span className="fb-badge fb-badge--neutral" style={{ color: KIND_TONE[kind] || "var(--text-secondary)" }}>
        <span className="fb-badge__dot" style={{ background: KIND_TONE[kind] || "var(--text-secondary)" }} />{KIND_LABEL[kind] || kind}
      </span>
    );
  }

  // ---------- LIST ----------
  function AccountList({ ccy, onOpen }) {
    const sym = D.SYM[ccy];
    return (
      <Page>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>5 家机构 · {D.flatAccounts.length} 个账户 · 按机构分组，机构内按用途排序</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" iconLeft={<Icon name="layout-grid" size={14} />}>从模板建账</Button>
            <Button variant="primary" size="sm" iconLeft={<Icon name="plus" size={14} />}>新建账户</Button>
          </div>
        </div>

        {D.accounts.map((grp) => {
          const total = grp.items.reduce((s, a) => s + (a.isLiability ? -D.conv(Math.abs(a.value), "CNY", "CNY") : a.value), 0);
          return (
            <Card key={grp.inst} padded={false}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--divider)" }}>
                <Icon name="landmark" size={15} color="var(--text-tertiary)" />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{grp.inst}</span>
                <Badge tone="neutral">{grp.items.length} 账户</Badge>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>合计</span>
                <CurrencyValue value={D.conv(total, "CNY", ccy)} currency={ccy} compact size="14px" />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {grp.items.map((a) => {
                    const stale = daysSince(a.updated) > 35;
                    return (
                      <Row key={a.id} onClick={() => onOpen(a.id)}>
                        <Td w="36"><div style={{ width: 8, height: 8, borderRadius: 2, background: KIND_TONE[a.kind] || "var(--text-tertiary)" }} /></Td>
                        <Td>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <span style={{ fontSize: 13, color: "var(--text-strong)" }}>{a.name}</span>
                            <KindBadge kind={a.kind} />
                            {a.mode === "txn" ? <Badge tone="gold">交易流水</Badge> : null}
                          </div>
                        </Td>
                        <Td><Badge tone="neutral">{a.ccy}</Badge></Td>
                        <Td right mono dim>{a.kind === "credit_card" ? "—" : native(a.balance, a.ccy)}</Td>
                        <Td right mono color={a.isLiability ? "var(--loss)" : "var(--text-strong)"}>
                          {a.isLiability ? "−" : ""}{D.SYM[ccy]}{D.conv(Math.abs(a.value), "CNY", ccy).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Td>
                        <Td right><span className="fb-num" style={{ fontSize: 11.5, color: stale ? "var(--warning)" : "var(--text-tertiary)" }}>{a.updated}{stale ? " ·旧" : ""}</span></Td>
                        <Td w="90">{a.spark.length ? <Sparkline data={a.spark} width={70} height={22} dot={false} /> : null}</Td>
                        <Td w="36"><Icon name="chevron-right" size={15} color="var(--text-tertiary)" /></Td>
                      </Row>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          );
        })}
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="info" size={13} /> 超过 35 天未更新的账户在最近快照日期上标灰提示 · 信用卡账户不使用余额快照
        </div>
      </Page>
    );
  }

  // ---------- DETAIL ----------
  function AccountDetail({ id, ccy, onBack }) {
    const a = D.accountById[id];
    const positions = D.holdings.filter((h) => h.acctId === id);
    const isBroker = a.kind === "brokerage" || a.kind === "crypto_wallet";
    const txns = D.transactions.filter((t) => t.acctId === id);
    const incomes = D.incomeEvents.filter((e) => e.acctId === id);
    const xfers = D.transfers.filter((t) => t.fromId === id || t.toId === id);
    const hist = D.balanceHistory[id] || (a.kind !== "credit_card" ? [{ date: a.updated, bal: a.balance }] : []);
    const recon = id === D.reconFlow.acctId ? D.reconFlow : null;
    const posMktNative = positions.filter((p) => p.hasPrice).reduce((s, p) => s + p.mktVal, 0);

    return (
      <Page max={1180}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12.5, padding: 0, alignSelf: "flex-start" }}>
          <Icon name="arrow-left" size={15} /> 返回账户列表
        </button>

        {/* header */}
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--surface-inset)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="landmark" size={22} color={KIND_TONE[a.kind]} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontSize: 19, fontWeight: 500, color: "var(--text-strong)", margin: 0 }}>{a.inst} · {a.name}</h2>
                <KindBadge kind={a.kind} />
                <Badge tone="neutral">{a.ccy}</Badge>
                {a.mode === "txn" ? <Badge tone="gold">交易流水模式</Badge> : <Badge tone="neutral">快照模式</Badge>}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 5, fontFamily: "var(--font-mono)" }}>account #{a.id} · 最近更新 {a.updated}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={14} />}>录入快照</Button>
              <IconButton aria-label="归档"><Icon name="archive" size={15} /></IconButton>
              <IconButton aria-label="编辑"><Icon name="pencil" size={15} /></IconButton>
            </div>
          </div>
        </Card>

        {/* summary cards for holding-type accounts */}
        {isBroker && positions.length ? (
          <div className="fb-grid fb-grid--g14 kpi-4">
            <StatCard label="本账户持仓市值" value={D.conv(posMktNative, a.ccy, ccy)} currency={ccy} compact />
            <StatCard label="总浮动盈亏" raw={<span style={{ color: "var(--gain)" }}><CurrencyValue value={D.conv(posMktNative * 0.21, a.ccy, ccy)} currency={ccy} signed size="var(--text-3xl)" compact /></span>} deltaPercent={21.0} />
            <StatCard label="已实现盈亏" raw={<span style={{ color: "var(--gain)" }}><CurrencyValue value={D.conv(positions.reduce((s, p) => s + p.realized, 0), a.ccy, ccy)} currency={ccy} signed size="var(--text-3xl)" /></span>} caption="含交易历史" />
            <StatCard label="占净资产" raw={<span className="fb-num" style={{ fontSize: "var(--text-3xl)", color: "var(--text-strong)" }}>{(a.value / D.kpis.netWorth * 100).toFixed(1)}%</span>} />
          </div>
        ) : null}

        {/* reconciliation card */}
        {recon ? (
          <Card eyebrow="现金对账" title={null} tight
            actions={<Badge tone="warning" dot>差额超阈值</Badge>}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
              <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>预期余额</div><span className="fb-num" style={{ fontSize: 17, color: "var(--text-strong)" }}>{native(recon.expected, a.ccy)}</span></div>
              <Icon name="minus" size={14} color="var(--text-tertiary)" />
              <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>最新快照</div><span className="fb-num" style={{ fontSize: 17, color: "var(--text-strong)" }}>{native(recon.snapshot, a.ccy)}</span></div>
              <Icon name="equal" size={14} color="var(--text-tertiary)" />
              <div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>差额</div><span className="fb-num" style={{ fontSize: 17, color: "var(--warning)" }}>+{native(recon.expected - recon.snapshot, a.ccy)}</span></div>
              <Button variant="secondary" size="sm" style={{ marginLeft: "auto" }} iconRight={<Icon name="arrow-right" size={14} />}>前往现金对账</Button>
            </div>
          </Card>
        ) : null}

        {/* positions */}
        {positions.length ? (
          <Card eyebrow="持仓" title={null} padded={false}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <Th>标的</Th><Th right>数量</Th><Th right>加权买入</Th><Th right>净持有</Th><Th right>现价</Th>
                <Th right>持仓市值</Th><Th right>浮动盈亏率</Th><Th right>已实现</Th><Th right>累计收益</Th><Th>持仓时长</Th>
              </tr></thead>
              <tbody>
                {positions.map((h) => (
                  <Row key={h.sym} highlight={!h.hasPrice}>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)", fontSize: 13 }}>{h.sym}</span>
                        {!h.settled ? <Badge tone="warning">未结算</Badge> : null}
                        {!h.hasPrice ? <Badge tone="danger">无价格</Badge> : null}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{h.name}</div>
                    </Td>
                    <Td right mono>{h.qty}</Td>
                    <Td right mono dim>{native(h.avgCost, h.qccy)}</Td>
                    <Td right mono dim>{native(h.effCost, h.qccy)}</Td>
                    <Td right mono color={h.hasPrice ? "var(--text-strong)" : "var(--text-tertiary)"}>{h.hasPrice ? native(h.price, h.qccy) : "—"}</Td>
                    <Td right mono color="var(--text-strong)">{h.hasPrice ? native(h.mktVal, h.qccy, 0) : "—"}</Td>
                    <Td right>{h.plPct == null ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : <DeltaValue percent={h.plPct} />}</Td>
                    <Td right mono color={h.realized > 0 ? "var(--gain)" : h.realized < 0 ? "var(--loss)" : "var(--text-tertiary)"}>{h.realized ? (h.realized > 0 ? "+" : "−") + Math.abs(h.realized) : "—"}</Td>
                    <Td right mono dim>{h.income ? "+" + h.income : "—"}</Td>
                    <Td><span className="fb-num" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{daysSince(h.first)} 天</span></Td>
                  </Row>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        {/* balance snapshots */}
        {hist.length ? (
          <Card eyebrow="余额快照 · 时间倒序" title={null} padded={false}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>日期</Th><Th right>余额（{a.ccy}）</Th><Th right>折算（{ccy}）</Th><Th>变化</Th><Th w="80"></Th></tr></thead>
              <tbody>
                {hist.map((s, i) => {
                  const prev = hist[i + 1];
                  const delta = prev ? s.bal - prev.bal : null;
                  return (
                    <Row key={i}>
                      <Td mono>{s.date}</Td>
                      <Td right mono color="var(--text-strong)">{native(s.bal, a.ccy)}</Td>
                      <Td right mono dim>{native(D.conv(s.bal, a.ccy, ccy), ccy, 0)}</Td>
                      <Td>{delta == null ? <span style={{ color: "var(--text-tertiary)" }}>首次</span> : <DeltaValue value={delta} />}</Td>
                      <Td right><span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>编辑</span></Td>
                    </Row>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : null}

        {/* transactions + income side by side */}
        <div className={txns.length && incomes.length ? "fb-grid split-2" : "fb-grid"}>
          {txns.length ? (
            <Card eyebrow="交易流水" title={null} padded={false}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><Th>日期</Th><Th>标的</Th><Th>方向</Th><Th right>数量 @ 价格</Th><Th>状态</Th></tr></thead>
                <tbody>
                  {txns.map((t) => (
                    <Row key={t.id}>
                      <Td mono dim>{t.date}</Td>
                      <Td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{t.sym}</span></Td>
                      <Td><span style={{ color: t.action === "buy" ? "var(--gain)" : "var(--loss)", fontWeight: 500 }}>{t.action === "buy" ? "买入" : "卖出"}</span></Td>
                      <Td right mono>{t.qty} @ {native(t.price, t.ccy)}</Td>
                      <Td>{t.settled ? <Badge tone="success">已结算</Badge> : <Badge tone="warning" dot>未结算</Badge>}</Td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
          {incomes.length ? (
            <Card eyebrow="收益事件" title={null} padded={false}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><Th>日期</Th><Th>类型</Th><Th>标的</Th><Th right>金额</Th></tr></thead>
                <tbody>
                  {incomes.map((e) => (
                    <Row key={e.id}>
                      <Td mono dim>{e.date}</Td>
                      <Td><Badge tone="neutral">{{ dividend: "分红", interest: "利息", rebate: "返现", other: "其他" }[e.kind]}</Badge></Td>
                      <Td>{e.sym || "—"}</Td>
                      <Td right mono color={e.amount < 0 ? "var(--loss)" : "var(--gain)"}>{e.amount < 0 ? "−" : "+"}{native(Math.abs(e.amount), e.ccy)}</Td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </div>

        {/* transfers */}
        {xfers.length ? (
          <Card eyebrow="转入 / 转出" title={null} padded={false}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>日期</Th><Th>方向</Th><Th>对手账户</Th><Th right>金额</Th></tr></thead>
              <tbody>
                {xfers.map((t) => {
                  const out = t.fromId === id;
                  return (
                    <Row key={t.id}>
                      <Td mono dim>{t.date}</Td>
                      <Td><span style={{ color: out ? "var(--loss)" : "var(--gain)" }}>{out ? "转出 ↗" : "转入 ↙"}</span></Td>
                      <Td>{out ? t.to : t.from}</Td>
                      <Td right mono color={out ? "var(--loss)" : "var(--gain)"}>{out ? "−" + native(t.fromAmt, t.fromCcy) : "+" + native(t.toAmt, t.toCcy)}</Td>
                    </Row>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : null}

        {/* credit card bills */}
        {a.kind === "credit_card" ? (
          <Card eyebrow="信用卡账单" title={null} padded={false}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>出账日</Th><Th right>总额</Th><Th>顶类目</Th><Th>状态</Th></tr></thead>
              <tbody>
                {D.ccBills.map((b, i) => (
                  <Row key={i}>
                    <Td mono dim>{b.date}</Td>
                    <Td right mono color="var(--loss)">{native(b.total, b.ccy, 0)}</Td>
                    <Td><span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{b.cats.map((c) => c.name).join(" · ")}</span></Td>
                    <Td>{b.paid ? <Badge tone="success">已还</Badge> : <Badge tone="warning" dot>未还</Badge>}</Td>
                  </Row>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </Page>
    );
  }

  function Accounts({ ccy, openId, setOpenId }) {
    const [local, setLocal] = useState(null);
    const id = openId != null ? openId : local;
    if (id != null) return <AccountDetail id={id} ccy={ccy} onBack={() => { setLocal(null); if (setOpenId) setOpenId(null); }} />;
    return <AccountList ccy={ccy} onOpen={(x) => { setLocal(x); if (setOpenId) setOpenId(x); }} />;
  }

  window.FBAccounts = Accounts;
})();
