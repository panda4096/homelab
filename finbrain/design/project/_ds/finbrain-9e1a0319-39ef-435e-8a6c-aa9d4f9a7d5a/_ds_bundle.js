/* @ds-bundle: {"format":3,"namespace":"Finbrain_9e1a03","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Segmented","sourcePath":"components/core/Segmented.jsx"},{"name":"Select","sourcePath":"components/core/Select.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"AllocationBar","sourcePath":"components/finance/AllocationBar.jsx"},{"name":"CurrencyValue","sourcePath":"components/finance/CurrencyValue.jsx"},{"name":"DeltaValue","sourcePath":"components/finance/DeltaValue.jsx"},{"name":"Sparkline","sourcePath":"components/finance/Sparkline.jsx"},{"name":"StatCard","sourcePath":"components/finance/StatCard.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"f63158b85e78","components/core/Button.jsx":"d4a0f3f79c5e","components/core/Card.jsx":"2b3746d612d4","components/core/IconButton.jsx":"edbbe03ef576","components/core/Input.jsx":"0e18835ffe41","components/core/Segmented.jsx":"0d7b5c5bcb42","components/core/Select.jsx":"380a783b0ca9","components/core/Switch.jsx":"f61228d312bb","components/core/Tag.jsx":"4fb8dcaf94fc","components/finance/AllocationBar.jsx":"d06c709a06f7","components/finance/CurrencyValue.jsx":"21c0113fbaef","components/finance/DeltaValue.jsx":"ebd1c614d217","components/finance/Sparkline.jsx":"59f9ebb35525","components/finance/StatCard.jsx":"7a8dc8712aef","ui_kits/finbrain/Dashboard.jsx":"2a41e2c41185","ui_kits/finbrain/Holdings.jsx":"087fe8b2280e","ui_kits/finbrain/ReviewWizard.jsx":"ec7ba8ae8641","ui_kits/finbrain/Shell.jsx":"71105a8eded5","ui_kits/finbrain/TrendAnalysis.jsx":"4694d91104fd","ui_kits/finbrain/charts.jsx":"e818d11806b0","ui_kits/finbrain/data.js":"5bdcc3e58d1d","ui_kits/finbrain/icons.jsx":"602d7c42ca7b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.Finbrain_9e1a03 = window.Finbrain_9e1a03 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — compact status / category label.
 */
