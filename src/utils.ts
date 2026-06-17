// Pure helper functions: score parsing, JSON extraction from noisy model
// responses, file-to-base64 conversion, and the self-consistency /
// calibration statistics (mean, stdev, median, stability classification,
// calibration metrics). No JSX, no React dependency.

// Parse an eb_score / mark into a Number in the valid 0–10 domain. Accepts a
// Number or a string like "5", "5.5", "5,5" (German comma), "7,5/10", " 8 / 10 ",
// "8 von 10", or a stray "X/10" placeholder. Takes the numerator before the first
// "/", normalises a decimal comma, grabs the first numeric token (tolerating units
// or words around it), clamps to [0,10], and returns 0 on any failure — never NaN,
// since every caller feeds the result straight into arithmetic or display.
export function parseScore(raw) {
  if (raw == null) return 0;
  const clamp = n => (n < 0 ? 0 : n > 10 ? 10 : n);
  if (typeof raw === "number") return Number.isFinite(raw) ? clamp(raw) : 0;
  const s = String(raw).split("/")[0].replace(",", ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);            // first numeric token
  if (!m) return 0;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? clamp(n) : 0;
}

// Derive the chapter-level topic key (e.g. "S7.2") from a lehrplan_section string
// such as "S7.2.4 Pufferlösungen", "S7.2.4: Puffer", "Thema S7.2.4", or bare "7.2.4".
// Strategy: scan ALL S<maj>.<min> tokens and PREFER the first whose chapter key
// actually exists in CHEMISTRY_TOPICS — so a stray number in prose (e.g. "1,5 mol")
// can't hijack the grouping. Falls back to the first token if none are known, or
// null if there is no token at all. Always groups at chapter level, so sub-sections
// (S7.2.3 / S7.2.4) aggregate into one bar.
export function deriveTopicKey(section, topics) {
  if (section == null) return null;
  const str = String(section);
  const re = /S?\s*(\d+)\.(\d+)(?:\.\d+)*/gi;
  let first = null, m;
  while ((m = re.exec(str)) !== null) {
    const key = `S${m[1]}.${m[2]}`;
    if (first === null) first = key;                                              // fallback
    if (topics && Object.prototype.hasOwnProperty.call(topics, key)) return key;  // prefer a real chapter
  }
  return first;
}

// Extract the JSON object from a possibly-noisy model response. Strips BOM /
// zero-width chars and markdown fences, tries a direct parse, then runs a
// STRING-AWARE balanced-brace scan (so a "}" inside a string value can't truncate
// the object), and finally applies a conservative trailing-comma repair. Throws a
// clear error only when nothing parses.
export function extractJSON(text) {
  if (!text) throw new Error("Empty response");
  const cleaned = String(text)
    .replace(/^\uFEFF/, "")                  // byte-order mark
    .replace(/[\u200B-\u200D\u2060]/g, "")   // zero-width chars
    .replace(/```json/gi, "").replace(/```/g, "")
    .trim();
  // Fast path: already valid
  try { return JSON.parse(cleaned); } catch {}
  // String-aware scan for the first complete top-level {...}
  const start = cleaned.indexOf("{");
  if (start !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        if (--depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try { return JSON.parse(candidate); }
          catch { try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1")); } catch {} }
          break;
        }
      }
    }
  }
  // Final fallback: outermost slice + trailing-comma repair (let this throw if still invalid)
  const first = cleaned.indexOf("{"), last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return JSON.parse(cleaned.slice(first, last + 1).replace(/,\s*([}\]])/g, "$1"));
  }
  throw new Error("No JSON object found in response");
}

// Read a File into a base64 string (the part after the data: prefix).
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("No file")); return; }
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result || "");
      const comma = res.indexOf(",");
      if (comma === -1) { reject(new Error("Unexpected file encoding")); return; }
      resolve(res.slice(comma + 1));
    };
    r.onerror = () => reject(r.error || new Error("File read failed"));
    r.onabort = () => reject(new Error("File read aborted"));
    r.readAsDataURL(file);
  });
}

