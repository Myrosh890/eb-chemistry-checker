import { EB_COMPETENCIES } from "../curriculum";

// One row in the per-question breakdown: status icon, competency badge,
// grader's note, and marks estimate.

export function QuestionRow({ q }) {
  const sc = q.status === "correct" ? "#46b694" : q.status === "partial" ? "#62cfc4" : q.status === "incorrect" ? "#ef7155" : "#bcdcd6";
  const icon = q.status === "correct" ? "✓" : q.status === "partial" ? "~" : q.status === "incorrect" ? "✗" : "—";
  const cm = EB_COMPETENCIES[q.competency];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <span style={{ color: sc, fontSize: 13, fontFamily: "'DM Mono',monospace", flexShrink: 0, width: 16, textAlign: "center" }}>{icon}</span>
      <span style={{ fontSize: 11, color: "#bcdcd6", fontFamily: "'DM Mono',monospace", flexShrink: 0, width: 80 }}>{q.label}</span>
      {cm && <span style={{ background: `${cm.color}22`, color: cm.color, padding: "1px 6px", borderRadius: 2, fontSize: 9, fontFamily: "'DM Mono',monospace", fontWeight: 700, flexShrink: 0 }}>{q.competency}</span>}
      <span style={{ fontSize: 11, color: "#f3fbf8", flex: 1 }}>{q.note}</span>
      {q.marks_estimate && <span style={{ fontSize: 11, color: sc, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{q.marks_estimate}</span>}
    </div>
  );
}
