import { deriveTopicKey, parseScore } from "../utils";
import { ERROR_META } from "../curriculum";

// ─── HISTORY DASHBOARD ────────────────────────────────────────────────────
export function HistoryDashboard({ history, topics, onClear }) {
  if (!history.length) return (
    <div style={{ textAlign: "center", color: "#86b6ae", padding: "40px 0", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
      No history yet. Analyse your first task to start tracking.
    </div>
  );

  const topicCounts = {};
  const errorTypeCounts = { conceptual: 0, procedural: 0, careless: 0, gap: 0 };
  let totalErrors = 0;
  history.forEach(entry => {
    (entry.errors || []).forEach(e => {
      totalErrors++;
      const key = deriveTopicKey(e.lehrplan_section, topics);
      if (key) topicCounts[key] = (topicCounts[key] || 0) + 1;
      if (e.error_type && errorTypeCounts[e.error_type] != null) errorTypeCounts[e.error_type]++;
    });
  });

  const topTopics = Object.entries(topicCounts).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const avgScore = history.length ? (history.reduce((a,h) => a + parseScore(h.score), 0) / history.length).toFixed(1) : "—";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Sessions", value: history.length, color: "#62cfc4" },
          { label: "Total Errors", value: totalErrors, color: "#ef7155" },
          { label: "Avg Score", value: avgScore, color: "#46b694" },
          { label: "High Priority", value: history.reduce((a,h) => a + (h.errors||[]).filter(e=>e.review_priority==="high").length, 0), color: "#ef7155" },
        ].map(s => (
          <div key={s.label} style={{ padding: "12px 10px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 3, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontFamily: "'Instrument Serif',serif", color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#bcdcd6", letterSpacing: ".12em", textTransform: "uppercase", marginTop: 4, fontFamily: "'DM Mono',monospace" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, color: "#bcdcd6", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Mono',monospace" }}>Error Pattern</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(errorTypeCounts).filter(([,v]) => v > 0).map(([type, count]) => {
            const m = ERROR_META[type];
            const pct = totalErrors ? Math.round(count/totalErrors*100) : 0;
            return (
              <div key={type} style={{ background: `${m.color}12`, border: `1px solid ${m.color}30`, borderRadius: 3, padding: "8px 14px", flex: 1, minWidth: 80 }}>
                <div style={{ fontSize: 18, fontFamily: "'Instrument Serif',serif", color: m.color }}>{count}</div>
                <div style={{ fontSize: 9, color: m.color, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace" }}>{m.label}</div>
                <div style={{ fontSize: 9, color: "#bcdcd6", marginTop: 2 }}>{pct}% of total</div>
              </div>
            );
          })}
        </div>
      </div>

      {topTopics.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: "#bcdcd6", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Mono',monospace" }}>Weakest Topics (cumulative)</div>
          {topTopics.map(([section, count]) => {
            const info = topics?.[section];
            const maxCount = topTopics[0][1];
            const barWidth = Math.round((count/maxCount)*100);
            return (
              <div key={section} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#62cfc4", fontFamily: "'DM Mono',monospace" }}>{section}</span>
                    <span style={{ fontSize: 11, color: "#bcdcd6" }}>{info?.title || "—"}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#9cc6bf", fontFamily: "'DM Mono',monospace" }}>{count}×</span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,.06)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${barWidth}%`, background: "#2f9aa3", borderRadius: 2, transition: "width .3s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, color: "#bcdcd6", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Mono',monospace" }}>Recent Sessions</div>
        {history.slice().reverse().slice(0, 5).map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#f3fbf8", fontFamily: "'DM Mono',monospace" }}>{h.topic || "—"}</div>
              <div style={{ fontSize: 10, color: "#bcdcd6" }}>{h.date} · {(h.errors||[]).length} errors</div>
            </div>
            <div style={{ fontSize: 20, fontFamily: "'Instrument Serif',serif", color: "#62cfc4" }}>{parseScore(h.score)}/10</div>
          </div>
        ))}
      </div>

      <button onClick={onClear} style={{ background: "transparent", color: "#86b6ae", border: "1px solid rgba(255,255,255,.08)", padding: "7px 16px", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 3 }}>
        Clear History
      </button>
    </div>
  );
}