// ─── STATISTICS (self-consistency + calibration) ─────────────────────────────

// Arithmetic mean of the FINITE numbers in arr (non-finite entries ignored). 0 if empty.
export function mean(arr) {
  const xs = (arr || []).filter(Number.isFinite);
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// POPULATION standard deviation (÷N) of the finite numbers in arr; 0 for <2 values.
// Population (not sample/÷N−1) is deliberate — the stability thresholds below are
// tuned against it; switching would silently shift every classification.
export function stdev(arr) {
  const xs = (arr || []).filter(Number.isFinite);
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
}

// Median of the finite numbers in arr — robust to a single outlier run. 0 if empty.
export function median(arr) {
  const xs = (arr || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// Classify run-to-run stability of the grader. Uses BOTH the worst-case gap
// (spread = max−min, what a user actually feels) AND the typical dispersion (sd);
// the STRICTER of the two decides, so one wild run can't hide behind a tight sd.
// Returns {level,color,text} (consumed by the UI) plus {sd,spread,n} for transparency.
export function stabilityLabel(scores) {
  const xs = (scores || []).filter(Number.isFinite);
  if (xs.length < 2) return { level: "single", color: "#bcdcd6", text: "single run", sd: 0, spread: 0, n: xs.length };
  const spread = Math.max(...xs) - Math.min(...xs);
  const sd = stdev(xs);
  const base = { sd, spread, n: xs.length };
  if (spread <= 0.5 && sd <= 0.3) return { level: "stable",   color: "#46b694", text: "stable", ...base };
  if (spread <= 1.5 && sd <= 0.8) return { level: "moderate", color: "#62cfc4", text: "moderate variance", ...base };
  return { level: "unstable", color: "#ef7155", text: "unstable", ...base };
}

// Calibration metrics: tool scores vs human-assigned true marks.
// points = [{ predicted, actual, localSpread? }]
//   predicted   — the MEDIAN of n runs (noise-reduced point estimate)
//   localSpread — max−min of that point's runs (its own measured noise)
// Separating BIAS (systematic drift vs human) from NOISE (run-to-run wobble) is the
// whole point: a raw MAE conflates them. With median-of-runs predictions the bias
// approximates true drift, and meanNoise reports the noise floor beneath it — a bias
// at or below that floor is statistically indistinguishable from zero. RMSE is added
// alongside MAE because it penalises a few large misses far more than many small ones.
export function calibrationStats(points) {
  const valid = (points || []).filter(p => p && Number.isFinite(p.predicted) && Number.isFinite(p.actual));
  if (!valid.length) return null;
  const errors  = valid.map(p => p.predicted - p.actual);     // signed: + = tool over-marks
  const absErr  = errors.map(Math.abs);
  const mae     = mean(absErr);                               // mean absolute error (marks)
  const rmse    = Math.sqrt(mean(errors.map(e => e * e)));    // large-miss-sensitive companion to MAE
  const bias    = mean(errors);                               // mean signed error (systematic drift)
  const within1 = valid.filter(p => Math.abs(p.predicted - p.actual) <= 1).length / valid.length;
  const spreads = valid.map(p => p.localSpread).filter(Number.isFinite);
  const meanNoise = spreads.length ? mean(spreads) : null;    // noise floor (avg per-point run spread)
  return {
    n: valid.length,
    mae: mae.toFixed(2),
    rmse: rmse.toFixed(2),
    bias: bias.toFixed(2),
    biasDirection: bias > 0.25 ? "over-marks" : bias < -0.25 ? "under-marks" : "well-centred",
    within1Pct: Math.round(within1 * 100),
    maxError: Math.max(...absErr).toFixed(1),
    meanNoise: meanNoise != null ? meanNoise.toFixed(2) : null,
    // true when the measured bias is buried under the grader's own noise → "can't distinguish from 0"
    biasBelowNoise: meanNoise != null ? (Math.abs(bias) <= meanNoise) : null,
    medianRuns: spreads.length > 0,
  };
}