function Badge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
  ...rest
}) {
  const cls = ["fb-badge", `fb-badge--${tone}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    className: "fb-badge__dot"
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — primary action control for finbrain's dark UI.
 * Variants map to the champagne-gold accent ladder; sizes are dense by default.
 */
function Button({
  variant = "secondary",
  size = "md",
  block = false,
  iconLeft = null,
  iconRight = null,
  disabled = false,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const cls = ["fb-btn", `fb-btn--${variant}`, size !== "md" ? `fb-btn--${size}` : "", block ? "fb-btn--block" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    disabled: disabled
  }, rest), iconLeft ? /*#__PURE__*/React.createElement("span", {
    className: "fb-btn__icon"
  }, iconLeft) : null, children != null ? /*#__PURE__*/React.createElement("span", null, children) : null, iconRight ? /*#__PURE__*/React.createElement("span", {
    className: "fb-btn__icon"
  }, iconRight) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — surface container. Optional header (eyebrow/title/subtitle + actions).
 * Compose freely; pass `header` + `actions` or just children.
 */
function Card({
  title = null,
  subtitle = null,
  eyebrow = null,
  actions = null,
  inset = false,
  flush = false,
  padded = true,
  tight = false,
  className = "",
  bodyClassName = "",
  children,
  ...rest
}) {
  const cls = ["fb-card", inset ? "fb-card--inset" : "", flush ? "fb-card--flush" : "", className].filter(Boolean).join(" ");
  const hasHeader = title || subtitle || eyebrow || actions;
  const bodyCls = ["fb-card__body", tight ? "fb-card__body--tight" : "", bodyClassName].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("section", _extends({
    className: cls
  }, rest), hasHeader ? /*#__PURE__*/React.createElement("header", {
    className: "fb-card__header"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "fb-card__eyebrow"
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("div", {
    className: "fb-card__title"
  }, title) : null, subtitle ? /*#__PURE__*/React.createElement("div", {
    className: "fb-card__subtitle"
  }, subtitle) : null), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "center"
    }
  }, actions) : null) : null, padded ? /*#__PURE__*/React.createElement("div", {
    className: bodyCls
  }, children) : children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square, icon-only control for toolbars and table rows.
 */
function IconButton({
  size = "md",
  solid = false,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
  children,
  ...rest
}) {
  const cls = ["fb-iconbtn", size !== "md" ? `fb-iconbtn--${size}` : "", solid ? "fb-iconbtn--solid" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    disabled: disabled,
    "aria-label": ariaLabel
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — text/number field with label, affix, icon, and error states.
 * Use numeric={true} for money/quantity fields → tabular figures, right aligned.
 */
function Input({
  label = null,
  hint = null,
  error = null,
  numeric = false,
  prefix = null,
  suffix = null,
  icon = null,
  size = "md",
  disabled = false,
  className = "",
  id,
  ...rest
}) {
  const wrapCls = ["fb-input-wrap", size === "sm" ? "fb-input-wrap--sm" : "", error ? "fb-input-wrap--error" : "", disabled ? "fb-input-wrap--disabled" : ""].filter(Boolean).join(" ");
  const inputCls = ["fb-input", numeric ? "fb-input--num" : "", className].filter(Boolean).join(" ");
  const field = /*#__PURE__*/React.createElement("div", {
    className: wrapCls
  }, icon ? /*#__PURE__*/React.createElement("span", {
    className: "fb-input__icon"
  }, icon) : null, prefix ? /*#__PURE__*/React.createElement("span", {
    className: "fb-input__affix"
  }, prefix) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: id,
    className: inputCls,
    disabled: disabled,
    inputMode: numeric ? "decimal" : undefined
  }, rest)), suffix ? /*#__PURE__*/React.createElement("span", {
    className: "fb-input__affix"
  }, suffix) : null);
  if (!label && !hint && !error) return field;
  return /*#__PURE__*/React.createElement("div", {
    className: "fb-field"
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "fb-field__label",
    htmlFor: id
  }, label) : null, field, error ? /*#__PURE__*/React.createElement("span", {
    className: "fb-field__hint fb-field__hint--error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "fb-field__hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Segmented.jsx
try { (() => {
/**
 * Segmented — inline single-choice control. Used heavily for
 * 展示币种切换 / buy·sell / 成本口径 / 对比口径.
 */
function Segmented({
  options = [],
  value,
  onChange,
  size = "md",
  accent = false,
  className = ""
}) {
  const norm = options.map(o => typeof o === "string" ? {
    value: o,
    label: o
  } : o);
  const cls = ["fb-segmented", size === "sm" ? "fb-segmented--sm" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: cls,
    role: "tablist"
  }, norm.map(o => {
    const isActive = o.value === value;
    const optCls = ["fb-segmented__opt", isActive ? "fb-segmented__opt--active" : "", isActive && accent ? "fb-segmented__opt--accent" : ""].filter(Boolean).join(" ");
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      type: "button",
      role: "tab",
      "aria-selected": isActive,
      className: optCls,
      onClick: () => onChange && onChange(o.value)
    }, o.icon ? /*#__PURE__*/React.createElement("span", {
      className: "fb-btn__icon"
    }, o.icon) : null, o.label);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/core/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — native-backed dropdown styled for the dark UI.
 * Options: array of { value, label } or strings.
 */
function Select({
  options = [],
  size = "md",
  className = "",
  value,
  onChange,
  ...rest
}) {
  const norm = options.map(o => typeof o === "string" ? {
    value: o,
    label: o
  } : o);
  const cls = ["fb-select", size === "sm" ? "fb-select--sm" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", {
    className: "fb-select-wrap",
    style: {
      width: rest.fullWidth ? "100%" : undefined
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: cls,
    value: value,
    onChange: onChange
  }, rest), norm.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    className: "fb-select-wrap__chevron"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 6.5l4 4 4-4",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Select.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Switch — boolean toggle (e.g. "仅含已结算", 仪表盘可见).
 */
function Switch({
  checked = false,
  onChange,
  label = null,
  disabled = false,
  className = "",
  ...rest
}) {
  const cls = ["fb-switch", checked ? "fb-switch--on" : "", disabled ? "fb-switch--disabled" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("label", {
    className: cls
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked, e),
    style: {
      position: "absolute",
      opacity: 0,
      width: 1,
      height: 1
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "fb-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fb-switch__thumb"
  })), label ? /*#__PURE__*/React.createElement("span", {
    className: "fb-switch__label"
  }, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tag — filter chip. Clickable + active states for toolbars and filters.
 */
function Tag({
  active = false,
  clickable = false,
  dotColor = null,
  onClose = null,
  className = "",
  children,
  ...rest
}) {
  const cls = ["fb-tag", clickable || rest.onClick ? "fb-tag--clickable" : "", active ? "fb-tag--active" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dotColor ? /*#__PURE__*/React.createElement("span", {
    className: "fb-tag__dot",
    style: {
      background: dotColor
    }
  }) : null, children, onClose ? /*#__PURE__*/React.createElement("span", {
    className: "fb-tag__close",
    role: "button",
    "aria-label": "\u79FB\u9664",
    onClick: e => {
      e.stopPropagation();
      onClose(e);
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 12 12",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 3l6 6M9 3l-6 6",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }))) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/finance/AllocationBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];

/**
 * AllocationBar — a segmented proportion bar with legend, for asset allocation
 * by 用途 / 币种 / 市场 / 机构. Items: { name, value, color? }.
 */
function AllocationBar({
  items = [],
  showLegend = true,
  showPct = true,
  height = 10,
  className = "",
  ...rest
}) {
  const total = items.reduce((s, it) => s + Math.max(0, it.value || 0), 0) || 1;
  const withPct = items.map((it, i) => ({
    ...it,
    color: it.color || VIZ[i % VIZ.length],
    pct: Math.max(0, it.value || 0) / total * 100
  }));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["fb-alloc", className].filter(Boolean).join(" ")
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "fb-alloc__track",
    style: {
      height
    }
  }, withPct.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "fb-alloc__seg",
    style: {
      width: `${it.pct}%`,
      background: it.color
    },
    title: `${it.name} · ${it.pct.toFixed(1)}%`
  }))), showLegend ? /*#__PURE__*/React.createElement("div", {
    className: "fb-alloc__legend"
  }, withPct.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "fb-alloc__item",
    style: {
      minWidth: 132
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fb-alloc__swatch",
    style: {
      background: it.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "fb-alloc__name"
  }, it.name), showPct ? /*#__PURE__*/React.createElement("span", {
    className: "fb-alloc__pct"
  }, it.pct.toFixed(1), "%") : null))) : null);
}
Object.assign(__ds_scope, { AllocationBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/AllocationBar.jsx", error: String((e && e.message) || e) }); }

// components/finance/CurrencyValue.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CCY_SYMBOL = {
  CNY: "¥",
  HKD: "HK$",
  USD: "$",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
  SGD: "S$",
  TWD: "NT$"
};
function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * CurrencyValue — money figure with tabular figures, grouped thousands,
 * and a quiet currency marker. Dimmed decimals for scan-ability.
 */
function CurrencyValue({
  value,
  currency = "CNY",
  decimals = 2,
  showSymbol = true,
  showCode = false,
  signed = false,
  hero = false,
  compact = false,
  size = null,
  className = "",
  ...rest
}) {
  if (value == null || Number.isNaN(value)) {
    return /*#__PURE__*/React.createElement("span", _extends({
      className: ["fb-metric", className].filter(Boolean).join(" "),
      style: size ? {
        fontSize: size
      } : undefined
    }, rest), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-tertiary)"
      }
    }, "\u2014"));
  }
  const neg = value < 0;
  let abs = Math.abs(value);
  let suffix = "";
  if (compact && abs >= 1e8) {
    abs = abs / 1e8;
    suffix = "亿";
  } else if (compact && abs >= 1e4) {
    abs = abs / 1e4;
    suffix = "万";
  }
  const dec = suffix ? Math.min(decimals, 2) : decimals;
  const fixed = abs.toFixed(dec);
  const [intPart, decPart] = fixed.split(".");
  const sign = neg ? "−" : signed ? "+" : "";
  const cls = ["fb-metric", hero ? "fb-metric--hero" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    style: size ? {
      fontSize: size
    } : undefined
  }, rest), showSymbol ? /*#__PURE__*/React.createElement("span", {
    className: "fb-metric__ccy"
  }, CCY_SYMBOL[currency] || currency) : null, sign, group(intPart), decPart ? /*#__PURE__*/React.createElement("span", {
    className: "fb-metric__dec"
  }, ".", decPart) : null, suffix ? /*#__PURE__*/React.createElement("span", {
    className: "fb-metric__dec",
    style: {
      marginLeft: "0.1em"
    }
  }, suffix) : null, showCode ? /*#__PURE__*/React.createElement("span", {
    className: "fb-metric__ccy",
    style: {
      marginLeft: "0.4em",
      marginRight: 0
    }
  }, currency) : null);
}
Object.assign(__ds_scope, { CurrencyValue });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/CurrencyValue.jsx", error: String((e && e.message) || e) }); }

// components/finance/DeltaValue.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * DeltaValue — a signed change, colored by the active gain/loss convention.
 * Direction follows the value sign; color comes from --gain / --loss so it
 * respects <html data-market-convention>. Render as a value, a percent, or both.
 */
function DeltaValue({
  value = null,
  percent = null,
  currency = null,
  decimals = 2,
  arrow = true,
  pill = false,
  showZero = false,
  className = "",
  ...rest
}) {
  const ref = value != null ? value : percent;
  const dir = ref == null || ref === 0 && !showZero ? "flat" : ref > 0 ? "up" : "down";
  const cls = ["fb-delta", `fb-delta--${dir}`, pill ? "fb-delta--pill" : "", className].filter(Boolean).join(" ");
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
  function fmtNum(n) {
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    const body = group(Math.abs(n).toFixed(decimals));
    return `${sign}${currency ? "" : ""}${body}`;
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), arrow ? /*#__PURE__*/React.createElement("span", {
    className: "fb-delta__arrow"
  }, glyph) : null, value != null ? /*#__PURE__*/React.createElement("span", null, fmtNum(value)) : null, value != null && percent != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.6
    }
  }, "\xB7") : null, percent != null ? /*#__PURE__*/React.createElement("span", null, (percent > 0 ? "+" : percent < 0 ? "−" : "") + Math.abs(percent).toFixed(2) + "%") : null);
}
Object.assign(__ds_scope, { DeltaValue });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/DeltaValue.jsx", error: String((e && e.message) || e) }); }

// components/finance/Sparkline.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Sparkline — compact trend line for table rows, KPI tiles, and watchlists.
 * `tone`: "auto" colors by first→last direction (gain/loss convention aware),
 * "gold" uses the brand accent, or pass an explicit CSS color.
 */
function Sparkline({
  data = [],
  width = 96,
  height = 28,
  tone = "auto",
  fill = true,
  strokeWidth = 1.5,
  dot = true,
  className = "",
  ...rest
}) {
  if (!data || data.length < 2) {
    return /*#__PURE__*/React.createElement("svg", _extends({
      width: width,
      height: height,
      className: className
    }, rest));
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth + 1;
  const innerH = height - pad * 2;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, pad + innerH - (v - min) / span * innerH]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  let color;
  if (tone === "auto") color = data[data.length - 1] >= data[0] ? "var(--gain)" : "var(--loss)";else if (tone === "gold") color = "var(--accent)";else color = tone;
  const gid = "spk" + Math.random().toString(36).slice(2, 8);
  const last = pts[pts.length - 1];
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: width,
    height: height,
    className: className,
    style: {
      display: "block",
      overflow: "visible"
    }
  }, rest), fill ? /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gid,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: color,
    stopOpacity: "0.22"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: color,
    stopOpacity: "0"
  }))) : null, fill ? /*#__PURE__*/React.createElement("path", {
    d: area,
    fill: `url(#${gid})`
  }) : null, /*#__PURE__*/React.createElement("path", {
    d: line,
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), dot ? /*#__PURE__*/React.createElement("circle", {
    cx: last[0],
    cy: last[1],
    r: strokeWidth + 0.6,
    fill: color
  }) : null);
}
Object.assign(__ds_scope, { Sparkline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/Sparkline.jsx", error: String((e && e.message) || e) }); }

// components/finance/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatCard — a KPI tile: label, big figure, optional delta foot.
 * Compose into the dashboard summary row.
 */
function StatCard({
  label,
  value,
  currency = "CNY",
  decimals = 2,
  compact = false,
  hero = false,
  deltaValue = null,
  deltaPercent = null,
  caption = null,
  icon = null,
  valueSize = "var(--text-3xl)",
  raw = null,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["fb-stat", className].filter(Boolean).join(" ")
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "fb-stat__label"
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      color: "var(--text-tertiary)"
    }
  }, icon) : null, label), /*#__PURE__*/React.createElement("div", {
    className: "fb-stat__value"
  }, raw != null ? raw : /*#__PURE__*/React.createElement(__ds_scope.CurrencyValue, {
    value: value,
    currency: currency,
    decimals: decimals,
    compact: compact,
    hero: hero,
    size: valueSize
  })), deltaValue != null || deltaPercent != null || caption ? /*#__PURE__*/React.createElement("div", {
    className: "fb-stat__foot"
  }, deltaValue != null || deltaPercent != null ? /*#__PURE__*/React.createElement(__ds_scope.DeltaValue, {
    value: deltaValue,
    percent: deltaPercent,
    pill: true
  }) : null, caption ? /*#__PURE__*/React.createElement("span", null, caption) : null) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/StatCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/Dashboard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* finbrain UI kit — Dashboard screen. window.FBDashboard */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const {
    Card,
    StatCard,
    CurrencyValue,
    DeltaValue,
    Badge,
    Button,
    Segmented
  } = window.Finbrain_9e1a03;
  const {
    Donut,
    LineChart,
    BarChart,
    DriftBars
  } = window.FBCharts;
  const {
    useState
  } = React;
  const cnyFmt = v => "¥" + (v / 1e4).toFixed(0) + "万";
  function MiniCard({
    children,
    ...rest
  }) {
    return /*#__PURE__*/React.createElement("div", _extends({
      className: "fb-card"
    }, rest), children);
  }
  function Dashboard({
    ccy
  }) {
    const [allocDim, setAllocDim] = useState("kind");
    const allocData = {
      kind: D.byKind,
      currency: D.byCurrency,
      quote: D.byQuoteCcy,
      institution: D.byInstitution
    }[allocDim];
    const sym = ccy === "USD" ? "$" : ccy === "HKD" ? "HK$" : "¥";
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 22,
        maxWidth: 1320,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.15fr 1fr 1fr",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "fb-card",
      style: {
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "var(--gradient-sheen)",
        pointerEvents: "none"
      }
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "fb-eyebrow"
    }, "\u51C0\u8D44\u4EA7 \xB7 NET WORTH"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10
      }
    }, /*#__PURE__*/React.createElement(CurrencyValue, {
      value: D.kpis.netWorth,
      currency: ccy,
      hero: true,
      size: "58px"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement(DeltaValue, {
      value: 84770,
      percent: D.kpis.nwDeltaPct,
      pill: true
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: "var(--text-tertiary)"
      }
    }, "\u8F83\u4E0A\u6708 \xB7 2026\u5E746\u6708\u76D8\u70B9"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 26,
        marginTop: 22,
        paddingTop: 16,
        borderTop: "1px solid var(--divider)"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-secondary)",
        marginBottom: 4
      }
    }, "\u603B\u8D44\u4EA7"), /*#__PURE__*/React.createElement(CurrencyValue, {
      value: D.kpis.assets,
      currency: ccy,
      size: "17px"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-secondary)",
        marginBottom: 4
      }
    }, "\u603B\u8D1F\u503A"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--loss)"
      }
    }, /*#__PURE__*/React.createElement(CurrencyValue, {
      value: -D.kpis.liabilities,
      currency: ccy,
      size: "17px"
    }))))), /*#__PURE__*/React.createElement(StatCard, {
      label: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Icon, {
        name: "trending-up",
        size: 13
      }), " \u6301\u4ED3\u603B\u5E02\u503C"),
      value: D.kpis.posValueCny,
      currency: ccy,
      compact: true,
      deltaPercent: D.kpis.unrealPct,
      caption: "\u6D6E\u52A8\u76C8\u4E8F"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateRows: "1fr 1fr",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "fb-card",
      style: {
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-secondary)"
      }
    }, "\u672C\u5E74\u5DF2\u5B9E\u73B0\u76C8\u4E8F"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--gain)"
      }
    }, /*#__PURE__*/React.createElement(CurrencyValue, {
      value: D.kpis.realizedYtd,
      currency: ccy,
      signed: true,
      size: "20px"
    })))), /*#__PURE__*/React.createElement(Icon, {
      name: "badge-check",
      size: 20,
      color: "var(--text-tertiary)"
    })), /*#__PURE__*/React.createElement("div", {
      className: "fb-card",
      style: {
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-secondary)"
      }
    }, "\u7D2F\u8BA1\u6536\u76CA\u4E8B\u4EF6 \xB7 \u672C\u5E74"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 3
      }
    }, /*#__PURE__*/React.createElement(CurrencyValue, {
      value: D.kpis.incomeYtd,
      currency: ccy,
      size: "20px"
    }))), /*#__PURE__*/React.createElement(Icon, {
      name: "coins",
      size: 20,
      color: "var(--text-tertiary)"
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Card, {
      eyebrow: "\u914D\u7F6E\u6F02\u79FB \xB7 ALLOCATION DRIFT",
      title: "\u6309\u8D26\u6237\u7528\u9014",
      tight: true,
      actions: /*#__PURE__*/React.createElement(Badge, {
        tone: "warning",
        dot: true
      }, "1 \u9879\u8D85\u9608\u503C")
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "4px 4px 6px"
      }
    }, /*#__PURE__*/React.createElement(DriftBars, {
      items: D.driftKind
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--divider)",
        fontSize: 12,
        color: "var(--text-tertiary)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "info",
      size: 13
    }), " \u767D\u7EBF\u4E3A\u76EE\u6807\u5360\u6BD4 \xB7 \u518D\u5E73\u8861\u5EFA\u8BAE\uFF1Acash \u51CF\u914D \xA554,200\uFF0Cwealth_product \u589E\u914D \xA528,500")), /*#__PURE__*/React.createElement("div", {
      className: "fb-card",
      style: {
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "fb-card__eyebrow"
    }, "\u5BF9\u8D26\u72B6\u6001 \xB7 RECONCILIATION"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        background: "var(--warning-bg)",
        border: "1px solid rgba(221,162,62,0.3)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: "var(--warning)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "triangle-alert",
      size: 14
    }), /*#__PURE__*/React.createElement("span", {
      className: "fb-num",
      style: {
        fontSize: 22,
        fontWeight: 600
      }
    }, "1")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--text-secondary)",
        marginTop: 2
      }
    }, "\u73B0\u91D1\u5DEE\u989D\u8D85\u9608\u503C\u8D26\u6237")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        background: "var(--surface-inset)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: "var(--text-secondary)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "clock",
      size: 14
    }), /*#__PURE__*/React.createElement("span", {
      className: "fb-num",
      style: {
        fontSize: 22,
        fontWeight: 600,
        color: "var(--text-strong)"
      }
    }, "2")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--text-secondary)",
        marginTop: 2
      }
    }, "\u672A\u7ED3\u7B97\u4EA4\u6613"))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-tertiary)",
        lineHeight: 1.5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-secondary)"
      }
    }, D.recon.sample.acct), " \u9884\u671F ", /*#__PURE__*/React.createElement("span", {
      className: "fb-num"
    }, "$", D.recon.sample.expected), " \xB7 \u5FEB\u7167 ", /*#__PURE__*/React.createElement("span", {
      className: "fb-num"
    }, "$", D.recon.sample.snapshot), " \xB7 \u5DEE\u989D ", /*#__PURE__*/React.createElement("span", {
      className: "fb-num",
      style: {
        color: "var(--warning)"
      }
    }, "+$", D.recon.sample.delta)), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      block: true,
      iconRight: /*#__PURE__*/React.createElement(Icon, {
        name: "arrow-right",
        size: 14
      })
    }, "\u524D\u5F80\u73B0\u91D1\u5BF9\u8D26"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1.6fr",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Card, {
      eyebrow: "\u8D44\u4EA7\u914D\u7F6E \xB7 ALLOCATION",
      actions: /*#__PURE__*/React.createElement(Segmented, {
        size: "sm",
        value: allocDim,
        onChange: setAllocDim,
        options: [{
          value: "kind",
          label: "用途"
        }, {
          value: "currency",
          label: "币种"
        }, {
          value: "quote",
          label: "暴露"
        }, {
          value: "institution",
          label: "机构"
        }]
      })
    }, /*#__PURE__*/React.createElement(Donut, {
      items: allocData,
      centerLabel: sym + "284.7万",
      centerSub: allocDim === "quote" ? "真实计价币种" : "净资产"
    })), /*#__PURE__*/React.createElement(Card, {
      eyebrow: "\u51C0\u8D44\u4EA7\u8D8B\u52BF \xB7 12 \u4E2A\u6708",
      title: null,
      actions: /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontSize: 11,
          color: "var(--text-tertiary)"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 5
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 12,
          height: 2,
          background: "var(--accent)"
        }
      }), "\u51C0\u8D44\u4EA7"), /*#__PURE__*/React.createElement("span", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 5
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 12,
          height: 0,
          borderTop: "1.3px dashed var(--viz-3)"
        }
      }), "\u6052\u751F"), /*#__PURE__*/React.createElement("span", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 5
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 12,
          height: 0,
          borderTop: "1.3px dashed var(--viz-1)"
        }
      }), "\u6807\u666E500"))
    }, /*#__PURE__*/React.createElement(LineChart, {
      series: D.nwSeries,
      yFmt: cnyFmt,
      benchmarks: [{
        name: "HSI",
        data: D.hsiSeries,
        color: "var(--viz-3)"
      }, {
        name: "SPX",
        data: D.spxSeries,
        color: "var(--viz-1)"
      }],
      annotations: [{
        i: 6
      }, {
        i: 9
      }]
    }))), /*#__PURE__*/React.createElement(Card, {
      eyebrow: "\u4FE1\u7528\u5361\u5F53\u6708\u652F\u51FA \xB7 \u6700\u8FD1 6 \u6708",
      title: null,
      actions: /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--text-tertiary)"
        }
      }, "\u672C\u671F ", /*#__PURE__*/React.createElement("span", {
        className: "fb-num",
        style: {
          color: "var(--text-primary)"
        }
      }, "\xA518,640"), " \xB7 \u9910\u996E / \u7F51\u8D2D / \u6570\u7801")
    }, /*#__PURE__*/React.createElement(BarChart, {
      data: D.ccSpend,
      color: "var(--viz-2)",
      yFmt: v => "¥" + (v / 1e3).toFixed(0) + "k"
    })));
  }
  window.FBDashboard = Dashboard;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/Holdings.jsx
