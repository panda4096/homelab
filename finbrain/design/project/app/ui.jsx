/* finbrain UI kit — shared layout/table helpers. window.FBUI */
(function () {
  const D = window.FBData;

  function Page({ children, max = 1320 }) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22, maxWidth: max, margin: "0 auto" }}>{children}</div>;
  }

  function Th({ children, right, w, sortKey, sort, onSort }) {
    const active = sort && sort.key === sortKey;
    return (
      <th onClick={sortKey ? () => onSort(sortKey) : undefined}
        style={{ textAlign: right ? "right" : "left", padding: "9px 12px", fontSize: 11, fontWeight: 500,
          color: active ? "var(--text-primary)" : "var(--text-tertiary)", whiteSpace: "nowrap", position: "sticky", top: 0,
          background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)", width: w,
          cursor: sortKey ? "pointer" : "default", userSelect: "none" }}>
        {children}{active ? <span style={{ marginLeft: 3, color: "var(--accent)" }}>{sort.dir > 0 ? "▲" : "▼"}</span> : sortKey ? <span style={{ marginLeft: 3, opacity: 0.3 }}>⇅</span> : null}
      </th>
    );
  }

  function Td({ children, right, mono, color, dim, w }) {
    return (
      <td style={{ textAlign: right ? "right" : "left", padding: "10px 12px", fontSize: 12.5,
        fontFamily: mono ? "var(--font-num)" : "var(--font-sans)", fontVariantNumeric: mono ? "tabular-nums" : undefined,
        color: color || (dim ? "var(--text-tertiary)" : "var(--text-primary)"), whiteSpace: "nowrap", width: w }}>{children}</td>
    );
  }

  // native amount with its own currency symbol
  function native(v, ccy, decimals) {
    if (v == null) return "—";
    const s = D.SYM[ccy] || (ccy + " ");
    const neg = v < 0;
    return (neg ? "−" : "") + s + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: decimals == null ? 2 : decimals, minimumFractionDigits: 0 });
  }

  // a hover-able table row
  function Row({ children, onClick, highlight }) {
    return (
      <tr onClick={onClick} style={{ borderBottom: "1px solid var(--divider)", background: highlight ? "var(--surface-inset)" : "transparent",
        transition: "var(--transition-control)", cursor: onClick ? "pointer" : "default" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-raised)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = highlight ? "var(--surface-inset)" : "transparent"; }}>
        {children}
      </tr>
    );
  }

  const KIND_LABEL = {
    cash: "活期", time_deposit: "定期", wealth_product: "理财", fund: "基金",
    brokerage: "证券", credit_card: "信用卡", crypto_wallet: "加密钱包",
  };
  const KIND_TONE = {
    cash: "var(--viz-2)", time_deposit: "var(--viz-6)", wealth_product: "var(--viz-3)",
    fund: "var(--viz-4)", brokerage: "var(--viz-1)", credit_card: "var(--loss)", crypto_wallet: "var(--viz-5)",
  };
  const MARKET_TONE = { US: "var(--viz-1)", HK: "var(--viz-3)", CN: "var(--viz-2)", CRYPTO: "var(--viz-5)", INDEX: "var(--viz-8)" };

  // section title row used above tables/cards
  function SectionHint({ children }) {
    const Icon = window.FBIcon;
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 8, lineHeight: 1.6 }}>
        <Icon name="info" size={13} /> {children}
      </div>
    );
  }

  window.FBUI = { Page, Th, Td, native, Row, KIND_LABEL, KIND_TONE, MARKET_TONE, SectionHint };
})();
