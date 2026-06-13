/* finbrain UI kit — 月度盘点向导 Review Wizard. window.FBReview */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const { Card, Button, Input, Badge, CurrencyValue, Switch } = window.Finbrain_9e1a03;
  const { useState } = React;

  const STEPS = [
    { id: 1, label: "盘点日期", icon: "calendar" },
    { id: 2, label: "金额型账户", icon: "wallet" },
    { id: 3, label: "持仓型账户", icon: "trending-up" },
    { id: 4, label: "公司动作", icon: "split" },
    { id: 5, label: "账户转账", icon: "repeat" },
    { id: 6, label: "信用卡账单", icon: "receipt" },
    { id: 7, label: "收益事件", icon: "coins" },
    { id: 8, label: "现金对账", icon: "scale" },
    { id: 9, label: "漂移检视", icon: "target" },
    { id: 10, label: "预览确认", icon: "clipboard-check" },
  ];

  const balAccounts = [
    { name: "招行 · 活期 6231", ccy: "CNY", last: 332000, now: "348,000" },
    { name: "招行 · 朝朝盈理财", ccy: "CNY", last: 320100, now: "323,280" },
    { name: "汇丰 · 港币活期", ccy: "HKD", last: 286400, now: "286,400" },
    { name: "汇丰 · 美元定期", ccy: "USD", last: 29200, now: "29,200" },
    { name: "汇丰 · 结构性理财", ccy: "USD", last: 29800, now: "30,100" },
  ];

  function StepRail({ step, setStep }) {
    return (
      <div style={{ width: 210, flex: "none", display: "flex", flexDirection: "column", gap: 2 }}>
        {STEPS.map((s) => {
          const done = s.id < step, cur = s.id === step;
          return (
            <button key={s.id} onClick={() => setStep(s.id)}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", border: "none", borderRadius: "var(--radius-md)",
                cursor: "pointer", textAlign: "left", background: cur ? "var(--accent-bg)" : "transparent", transition: "var(--transition-control)" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? "var(--accent)" : cur ? "transparent" : "var(--surface-inset)",
                border: cur ? "1.5px solid var(--accent)" : done ? "none" : "1px solid var(--border-default)",
                color: done ? "var(--accent-text)" : cur ? "var(--accent-bright)" : "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {done ? <Icon name="check" size={12} /> : s.id}
              </span>
              <span style={{ fontSize: 12.5, color: cur ? "var(--accent-bright)" : done ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: cur ? 500 : 400 }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function BalanceStep() {
    const [vals, setVals] = useState(balAccounts.map((a) => a.now));
    return (
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 150px", gap: 12, padding: "0 14px 6px", fontSize: 11, color: "var(--text-tertiary)" }}>
            <span>账户</span><span style={{ textAlign: "right" }}>上次值</span><span>当日余额</span><span></span>
          </div>
          {balAccounts.map((a, i) => {
            const changed = a.now.replace(/,/g, "") !== String(a.last);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 150px", gap: 12, alignItems: "center",
                background: "var(--surface-inset)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.name}</span>
                  <Badge tone="neutral">{a.ccy}</Badge>
                </div>
                <span className="fb-num" style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 12.5 }}>{a.last.toLocaleString()}</span>
                <Input numeric prefix={a.ccy} value={vals[i]} onChange={(e) => setVals((v) => v.map((x, j) => j === i ? e.target.value : x))} size="sm" />
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="ghost" size="xs">保留上次</Button>
                  <Button variant="ghost" size="xs">无变化</Button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12, color: "var(--text-tertiary)" }}>
          <Icon name="info" size={13} /> 同账户同日期幂等覆盖 · 缺失值不阻塞，聚合时按规则降级
        </div>
      </div>
    );
  }

  function Review({ onClose }) {
    const [step, setStep] = useState(2);
    const cur = STEPS.find((s) => s.id === step);
    return (
      <div style={{ padding: 22, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <Icon name="clipboard-check" size={20} color="var(--accent)" />
          <h2 style={{ fontSize: 20, fontWeight: 500, color: "var(--text-strong)", margin: 0 }}>2026 年 6 月盘点</h2>
          <Badge tone="gold">草稿已自动保存</Badge>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>步骤 {step} / 10</span>
            <Button variant="ghost" size="sm" onClick={onClose}>退出</Button>
          </div>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "var(--surface-inset)", margin: "12px 0 22px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: (step / 10 * 100) + "%", background: "var(--gradient-gold)", transition: "width .3s var(--ease-out)" }} />
        </div>
        <div style={{ display: "flex", gap: 26 }}>
          <StepRail step={step} setStep={setStep} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card eyebrow={"步骤 " + step} title={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><Icon name={cur.icon} size={17} color="var(--accent)" />{cur.label}</span>}
              subtitle={step === 2 ? "列出所有非信用卡的活跃账户，逐个填入当日余额" : null}
              actions={<Button variant="secondary" size="sm" iconLeft={<Icon name="copy" size={14} />}>全部保留上次</Button>}>
              {step === 2 ? <BalanceStep /> : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "44px 20px", textAlign: "center", color: "var(--text-tertiary)", gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--surface-inset)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={cur.icon} size={24} color="var(--text-secondary)" />
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{cur.label}步骤</div>
                  <div style={{ fontSize: 12.5, maxWidth: 360, lineHeight: 1.6 }}>该步骤引导业主完成本期{cur.label}的批量录入与对照（见 PRD §7.5）。可中断保存草稿，下次接着填。</div>
                </div>
              )}
            </Card>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
              <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))} iconLeft={<Icon name="arrow-left" size={15} />}>上一步</Button>
              <div style={{ display: "flex", gap: 10 }}>
                <Button variant="secondary">保存草稿</Button>
                <Button variant="primary" onClick={() => setStep((s) => Math.min(10, s + 1))} iconRight={<Icon name="arrow-right" size={15} />}>{step === 10 ? "确认提交" : "下一步"}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.FBReview = Review;
})();
