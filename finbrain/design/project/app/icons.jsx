/* finbrain UI kit — Lucide icon renderer (reads window.lucide.icons node data,
   renders as real React SVG — no DOM mutation). window.FBIcon */
(function () {
  function toCamel(k) {
    return k.indexOf("-") === -1 ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  function Icon({ name, size = 16, stroke = 1.7, color, style, className }) {
    const pascal = name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const node = window.lucide && window.lucide.icons && window.lucide.icons[pascal];
    if (!node) return <span style={{ display: "inline-block", width: size, height: size }} />;
    const children = node[2] || [];
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color || "currentColor"} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
        className={className} style={{ display: "block", flex: "none", ...style }}>
        {children.map((c, i) => {
          const props = { key: i };
          const attrs = c[1] || {};
          for (const k in attrs) props[toCamel(k)] = attrs[k];
          return React.createElement(c[0], props);
        })}
      </svg>
    );
  }
  window.FBIcon = Icon;
})();