try { (() => {
/* finbrain UI kit — Holdings overview (持仓总览). window.FBHoldings */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const {
    Card,
    StatCard,
    CurrencyValue,
    DeltaValue,
    Badge,
    Tag,
    Segmented,
    Sparkline
  } = window.Finbrain_9e1a03;
  const {
    useState
  } = React;
  const MARKET_TONE = {
    US: "var(--viz-1)",
    HK: "var(--viz-3)",
    CN: "var(--viz-2)",
    CRYPTO: "var(--viz-5)"
  };
  function Th({
    children,
    right,
    w
  }) {
    return /*#__PURE__*/React.createElement("th", {
      style: {
        textAlign: right ? "right" : "left",
        padding: "9px 12px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--text-tertiary)",
        whiteSpace: "nowrap",
        position: "sticky",
        top: 0,
        background: "var(--surface-card)",
        borderBottom: "1px solid var(--border-default)",
        width: w
      }
    }, children);
  }
  function Td({
    children,
    right,
    mono,
    color,
    dim
  }) {
    return /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: right ? "right" : "left",
        padding: "10px 12px",
        fontSize: 12.5,
        fontFamily: mono ? "var(--font-num)" : "var(--font-sans)",
        fontVariantNumeric: mono ? "tabular-nums" : undefined,
        color: color || (dim ? "var(--text-tertiary)" : "var(--text-primary)"),
        whiteSpace: "nowrap"
      }
    }, children);
  }
  function Holdings({
    ccy
  }) {
    const [group, setGroup] = useState("account");
    const [filter, setFilter] = useState("all");
    const rows = D.holdings.filter(h => filter === "all" || (filter === "profit" ? h.plPct > 0 : filter === "noprice" ? !h.hasPrice : h.market === filter));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 22,
        maxWidth: 1320,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(StatCard, {
      label: "\u6301\u4ED3\u603B\u5E02\u503C",
      value: 161196,
      currency: ccy,
      compact: true
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "\u6301\u4ED3\u603B\u6210\u672C",
      value: 134407,
      currency: ccy,
      compact: true
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "\u603B\u6D6E\u52A8\u76C8\u4E8F",
      raw: /*#__PURE__*/React.createElement("span", {
        style: {
          color: "var(--gain)"
        }
      }, /*#__PURE__*/React.createElement(CurrencyValue, {
        value: 26789,
        currency: ccy,
        signed: true,
        size: "var(--text-3xl)"
      })),
      deltaPercent: 19.9
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "\u603B\u5DF2\u5B9E\u73B0\u76C8\u4E8F",
      raw: /*#__PURE__*/React.createElement("span", {
        style: {
          color: "var(--gain)"
        }
      }, /*#__PURE__*/React.createElement(CurrencyValue, {
        value: 4760,
        currency: ccy,
        signed: true,
        size: "var(--text-3xl)"
      })),
      caption: "\u542B 7 \u7B14\u5356\u51FA"
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "\u6301\u4ED3\u5360\u51C0\u8D44\u4EA7",
      raw: /*#__PURE__*/React.createElement("span", {
        className: "fb-num",
        style: {
          fontSize: "var(--text-3xl)",
          color: "var(--text-strong)"
        }
      }, "52.2%")
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(Segmented, {
      value: group,
      onChange: setGroup,
      size: "sm",
      options: [{
        value: "account",
        label: "按账户"
      }, {
        value: "symbol",
        label: "按标的合并"
      }, {
        value: "market",
        label: "按市场"
      }, {
        value: "quote",
        label: "按计价币种"
      }]
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 1,
        height: 22,
        background: "var(--divider)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 7,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(Tag, {
      clickable: true,
      active: filter === "all",
      onClick: () => setFilter("all")
    }, "\u5168\u90E8 ", D.holdings.length), /*#__PURE__*/React.createElement(Tag, {
      clickable: true,
      active: filter === "US",
      onClick: () => setFilter("US"),
      dotColor: "var(--viz-1)"
    }, "\u7F8E\u80A1"), /*#__PURE__*/React.createElement(Tag, {
      clickable: true,
      active: filter === "HK",
      onClick: () => setFilter("HK"),
      dotColor: "var(--viz-3)"
    }, "\u6E2F\u80A1"), /*#__PURE__*/React.createElement(Tag, {
      clickable: true,
      active: filter === "profit",
      onClick: () => setFilter("profit")
    }, "\u76C8\u5229\u4E2D"), /*#__PURE__*/React.createElement(Tag, {
      clickable: true,
      active: filter === "noprice",
      onClick: () => setFilter("noprice")
    }, "\u65E0\u4EF7\u683C")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11.5,
        color: "var(--text-tertiary)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "columns-3",
      size: 14
    }), " \u6210\u672C\u53E3\u5F84\uFF1A\u52A0\u6743\u4E70\u5165")), /*#__PURE__*/React.createElement(Card, {
      padded: false
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: "auto"
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse",
        minWidth: 1080
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement(Th, {
      w: "200"
    }, "\u6807\u7684 / \u8D26\u6237"), /*#__PURE__*/React.createElement(Th, null, "\u5E02\u573A"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u6570\u91CF"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u52A0\u6743\u4E70\u5165"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u73B0\u4EF7"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u6301\u4ED3\u5E02\u503C"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u6D6E\u52A8\u76C8\u4E8F\u7387"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u5DF2\u5B9E\u73B0"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u7D2F\u8BA1\u6536\u76CA"), /*#__PURE__*/React.createElement(Th, {
      right: true
    }, "\u4ED3\u4F4D\u6743\u91CD"), /*#__PURE__*/React.createElement(Th, {
      w: "96"
    }, "\u8D8B\u52BF"))), /*#__PURE__*/React.createElement("tbody", null, rows.map((h, i) => /*#__PURE__*/React.createElement("tr", {
      key: i,
      style: {
        borderBottom: "1px solid var(--divider)",
        background: !h.hasPrice ? "var(--surface-inset)" : "transparent",
        transition: "var(--transition-control)",
        cursor: "default"
      },
      onMouseEnter: e => {
        if (h.hasPrice) e.currentTarget.style.background = "var(--surface-raised)";
      },
      onMouseLeave: e => {
        e.currentTarget.style.background = !h.hasPrice ? "var(--surface-inset)" : "transparent";
      }
    }, /*#__PURE__*/React.createElement(Td, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 9
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        color: "var(--text-strong)",
        fontSize: 13
      }
    }, h.sym), !h.settled ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning"
    }, "\u672A\u7ED3\u7B97") : null, !h.hasPrice ? /*#__PURE__*/React.createElement(Badge, {
      tone: "danger"
    }, "\u65E0\u4EF7\u683C") : null), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--text-tertiary)",
        marginTop: 1
      }
    }, h.name, " \xB7 ", h.acct)))), /*#__PURE__*/React.createElement(Td, null, /*#__PURE__*/React.createElement("span", {
      className: "fb-badge fb-badge--neutral",
      style: {
        color: MARKET_TONE[h.market]
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "fb-badge__dot",
      style: {
        background: MARKET_TONE[h.market]
      }
    }), h.market)), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true
    }, h.qty), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true,
      dim: true
    }, h.qccy === "USD" ? "$" : h.qccy === "HKD" ? "HK$" : "¥", h.avgCost), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true,
      color: h.hasPrice ? "var(--text-strong)" : "var(--text-tertiary)"
    }, h.hasPrice ? (h.qccy === "USD" ? "$" : h.qccy === "HKD" ? "HK$" : "¥") + h.price : "—"), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true,
      color: "var(--text-strong)"
    }, h.hasPrice ? (h.qccy === "USD" ? "$" : h.qccy === "HKD" ? "HK$" : "¥") + h.mktVal.toLocaleString() : "—"), /*#__PURE__*/React.createElement(Td, {
      right: true
    }, h.plPct == null ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-tertiary)"
      }
    }, "\u2014") : /*#__PURE__*/React.createElement(DeltaValue, {
      percent: h.plPct
    })), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true,
      color: h.realized > 0 ? "var(--gain)" : h.realized < 0 ? "var(--loss)" : "var(--text-tertiary)"
    }, h.realized ? (h.realized > 0 ? "+" : "−") + Math.abs(h.realized) : "—"), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true,
      dim: true
    }, h.income ? "+" + h.income : "—"), /*#__PURE__*/React.createElement(Td, {
      right: true,
      mono: true
    }, h.weight == null ? "—" : h.weight + "%"), /*#__PURE__*/React.createElement(Td, null, h.hasPrice && h.spark.length ? /*#__PURE__*/React.createElement(Sparkline, {
      data: h.spark,
      width: 84,
      height: 24,
      dot: false
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-tertiary)"
      }
    }, "\u2014")))))))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-tertiary)",
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "info",
      size: 13
    }), " \u6D6E\u52A8\u76C8\u4E8F\u7387\u6309\u539F\u5E01\u53E3\u5F84\u8BA1\u7B97\uFF0C\u907F\u514D\u6C47\u7387\u6CE2\u52A8\u6C61\u67D3\u5355\u6807\u7684\u771F\u5B9E\u6DA8\u8DCC \xB7 MU \u7F3A\u6700\u65B0\u4EF7\u683C\uFF0C\u5355\u5217\u4E14\u4E0D\u8BA1\u5165\u6C47\u603B"));
  }
  window.FBHoldings = Holdings;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/Holdings.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/ReviewWizard.jsx
