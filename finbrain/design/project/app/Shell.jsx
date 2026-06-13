/* finbrain UI kit — Sidebar + Topbar shell. window.FBShell = { Sidebar, Topbar } */
(function () {
  const Icon = window.FBIcon;
  const { Segmented, IconButton, Button, Badge } = window.Finbrain_9e1a03;

  const NAV = [
    { section: "概览", items: [
      { id: "dashboard", label: "仪表盘", icon: "layout-dashboard" },
      { id: "holdings", label: "持仓总览", icon: "trending-up" },
      { id: "trend", label: "趋势分析", icon: "chart-spline" },
      { id: "compare", label: "期间对比", icon: "git-compare-arrows" },
      { id: "pivot", label: "多维聚合", icon: "table-2" },
    ]},
    { section: "录入", items: [
      { id: "review", label: "月度盘点", icon: "list-checks", accent: true },
      { id: "transactions", label: "持仓交易", icon: "arrow-left-right" },
      { id: "income", label: "收益事件", icon: "coins" },
      { id: "transfers", label: "账户转账", icon: "repeat" },
    ]},
    { section: "管理", items: [
      { id: "accounts", label: "账户列表", icon: "landmark" },
      { id: "targets", label: "目标配置", icon: "target" },
      { id: "recon", label: "现金对账", icon: "scale" },
      { id: "market", label: "价格 / 汇率 / 基准", icon: "candlestick-chart" },
      { id: "settings", label: "设置", icon: "settings" },
    ]},
  ];

  function Sidebar({ active, onNav, mode, onMode }) {
    const copilot = mode === "copilot";
    return (
      <aside style={{ width: copilot ? 348 : "var(--sidebar-width)", background: "var(--surface-panel)", borderRight: "1px solid var(--divider)",
        display: "flex", flexDirection: "column", flex: "none", height: "100%", transition: "width .24s var(--ease-out)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 14px", borderBottom: "1px solid var(--divider)" }}>
          <img src="app/assets/logo/finbrain-wordmark.svg" height="31" alt="finbrain" style={{ display: "block" }} />
        </div>
        <div style={{ padding: "10px 10px 6px" }}>
          <Segmented size="sm" value={mode} onChange={onMode}
            options={[{ value: "nav", label: "导航" }, { value: "copilot", label: "Copilot" }]} />
        </div>
        {copilot ? <window.FBCopilot onClose={() => onMode("nav")} /> : (
        <React.Fragment>
        <nav style={{ flex: 1, overflowY: "auto", padding: "4px 10px 18px" }}>
          {NAV.map((grp) => (
            <div key={grp.section} style={{ marginBottom: 14 }}>
              <div className="fb-eyebrow" style={{ padding: "8px 10px 6px" }}>{grp.section}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {grp.items.map((it) => {
                  const on = active === it.id;
                  return (
                    <button key={it.id} onClick={() => onNav(it.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "none",
                        borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", width: "100%",
                        background: on ? "var(--accent-bg)" : "transparent",
                        color: on ? "var(--accent-bright)" : "var(--text-secondary)",
                        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: on ? 500 : 400,
                        boxShadow: on ? "inset 2px 0 0 var(--accent)" : "none", transition: "var(--transition-control)" }}
                      onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
                      onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; } }}>
                      <Icon name={it.icon} size={16} stroke={on ? 1.9 : 1.7} />
                      <span style={{ flex: 1 }}>{it.label}</span>
                      {it.accent ? <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--gradient-gold)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)", fontWeight: 700, fontSize: 12, flex: "none" }}>业</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--text-primary)" }}>业主</div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>self-hosted · k3s</div>
          </div>
        </div>
        </React.Fragment>
        )}
      </aside>
    );
  }

  function Topbar({ title, ccy, onCcy, convention, onConvention, onReview, onNL }) {
    return (
      <header style={{ height: "var(--topbar-height)", flex: "none", borderBottom: "1px solid var(--divider)",
        background: "color-mix(in srgb, var(--surface-base) 82%, transparent)", backdropFilter: "var(--blur-bar)",
        display: "flex", alignItems: "center", gap: 14, padding: "0 22px", position: "sticky", top: 0, zIndex: 20 }}>
        <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-strong)", margin: 0, whiteSpace: "nowrap" }}>{title}</h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          <Segmented options={["CNY", "HKD", "USD"]} value={ccy} onChange={onCcy} size="sm" />
          <IconButton aria-label="刷新"><Icon name="refresh-cw" size={16} /></IconButton>
          <div style={{ position: "relative" }}>
            <IconButton aria-label="通知"><Icon name="bell" size={16} /></IconButton>
            <span style={{ position: "absolute", top: 6, right: 7, width: 6, height: 6, borderRadius: "50%", background: "var(--warning)", border: "1.5px solid var(--surface-base)" }} />
          </div>
        </div>
      </header>
    );
  }

  window.FBShell = { Sidebar, Topbar, NAV };
})();
