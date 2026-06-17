# EB Chemistry Checker

An AI-powered answer checker for the European Baccalaureate (EB) Chemistry exam, built against the official Lehrplan (Ref: 2021-01-D-51-de-2). It doesn't just grade — it measures how much its own grading can be trusted.

## The problem

Large language models are fluent graders but unreliable ones. Hand a model the same student answer twice and it can return two different scores — not because the chemistry changed, but because the model's output is inherently stochastic. Most "AI grading" tools never check for this; they trust the first response and present it as if it were a fact.

That's the actual engineering problem this project addresses: before an AI grader's score means anything, you need to know its noise floor (how much it disagrees with itself) and its bias (how far it systematically drifts from a real examiner). This project treats grading and validating the grader as two separate, equally important problems.

## How grading works

A student uploads the task sheet and their completed answer (both PDFs). The app sends them to Claude alongside a system prompt that encodes the official EB grading logic:

- **Competency tagging** — every Lehrplan objective carries an official [K]/[A]/[B] competency tag (Kenntnisse, Anwendung, Bewertung), looked up directly from the syllabus table rather than guessed from the verb used in the question.
- **EB Operatoren rubric** — the German command verbs used in EB exams (*berechnen*, *erkläre*, *formuliere*, *aufstellen*...) each demand a specific answer form; a numerically correct answer with no method shown does not earn full marks if the verb demanded one.
- **Tiered scope rules** — a three-tier framework decides what's in scope, what's beyond the syllabus (and therefore neither rewarded nor penalised), and a fixed set of always-error rules (missing H-atoms in structural formulas, wrong equilibrium arrows, units on a dimensionless Kc) that are scored on notation independently of whether the underlying chemistry is right.
- **Mandatory experiment rubrics** — the 11 official EB practical experiments each have a gradable rubric (setup, expected observation, required equation, typical error), used whenever a question references a practical context.
- **Error classification** — every mistake is classified as conceptual, procedural, careless, or a gap (no attempt), via an ordered decision procedure with explicit tie-breakers for boundary cases.

The result is returned as structured JSON: an overall grade mapped to the official A–FX descriptors, a per-question breakdown, and a list of classified errors with the exact Lehrplan section and a one-line hint for each.

## Validation against a human examiner

A grader that sounds confident isn't the same as a grader that's accurate. This project includes a calibration harness: feed it an answer that a real teacher has already graded, enter that human mark, and the tool grades the same answer blind — three times, taking the median — and records the gap.

Across enough points, this produces:

- **MAE and RMSE** (mean/root-mean-square absolute error, in marks) against the human-assigned score
- **Systematic bias** — whether the tool consistently over- or under-marks, not just how far off any single grade was
- **Bias vs. noise floor** — each point already averages 3 runs, so the tool's own run-to-run noise is known; a measured bias smaller than that noise floor is statistically indistinguishable from zero, and chasing it further would mean fitting noise rather than fixing a real problem
- **% of grades within ±1 mark** of the human examiner

A self-consistency check (grade the same answer 3× with no ground truth) is also surfaced directly in the UI, so grader stability can be inspected even without a calibration point on hand.

## Engineering decisions worth noting

**Correctness before features.** Before building anything learner-facing — practice mode, progress tracking — grader accuracy was validated first: self-consistency and calibration against real human marks. A learning tool built on top of an unverified grader teaches the wrong lessons. Practice mode and longitudinal trend tracking are deliberately still in the backlog.

**Rejected a shared multi-subject engine.** An earlier version of this codebase explored grading multiple EB subjects (Biology, Mathematics, Geography) through one shared engine with a `CURRICULA[subject]` registry. That was cut. Geography, for instance, has no marks-to-grade numeric conversion the calibration harness assumes — its assessment model is structurally different, not just a different syllabus table plugged into the same machinery. Each EB subject checker, if built, gets its own repository instead of being forced into one shared abstraction.

**Professional judgment over mechanical transcription.** While auditing the Lehrplan against the official source document chapter by chapter, corrections were applied directly to the syllabus text rather than treating the source as infallible — the working principle was reasoned chemical accuracy, not mechanical copying. (Two specific items from that audit are still flagged as open below, rather than quietly assumed correct.)

