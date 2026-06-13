/* finbrain UI kit — Copilot chat panel (lives inside the sidebar). window.FBCopilot */
(function () {
  const Icon = window.FBIcon;
  const { Badge, Button } = window.Finbrain_9e1a03;
  const { useState, useRef, useEffect } = React;

  const CHIPS = [
    "招行 6231 今天 12.3 万",
    "汇丰美股 GOOG 加到 50 股",
    "今年外汇敞口多少？",
    "本月总结",
  ];

  // a parsed-intent preview card (what the agent proposes to write)
  function Preview() {
    return (
      <div style={{ background: "var(--surface-inset)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge tone="gold">持仓快照</Badge>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>position_snapshots · 0.88</span>
        </div>
        {[["账户", "富途 · 美股账户 (USD)"], ["标的", "GOOG · Alphabet"], ["数量", "50 股"], ["平均成本", "保留 $142.30"], ["日期", "2026-06-13"]].map(([k, v]) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "64px 1fr", fontSize: 12 }}>
            <span style={{ color: "var(--text-tertiary)" }}>{k}</span>
            <span style={{ color: "var(--text-primary)", fontFamily: k === "数量" || k === "平均成本" ? "var(--font-num)" : "inherit" }}>{v}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
          <Button variant="primary" size="xs" iconLeft={<Icon name="check" size={12} />}>确认写入</Button>
          <Button variant="ghost" size="xs">忽略</Button>
        </div>
      </div>
    );
  }

  function CopilotPanel({ onClose }) {
    const [msgs, setMsgs] = useState([
      { role: "assistant", text: "我是 finbrain Copilot。可以帮你录入快照 / 交易、查询资产、生成阶段总结 —— 用自然语言告诉我就行。" },
    ]);
    const [input, setInput] = useState("");
    const [thinking, setThinking] = useState(false);
    const scrollRef = useRef(null);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, thinking]);

    function send(text) {
      const t = (text != null ? text : input).trim();
      if (!t || thinking) return;
      setMsgs((m) => [...m, { role: "user", text: t }]);
      setInput("");
      setThinking(true);
      // simulate streaming agent latency; later this is where the live agent response streams in
      setTimeout(() => {
        setThinking(false);
        setMsgs((m) => [...m, { role: "assistant", text: "已解析为一条持仓快照，确认后写入账本：", preview: true }]);
      }, 750);
    }

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 14px 9px" }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--gradient-gold)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <Icon name="sparkles" size={12} color="var(--accent-text)" />
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-strong)" }}>Copilot</span>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "0 4px" }}>beta</span>
          <button onClick={onClose} aria-label="返回导航" title="返回导航"
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", padding: 2 }}>
            <Icon name="panel-left-close" size={16} />
          </button>
        </div>

        <div ref={scrollRef} className="fb-scroll" style={{ flex: 1, padding: "6px 14px 14px", display: "flex", flexDirection: "column", gap: 13 }}>
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} style={{ alignSelf: "flex-end", maxWidth: "90%", background: "var(--accent-bg)", border: "1px solid rgba(201,168,106,0.28)", borderRadius: "10px 10px 3px 10px", padding: "8px 11px", fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.5 }}>{m.text}</div>
          ) : (
            <div key={i} style={{ alignSelf: "flex-start", maxWidth: "96%" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65 }}>{m.text}</div>
              {m.preview ? <Preview /> : null}
            </div>
          ))}
          {thinking ? (
            <div style={{ alignSelf: "flex-start", display: "flex", gap: 4, padding: "3px 1px" }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animation: `fbBlink 1s ${i * 0.16}s infinite` }} />)}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "10px 12px 12px", borderTop: "1px solid var(--divider)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
            {CHIPS.map((c, i) => (
              <button key={i} onClick={() => send(c)} className="fb-tag fb-tag--clickable" style={{ fontSize: 10.5 }}>{c}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "var(--surface-inset)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "7px 8px 7px 11px" }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1} placeholder="录入 / 查询 / 总结…"
              style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", color: "var(--text-strong)", fontFamily: "var(--font-sans)", fontSize: 12.5, lineHeight: 1.5, maxHeight: 90, padding: "3px 0" }} />
            <button onClick={() => send()} aria-label="发送"
              style={{ flex: "none", width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer", background: "var(--gradient-gold)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="arrow-up" size={15} color="var(--accent-text)" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  window.FBCopilot = CopilotPanel;
})();