try { (() => {
/* finbrain UI kit — 月度盘点向导 Review Wizard. window.FBReview */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const {
    Card,
    Button,
    Input,
    Badge,
    CurrencyValue,
    Switch
  } = window.Finbrain_9e1a03;
  const {
    useState
  } = React;
  const STEPS = [{
    id: 1,
    label: "盘点日期",
    icon: "calendar"
  }, {
    id: 2,
    label: "金额型账户",
    icon: "wallet"
  }, {
    id: 3,
    label: "持仓型账户",
    icon: "trending-up"
  }, {
    id: 4,
    label: "公司动作",
    icon: "split"
  }, {
    id: 5,
    label: "账户转账",
    icon: "repeat"
  }, {
    id: 6,
    label: "信用卡账单",
    icon: "receipt"
  }, {
    id: 7,
    label: "收益事件",
    icon: "coins"
  }, {
    id: 8,
    label: "现金对账",
    icon: "scale"
  }, {
    id: 9,
    label: "漂移检视",
    icon: "target"
  }, {
    id: 10,
    label: "预览确认",
    icon: "clipboard-check"
  }];
  const balAccounts = [{
    name: "招行 · 活期 6231",
    ccy: "CNY",
    last: 332000,
    now: "348,000"
  }, {
    name: "招行 · 朝朝盈理财",
    ccy: "CNY",
    last: 320100,
    now: "323,280"
  }, {
    name: "汇丰 · 港币活期",
    ccy: "HKD",
    last: 286400,
    now: "286,400"
  }, {
    name: "汇丰 · 美元定期",
    ccy: "USD",
    last: 29200,
    now: "29,200"
  }, {
    name: "汇丰 · 结构性理财",
    ccy: "USD",
    last: 29800,
    now: "30,100"
  }];
  function StepRail({
    step,
    setStep
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: 210,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        gap: 2
      }
    }, STEPS.map(s => {
      const done = s.id < step,
        cur = s.id === step;
      return /*#__PURE__*/React.createElement("button", {
        key: s.id,
        onClick: () => setStep(s.id),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "9px 11px",
          border: "none",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          textAlign: "left",
          background: cur ? "var(--accent-bg)" : "transparent",
          transition: "var(--transition-control)"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 22,
          height: 22,
          borderRadius: "50%",
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? "var(--accent)" : cur ? "transparent" : "var(--surface-inset)",
          border: cur ? "1.5px solid var(--accent)" : done ? "none" : "1px solid var(--border-default)",
          color: done ? "var(--accent-text)" : cur ? "var(--accent-bright)" : "var(--text-tertiary)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600
        }
      }, done ? /*#__PURE__*/React.createElement(Icon, {
        name: "check",
        size: 12
      }) : s.id), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12.5,
          color: cur ? "var(--accent-bright)" : done ? "var(--text-secondary)" : "var(--text-tertiary)",
          fontWeight: cur ? 500 : 400
        }
      }, s.label));
    }));
  }
  function BalanceStep() {
    const [vals, setVals] = useState(balAccounts.map(a => a.now));
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 150px",
        gap: 12,
        padding: "0 14px 6px",
        fontSize: 11,
        color: "var(--text-tertiary)"
      }
    }, /*#__PURE__*/React.createElement("span", null, "\u8D26\u6237"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "right"
      }
    }, "\u4E0A\u6B21\u503C"), /*#__PURE__*/React.createElement("span", null, "\u5F53\u65E5\u4F59\u989D"), /*#__PURE__*/React.createElement("span", null)), balAccounts.map((a, i) => {
      const changed = a.now.replace(/,/g, "") !== String(a.last);
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1fr 150px",
          gap: 12,
          alignItems: "center",
          background: "var(--surface-inset)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          padding: "10px 14px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 13,
          color: "var(--text-primary)"
        }
      }, a.name), /*#__PURE__*/React.createElement(Badge, {
        tone: "neutral"
      }, a.ccy)), /*#__PURE__*/React.createElement("span", {
        className: "fb-num",
        style: {
          textAlign: "right",
          color: "var(--text-tertiary)",
          fontSize: 12.5
        }
      }, a.last.toLocaleString()), /*#__PURE__*/React.createElement(Input, {
        numeric: true,
        prefix: a.ccy,
        value: vals[i],
        onChange: e => setVals(v => v.map((x, j) => j === i ? e.target.value : x)),
        size: "sm"
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 6
        }
      }, /*#__PURE__*/React.createElement(Button, {
        variant: "ghost",
        size: "xs"
      }, "\u4FDD\u7559\u4E0A\u6B21"), /*#__PURE__*/React.createElement(Button, {
        variant: "ghost",
        size: "xs"
      }, "\u65E0\u53D8\u5316")));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 14,
        fontSize: 12,
        color: "var(--text-tertiary)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "info",
      size: 13
    }), " \u540C\u8D26\u6237\u540C\u65E5\u671F\u5E42\u7B49\u8986\u76D6 \xB7 \u7F3A\u5931\u503C\u4E0D\u963B\u585E\uFF0C\u805A\u5408\u65F6\u6309\u89C4\u5219\u964D\u7EA7"));
  }
  function Review({
    onClose
  }) {
    const [step, setStep] = useState(2);
    const cur = STEPS.find(s => s.id === step);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 22,
        maxWidth: 1100,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "clipboard-check",
      size: 20,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 20,
        fontWeight: 500,
        color: "var(--text-strong)",
        margin: 0
      }
    }, "2026 \u5E74 6 \u6708\u76D8\u70B9"), /*#__PURE__*/React.createElement(Badge, {
      tone: "gold"
    }, "\u8349\u7A3F\u5DF2\u81EA\u52A8\u4FDD\u5B58"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: "var(--text-tertiary)"
      }
    }, "\u6B65\u9AA4 ", step, " / 10"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: onClose
    }, "\u9000\u51FA"))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        borderRadius: 2,
        background: "var(--surface-inset)",
        margin: "12px 0 22px",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: step / 10 * 100 + "%",
        background: "var(--gradient-gold)",
        transition: "width .3s var(--ease-out)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 26
      }
    }, /*#__PURE__*/React.createElement(StepRail, {
      step: step,
      setStep: setStep
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement(Card, {
      eyebrow: "步骤 " + step,
      title: /*#__PURE__*/React.createElement("span", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 9
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: cur.icon,
        size: 17,
        color: "var(--accent)"
      }), cur.label),
      subtitle: step === 2 ? "列出所有非信用卡的活跃账户，逐个填入当日余额" : null,
      actions: /*#__PURE__*/React.createElement(Button, {
        variant: "secondary",
        size: "sm",
        iconLeft: /*#__PURE__*/React.createElement(Icon, {
          name: "copy",
          size: 14
        })
      }, "\u5168\u90E8\u4FDD\u7559\u4E0A\u6B21")
    }, step === 2 ? /*#__PURE__*/React.createElement(BalanceStep, null) : /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "44px 20px",
        textAlign: "center",
        color: "var(--text-tertiary)",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 52,
        height: 52,
        borderRadius: "50%",
        background: "var(--surface-inset)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: cur.icon,
      size: 24,
      color: "var(--text-secondary)"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: "var(--text-secondary)"
      }
    }, cur.label, "\u6B65\u9AA4"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        maxWidth: 360,
        lineHeight: 1.6
      }
    }, "\u8BE5\u6B65\u9AA4\u5F15\u5BFC\u4E1A\u4E3B\u5B8C\u6210\u672C\u671F", cur.label, "\u7684\u6279\u91CF\u5F55\u5165\u4E0E\u5BF9\u7167\uFF08\u89C1 PRD \xA77.5\uFF09\u3002\u53EF\u4E2D\u65AD\u4FDD\u5B58\u8349\u7A3F\uFF0C\u4E0B\u6B21\u63A5\u7740\u586B\u3002"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        marginTop: 18
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      disabled: step === 1,
      onClick: () => setStep(s => Math.max(1, s - 1)),
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "arrow-left",
        size: 15
      })
    }, "\u4E0A\u4E00\u6B65"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary"
    }, "\u4FDD\u5B58\u8349\u7A3F"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: () => setStep(s => Math.min(10, s + 1)),
      iconRight: /*#__PURE__*/React.createElement(Icon, {
        name: "arrow-right",
        size: 15
      })
    }, step === 10 ? "确认提交" : "下一步"))))));
  }
  window.FBReview = Review;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/ReviewWizard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/Shell.jsx
