import { useRef } from "react";

// Optional reference-material uploader (Musterlösung, past EB exams,
// Formelsammlung, course handouts) — multiple PDFs, used per SECTION -1.

export function RefUploader({ refFiles, setRefFiles }) {
  const ref = useRef();
  const add = (files) => {
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf");
    if (pdfs.length) setRefFiles(prev => [...prev, ...pdfs]);
  };
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:9, letterSpacing:".16em", color:"#bcdcd6", textTransform:"uppercase", marginBottom:8 }}>
        Reference material <span style={{ color:"#86b6ae", fontWeight:400 }}>(optional — Musterlösung, past EB exams, Formelsammlung, course handouts)</span>
      </div>
      <div
        onClick={()=>ref.current.click()}
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{ e.preventDefault(); add(e.dataTransfer.files); }}
        style={{ border:"1px dashed rgba(255,255,255,0.1)", borderRadius:4, padding:"12px 14px", cursor:"pointer", background:"rgba(255,255,255,0.02)", display:"flex", alignItems:"center", gap:10 }}
      >
        <input ref={ref} type="file" accept="application/pdf" multiple style={{ display:"none" }} onChange={e=>add(e.target.files)} />
        <span style={{ fontSize:16, opacity:.4 }}>＋</span>
        <span style={{ fontSize:11, color:"#9cc6bf" }}>
          {refFiles.length ? `${refFiles.length} reference file${refFiles.length>1?"s":""} attached — click to add more` : "Add reference PDFs (the AI uses these to anchor the expected answer & marking style)"}
        </span>
      </div>
      {refFiles.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
          {refFiles.map((f,i)=>(
            <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:3, padding:"4px 8px", fontSize:10, color:"#9cc6bf", fontFamily:"'DM Mono',monospace" }}>
              📄 {f.name.length>28 ? f.name.slice(0,25)+"…" : f.name}
              <span onClick={(e)=>{ e.stopPropagation(); setRefFiles(prev=>prev.filter((_,j)=>j!==i)); }} style={{ cursor:"pointer", color:"#9cc6bf", fontWeight:700 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
