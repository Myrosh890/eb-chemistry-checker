import { useState } from "react";
import { ERROR_META, EB_COMPETENCIES } from "../curriculum";

// Expandable card for a single classified error: location, competency badge,
// error-type badge, review-priority dot, and (when expanded) the full
// student-wrote / expected / Lehrplan-section / root-cause / hint detail.

export function ErrorCard({ err, index }) {
  const [open, setOpen] = useState(false);
  const em = ERROR_META[err.error_type] || { color: "#bcdcd6", label: err.error_type };
  const cm = EB_COMPETENCIES[err.eb_competency] || { color: "#9cc6bf" };
  const pc = err.review_priority === "high" ? "#ef7155" : err.review_priority === "medium" ? "#62cfc4" : "#3aa6c4";
  return (
    <div style={{ borderLeft: `3px solid ${em.color}`, marginBottom: 6, background: "rgba(255,255,255,.025)" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#bcdcd6", flexShrink: 0 }}>#{String(index+1).padStart(2,"0")}</span>
          <span style={{ fontSize: 12, color: "#f3fbf8", fontFamily: "'DM Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{err.location}</span>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
          <span style={{ background: `${cm.color}25`, color: cm.color, padding: "2px 7px", borderRadius: 2, fontSize: 9, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{err.eb_competency}</span>
          <span style={{ background: em.color, color: "#eef8f4", padding: "2px 8px", borderRadius: 2, fontSize: 9, fontFamily: "'DM Mono',monospace", fontWeight: 700, textTransform: "uppercase" }}>{em.label}</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: pc, flexShrink: 0 }} title={`Priority: ${err.review_priority}`} />
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 14px 12px", fontSize: 12, fontFamily: "'DM Mono',monospace", lineHeight: 1.65 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
            <div><div style={{ color: "#bcdcd6", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 2 }}>Student wrote</div><div style={{ color: "#e88068" }}>{err.student_wrote}</div></div>
            <div><div style={{ color: "#bcdcd6", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 2 }}>Expected</div><div style={{ color: "#37987a" }}>{err.correct}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
            <div><div style={{ color: "#bcdcd6", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 2 }}>Lehrplan</div><div style={{ color: "#62cfc4", fontSize: 11 }}>{err.lehrplan_section}</div></div>
            <div><div style={{ color: "#bcdcd6", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 2 }}>EB Verb Tested</div><div style={{ color: "#9cc6bf", fontStyle: "italic", fontSize: 11 }}>{err.lehrplan_verb}</div></div>
          </div>
          <div style={{ marginBottom: 6, color: "#bcdcd6" }}><span style={{ color: "#bcdcd6" }}>Root cause: </span>{err.root_cause}</div>
          <div style={{ borderLeft: "2px solid rgba(240,199,15,.2)", paddingLeft: 10, color: "#bcdcd6", fontStyle: "italic", fontSize: 11 }}>"{err.hint}"</div>
        </div>
      )}
    </div>
  );
}