try { (() => {
/* finbrain UI kit — Sidebar + Topbar shell. window.FBShell = { Sidebar, Topbar } */
(function () {
  const Icon = window.FBIcon;
  const {
    Segmented,
    IconButton,
    Button,
    Badge
  } = window.Finbrain_9e1a03;
  const NAV = [{
    section: "概览",
    items: [{
      id: "dashboard",
      label: "仪表盘",
      icon: "layout-dashboard"
    }, {
      id: "holdings",
      label: "持仓总览",
      icon: "trending-up"
    }, {
      id: "trend",
      label: "趋势分析",
      icon: "chart-spline"
    }, {
      id: "compare",
      label: "期间对比",
      icon: "git-compare-arrows"
    }, {
      id: "pivot",
      label: "多维聚合",
      icon: "table-2"
    }]
  }, {
    section: "录入",
    items: [{
      id: "review",
      label: "月度盘点",
      icon: "list-checks",
      accent: true
    }, {
      id: "transactions",
      label: "持仓交易",
      icon: "arrow-left-right"
    }, {
      id: "income",
      label: "收益事件",
      icon: "coins"
    }, {
      id: "transfers",
      label: "账户转账",
      icon: "repeat"
    }]
  }, {
    section: "管理",
    items: [{
      id: "accounts",
      label: "账户列表",
      icon: "landmark"
    }, {
      id: "targets",
      label: "目标配置",
      icon: "target"
    }, {
      id: "recon",
      label: "现金对账",
      icon: "scale"
    }, {
      id: "market",
      label: "价格 / 汇率 / 基准",
      icon: "candlestick-chart"
    }, {
      id: "settings",
      label: "设置",
      icon: "settings"
    }]
  }];
  function Sidebar({
    active,
    onNav
  }) {
    return /*#__PURE__*/React.createElement("aside", {
      style: {
        width: "var(--sidebar-width)",
        background: "var(--surface-panel)",
        borderRight: "1px solid var(--divider)",
        display: "flex",
        flexDirection: "column",
        flex: "none",
        height: "100%"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "16px 18px 14px",
        borderBottom: "1px solid var(--divider)"
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo/finbrain-mark.svg",
      width: "26",
      height: "26",
      alt: ""
    }), /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo/finbrain-wordmark.svg",
      height: "22",
      alt: "finbrain",
      style: {
        marginLeft: -2
      }
    })), /*#__PURE__*/React.createElement("nav", {
      style: {
        flex: 1,
        overflowY: "auto",
        padding: "10px 10px 18px"
      }
    }, NAV.map(grp => /*#__PURE__*/React.createElement("div", {
      key: grp.section,
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "fb-eyebrow",
      style: {
        padding: "8px 10px 6px"
      }
    }, grp.section), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 1
      }
    }, grp.items.map(it => {
      const on = active === it.id;
      return /*#__PURE__*/React.createElement("button", {
        key: it.id,
        onClick: () => onNav(it.id),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          border: "none",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
          background: on ? "var(--accent-bg)" : "transparent",
          color: on ? "var(--accent-bright)" : "var(--text-secondary)",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: on ? 500 : 400,
          boxShadow: on ? "inset 2px 0 0 var(--accent)" : "none",
          transition: "var(--transition-control)"
        },
        onMouseEnter: e => {
          if (!on) {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color = "var(--text-primary)";
          }
        },
        onMouseLeave: e => {
          if (!on) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: it.icon,
        size: 16,
        stroke: on ? 1.9 : 1.7
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1
        }
      }, it.label), it.accent ? /*#__PURE__*/React.createElement("span", {
        style: {
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "var(--accent)"
        }
      }) : null);
    }))))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 16px",
        borderTop: "1px solid var(--divider)",
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "var(--gradient-gold)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--accent-text)",
        fontWeight: 700,
        fontSize: 12,
        flex: "none"
      }
    }, "\u4E1A"), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--text-primary)"
      }
    }, "\u4E1A\u4E3B"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10.5,
        color: "var(--text-tertiary)",
        fontFamily: "var(--font-mono)"
      }
    }, "self-hosted \xB7 k3s"))));
  }
  function Topbar({
    title,
    ccy,
    onCcy,
    convention,
    onConvention,
    onReview,
    onNL
  }) {
    return /*#__PURE__*/React.createElement("header", {
      style: {
        height: "var(--topbar-height)",
        flex: "none",
        borderBottom: "1px solid var(--divider)",
        background: "color-mix(in srgb, var(--surface-base) 82%, transparent)",
        backdropFilter: "var(--blur-bar)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 22px",
        position: "sticky",
        top: 0,
        zIndex: 20
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 16,
        fontWeight: 500,
        color: "var(--text-strong)",
        margin: 0,
        whiteSpace: "nowrap"
      }
    }, title), /*#__PURE__*/React.createElement("button", {
      onClick: onNL,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginLeft: 18,
        height: 34,
        flex: "1 1 0",
        minWidth: 0,
        maxWidth: 420,
        background: "var(--surface-inset)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        padding: "0 12px",
        cursor: "text",
        color: "var(--text-tertiary)",
        fontFamily: "var(--font-sans)",
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 15,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        textAlign: "left",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, "\u81EA\u7136\u8BED\u8A00\u5F55\u5165 / \u67E5\u8BE2\u2026"), /*#__PURE__*/React.createElement("kbd", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        color: "var(--text-tertiary)",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        padding: "1px 5px"
      }
    }, "\u2318K")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flex: "none"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: onConvention,
      title: "\u5207\u6362\u6DA8\u8DCC\u8272\u7EA6\u5B9A",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 10px",
        background: "transparent",
        flex: "none",
        whiteSpace: "nowrap",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        color: "var(--text-secondary)",
        fontSize: 11.5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: "var(--gain)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, convention === "cn" ? "红涨绿跌" : "绿涨红跌")), /*#__PURE__*/React.createElement(Segmented, {
      options: ["CNY", "HKD", "USD"],
      value: ccy,
      onChange: onCcy,
      size: "sm"
    }), /*#__PURE__*/React.createElement(IconButton, {
      "aria-label": "\u5237\u65B0"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "refresh-cw",
      size: 16
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      "aria-label": "\u901A\u77E5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "bell",
      size: 16
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: 6,
        right: 7,
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--warning)",
        border: "1.5px solid var(--surface-base)"
      }
    })), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "sm",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "clipboard-check",
        size: 15
      }),
      onClick: onReview
    }, "\u5F00\u59CB\u672C\u6708\u76D8\u70B9")));
  }
  window.FBShell = {
    Sidebar,
    Topbar,
    NAV
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/TrendAnalysis.jsx
try { (() => {
/* finbrain UI kit — 趋势分析 Trend Analysis. window.FBTrend */
(function () {
  const Icon = window.FBIcon;
  const D = window.FBData;
  const {
    Card,
    Segmented,
    Select,
    Switch,
    Badge,
    Button,
    DeltaValue
  } = window.Finbrain_9e1a03;
  const {
    LineChart
  } = window.FBCharts;
  const {
    useState
  } = React;
  const cnyFmt = v => "¥" + (v / 1e4).toFixed(0) + "万";
  const annotations = [{
    i: 6,
    date: "2025-12",
    label: "加仓 NVDA",
    body: "12 股 @ $118，配置向 US 科技倾斜",
    color: "var(--gain)"
  }, {
    i: 9,
    date: "2026-03",
    label: "白酒基金止损减配",
    body: "161725.OF 浮亏 −12%，再平衡至现金",
    color: "var(--loss)"
  }, {
    i: 11,
    date: "2026-05",
    label: "腾讯分红入账",
    body: "0700.HK 现金分红 HK$1,840",
    color: "var(--accent)"
  }];
  function Trend({
    ccy
  }) {
    const [subject, setSubject] = useState("networth");
    const [gran, setGran] = useState("month");
    const [mode, setMode] = useState("rebase");
    const [showHsi, setShowHsi] = useState(true);
    const [showSpx, setShowSpx] = useState(true);
    const bms = [];
    if (showHsi) bms.push({
      name: "HSI",
      data: D.hsiSeries,
      color: "var(--viz-3)"
    });
    if (showSpx) bms.push({
      name: "SPX",
      data: D.spxSeries,
      color: "var(--viz-1)"
    });
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 22,
        maxWidth: 1320,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(Select, {
      size: "sm",
      value: subject,
      onChange: e => setSubject(e.target.value),
      options: [{
        value: "networth",
        label: "净资产"
      }, {
        value: "position",
        label: "持仓总市值"
      }, {
        value: "us",
        label: "美股配置桶"
      }]
    }), /*#__PURE__*/React.createElement(Segmented, {
      size: "sm",
      value: gran,
      onChange: setGran,
      options: [{
        value: "day",
        label: "每日"
      }, {
        value: "month",
        label: "月度"
      }, {
        value: "quarter",
        label: "季度"
      }, {
        value: "year",
        label: "年度"
      }]
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 1,
        height: 22,
        background: "var(--divider)"
      }
    }), /*#__PURE__*/React.createElement(Segmented, {
      size: "sm",
      value: mode,
      onChange: setMode,
      options: [{
        value: "absolute",
        label: "绝对值"
      }, {
        value: "rebase",
        label: "归一化 100"
      }, {
        value: "excess",
        label: "超额收益"
      }]
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement(Switch, {
      checked: showHsi,
      onChange: setShowHsi,
      label: "\u6052\u751F\u6307\u6570"
    }), /*#__PURE__*/React.createElement(Switch, {
      checked: showSpx,
      onChange: setShowSpx,
      label: "\u6807\u666E500"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "fb-eyebrow"
    }, "\u51C0\u8D44\u4EA7 \xB7 12 \u4E2A\u6708"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginTop: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "fb-metric",
      style: {
        fontSize: 30
      }
    }, "\xA52,847,219"), /*#__PURE__*/React.createElement(DeltaValue, {
      value: 461219,
      percent: 19.3
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: "var(--text-tertiary)"
      }
    }, "vs 12 \u6708\u524D"))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-tertiary)"
      }
    }, "\u8F83\u6052\u751F\u8D85\u989D"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--gain)",
        fontFamily: "var(--font-num)",
        fontSize: 17,
        fontWeight: 600
      }
    }, "+3.6%"))), /*#__PURE__*/React.createElement(LineChart, {
      series: D.nwSeries,
      yFmt: cnyFmt,
      benchmarks: bms,
      annotations: annotations.map(a => ({
        i: a.i
      })),
      height: 300
    })), /*#__PURE__*/React.createElement(Card, {
      eyebrow: "\u51C0\u8D44\u4EA7\u6309\u7528\u9014 \xB7 \u5806\u53E0\u9762\u79EF",
      title: null
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        height: 150,
        alignItems: "flex-end",
        gap: 3,
        padding: "8px 0"
      }
    }, D.nwSeries.map((d, i) => {
      const segs = [0.50, 0.21, 0.19, 0.074, 0.046];
      const colors = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-6)", "var(--viz-5)"];
      const h = 60 + (d.v - 2380000) / 470000 * 90;
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          flex: 1,
          height: h,
          display: "flex",
          flexDirection: "column",
          borderRadius: "3px 3px 0 0",
          overflow: "hidden"
        }
      }, segs.map((s, j) => /*#__PURE__*/React.createElement("div", {
        key: j,
        style: {
          flex: s,
          background: colors[j],
          opacity: i === D.nwSeries.length - 1 ? 1 : 0.72
        }
      })));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 16,
        marginTop: 10,
        flexWrap: "wrap"
      }
    }, [["brokerage", "var(--viz-1)"], ["cash", "var(--viz-2)"], ["wealth_product", "var(--viz-3)"], ["time_deposit", "var(--viz-6)"], ["crypto", "var(--viz-5)"]].map(([n, c]) => /*#__PURE__*/React.createElement("span", {
      key: n,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        color: "var(--text-secondary)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: c
      }
    }), n))))), /*#__PURE__*/React.createElement(Card, {
      eyebrow: "\u6807\u6CE8 \xB7 ANNOTATIONS",
      title: null,
      tight: true,
      actions: /*#__PURE__*/React.createElement("button", {
        className: "fb-iconbtn fb-iconbtn--sm",
        "aria-label": "\u65B0\u589E\u6807\u6CE8"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 15
      }))
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10
      }
    }, annotations.map((a, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        borderLeft: "2px solid " + a.color,
        paddingLeft: 11,
        paddingBottom: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        color: "var(--text-tertiary)"
      }
    }, a.date), i === 2 ? /*#__PURE__*/React.createElement(Badge, {
      tone: "gold"
    }, "LLM") : null), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--text-primary)",
        marginTop: 3,
        fontWeight: 500
      }
    }, a.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--text-tertiary)",
        marginTop: 2,
        lineHeight: 1.5
      }
    }, a.body)))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid var(--divider)",
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontSize: 11.5,
        color: "var(--text-tertiary)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 13,
      color: "var(--accent)"
    }), " \u7531\u9636\u6BB5\u6027\u603B\u7ED3\u81EA\u52A8\u751F\u6210\u7684\u5EFA\u8BAE\u6807\u6CE8\uFF0C\u4E1A\u4E3B\u786E\u8BA4\u540E\u843D\u5E93"))));
  }
  window.FBTrend = Trend;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/TrendAnalysis.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/charts.jsx
