import { calibrationStats } from "../utils";
import { DropZone } from "./DropZone";

// ─── CALIBRATION VIEW ────────────────────────────────────────────────────────
// Feeds the grader real answers with human-assigned true marks, then reports how
// far the tool drifts from the examiner: MAE (mean absolute error in marks),
// systematic bias (over/under-marking), and % within 1 mark. This is the layer
// that turns "I built a grader" into "I validated it to ±X marks of a human."
export function CalibrationView({ calibration, taskFile, answerFile, setTaskFile, setAnswerFile,
  calTrueMark, setCalTrueMark, topicContext, setTopicContext, contextPlaceholder,
  onRun, onClear, loading, loadMsg, apiError }) {

  const stats = calibrationStats(calibration);

  return (
    <div>
      <div style={{ fontSize:12, color:"#9cc6bf", lineHeight:1.7, marginBottom:18, padding:"12px 14px", background:"rgba(76,154,201,.06)", border:"1px solid rgba(76,154,201,.18)", borderRadius:4 }}>
        Calibration measures how closely the tool agrees with a real examiner. Upload an answer you already have a <strong style={{ color:"#bcdcd6" }}>human-assigned mark</strong> for, enter that mark, and the tool grades it blind. Over several points it reports its error against ground truth. <span style={{ color:"#9cc6bf" }}>Aim for 5–10 points for a meaningful number.</span>
      </div>

      {/* Metrics summary */}
      {stats ? (
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
            {[
              { label:"Calibration pts", value:stats.n, color:"#62cfc4" },
              { label:"MAE (marks)", value:stats.mae, color: parseFloat(stats.mae)<=1 ? "#46b694" : parseFloat(stats.mae)<=2 ? "#62cfc4" : "#ef7155" },
              { label:"Within ±1", value:stats.within1Pct+"%", color: stats.within1Pct>=70 ? "#46b694" : "#62cfc4" },
              stats.meanNoise != null
                ? { label:"Noise floor ±", value:stats.meanNoise, color:"#3aa6c4" }
                : { label:"Max error", value:stats.maxError, color:"#bcdcd6" },
            ].map(s => (
              <div key={s.label} style={{ padding:"12px 10px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)", borderRadius:3, textAlign:"center" }}>
                <div style={{ fontSize:20, fontFamily:"'Instrument Serif',serif", color:s.color, lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:9, color:"#bcdcd6", letterSpacing:".1em", textTransform:"uppercase", marginTop:4, fontFamily:"'DM Mono',monospace" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Bias readout */}
          <div style={{ padding:"10px 14px", background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.05)", borderRadius:3, fontSize:11, color:"#9cc6bf", lineHeight:1.6 }}>
            <span style={{ color:"#bcdcd6", textTransform:"uppercase", letterSpacing:".1em", fontSize:9 }}>Systematic bias</span><br/>
            Mean signed error <strong style={{ color: stats.biasDirection==="well-centred" ? "#46b694" : "#62cfc4" }}>{stats.bias>0?"+":""}{stats.bias}</strong> marks — the tool <strong style={{ color:"#f3fbf8" }}>{stats.biasDirection}</strong>{stats.biasDirection!=="well-centred" ? " on average. You can mentally adjust scores by this offset until the prompt is tuned." : " — no consistent over/under-marking detected."}
            {stats.meanNoise != null && (
              <>
                <br/><br/>
                <span style={{ color:"#bcdcd6", textTransform:"uppercase", letterSpacing:".1em", fontSize:9 }}>Bias vs noise</span><br/>
                Each point is the median of 3 runs; the grader's own run-to-run noise averages <strong style={{ color:"#3aa6c4" }}>±{stats.meanNoise}</strong> marks.{" "}
                {stats.biasBelowNoise
                  ? <>The measured bias (<strong>{Math.abs(stats.bias)}</strong>) sits <strong style={{ color:"#46b694" }}>at or below</strong> that noise floor — so it's <strong style={{ color:"#46b694" }}>statistically indistinguishable from zero</strong>. The tool is as well-aligned as its own consistency allows; chasing this bias further would be fitting noise.</>
                  : <>The measured bias (<strong>{Math.abs(stats.bias)}</strong>) is <strong style={{ color:"#62cfc4" }}>larger than</strong> that noise floor — so it's a <strong style={{ color:"#62cfc4" }}>real systematic drift</strong>, not random wobble. This is worth correcting in the prompt.</>}
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom:20, fontSize:11, color:"#bcdcd6", fontStyle:"italic", textAlign:"center", padding:"16px 0" }}>
          No calibration points yet. Add your first below.
        </div>
      )}

      {/* Add a calibration point */}
      <div style={{ borderTop:"1px solid rgba(255,255,255,.06)", paddingTop:18 }}>
        <div style={{ fontSize:9, color:"#bcdcd6", letterSpacing:".14em", textTransform:"uppercase", marginBottom:12, fontFamily:"'DM Mono',monospace" }}>Add Calibration Point</div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <DropZone label="Task / Question" sublabel="PDF" file={taskFile} onFile={setTaskFile} accent="#3aa6c4" />
          <DropZone label="Graded Answer" sublabel="PDF — already marked" file={answerFile} onFile={setAnswerFile} accent="#62cfc4" />
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:".14em", color:"#bcdcd6", textTransform:"uppercase", marginBottom:6 }}>True mark (0–10, from examiner)</div>
            <input type="text" value={calTrueMark} onChange={e=>setCalTrueMark(e.target.value)} placeholder="e.g. 7  or  6,5" />
          </div>
          <div>
            <div style={{ fontSize:9, letterSpacing:".14em", color:"#bcdcd6", textTransform:"uppercase", marginBottom:6 }}>Topic (optional)</div>
            <input type="text" value={topicContext} onChange={e=>setTopicContext(e.target.value)} placeholder={contextPlaceholder} />
          </div>
        </div>

        <button className="btn-p" onClick={onRun} disabled={!taskFile||!answerFile||!calTrueMark.trim()||loading} style={{ width:"100%" }}>
          {loading ? loadMsg||"Grading…" : "Grade blind ×3 & record gap →"}
        </button>
        <div style={{ marginTop:8, fontSize:10, color:"#bcdcd6", lineHeight:1.5, fontStyle:"italic" }}>
          Each calibration point grades the answer 3× and takes the median, so the recorded gap reflects systematic bias rather than a single noisy run. Slower, but that's the price of a trustworthy number.
        </div>

        {apiError && (
          <div style={{ marginTop:12, color:"#e88068", fontSize:11, padding:"11px 14px", border:"1px solid rgba(224,89,43,.2)", borderRadius:3 }}>{apiError}</div>
        )}
      </div>

      {/* Points table */}
      {calibration.length > 0 && (
        <div style={{ marginTop:22 }}>
          <div style={{ fontSize:9, color:"#bcdcd6", letterSpacing:".14em", textTransform:"uppercase", marginBottom:10, fontFamily:"'DM Mono',monospace" }}>Recorded Points</div>
          <div style={{ display:"flex", fontSize:9, color:"#86b6ae", textTransform:"uppercase", letterSpacing:".08em", padding:"0 0 6px", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
            <span style={{ flex:1 }}>Topic</span>
            <span style={{ width:54, textAlign:"right" }}>Tool</span>
            <span style={{ width:50, textAlign:"right" }}>±noise</span>
            <span style={{ width:54, textAlign:"right" }}>Human</span>
            <span style={{ width:54, textAlign:"right" }}>Δ</span>
          </div>
          {calibration.slice().reverse().map((p,i) => {
            const delta = (p.predicted - p.actual);
            const dColor = Math.abs(delta) <= 1 ? "#46b694" : Math.abs(delta) <= 2 ? "#62cfc4" : "#ef7155";
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                <span style={{ flex:1, color:"#f3fbf8", fontFamily:"'DM Mono',monospace" }}>{p.topic}<span style={{ color:"#bcdcd6", marginLeft:8, fontSize:10 }}>{p.date}</span></span>
                <span style={{ width:54, textAlign:"right", color:"#bcdcd6", fontFamily:"'DM Mono',monospace" }}>{p.predicted}</span>
                <span style={{ width:50, textAlign:"right", color: p.localSpread!=null ? "#3aa6c4" : "#86b6ae", fontFamily:"'DM Mono',monospace", fontSize:11 }}>{p.localSpread!=null ? `±${p.localSpread.toFixed(1)}` : "—"}</span>
                <span style={{ width:54, textAlign:"right", color:"#bcdcd6", fontFamily:"'DM Mono',monospace" }}>{p.actual}</span>
                <span style={{ width:54, textAlign:"right", color:dColor, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{delta>0?"+":""}{delta.toFixed(1)}</span>
              </div>
            );
          })}
          <button onClick={onClear} style={{ marginTop:14, background:"transparent", color:"#86b6ae", border:"1px solid rgba(255,255,255,.08)", padding:"7px 16px", fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:".1em", textTransform:"uppercase", cursor:"pointer", borderRadius:3 }}>
            Clear Calibration Data
          </button>
        </div>
      )}
    </div>
  );
}
