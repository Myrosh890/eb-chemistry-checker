import { useRef, useState } from "react";

// Single-file PDF drop zone used for both the task sheet and the student answer.

export function DropZone({ label, sublabel, file, onFile, accent, disabled }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  return (
    <div onClick={() => !disabled && ref.current.click()}
      onDragOver={e => { if (disabled) return; e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { if (disabled) return; e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") onFile(f); }}
      style={{ border: `2px dashed ${drag ? accent : file ? accent : "rgba(255,255,255,0.1)"}`, borderRadius: 4, padding: "22px 16px", cursor: disabled ? "not-allowed" : "pointer", background: file ? `${accent}08` : "rgba(255,255,255,0.02)", transition: "all .2s", textAlign: "center", minHeight: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, opacity: disabled ? 0.4 : 1 }}>
      <input ref={ref} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <div style={{ fontSize: 22, opacity: file ? 1 : .3 }}>{file ? "📄" : "⬆"}</div>
      <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: file ? accent : "#bcdcd6", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: file ? "#9cc6bf" : "#699a92", fontFamily: "'DM Mono',monospace" }}>{file ? `${file.name} · ${(file.size/1024).toFixed(0)}KB` : sublabel}</div>
    </div>
  );
}