try { (() => {
/* finbrain UI kit — lightweight SVG charts. window.FBCharts */
(function () {
  const {
    useState
  } = React;
  function polar(cx, cy, r, a) {
    const rad = (a - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  function arc(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  // ---- Donut ----
  function Donut({
    items,
    size = 132,
    thickness = 14,
    centerLabel,
    centerSub
  }) {
    const [hover, setHover] = useState(null);
    const total = items.reduce((s, it) => s + it.value, 0) || 1;
    const cx = size / 2,
      cy = size / 2,
      r = (size - thickness) / 2;
    let a = 0;
    const segs = items.map((it, i) => {
      const sweep = it.value / total * 360;
      const s = {
        ...it,
        a0: a + 1,
        a1: a + sweep - 1,
        i
      };
      a += sweep;
      return s;
    });
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 18
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: size,
      height: size,
      style: {
        flex: "none"
      }
    }, /*#__PURE__*/React.createElement("circle", {
      cx: cx,
      cy: cy,
      r: r,
      fill: "none",
      stroke: "var(--surface-inset)",
      strokeWidth: thickness
    }), segs.map(s => /*#__PURE__*/React.createElement("path", {
      key: s.i,
      d: arc(cx, cy, r, s.a0, s.a1),
      fill: "none",
      stroke: s.color,
      strokeWidth: hover === s.i ? thickness + 3 : thickness,
      strokeLinecap: "round",
      onMouseEnter: () => setHover(s.i),
      onMouseLeave: () => setHover(null),
      style: {
        transition: "stroke-width .15s",
        cursor: "default",
        opacity: hover == null || hover === s.i ? 1 : 0.4
      }
    })), /*#__PURE__*/React.createElement("text", {
      x: cx,
      y: cy - 2,
      textAnchor: "middle",
      fontFamily: "var(--font-num)",
      fontSize: "17",
      fontWeight: "600",
      fill: "var(--text-strong)"
    }, centerLabel), /*#__PURE__*/React.createElement("text", {
      x: cx,
      y: cy + 14,
      textAnchor: "middle",
      fontFamily: "var(--font-mono)",
      fontSize: "9.5",
      fill: "var(--text-tertiary)",
      letterSpacing: "0.06em"
    }, centerSub)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 7,
        minWidth: 0
      }
    }, segs.map(s => /*#__PURE__*/React.createElement("div", {
      key: s.i,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        opacity: hover == null || hover === s.i ? 1 : 0.45,
        transition: "opacity .15s"
      },
      onMouseEnter: () => setHover(s.i),
      onMouseLeave: () => setHover(null)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: s.color,
        flex: "none"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-secondary)"
      }
    }, s.name), /*#__PURE__*/React.createElement("span", {
      className: "fb-num",
      style: {
        marginLeft: "auto",
        color: "var(--text-primary)",
        paddingLeft: 14
      }
    }, (s.value / total * 100).toFixed(1), "%")))));
  }

  // ---- Line chart with optional benchmark + annotation ----
  function LineChart({
    series,
    benchmarks = [],
    width = 720,
    height = 240,
    annotations = [],
    yFmt
  }) {
    const [hover, setHover] = useState(null);
    const padL = 56,
      padR = 18,
      padT = 16,
      padB = 26;
    const iw = width - padL - padR,
      ih = height - padT - padB;
    const vals = series.map(d => d.v);
    const min = Math.min(...vals) * 0.985,
      max = Math.max(...vals) * 1.01;
    const span = max - min || 1;
    const x = i => padL + i / (series.length - 1) * iw;
    const y = v => padT + ih - (v - min) / span * ih;
    const path = series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.v).toFixed(1)}`).join(" ");
    const area = `${path} L${x(series.length - 1)} ${padT + ih} L${padL} ${padT + ih} Z`;
    // benchmark normalized to series scale
    const benchPaths = benchmarks.map(b => {
      const bmin = Math.min(...b.data),
        bmax = Math.max(...b.data),
        bspan = bmax - bmin || 1;
      const by = v => padT + ih - (v - bmin) / bspan * ih;
      return {
        color: b.color,
        name: b.name,
        d: b.data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${by(v).toFixed(1)}`).join(" ")
      };
    });
    const gridY = [0, 0.25, 0.5, 0.75, 1].map(t => ({
      t,
      v: min + span * (1 - t),
      y: padT + ih * t
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "100%",
      viewBox: `0 0 ${width} ${height}`,
      onMouseLeave: () => setHover(null),
      style: {
        display: "block"
      }
    }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
      id: "nwArea",
      x1: "0",
      y1: "0",
      x2: "0",
      y2: "1"
    }, /*#__PURE__*/React.createElement("stop", {
      offset: "0",
      stopColor: "var(--accent)",
      stopOpacity: "0.20"
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "1",
      stopColor: "var(--accent)",
      stopOpacity: "0"
    }))), gridY.map((g, i) => /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("line", {
      x1: padL,
      y1: g.y,
      x2: width - padR,
      y2: g.y,
      stroke: "var(--border-subtle)"
    }), /*#__PURE__*/React.createElement("text", {
      x: padL - 8,
      y: g.y + 3,
      textAnchor: "end",
      fontFamily: "var(--font-mono)",
      fontSize: "9.5",
      fill: "var(--text-tertiary)"
    }, yFmt ? yFmt(g.v) : g.v.toFixed(0)))), annotations.map((an, i) => {
      const ax = x(an.i);
      return /*#__PURE__*/React.createElement("g", {
        key: "an" + i
      }, /*#__PURE__*/React.createElement("line", {
        x1: ax,
        y1: padT,
        x2: ax,
        y2: padT + ih,
        stroke: "var(--accent-deep)",
        strokeDasharray: "3 3",
        opacity: "0.7"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: ax,
        cy: padT + 4,
        r: "3",
        fill: "var(--accent)"
      }));
    }), /*#__PURE__*/React.createElement("path", {
      d: area,
      fill: "url(#nwArea)"
    }), benchPaths.map((b, i) => /*#__PURE__*/React.createElement("path", {
      key: i,
      d: b.d,
      fill: "none",
      stroke: b.color,
      strokeWidth: "1.3",
      strokeDasharray: "4 3",
      opacity: "0.65"
    })), /*#__PURE__*/React.createElement("path", {
      d: path,
      fill: "none",
      stroke: "var(--accent)",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }), series.map((d, i) => /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("rect", {
      x: x(i) - iw / series.length / 2,
      y: padT,
      width: iw / series.length,
      height: ih,
      fill: "transparent",
      onMouseEnter: () => setHover(i)
    }), hover === i ? /*#__PURE__*/React.createElement("circle", {
      cx: x(i),
      cy: y(d.v),
      r: "4",
      fill: "var(--accent-bright)",
      stroke: "var(--surface-base)",
      strokeWidth: "2"
    }) : null)), hover != null ? /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("line", {
      x1: x(hover),
      y1: padT,
      x2: x(hover),
      y2: padT + ih,
      stroke: "var(--border-strong)"
    }), /*#__PURE__*/React.createElement("g", {
      transform: `translate(${Math.min(x(hover) + 8, width - 120)}, ${padT + 6})`
    }, /*#__PURE__*/React.createElement("rect", {
      width: "112",
      height: "38",
      rx: "6",
      fill: "var(--surface-overlay)",
      stroke: "var(--border-default)"
    }), /*#__PURE__*/React.createElement("text", {
      x: "9",
      y: "15",
      fontFamily: "var(--font-mono)",
      fontSize: "9.5",
      fill: "var(--text-tertiary)"
    }, series[hover].m), /*#__PURE__*/React.createElement("text", {
      x: "9",
      y: "30",
      fontFamily: "var(--font-num)",
      fontSize: "12.5",
      fontWeight: "600",
      fill: "var(--text-strong)"
    }, yFmt ? yFmt(series[hover].v) : series[hover].v))) : null, series.map((d, i) => i % 2 === 0 || i === series.length - 1 ? /*#__PURE__*/React.createElement("text", {
      key: "x" + i,
      x: x(i),
      y: height - 8,
      textAnchor: "middle",
      fontFamily: "var(--font-mono)",
      fontSize: "9",
      fill: "var(--text-tertiary)"
    }, d.m.slice(5)) : null));
  }

  // ---- Bar chart ----
  function BarChart({
    data,
    width = 720,
    height = 130,
    color = "var(--viz-2)",
    yFmt
  }) {
    const padL = 48,
      padR = 12,
      padT = 12,
      padB = 22;
    const iw = width - padL - padR,
      ih = height - padT - padB;
    const max = Math.max(...data.map(d => d.v)) * 1.1;
    const bw = iw / data.length * 0.5;
    return /*#__PURE__*/React.createElement("svg", {
      width: "100%",
      viewBox: `0 0 ${width} ${height}`,
      style: {
        display: "block"
      }
    }, [0, 0.5, 1].map((t, i) => /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("line", {
      x1: padL,
      y1: padT + ih * t,
      x2: width - padR,
      y2: padT + ih * t,
      stroke: "var(--border-subtle)"
    }), /*#__PURE__*/React.createElement("text", {
      x: padL - 8,
      y: padT + ih * t + 3,
      textAnchor: "end",
      fontFamily: "var(--font-mono)",
      fontSize: "9",
      fill: "var(--text-tertiary)"
    }, yFmt ? yFmt(max * (1 - t)) : (max * (1 - t)).toFixed(0)))), data.map((d, i) => {
      const cx = padL + (i + 0.5) * (iw / data.length);
      const bh = d.v / max * ih;
      return /*#__PURE__*/React.createElement("g", {
        key: i
      }, /*#__PURE__*/React.createElement("rect", {
        x: cx - bw / 2,
        y: padT + ih - bh,
        width: bw,
        height: bh,
        rx: "2",
        fill: color,
        opacity: i === data.length - 1 ? 1 : 0.55
      }), /*#__PURE__*/React.createElement("text", {
        x: cx,
        y: height - 7,
        textAnchor: "middle",
        fontFamily: "var(--font-mono)",
        fontSize: "9",
        fill: "var(--text-tertiary)"
      }, d.m));
    }));
  }

  // ---- Drift bars (actual vs target) ----
  function DriftBars({
    items
  }) {
    const maxv = Math.max(...items.map(i => Math.max(i.actual, i.target)));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 13
      }
    }, items.map((it, i) => {
      const drift = +(it.actual - it.target).toFixed(1);
      const over = drift > 0;
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          display: "grid",
          gridTemplateColumns: "120px 1fr 64px",
          alignItems: "center",
          gap: 12
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          color: "var(--text-secondary)"
        }
      }, it.name), /*#__PURE__*/React.createElement("div", {
        style: {
          position: "relative",
          height: 18
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          inset: 0,
          top: 5,
          height: 8,
          background: "var(--surface-inset)",
          borderRadius: 4
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          top: 5,
          height: 8,
          width: `${it.actual / maxv * 100}%`,
          background: it.color,
          borderRadius: 4
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          top: 1,
          height: 16,
          left: `${it.target / maxv * 100}%`,
          width: 2,
          background: "var(--text-strong)",
          borderRadius: 1
        },
        title: "目标 " + it.target + "%"
      })), /*#__PURE__*/React.createElement("span", {
        className: "fb-num",
        style: {
          fontSize: 11.5,
          textAlign: "right",
          color: Math.abs(drift) > 2 ? over ? "var(--gain)" : "var(--loss)" : "var(--text-tertiary)"
        }
      }, drift > 0 ? "+" : drift < 0 ? "−" : "", Math.abs(drift), "%"));
    }));
  }
  window.FBCharts = {
    Donut,
    LineChart,
    BarChart,
    DriftBars
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/charts.jsx", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/data.js
try { (() => {
/* finbrain UI kit — mock data (single owner, multi-institution, multi-currency).
   Attached to window for sharing across Babel script files. Figures in display
   currency CNY unless a native currency is noted. */
(function () {
  // ---- Net-worth monthly series (CNY), last 13 months ----
  const nwSeries = [{
    m: "2025-06",
    v: 2386000
  }, {
    m: "2025-07",
    v: 2421500
  }, {
    m: "2025-08",
    v: 2398200
  }, {
    m: "2025-09",
    v: 2452800
  }, {
    m: "2025-10",
    v: 2510400
  }, {
    m: "2025-11",
    v: 2488900
  }, {
    m: "2025-12",
    v: 2563200
  }, {
    m: "2026-01",
    v: 2604700
  }, {
    m: "2026-02",
    v: 2641000
  }, {
    m: "2026-03",
    v: 2702300
  }, {
    m: "2026-04",
    v: 2761800
  }, {
    m: "2026-05",
    v: 2762450
  }, {
    m: "2026-06",
    v: 2847219.5
  }];
  // Benchmark: HSI rebased points (normalized series for overlay)
  const hsiSeries = [100, 101.4, 99.2, 102.8, 105.1, 103.0, 106.9, 108.2, 107.0, 110.4, 113.8, 112.0, 115.7];
  const spxSeries = [100, 102.1, 103.0, 101.2, 104.8, 106.9, 109.2, 111.0, 113.4, 112.1, 116.8, 119.2, 121.5];

  // ---- Allocation by 用途 (kind) ----
  const byKind = [{
    name: "brokerage",
    value: 1486000,
    color: "var(--viz-1)"
  }, {
    name: "cash",
    value: 624000,
    color: "var(--viz-2)"
  }, {
    name: "wealth_product",
    value: 540000,
    color: "var(--viz-3)"
  }, {
    name: "time_deposit",
    value: 210000,
    color: "var(--viz-6)"
  }, {
    name: "crypto_wallet",
    value: 132219,
    color: "var(--viz-5)"
  }];
  const byCurrency = [{
    name: "CNY",
    value: 1180000,
    color: "var(--viz-2)"
  }, {
    name: "USD",
    value: 980000,
    color: "var(--viz-1)"
  }, {
    name: "HKD",
    value: 612219,
    color: "var(--viz-3)"
  }, {
    name: "其他",
    value: 75000,
    color: "var(--viz-8)"
  }];
  // 真实计价币种 (currency exposure — differs from account currency)
  const byQuoteCcy = [{
    name: "USD",
    value: 1240000,
    color: "var(--viz-1)"
  }, {
    name: "CNY",
    value: 940000,
    color: "var(--viz-2)"
  }, {
    name: "HKD",
    value: 560219,
    color: "var(--viz-3)"
  }, {
    name: "其他",
    value: 107000,
    color: "var(--viz-8)"
  }];
  const byInstitution = [{
    name: "富途证券",
    value: 1180000,
    color: "var(--viz-1)"
  }, {
    name: "汇丰 HK",
    value: 690000,
    color: "var(--viz-4)"
  }, {
    name: "招商银行",
    value: 612000,
    color: "var(--viz-2)"
  }, {
    name: "Binance",
    value: 132219,
    color: "var(--viz-5)"
  }, {
    name: "中银香港",
    value: 233000,
    color: "var(--viz-6)"
  }];
  const byMarket = [{
    name: "US",
    value: 1240000,
    color: "var(--viz-1)"
  }, {
    name: "HK",
    value: 412000,
    color: "var(--viz-3)"
  }, {
    name: "CN",
    value: 286000,
    color: "var(--viz-2)"
  }, {
    name: "CRYPTO",
    value: 132219,
    color: "var(--viz-5)"
  }];

  // ---- Accounts grouped by institution ----
  const accounts = [{
    inst: "富途证券",
    items: [{
      id: 1,
      name: "美股账户",
      kind: "brokerage",
      ccy: "USD",
      balance: 237.62,
      balCny: 1710,
      value: 712400,
      updated: "2026-06-05",
      spark: [62, 64, 63, 67, 70, 69, 72]
    }, {
      id: 2,
      name: "港股账户",
      kind: "brokerage",
      ccy: "HKD",
      balance: 4820,
      balCny: 4434,
      value: 318600,
      updated: "2026-06-05",
      spark: [40, 39, 41, 38, 37, 39, 42]
    }]
  }, {
    inst: "汇丰 HK",
    items: [{
      id: 3,
      name: "港币活期",
      kind: "cash",
      ccy: "HKD",
      balance: 286400,
      balCny: 263488,
      value: 263488,
      updated: "2026-06-01",
      spark: [26, 26, 25, 26, 26, 26, 26]
    }, {
      id: 4,
      name: "美元定期",
      kind: "time_deposit",
      ccy: "USD",
      balance: 29200,
      balCny: 210240,
      value: 210240,
      updated: "2026-05-31",
      spark: [21, 21, 21, 21, 21, 21, 21]
    }, {
      id: 5,
      name: "结构性理财",
      kind: "wealth_product",
      ccy: "USD",
      balance: 30100,
      balCny: 216720,
      value: 216720,
      updated: "2026-05-28",
      spark: [20, 21, 21, 22, 22, 21, 22]
    }]
  }, {
    inst: "招商银行",
    items: [{
      id: 6,
      name: "活期 6231",
      kind: "cash",
      ccy: "CNY",
      balance: 348000,
      balCny: 348000,
      value: 348000,
      updated: "2026-06-08",
      spark: [33, 34, 34, 35, 34, 35, 35]
    }, {
      id: 7,
      name: "朝朝盈理财",
      kind: "wealth_product",
      ccy: "CNY",
      balance: 323280,
      balCny: 323280,
      value: 323280,
      updated: "2026-06-02",
      spark: [31, 32, 32, 32, 32, 32, 32]
    }, {
      id: 8,
      name: "信用卡合计",
      kind: "credit_card",
      ccy: "CNY",
      balance: 18640,
      balCny: 18640,
      value: -18640,
      updated: "2026-06-03",
      isLiability: true,
      spark: [12, 15, 11, 18, 14, 16, 19]
    }]
  }, {
    inst: "Binance",
    items: [{
      id: 9,
      name: "现货钱包",
      kind: "crypto_wallet",
      ccy: "USD",
      balance: 1240,
      balCny: 8928,
      value: 132219,
      updated: "2026-06-10",
      spark: [9, 11, 10, 13, 12, 14, 13]
    }]
  }];

  // ---- Holdings (positions) — full metric set ----
  const holdings = [{
    sym: "GOOG",
    name: "Alphabet",
    acct: "富途·美股",
    inst: "富途证券",
    market: "US",
    qccy: "USD",
    qty: 18,
    avgCost: 142.30,
    effCost: 128.10,
    price: 184.25,
    costBasis: 2561.4,
    mktVal: 3316.5,
    plPct: 29.5,
    realized: 1280,
    income: 312,
    weight: 22.4,
    hasPrice: true,
    settled: true,
    spark: [142, 150, 148, 162, 170, 178, 184],
    lastTx: "2026-04-12"
  }, {
    sym: "NVDA",
    name: "NVIDIA",
    acct: "富途·美股",
    inst: "富途证券",
    market: "US",
    qccy: "USD",
    qty: 12,
    avgCost: 118.00,
    effCost: 118.00,
    price: 168.40,
    costBasis: 1416,
    mktVal: 2020.8,
    plPct: 42.7,
    realized: 0,
    income: 0,
    weight: 13.6,
    hasPrice: true,
    settled: true,
    spark: [118, 124, 130, 142, 151, 160, 168],
    lastTx: "2026-05-02"
  }, {
    sym: "NTDOY",
    name: "任天堂",
    acct: "富途·美股",
    inst: "富途证券",
    market: "US",
    qccy: "USD",
    qty: 60,
    avgCost: 17.115,
    effCost: 15.90,
    price: 19.80,
    costBasis: 1026.9,
    mktVal: 1188,
    plPct: 15.7,
    realized: 240,
    income: 88,
    weight: 8.0,
    hasPrice: true,
    settled: false,
    spark: [17, 17.5, 18, 18.4, 19, 19.2, 19.8],
    lastTx: "2026-03-21"
  }, {
    sym: "0700.HK",
    name: "腾讯控股",
    acct: "富途·港股",
    inst: "富途证券",
    market: "HK",
    qccy: "HKD",
    qty: 200,
    avgCost: 372.80,
    effCost: 372.80,
    price: 401.20,
    costBasis: 74560,
    mktVal: 80240,
    plPct: 7.6,
    realized: 0,
    income: 1840,
    weight: 30.4,
    hasPrice: true,
    settled: true,
    spark: [372, 368, 375, 382, 390, 395, 401],
    lastTx: "2026-02-18"
  }, {
    sym: "9988.HK",
    name: "阿里巴巴",
    acct: "富途·港股",
    inst: "富途证券",
    market: "HK",
    qccy: "HKD",
    qty: 300,
    avgCost: 78.40,
    effCost: 81.20,
    price: 74.90,
    costBasis: 23520,
    mktVal: 22470,
    plPct: -4.5,
    realized: -620,
    income: 0,
    weight: 8.5,
    hasPrice: true,
    settled: true,
    spark: [78, 80, 77, 75, 76, 74, 74.9],
    lastTx: "2026-05-19"
  }, {
    sym: "161725.OF",
    name: "招商中证白酒",
    acct: "招行·基金",
    inst: "招商银行",
    market: "CN",
    qccy: "CNY",
    qty: 12000,
    avgCost: 1.082,
    effCost: 1.082,
    price: 0.948,
    costBasis: 12984,
    mktVal: 11376,
    plPct: -12.4,
    realized: 0,
    income: 0,
    weight: 4.3,
    hasPrice: true,
    settled: true,
    spark: [1.08, 1.05, 1.02, 0.99, 0.97, 0.95, 0.948],
    lastTx: "2025-11-08"
  }, {
    sym: "BTC",
    name: "Bitcoin",
    acct: "Binance·现货",
    inst: "Binance",
    market: "CRYPTO",
    qccy: "USD",
    qty: 0.42,
    avgCost: 38200,
    effCost: 31400,
    price: 43800,
    costBasis: 16044,
    mktVal: 18396,
    plPct: 14.7,
    realized: 2860,
    income: 0,
    weight: 7.0,
    hasPrice: true,
    settled: true,
    spark: [38, 40, 39, 42, 41, 43, 43.8],
    lastTx: "2026-06-01"
  }, {
    sym: "MU",
    name: "美光科技",
    acct: "富途·美股",
    inst: "富途证券",
    market: "US",
    qccy: "USD",
    qty: 6,
    avgCost: 399.75,
    effCost: 399.75,
    price: null,
    costBasis: 2398.5,
    mktVal: null,
    plPct: null,
    realized: 0,
    income: 0,
    weight: null,
    hasPrice: false,
    settled: false,
    spark: [],
    lastTx: "2026-05-05"
  }];

  // ---- Allocation targets & drift (kind dimension) ----
  const driftKind = [{
    name: "brokerage",
    actual: 50.2,
    target: 50,
    color: "var(--viz-1)"
  }, {
    name: "cash",
    actual: 21.9,
    target: 20,
    color: "var(--viz-2)"
  }, {
    name: "wealth_product",
    actual: 19.0,
    target: 18,
    color: "var(--viz-3)"
  }, {
    name: "time_deposit",
    actual: 7.4,
    target: 7,
    color: "var(--viz-6)"
  }, {
    name: "crypto_wallet",
    actual: 4.6,
    target: 5,
    color: "var(--viz-5)"
  }];

  // ---- Credit-card monthly spend (CNY) ----
  const ccSpend = [{
    m: "01",
    v: 14200
  }, {
    m: "02",
    v: 21800
  }, {
    m: "03",
    v: 12600
  }, {
    m: "04",
    v: 18900
  }, {
    m: "05",
    v: 16400
  }, {
    m: "06",
    v: 18640
  }];

  // ---- Reconciliation summary ----
  const recon = {
    driftAccounts: 1,
    unsettled: 2,
    sample: {
      acct: "富途·美股",
      expected: 312.40,
      snapshot: 237.62,
      delta: 74.78
    }
  };
  window.FBData = {
    nwSeries,
    hsiSeries,
    spxSeries,
    byKind,
    byCurrency,
    byQuoteCcy,
    byInstitution,
    byMarket,
    accounts,
    holdings,
    driftKind,
    ccSpend,
    recon,
    kpis: {
      netWorth: 2847219.5,
      nwDeltaPct: 3.1,
      assets: 2865859.5,
      liabilities: 18640,
      posValue: 139007.5 * 12.6,
      posValueCny: 1486000,
      unrealPct: 18.4,
      unrealAbs: 231000,
      realizedYtd: 24800,
      incomeYtd: 6420,
      posShare: 52.2
    }
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/data.js", error: String((e && e.message) || e) }); }

// ui_kits/finbrain/icons.jsx
try { (() => {
/* finbrain UI kit — Lucide icon renderer (reads window.lucide.icons node data,
   renders as real React SVG — no DOM mutation). window.FBIcon */
(function () {
  function toCamel(k) {
    return k.indexOf("-") === -1 ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  function Icon({
    name,
    size = 16,
    stroke = 1.7,
    color,
    style,
    className
  }) {
    const pascal = name.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const node = window.lucide && window.lucide.icons && window.lucide.icons[pascal];
    if (!node) return /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        width: size,
        height: size
      }
    });
    const children = node[2] || [];
    return /*#__PURE__*/React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color || "currentColor",
      strokeWidth: stroke,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: className,
      style: {
        display: "block",
        flex: "none",
        ...style
      }
    }, children.map((c, i) => {
      const props = {
        key: i
      };
      const attrs = c[1] || {};
      for (const k in attrs) props[toCamel(k)] = attrs[k];
      return React.createElement(c[0], props);
    }));
  }
  window.FBIcon = Icon;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/finbrain/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.AllocationBar = __ds_scope.AllocationBar;

__ds_ns.CurrencyValue = __ds_scope.CurrencyValue;

__ds_ns.DeltaValue = __ds_scope.DeltaValue;

__ds_ns.Sparkline = __ds_scope.Sparkline;

__ds_ns.StatCard = __ds_scope.StatCard;

})();
