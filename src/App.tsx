import { useState, useRef, useEffect } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  EB CHEMISTRY ANSWER CHECKER
//  Grades student answers against the official EB Chemistry Lehrplan
//  (Ref: 2021-01-D-51-de-2). This app is intentionally single-subject — see
//  curriculum.ts and the README for why a shared multi-subject engine was
//  considered and rejected in favour of one repository per EB subject.
// ════════════════════════════════════════════════════════════════════════════

import { EB_COMPETENCIES, ERROR_META, CHEMISTRY_TOPICS, buildFocusHint, CHEMISTRY_CURRICULUM } from "./curriculum";
import { parseScore, extractJSON, fileToBase64, mean, stdev, median, stabilityLabel } from "./utils";
import { RefUploader } from "./components/RefUploader";
import { DropZone } from "./components/DropZone";
import { ErrorCard } from "./components/ErrorCard";
import { QuestionRow } from "./components/QuestionRow";
import { HistoryDashboard } from "./components/HistoryDashboard";
import { CalibrationView } from "./components/CalibrationView";

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("analyse");
  const [taskFile, setTaskFile]     = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [topicContext, setTopicContext] = useState("");
  const [focusTopic, setFocusTopic] = useState("ALL");   // chapter key or "ALL"
  const [refFiles, setRefFiles]     = useState([]);        // reference PDFs (Musterlösung, past exams, Formelsammlung…)
  const [loading, setLoading]       = useState(false);
  const [loadMsg, setLoadMsg]       = useState("");
  const [result, setResult]         = useState(null);
  const [apiError, setApiError]     = useState(null);
  const [activeTab, setActiveTab]   = useState("overview");
  const [history, setHistory]       = useState([]);
  // self-consistency: scores from the N runs of the most recent analysis
  const [consistencyScores, setConsistencyScores] = useState([]);
  // calibration: { trueMark, predicted, topic, date }[]
  const [calibration, setCalibration] = useState([]);
  const [calTrueMark, setCalTrueMark] = useState("");
  const resultRef = useRef();

  const curriculum = CHEMISTRY_CURRICULUM;

  // Load saved history + calibration once on mount
  useEffect(() => {
    setResult(null); setApiError(null);
    (async () => {
      try {
        const stored = await window.storage.get(curriculum.storageKey);
        setHistory(stored?.value ? JSON.parse(stored.value) : []);
      } catch { setHistory([]); }
      try {
        const cal = await window.storage.get(curriculum.calibrationKey);
        setCalibration(cal?.value ? JSON.parse(cal.value) : []);
      } catch { setCalibration([]); }
    })();
  }, []);

  // Human-readable label for the current focus selection (structured > free text).
  const focusLabel = () => {
    if (focusTopic && focusTopic !== "ALL" && CHEMISTRY_TOPICS[focusTopic])
      return `${focusTopic} ${CHEMISTRY_TOPICS[focusTopic].title}`;
    return topicContext || "—";
  };

  const saveToHistory = async (res) => {
    const entry = {
      date: new Date().toLocaleDateString("de-DE"),
      topic: focusLabel(),
      // NOTE: stored as the raw eb_score string (e.g. "5/10" or "5,5/10").
      // v3 stored a parsed Number here; parseScore() reads BOTH shapes, so old
      // v3 history in storage still renders correctly after upgrading to v4.
      score: res.overview?.eb_score ?? "0",
      errors: res.errors || [],
      summary: res.overview?.summary || "",
    };
    const next = [...history, entry];
    setHistory(next);
    try { await window.storage.set(curriculum.storageKey, JSON.stringify(next), false); } catch {}
  };

  const clearHistory = async () => {
    setHistory([]);
    try { await window.storage.delete(curriculum.storageKey); } catch {}
  };

  // Calibration: grade the uploaded answer, store (predicted vs the human true mark).
  async function runCalibration() {
    if (!taskFile || !answerFile) return;
    const trueMark = parseScore(calTrueMark);
    if (!calTrueMark.trim()) { setApiError("Enter the human-assigned true mark (0–10) first."); return; }
    setLoading(true); setApiError(null);
    try {
      const N = 3;
      const { medianScore, spread, scores } = await gradeMedian(N, (i, n) =>
        setLoadMsg(`Calibration grading — run ${i} of ${n}…`));
      const point = {
        date: new Date().toLocaleDateString("de-DE"),
        topic: focusLabel(),
        predicted: medianScore,   // median of N runs → noise-reduced estimate
        actual: trueMark,
        localSpread: spread,      // this point's own run-to-run noise
        runs: scores,             // raw scores, for transparency
      };
      const next = [...calibration, point];
      setCalibration(next);
      try { await window.storage.set(curriculum.calibrationKey, JSON.stringify(next), false); } catch {}
      setCalTrueMark("");
    } catch(e) {
      setApiError(e.message || "Calibration grading failed.");
    } finally {
      setLoading(false); setLoadMsg("");
    }
  }

  const clearCalibration = async () => {
    setCalibration([]);
    try { await window.storage.delete(curriculum.calibrationKey); } catch {}
  };

  // One grading pass: returns parsed JSON. Shared by single-run, consistency, and calibration.
  async function gradeOnce() {
    const taskB64 = await fileToBase64(taskFile);
    const ansB64  = await fileToBase64(answerFile);

    // Encode any reference PDFs (Musterlösung, past exams, Formelsammlung, handouts).
    const refB64s = [];
    for (const rf of refFiles) {
      try { refB64s.push({ name: rf.name, data: await fileToBase64(rf) }); } catch {}
    }

    const focusHint = buildFocusHint(focusTopic);
    const refList = refB64s.length
      ? `\nReference material provided (NOT written by the student): ${refB64s.map(r => r.name).join(", ")}. Use per SECTION −1.`
      : "";

    const userText = `Subject: Chemistry
${topicContext ? `Free-text context: ${topicContext}` : ""}${focusHint}${refList}

Documents follow, each marked by title. TASK = the question. STUDENT ANSWER = the only work to grade. Any REFERENCE: … document is support material, not the student's work.
Read every document completely including all formulas, equations, structural formulas, and diagrams.
Analyse every sub-question separately. Return JSON only.`;

    const content = [
      { type: "text", text: userText },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: taskB64 }, title: "TASK / QUESTION SHEET" },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: ansB64 }, title: "STUDENT ANSWER" },
      ...refB64s.map(r => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: r.data }, title: `REFERENCE: ${r.name}` })),
    ];

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: curriculum.systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e?.error?.message || `API error ${resp.status}`);
    }
    const data = await resp.json();
    const text = data.content.find(b => b.type === "text")?.text || "";
    return extractJSON(text);   // robust parse w/ repair fallback
  }

  // Grade the same answer n times; return the MEDIAN-scoring run plus the score
  // spread. Median (not mean) so one wild run can't drag the point estimate.
  // onProgress(i, n) lets the caller show "run i of n". Used by calibration to
  // separate systematic bias from run-to-run noise.
  async function gradeMedian(n = 3, onProgress) {
    const runs = [];
    for (let i = 0; i < n; i++) {
      if (onProgress) onProgress(i + 1, n);
      const parsed = await gradeOnce();
      runs.push({ parsed, score: parseScore(parsed.overview?.eb_score) });
    }
    const scores = runs.map(r => r.score);
    const med = median(scores);
    const spread = Math.max(...scores) - Math.min(...scores);
    // Representative run = the one whose score is closest to the median, so the
    // full feedback shown to the user matches the reported median score.
    const rep = runs.reduce((best, r) =>
      Math.abs(r.score - med) < Math.abs(best.score - med) ? r : best, runs[0]);
    return { medianScore: med, spread, scores, parsed: rep.parsed };
  }

  async function analyse() {
    setLoading(true); setResult(null); setApiError(null); setConsistencyScores([]);
    try {
      setLoadMsg("Reading documents…");
      setLoadMsg("Analysing against Chemistry Lehrplan…");
      const parsed = await gradeOnce();
      setResult(parsed);
      setActiveTab("overview");
      await saveToHistory(parsed);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch(e) {
      setApiError(e.message || "Analysis failed — the response could not be parsed. Try again.");
    } finally {
      setLoading(false); setLoadMsg("");
    }
  }

  // Self-consistency: grade the SAME answer N times, measure score spread.
  // Does not write to history (it would skew the longitudinal record); it's a
  // diagnostic of grader stability, surfaced in the result panel.
  async function runConsistency(n = 3) {
    if (!taskFile || !answerFile) return;
    setLoading(true); setApiError(null); setConsistencyScores([]);
    const scores = [];
    let lastParsed = null;
    try {
      for (let i = 0; i < n; i++) {
        setLoadMsg(`Self-consistency run ${i + 1} of ${n}…`);
        const parsed = await gradeOnce();
        lastParsed = parsed;
        scores.push(parseScore(parsed.overview?.eb_score));
        setConsistencyScores([...scores]);
      }
      // Show the last run's full result, but do NOT save N entries to history.
      if (lastParsed) { setResult(lastParsed); setActiveTab("overview"); }
    } catch(e) {
      setApiError(e.message || "Consistency run failed.");
    } finally {
      setLoading(false); setLoadMsg("");
    }
  }

  const highPriority = result?.errors?.filter(e => e.review_priority === "high").length || 0;
  const errorDist = (result?.errors || []).reduce((acc, e) => {
    acc[e.error_type] = (acc[e.error_type]||0)+1;
    return acc;
  }, {});

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Instrument+Serif:ital@0;1&display=swap');
        *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#0c333d 0%,#0e4350 45%,#125c63 100%)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .res{animation:fadeUp .35s ease both}
        .btn-p{background:#2f9aa3;color:#eef8f4;border:none;padding:11px 24px;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;border-radius:3px;transition:all .2s}
        .btn-p:hover:not(:disabled){background:#46b694;color:#0c333d}
        .btn-p:disabled{opacity:.3;cursor:not-allowed}
        .btn-g{background:transparent;color:#bcdcd6;border:1px solid rgba(255,255,255,.1);padding:8px 16px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:3px;transition:all .2s}
        .btn-g:hover{color:#9cc6bf;border-color:rgba(255,255,255,.25)}
        .tab{cursor:pointer;padding:5px 0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-family:'DM Mono',monospace;border-bottom:2px solid transparent;transition:all .15s;color:#86b6ae}
        .tab.on{color:#62cfc4;border-bottom-color:#62cfc4}
        .tab:hover:not(.on){color:#bcdcd6}
        .nav-tab{cursor:pointer;padding:6px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-family:'DM Mono',monospace;border-bottom:2px solid transparent;transition:all .15s;color:#86b6ae}
        .nav-tab.on{color:#62cfc4;border-bottom-color:#62cfc4}
        input[type=text]{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:3px;color:#eef8f4;padding:9px 12px;font-size:12px;font-family:'DM Mono',monospace;outline:none;transition:border-color .2s;width:100%}
        input[type=text]:focus{border-color:rgba(240,199,15,.4)}
        input[type=text]::placeholder{color:#699a92}
      `}</style>

      <div style={{ minHeight:"100vh", background:"transparent", color:"#eef8f4", fontFamily:"'DM Mono',monospace" }}>
        <div style={{ borderBottom:"1px solid rgba(255,255,255,.06)", padding:"18px 28px", display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:".22em", color:"#86b6ae", textTransform:"uppercase", marginBottom:3 }}>Schola Europaea</div>
            <h1 style={{ margin:0, fontFamily:"'Instrument Serif',serif", fontWeight:400, fontSize:24, color:"#eef8f4", letterSpacing:"-.02em" }}><span style={{color:"#62cfc4"}}>🍋</span> EB Chemistry Checker</h1>
          </div>
          <div style={{ display:"flex", gap:20 }}>
            <span className={`nav-tab ${view==="analyse"?"on":""}`} onClick={()=>setView("analyse")}>Analyse</span>
            <span className={`nav-tab ${view==="history"?"on":""}`} onClick={()=>setView("history")}>History {history.length>0 && `(${history.length})`}</span>
            <span className={`nav-tab ${view==="calibration"?"on":""}`} onClick={()=>setView("calibration")}>Calibration {calibration.length>0 && `(${calibration.length})`}</span>
          </div>
        </div>

        <div style={{ maxWidth:760, margin:"0 auto", padding:"24px 20px" }}>

          {/* ── HISTORY VIEW ── */}
          {view === "history" && <HistoryDashboard history={history} topics={curriculum.topics} onClear={clearHistory} />}

          {/* ── CALIBRATION VIEW ── */}
          {view === "calibration" && (
            <CalibrationView
              calibration={calibration}
              taskFile={taskFile} answerFile={answerFile}
              setTaskFile={setTaskFile} setAnswerFile={setAnswerFile}
              calTrueMark={calTrueMark} setCalTrueMark={setCalTrueMark}
              topicContext={topicContext} setTopicContext={setTopicContext}
              contextPlaceholder={curriculum.contextPlaceholder}
              onRun={runCalibration} onClear={clearCalibration}
              loading={loading} loadMsg={loadMsg} apiError={apiError}
            />
          )}

          {/* ── ANALYSE VIEW ── */}
          {view === "analyse" && (
            <>
              {/* Topic focus — structured dropdown (no typing, no typos) */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:9, letterSpacing:".16em", color:"#bcdcd6", textTransform:"uppercase", marginBottom:8 }}>
                  Topic focus <span style={{ color:"#86b6ae", fontWeight:400 }}>(optional — sharpens emphasis, never restricts scope)</span>
                </div>
                <select
                  value={focusTopic}
                  onChange={e=>setFocusTopic(e.target.value)}
                  style={{ width:"100%", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.1)", borderRadius:3, color:"#eef8f4", padding:"9px 12px", fontSize:12, fontFamily:"'DM Mono',monospace", outline:"none", cursor:"pointer" }}
                >
                  <option value="ALL">Whole syllabus (S6 + S7) — default</option>
                  <optgroup label="S6">
                    {Object.entries(CHEMISTRY_TOPICS).filter(([,t])=>t.year==="S6").map(([k,t])=>(
                      <option key={k} value={k}>{k} · {t.title} ({t.weight})</option>
                    ))}
                  </optgroup>
                  <optgroup label="S7">
                    {Object.entries(CHEMISTRY_TOPICS).filter(([,t])=>t.year==="S7").map(([k,t])=>(
                      <option key={k} value={k}>{k} · {t.title} ({t.weight})</option>
                    ))}
                  </optgroup>
                </select>
                {focusTopic !== "ALL" && CHEMISTRY_TOPICS[focusTopic] && (
                  <div style={{ marginTop:8, fontSize:10, color:"#9cc6bf", lineHeight:1.5 }}>
                    Sub-topics in focus: {CHEMISTRY_TOPICS[focusTopic].sub.join(" · ")}
                  </div>
                )}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <DropZone label="Task / Question Sheet" sublabel="PDF — original question" file={taskFile} onFile={setTaskFile} accent="#3aa6c4" />
                <DropZone label="Your Answer" sublabel="PDF — your completed work" file={answerFile} onFile={setAnswerFile} accent="#62cfc4" />
              </div>

              {/* Reference material — optional, multiple PDFs */}
              <RefUploader refFiles={refFiles} setRefFiles={setRefFiles} />

              <div style={{ display:"flex", gap:8 }}>
                <button className="btn-p" onClick={analyse} disabled={!taskFile||!answerFile||loading} style={{ flex:1 }}>
                  {loading ? loadMsg||"Analysing…" : "Analyse against Chemistry Lehrplan →"}
                </button>
                <button className="btn-g" onClick={()=>runConsistency(3)} disabled={!taskFile||!answerFile||loading} title="Grade the same answer 3× and measure score variance" style={{ whiteSpace:"nowrap" }}>
                  Run 3× ⟳
                </button>
              </div>

              {/* honest framing — formative not summative */}
              <div style={{ marginTop:10, fontSize:10, color:"#bcdcd6", lineHeight:1.5, fontStyle:"italic" }}>
                AI grading is approximate and stochastic. Treat scores as formative feedback, not a summative mark. Use "Run 3×" to check how stable the grade is, and the Calibration tab to measure agreement with a real examiner.
              </div>

              {loading && (
                <div style={{ marginTop:14, display:"flex", alignItems:"center", gap:10, color:"#bcdcd6" }}>
                  <div style={{ width:14, height:14, border:"2px solid #86b6ae", borderTopColor:"#62cfc4", borderRadius:"50%", animation:"spin .8s linear infinite", flexShrink:0 }} />
                  <span style={{ fontSize:11 }}>{loadMsg}</span>
                </div>
              )}

              {apiError && (
                <div style={{ marginTop:14, color:"#e88068", fontSize:11, padding:"11px 14px", border:"1px solid rgba(224,89,43,.2)", borderRadius:3 }}>{apiError}</div>
              )}

              {/* Self-consistency panel */}
              {consistencyScores.length >= 2 && (() => {
                const sl = stabilityLabel(consistencyScores);
                const sd = stdev(consistencyScores).toFixed(2);
                const spread = (Math.max(...consistencyScores) - Math.min(...consistencyScores)).toFixed(1);
                return (
                  <div style={{ marginTop:16, padding:"14px 16px", background:`${sl.color}0d`, border:`1px solid ${sl.color}30`, borderRadius:4 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <span style={{ fontSize:9, color:"#bcdcd6", letterSpacing:".14em", textTransform:"uppercase" }}>Self-Consistency · {consistencyScores.length} runs</span>
                      <span style={{ background:`${sl.color}22`, color:sl.color, padding:"2px 10px", borderRadius:2, fontSize:10, fontFamily:"'DM Mono',monospace", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>{sl.text}</span>
                    </div>
                    <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                      <div style={{ display:"flex", gap:6, alignItems:"flex-end" }}>
                        {consistencyScores.map((s,i) => (
                          <div key={i} style={{ textAlign:"center" }}>
                            <div style={{ fontSize:18, fontFamily:"'Instrument Serif',serif", color:sl.color, lineHeight:1 }}>{s}</div>
                            <div style={{ fontSize:8, color:"#bcdcd6", marginTop:2 }}>run {i+1}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginLeft:"auto", display:"flex", gap:18 }}>
                        <div><div style={{ fontSize:9, color:"#bcdcd6", textTransform:"uppercase", letterSpacing:".1em" }}>spread</div><div style={{ fontSize:14, color:"#f3fbf8", fontFamily:"'DM Mono',monospace" }}>±{spread}</div></div>
                        <div><div style={{ fontSize:9, color:"#bcdcd6", textTransform:"uppercase", letterSpacing:".1em" }}>σ</div><div style={{ fontSize:14, color:"#f3fbf8", fontFamily:"'DM Mono',monospace" }}>{sd}</div></div>
                        <div><div style={{ fontSize:9, color:"#bcdcd6", textTransform:"uppercase", letterSpacing:".1em" }}>mean</div><div style={{ fontSize:14, color:"#f3fbf8", fontFamily:"'DM Mono',monospace" }}>{mean(consistencyScores).toFixed(1)}</div></div>
                      </div>
                    </div>
                    {sl.level === "unstable" && (
                      <div style={{ marginTop:10, fontSize:10, color:"#ef7155", lineHeight:1.5 }}>
                        High variance ({spread} marks) — the grader disagrees with itself on this answer. Treat the score with caution; the answer likely sits on a grade boundary or contains ambiguity the model resolves differently each run.
                      </div>
                    )}
                  </div>
                );
              })()}

              {result && (
                <div ref={resultRef} className="res" style={{ marginTop:28 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"72px 1fr", gap:10, marginBottom:14 }}>
                    <div style={{ textAlign:"center", padding:"14px 6px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:4 }}>
                      <div style={{ fontSize:9, color:"#bcdcd6", letterSpacing:".12em", textTransform:"uppercase", marginBottom:4 }}>EB Score</div>
                      <div style={{ fontSize:30, fontFamily:"'Instrument Serif',serif", color:"#62cfc4", lineHeight:1 }}>{parseScore(result.overview?.eb_score)||"—"}</div>
                      <div style={{ fontSize:9, color:"#bcdcd6", marginTop:2 }}>/10</div>
                      {result.overview?.eb_grade && (
                        <div style={{ marginTop:8, display:"inline-block", background:"rgba(240,199,15,.15)", color:"#62cfc4", padding:"2px 9px", borderRadius:2, fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:".05em" }}>{result.overview.eb_grade}</div>
                      )}
                    </div>
                    <div style={{ padding:"12px 14px", background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.05)", borderRadius:4 }}>
                      <div style={{ fontSize:9, color:"#bcdcd6", letterSpacing:".12em", textTransform:"uppercase", marginBottom:5 }}>Assessment</div>
                      <div style={{ fontSize:12, color:"#bcdcd6", lineHeight:1.65 }}>{result.overview?.summary}</div>
                      {result.overview?.grade_justification && (
                        <div style={{ marginTop:6, fontSize:11, color:"#bcdcd6", fontStyle:"italic", lineHeight:1.55, borderLeft:"2px solid rgba(240,199,15,.2)", paddingLeft:8 }}>{result.overview.grade_justification}</div>
                      )}
                      {highPriority > 0 && (
                        <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ width:5, height:5, borderRadius:"50%", background:"#ef7155", flexShrink:0 }} />
                          <span style={{ fontSize:10, color:"#ef7155" }}>{highPriority} high-priority error{highPriority>1?"s":""}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
                    {Object.entries(EB_COMPETENCIES).map(([key,m]) => {
                      const cb = result.overview?.competency_breakdown?.[key];
                      const level = typeof cb === "object" ? cb?.level : null;
                      const comment = typeof cb === "object" ? cb?.comment : cb;
                      return (
                      <div key={key} style={{ padding:"10px 12px", background:`${m.color}10`, border:`1px solid ${m.color}28`, borderRadius:3 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                          <span style={{ fontSize:10, color:m.color, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{key} · {m.weight}</span>
                          {level && <span style={{ fontSize:11, color:m.color, fontFamily:"'DM Mono',monospace", fontWeight:700, background:`${m.color}20`, padding:"0 6px", borderRadius:2 }}>{level}</span>}
                        </div>
                        <div style={{ fontSize:9, color:"#9cc6bf", marginBottom:4 }}>{m.label}</div>
                        <div style={{ fontSize:11, color:"#bcdcd6", lineHeight:1.5 }}>{comment||"—"}</div>
                      </div>
                      );
                    })}
                  </div>

                  {result.errors?.length > 0 && (
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
                      {Object.entries(ERROR_META).map(([type,m]) => {
                        const c = errorDist[type]||0; if(!c) return null;
                        return (
                          <div key={type} style={{ background:`${m.color}12`, border:`1px solid ${m.color}30`, borderRadius:3, padding:"4px 11px", display:"flex", gap:6, alignItems:"center" }}>
                            <span style={{ width:5, height:5, borderRadius:"50%", background:m.color, flexShrink:0 }} />
                            <span style={{ fontSize:10, color:m.color, fontFamily:"'DM Mono',monospace" }}>{m.label}</span>
                            <span style={{ fontSize:12, color:"#f3fbf8", fontFamily:"'Instrument Serif',serif" }}>{c}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display:"flex", gap:18, borderBottom:"1px solid rgba(255,255,255,.07)", marginBottom:14 }}>
                    {[
                      ["overview", `Questions (${result.questions?.length||0})`],
                      ["errors",   `Errors (${result.errors?.length||0})`],
                      ["review",   "Review Plan"],
                      ["strengths","Strengths"],
                    ].map(([t,lbl]) => (
                      <span key={t} className={`tab ${activeTab===t?"on":""}`} onClick={()=>setActiveTab(t)}>{lbl}</span>
                    ))}
                  </div>

                  {activeTab==="overview" && (
                    <div>{(result.questions||[]).map((q,i) => <QuestionRow key={i} q={q} />)}</div>
                  )}

                  {activeTab==="errors" && (
                    <div>
                      {!result.errors?.length && <div style={{ color:"#bcdcd6", fontSize:12, textAlign:"center", padding:32 }}>No errors found.</div>}
                      {(result.errors||[]).slice().sort((a,b)=>{const p={high:0,medium:1,low:2};return (p[a.review_priority]??9)-(p[b.review_priority]??9);}).map((e,i) => <ErrorCard key={i} err={e} index={i} />)}
                    </div>
                  )}

                  {activeTab==="review" && (
                    <div>
                      {(result.priority_review||[]).map((item,i) => {
                        const cm = EB_COMPETENCIES[item.competency]||{color:"#bcdcd6"};
                        return (
                          <div key={i} style={{ display:"flex", gap:12, padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,.05)", alignItems:"flex-start" }}>
                            <span style={{ fontSize:10, color:"#bcdcd6", fontFamily:"'DM Mono',monospace", flexShrink:0, paddingTop:1 }}>0{i+1}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", gap:7, alignItems:"center", marginBottom:2, flexWrap:"wrap" }}>
                                <span style={{ fontSize:11, color:"#62cfc4", fontFamily:"'DM Mono',monospace" }}>{item.topic}</span>
                                <span style={{ fontSize:9, color:"#bcdcd6" }}>{item.section}</span>
                                <span style={{ background:`${cm.color}20`, color:cm.color, padding:"1px 6px", borderRadius:2, fontSize:9, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{item.competency}</span>
                                {item.lehrplan_verb && <span style={{ color:"#bcdcd6", fontSize:9, fontStyle:"italic" }}>verb: {item.lehrplan_verb}</span>}
                              </div>
                              <div style={{ fontSize:11, color:"#bcdcd6" }}>{item.reason}</div>
                            </div>
                          </div>
                        );
                      })}
                      {result.exam_strategies?.length > 0 && (
                        <div style={{ marginTop:20 }}>
                          <div style={{ fontSize:9, color:"#62cfc4", letterSpacing:".14em", textTransform:"uppercase", marginBottom:10 }}>EB Exam Strategy Tips</div>
                          {result.exam_strategies.map((s,i) => (
                            <div key={i} style={{ padding:"11px 14px", background:"rgba(240,199,15,.04)", border:"1px solid rgba(240,199,15,.12)", borderRadius:3, marginBottom:8 }}>
                              <div style={{ fontSize:9, color:"#62cfc4", marginBottom:5, letterSpacing:".08em", textTransform:"uppercase" }}>{s.type}</div>
                              <div style={{ fontSize:12, color:"#bcdcd6", lineHeight:1.65 }}>{s.tip}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab==="strengths" && (
                    <div>
                      {(result.strengths||[]).map((s,i) => (
                        <div key={i} style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,.04)", alignItems:"flex-start" }}>
                          <span style={{ color:"#46b694", fontSize:12, flexShrink:0 }}>✓</span>
                          <span style={{ fontSize:12, color:"#bcdcd6", lineHeight:1.6 }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop:18 }}>
                    <button className="btn-g" onClick={()=>{setResult(null);setTaskFile(null);setAnswerFile(null);setApiError(null);setTopicContext("");}}>← New Analysis</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