**A fragile constraint, documented rather than hidden.** The system prompt is one large template literal; a single stray backtick anywhere inside it silently truncates the string and breaks the app with no helpful error. Rather than relying on memory, this is called out explicitly in `systemPrompt.ts` itself, and was checked line-by-line on every edit during development.

## Known limitations

**Blocker — not yet safe to deploy publicly.** The app currently calls `api.anthropic.com` directly from the browser. That means an API key would have to live in client-side code, visible to anyone who opens dev tools — unacceptable for a real deployment. Fixing this means moving the API call behind a backend proxy that holds the key server-side. Not yet done; tracked as the next infrastructure step before any public hosting.

**Open — two Lehrplan items need source verification.** The Alkohole subsection (under organic chemistry, S7.4) was not photographed from the original syllabus document and its content here could not be cross-checked. The Polyamide restriction noted in the same chapter likewise couldn't be confirmed against the provided source images. Both are flagged rather than silently assumed correct.

**Cosmetic — present but inert.** The prompt already recognizes an optional "REFERENCE: HANDWRITING KEY" document (declared in the document-roles section, used by the input/output contract to decode hard-to-read answers) — but there's no UI control yet for a student to actually upload one.

## Project structure

```
src/
  systemPrompt.ts        the full EB Chemistry examiner prompt (~900 lines,
                          Sections −1 to 11: scope rules, experiment rubrics,
                          error classification, output JSON schema)
  curriculum.ts           topic map (S6/S7 chapters + weights), the EB
                          competency framework, error-type metadata, and the
                          focus-hint builder
  utils.ts                pure functions: score parsing, JSON extraction from
                          noisy model output, file-to-base64, and the
                          self-consistency / calibration statistics
  components/
    DropZone.tsx          single-file PDF drop target (task sheet / answer)
    RefUploader.tsx       optional multi-file reference material uploader
    ErrorCard.tsx         one expandable classified-error card
    QuestionRow.tsx       one row in the per-question breakdown
    HistoryDashboard.tsx  the History tab: session stats, weak-topic chart
    CalibrationView.tsx   the Calibration tab: MAE/bias readout + points table
  App.tsx                 state, data flow, and the three-tab shell that
                          wires everything above together
  main.tsx                mounts App into the page
```

This file split happened after the engine had already grown past 2,000 lines in one file. Each piece now changes for a different reason: correcting the Lehrplan never touches UI code, and adjusting a button's styling never requires scrolling past a 900-line prompt.

One cross-file dependency worth knowing about: the four error-type labels (`conceptual`, `procedural`, `careless`, `gap`) appear in three places that must stay in sync — the JSON schema inside `systemPrompt.ts`, the `ERROR_META` map in `curriculum.ts`, and the dashboard counter initializer in `components/HistoryDashboard.tsx`. Renaming or adding a type means updating all three.

## Running it locally

```
npm install
npm run dev
```

This opens the full UI (all three tabs, file upload, history, calibration table) in the browser. Grading itself won't work without an Anthropic Platform API key wired up server-side — see Known Limitations above — but everything else is fully interactive.

```
npm run build
```

produces a production bundle via Vite; `npm run preview` serves it locally.

## Curriculum coverage

Full S6 + S7 syllabus, ten chapters:

| Chapter | Topic | Weight |
|---|---|---|
| S6.1 | Elektronische Struktur & PSE | 10% |
| S6.2 | Chemische Bindung | 20% |
| S6.3 | Aggregatzustände & Zwischenmolekulare Kräfte | 10% |
| S6.4 | Thermodynamik | 20% |
| S6.5 | Reaktionskinetik | 20% |
| S6.6 | Allgemeine Organische Chemie | 20% |
| S7.1 | Gleichgewichte | 10% |
| S7.2 | Säuren & Basen | 20% |
| S7.3 | Elektrochemie | 30% |
| S7.4 | Organische Chemie (S7) | 40% |
