/* finbrain UI kit — lightweight SVG charts. window.FBCharts */
(function () {
  const { useState } = React;

  function polar(cx, cy, r, a) {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  function arc(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  // ---- Donut ----
  function Donut({ items, size = 132, thickness = 14, centerLabel, centerSub }) {
    const [hover, setHover] = useState(null);
    const total = items.reduce((s, it) => s + it.value, 0) || 1;
    const cx = size / 2, cy = size / 2, r = (size - thickness) / 2;
    let a = 0;
    const segs = items.map((it, i) => {
      const sweep = (it.value / total) * 360;
      const s = { ...it, a0: a + 1, a1: a + sweep - 1, i };
      a += sweep;
      return s;
    });
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width={size} height={size} style={{ flex: "none" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={thickness} />
          {segs.map((s) => (
            <path key={s.i} d={arc(cx, cy, r, s.a0, s.a1)} fill="none" stroke={s.color}
              strokeWidth={hover === s.i ? thickness + 3 : thickness} strokeLinecap="round"
              onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}
              style={{ transition: "stroke-width .15s", cursor: "default", opacity: hover == null || hover === s.i ? 1 : 0.4 }} />
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="var(--font-num)" fontSize="17" fontWeight="600" fill="var(--text-strong)">{centerLabel}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--text-tertiary)" letterSpacing="0.06em">{centerSub}</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
          {segs.map((s) => (
            <div key={s.i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: hover == null || hover === s.i ? 1 : 0.45, transition: "opacity .15s" }}
              onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: "none" }} />
              <span style={{ color: "var(--text-secondary)" }}>{s.name}</span>
              <span className="fb-num" style={{ marginLeft: "auto", color: "var(--text-primary)", paddingLeft: 14 }}>{((s.value / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Line chart with optional benchmark + annotation ----
  function LineChart({ series, benchmarks = [], width = 720, height = 240, annotations = [], yFmt }) {
    const [hover, setHover] = useState(null);
    const padL = 56, padR = 18, padT = 16, padB = 26;
    const iw = width - padL - padR, ih = height - padT - padB;
    const vals = series.map((d) => d.v);
    const min = Math.min(...vals) * 0.985, max = Math.max(...vals) * 1.01;
    const span = max - min || 1;
    const x = (i) => padL + (i / (series.length - 1)) * iw;
    const y = (v) => padT + ih - ((v - min) / span) * ih;
    const path = series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.v).toFixed(1)}`).join(" ");
    const area = `${path} L${x(series.length - 1)} ${padT + ih} L${padL} ${padT + ih} Z`;
    // benchmark normalized to series scale
    const benchPaths = benchmarks.map((b) => {
      const bmin = Math.min(...b.data), bmax = Math.max(...b.data), bspan = bmax - bmin || 1;
      const by = (v) => padT + ih - ((v - bmin) / bspan) * ih;
      return { color: b.color, name: b.name, d: b.data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${by(v).toFixed(1)}`).join(" ") };
    });
    const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, v: min + span * (1 - t), y: padT + ih * t }));
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
        <defs>
          <linearGradient id="nwArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.20" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={width - padR} y2={g.y} stroke="var(--border-subtle)" />
            <text x={padL - 8} y={g.y + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--text-tertiary)">{yFmt ? yFmt(g.v) : g.v.toFixed(0)}</text>
          </g>
        ))}
        {annotations.map((an, i) => {
          const ax = x(an.i);
          return (
            <g key={"an" + i}>
              <line x1={ax} y1={padT} x2={ax} y2={padT + ih} stroke="var(--accent-deep)" strokeDasharray="3 3" opacity="0.7" />
              <circle cx={ax} cy={padT + 4} r="3" fill="var(--accent)" />
            </g>
          );
        })}
        <path d={area} fill="url(#nwArea)" />
        {benchPaths.map((b, i) => (
          <path key={i} d={b.d} fill="none" stroke={b.color} strokeWidth="1.3" strokeDasharray="4 3" opacity="0.65" />
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {series.map((d, i) => (
          <g key={i}>
            <rect x={x(i) - iw / series.length / 2} y={padT} width={iw / series.length} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} />
            {hover === i ? <circle cx={x(i)} cy={y(d.v)} r="4" fill="var(--accent-bright)" stroke="var(--surface-base)" strokeWidth="2" /> : null}
          </g>
        ))}
        {hover != null ? (
          <g>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + ih} stroke="var(--border-strong)" />
            <g transform={`translate(${Math.min(x(hover) + 8, width - 120)}, ${padT + 6})`}>
              <rect width="112" height="38" rx="6" fill="var(--surface-overlay)" stroke="var(--border-default)" />
              <text x="9" y="15" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--text-tertiary)">{series[hover].m}</text>
              <text x="9" y="30" fontFamily="var(--font-num)" fontSize="12.5" fontWeight="600" fill="var(--text-strong)">{yFmt ? yFmt(series[hover].v) : series[hover].v}</text>
            </g>
          </g>
        ) : null}
        {series.map((d, i) => (i % 2 === 0 || i === series.length - 1) ? (
          <text key={"x" + i} x={x(i)} y={height - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-tertiary)">{d.m.slice(5)}</text>
        ) : null)}
      </svg>
    );
  }

  // ---- Bar chart ----
  function BarChart({ data, width = 720, height = 130, color = "var(--viz-2)", yFmt }) {
    const padL = 48, padR = 12, padT = 12, padB = 22;
    const iw = width - padL - padR, ih = height - padT - padB;
    const max = Math.max(...data.map((d) => d.v)) * 1.1;
    const bw = (iw / data.length) * 0.5;
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {[0, 0.5, 1].map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={padT + ih * t} x2={width - padR} y2={padT + ih * t} stroke="var(--border-subtle)" />
            <text x={padL - 8} y={padT + ih * t + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-tertiary)">{yFmt ? yFmt(max * (1 - t)) : (max * (1 - t)).toFixed(0)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + (i + 0.5) * (iw / data.length);
          const bh = (d.v / max) * ih;
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={padT + ih - bh} width={bw} height={bh} rx="2" fill={color} opacity={i === data.length - 1 ? 1 : 0.55} />
              <text x={cx} y={height - 7} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-tertiary)">{d.m}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ---- Drift bars (actual vs target) ----
  function DriftBars({ items }) {
    const maxv = Math.max(...items.map((i) => Math.max(i.actual, i.target)));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {items.map((it, i) => {
          const drift = +(it.actual - it.target).toFixed(1);
          const over = drift > 0;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 64px", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{it.name}</span>
              <div style={{ position: "relative", height: 18 }}>
                <div style={{ position: "absolute", inset: 0, top: 5, height: 8, background: "var(--surface-inset)", borderRadius: 4 }} />
                <div style={{ position: "absolute", top: 5, height: 8, width: `${(it.actual / maxv) * 100}%`, background: it.color, borderRadius: 4 }} />
                <div style={{ position: "absolute", top: 1, height: 16, left: `${(it.target / maxv) * 100}%`, width: 2, background: "var(--text-strong)", borderRadius: 1 }} title={"目标 " + it.target + "%"} />
              </div>
              <span className="fb-num" style={{ fontSize: 11.5, textAlign: "right", color: Math.abs(drift) > 2 ? (over ? "var(--gain)" : "var(--loss)") : "var(--text-tertiary)" }}>
                {drift > 0 ? "+" : drift < 0 ? "−" : ""}{Math.abs(drift)}%
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  window.FBCharts = { Donut, LineChart, BarChart, DriftBars };
})();
