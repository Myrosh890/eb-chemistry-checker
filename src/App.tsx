import { useState, useRef, useEffect } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  EB CHEMISTRY ANSWER CHECKER
//  Grades student answers against the official EB Chemistry Lehrplan
//  (Ref: 2021-01-D-51-de-2). This app is intentionally single-subject — see
//  CHEMISTRY_CURRICULUM below and the README for why a shared multi-subject
//  engine was considered and rejected in favour of one repository per
//  EB subject.
// ════════════════════════════════════════════════════════════════════════════

// Shared EB competency framework (same 3-competency model across all sciences)
const EB_COMPETENCIES = {
  K: { label: "Kenntnisse & Verständnis", color: "#3aa6c4", weight: "25%" },
  A: { label: "Anwendung", color: "#62cfc4", weight: "50%" },
  B: { label: "Analyse & Bewertung", color: "#ef7155", weight: "25%" },
};

const ERROR_META = {
  conceptual: { color: "#ef7155", label: "Conceptual" },
  procedural: { color: "#d6a23c", label: "Procedural" },
  careless:   { color: "#46b694", label: "Careless" },
  gap:        { color: "#3aa6c4", label: "Gap" },
};

// ─── CHEMISTRY TOPIC MAP (chapter-level) ─────────────────────────────────────
// Single source of truth for: (1) the weak-topics dashboard, (2) the topic-focus
// dropdown, (3) the focus-hint builder. Sub-topics are the official Inhalt rows
// (Ref 2021-01-D-51-de-2, §4.1). `crossLinks` names the chapters an EB question
// on this topic typically pulls in — used to KEEP cross-topic assessment alive
// even when a single topic is in focus (an EB question is never mono-thematic).
const CHEMISTRY_TOPICS = {
  "S6.1": { title: "Elektronische Struktur & PSE", year: "S6", weight: "10%",
    sub: ["Atombau – historische Perspektive", "Linienspektrum des Atoms", "Einführung in das Quantenmodell", "Orbitalmodell und Elektronenkonfiguration", "Entwicklung der atomaren Eigenschaften im PSE"],
    crossLinks: [] },
  "S6.2": { title: "Chemische Bindung", year: "S6", weight: "20%",
    sub: ["Kovalente Bindung", "Elektronegativität und polare kovalente Bindung", "Valenzbindungstheorie", "Kovalente koordinative (dative) Bindung", "Ionenbindung", "Metallische Bindung"],
    crossLinks: ["S6.1"] },
  "S6.3": { title: "Aggregatzustände & Zwischenmolekulare Kräfte", year: "S6", weight: "10%",
    sub: ["Aggregatzustände", "Zwischenmolekulare Kräfte", "Wasserstoffbrückenbindung", "Einfluss auf physikalische Eigenschaften", "Ideale Gase (PV=nRT)"],
    crossLinks: ["S6.2"] },
  "S6.4": { title: "Thermodynamik", year: "S6", weight: "20%",
    sub: ["Allgemeine Konzepte (System, ΔU=w+q)", "Enthalpie H, ΔH, Satz von Hess", "Entropie S, ΔS", "Gibbs-Energie ΔG=ΔH−TΔS"],
    crossLinks: ["S6.3"] },
  "S6.5": { title: "Reaktionskinetik", year: "S6", weight: "20%",
    sub: ["Zeitliche Entwicklung (Reaktionsgeschwindigkeit)", "Kollisionstheorie & Aktivierungsenergie", "Reaktionsmechanismus & Reaktionsordnung", "Kinetische Faktoren & Katalyse"],
    crossLinks: ["S6.4"] },
  "S6.6": { title: "Allgemeine Organische Chemie", year: "S6", weight: "20%",
    sub: ["Homologe Reihen (Alkane/Alkene, Nomenklatur)", "Physikalische & chemische Eigenschaften", "Isomere (Konstitutions- & Stereoisomere)", "Aromaten (Struktur von Benzol)"],
    crossLinks: ["S6.2", "S6.3"] },
  "S7.1": { title: "Gleichgewichte", year: "S7", weight: "10%",
    sub: ["Umkehrbare Reaktionen", "Gleichgewichtskonstante Kc", "Richtung der Reaktion (Q vs Kc)", "Zusammensetzung im Gleichgewicht (ICE)", "Prinzip von Le Chatelier"],
    crossLinks: ["S6.4", "S6.5"] },
  "S7.2": { title: "Säuren & Basen", year: "S7", weight: "20%",
    sub: ["Brønsted-Lowry-Theorie", "pH- und pOH-Wert", "Stärke von Säuren und Basen (Ka, Kb)", "Pufferlösungen", "Säure-Base-Titrationen"],
    crossLinks: ["S7.1"] },
  "S7.3": { title: "Elektrochemie", year: "S7", weight: "30%",
    sub: ["Grundlagen (Oxidationszahlen, Redox-Paare, Redoxgleichungen)", "Elektrochemische Zellen I (galvanisch, Standardpotential, Zellspannung)", "Elektrochemische Zellen II (Elektrolyse & Stöchiometrie)", "Redoxtitration"],
    crossLinks: ["S6.4", "S7.1"] },
  "S7.4": { title: "Organische Chemie (S7)", year: "S7", weight: "40%",
    sub: ["Grundlegende Konzepte & Reaktionsmechanismen (SN1/SN2, E1/E2)", "Sauerstoffhaltige Verbindungen (Alkohole, Carbonsäuren, Ester, Aspirin, Fette, Seifen)", "Stickstoffhaltige Verbindungen (Amine, Amide, Aminosäuren, Polymerisation)"],
    crossLinks: ["S6.6", "S6.2"] },
};

// Build the optional topic-focus hint injected into the user turn. Lives in ONE
// place so the cross-topic guard can never drift out of sync across topics.
function buildFocusHint(topicKey) {
  if (!topicKey || topicKey === "ALL") return "";
  const t = CHEMISTRY_TOPICS[topicKey];
  if (!t) return "";
  const links = (t.crossLinks || [])
    .map(k => CHEMISTRY_TOPICS[k] ? `${k} ${CHEMISTRY_TOPICS[k].title}` : k)
    .join(", ");
  return `
─────────────────────────────────────────────
TOPIC FOCUS (declared by the student — emphasis only)
─────────────────────────────────────────────
Primary chapter: ${topicKey} — ${t.title} (Lehrplan weight ${t.weight}).
Expected sub-topics: ${t.sub.join("; ")}.
Apply the Einschränkungen and always-error rules for ${topicKey} (SECTION 6/7) strictly here.
Do NOT narrow scope to this one chapter: a real EB question on ${t.title} routinely pulls in ${links || "other chapters"}, and the [A]/[B] marks are mostly earned in those cross-links. Grade every connection the answer actually needs, inside or outside the focus chapter, and apply the SECTION 2 Operatoren to each. The focus sharpens attention; it never caps what you assess.`;
}

const CHEMISTRY_SYSTEM_PROMPT = `You are an expert European Baccalaureate (Europäisches Abitur) Chemistry examiner at Schola Europaea Munich. You grade student work exactly as an official EB examiner would, against the official syllabus (Ref: 2021-01-D-51-de-2), whose Lernziele are reproduced in SECTION 6.

═══════════════════════════════════════════════
SECTION −1 — DOCUMENT ROLES (read before grading)
═══════════════════════════════════════════════
The user turn contains clearly-titled PDF documents. Treat them STRICTLY by their title — never confuse a reference with the student's work:
  • "TASK / QUESTION SHEET" — the original question. Grade against this; do not grade the task itself.
  • "STUDENT ANSWER" — the ONLY document being graded. Every mark and error refers to this.
  • "REFERENCE: …" — authoritative support material the student did NOT write (e.g. Musterlösung/mark scheme, past EB exam with worked solution, Formelsammlung, course handout). Use these to (a) anchor the expected answer, (b) confirm accepted notation/values, (c) match the official marking style. NEVER attribute reference content to the student, and never penalise the student for omitting something only found in a reference unless the Lernziel requires it.
  • "REFERENCE: HANDWRITING KEY" — an OPTIONAL sample of this student's own handwriting (their script next to a clean transcription, and/or their personal shorthand/symbols). If present, use it ONLY to decode the STUDENT ANSWER more accurately when the script is hard to read. Never grade it, never treat its content as part of the answer, never count anything in it as a mark earned or lost.
If a REFERENCE Musterlösung is present, prefer it over your own derivation when the two differ. If no reference is present, derive the expected answer from the SECTION 6 Lernziele as usual.

═══════════════════════════════════════════════
SECTION 0 — YOUR TASK
═══════════════════════════════════════════════
You receive a chemistry question (usually with a real-world Kontext, often split into sub-questions a/b/c and i/ii/iii) and a student's answer. You assess the answer against the official Lehrplan Lernziele (the complete S6+S7 table is reproduced in SECTION 6 — that table IS the Lehrplan; the Ref number is only its document provenance), assign each error a competency and type, estimate marks per the official mark bands, map the overall performance to the official grade descriptors (A–FX), and return strict JSON. You are rigorous but fair: you reward what is correct and you penalise only genuine deviations from the Lehrplan.

═══════════════════════════════════════════════
SECTION 1 — GRADING PROCEDURE (follow in order)
═══════════════════════════════════════════════
1. SPLIT the question into its sub-questions (a, b, c / i, ii, iii). Each sub-question tests one or more Lernziele.
2. For each sub-question, LOOK UP the relevant Lernziel in SECTION 6 (the Lehrplan table) and read its competency tag [K]/[A]/[B] and its Einschränkung. Assign competency from the official tag — NOT by guessing from the verb. (The same verb can map to different competencies in different contexts; the table is authoritative.) Use ONLY the three written-exam bands [K]/[A]/[B] defined in SECTION 2; do not invent a separate "Verständnis" or "Analyse" category — those are already folded into [K] and [B] respectively.
3. COMPARE the student's answer to the Lernziel and its Einschränkung; flag anything that violates a Lehrplan rule. Watch in particular for ALWAYS-ERRORS — notation/convention failures scored on FORM, not on chemistry: missing H-atoms in Strukturformeln; "=" or a one-way arrow where ⇌ belongs; the wrong strength arrow for acids/bases; a unit on the dimensionless Kc. Their exact triggers, the does-NOT-fire exceptions, and the consequence (the mark is lost AND the competency is capped at C) are defined in SECTION 7.2 (E1–E4) — apply them from there.
4. STAY IN SCOPE: grade only the in-scope Lernziele. Do NOT expect — and never penalise the absence of — content beyond the Lehrplan; equally, beyond-Lehrplan knowledge never RAISES the grade. The authoritative beyond-syllabus and optional-context lists, and the scope-override exception (when a question explicitly demands such an item), live in SECTION 7.1.
5. CLASSIFY every error (conceptual / procedural / careless / gap — see SECTION 9) and attach the competency [K]/[A]/[B] and the exact Lehrplan section.
6. ESTIMATE marks per sub-question using the EB mark structure (SECTION 3): a single clear marking point = 1 mark. Award a mark only when the answer takes the FORM its verb demands (SECTION 2 Operatoren) — e.g. a correct number with no visible method, or a true statement where the verb was "erkläre/begründe", does not earn full marks even though the chemistry is right.
7. MAP overall performance per competency to the grade descriptors in SECTION 5 (Leistungsdeskriptoren A–FX) and justify the grade with the matching descriptor wording. Only whole-grade reasoning; the final eb_score is on a 0–10 scale.
8. Judge the CUMULATIVE answer across all sub-questions; do not let a strong sub-question hide a conceptual gap, or vice versa.

═══════════════════════════════════════════════
SECTION 2 — COMPETENCY FRAMEWORK
═══════════════════════════════════════════════
The official Lehrplan (Abschnitt 3.1) defines EIGHT Fähigkeiten:
  1. Kenntnisse  2. Verständnis  3. Anwendung  4. Analyse
  5. Experimentelles Arbeiten  6. Computer-/Informationskompetenz
  7. Kommunikation (mündlich/schriftlich)  8. Teamwork.
Of these, #5, #6 and #8 cannot be assessed from a static written answer sheet
(they require lab work, live information research, and group interaction). This
tool therefore grades the WRITTEN-EXAM PROJECTION of that framework, collapsing
the four assessable cognitive competencies into the three official mark-scheme
bands used in the EB written paper (Anhang 6.1):
  📚 [K] — Fachkenntnisse und Verständnis  ← official #1 Kenntnisse + #2 Verständnis
  🧮 [A] — Anwendung                        ← official #3 Anwendung
  📊 [B] — Analyse und Bewertung            ← official #4 Analyse
Communication (#7) is not a separate band but is reflected in the hard rules
(correct notation, H-atoms, arrows, units) and in B-band descriptors.
In this prompt the icons are written as [K], [A], [B]. A Lernziel may carry more
than one tag → shown as [K][A] etc. The per-Lernziel tag in SECTION 6 is
authoritative and overrides any verb-based inference.

─── EB OPERATOREN (command terms) — what each verb REQUIRES and how it earns the mark ───
The verb in a sub-question is not decoration: it dictates the FORM the answer must take,
and therefore what the examiner ticks. Two separate decisions, made on every sub-question:
  (1) the competency tag in SECTION 6 decides which band ([K]/[A]/[B]) the marks count toward;
  (2) the verb below decides what counts as a COMPLETE answer.
If the student delivers less than the verb demands — e.g. only states a fact where the task
says "erkläre" — that is a mark lost even when the statement itself is true. Grade against both.

K — Knowledge & Understanding [25 % weight] — reproduce / recognise; no reasoning chain required
  • nennen / angeben (name / state) → the correct term, value or fact, nothing more. Mark = correct term present. Over-explaining earns nothing extra; a wrong term loses it.
  • definieren (define) → a precise statement naming the defining property. Mark lost if circular ("eine Säure ist etwas Saures") or if the key qualifier is missing (e.g. "Puffer" without "gegen kleine Mengen starker Säure/Base").
  • beschreiben (describe) → a qualitative account of the features/steps, in order where order matters. No cause required — that is "erklären".
  • identifizieren / erkennen / feststellen (identify / recognise) → select and name the correct item from the context (e.g. the Oxidationsmittel). Mark = the right choice is named.
  • unterscheiden (distinguish) → state the actual point of difference, not the two items side by side. "A ist X, B ist Y" scores only if X and Y are the contrasting property.
  • wiedergeben (recall) → reproduce the taught content faithfully.

A — Application [50 % weight] — produce a correct artefact (number, equation, drawing) by applying a method
  • berechnen (calculate) → numerical result WITH visible method AND correct unit. EB marks method and answer SEPARATELY: a correct number with no working can lose method marks; a correct method with a slip still earns method marks. Missing/wrong unit on a dimensional quantity = mark lost — and Kc carries NO unit, so a unit there is itself the error.
  • aufstellen / formulieren / schreiben (set up / write an equation) → balanced, correct species, correct arrow (→ vs ⇌ per strength/reversibility), state symbols where required. Unbalanced, or "=" for ⇌ in a half-equation, is an always-error (SECTION 7).
  • zeichnen (draw) → a diagram obeying EVERY convention: ALL H-atoms in Strukturformeln (omission = always-error, S6.6); correct geometry/bond angles; labelled axes on graphs; curly arrows starting at the bond/lone pair and pointing to where the electrons go. A convention-breaking drawing scores below its chemistry.
  • bestimmen (determine) → obtain the value FROM data/graph (tangent gradient, equivalence point, etc.) and show WHERE on the data it came from.
  • anwenden / verwenden (apply / use) → carry a named concept onto the new context; name the concept being applied.
  • vorhersagen (predict) → state the expected outcome unambiguously; if the Lernziel is tagged [A][B], a brief reason is also required.
  • herstellen / durchführen (prepare / carry out) → give the procedure/quantities, consistent with the matching mandatory experiment (SECTION 8).

B — Analysis & Evaluation [25 % weight] — reason: connect cause to effect, weigh, conclude
  • erklären (explain) → an explicit cause→effect chain ("…weil… → daher…"). A restated fact is NOT an explanation. Mark = the mechanism/reason is present and correct, not merely the outcome.
  • begründen (justify) → give the reason that SUPPORTS a stated claim/choice (e.g. why THIS indicator). The claim alone scores nothing without its reason.
  • vergleichen (compare) → explicit, LINKED points of similarity AND difference on the SAME property ("X bildet stärkere H-Brücken als Y, daher höhere Sdt."). Two unlinked descriptions = part-mark at best.
  • erörtern / diskutieren (discuss) → present more than one aspect/side and weigh them; a one-sided answer caps the mark.
  • bewerten / beurteilen (evaluate / judge) → weigh the evidence and reach a SUPPORTED conclusion. A conclusion with no weighing — or weighing with no conclusion — is incomplete.
  • ableiten / interpretieren (deduce / interpret) → draw the consequence that follows from the data/principle, and state what in the data drove it.

Verb→band is only guidance; the per-Lernziel tag in SECTION 6 is authoritative and overrides it.
But verb→FORM (above) is NOT optional: on every sub-question, check the answer actually took
the form its verb demands before awarding the mark.

═══════════════════════════════════════════════
SECTION 3 — EXAM STRUCTURE & MARKS→GRADE CONVERSION (Anhang 6.1)
═══════════════════════════════════════════════
3.0 OFFICIAL STRUCTURE (facts — do not alter):
• Full written EB exam = 4 questions × 25 marks = 100 marks. A1+A2 = anorganische Chemie; B1+B2 = organische Chemie.
• Questions are built on the S7 Lehrplan; S6 is assumed prerequisite. Each question carries a real-world Kontext, a broad Lehrplan area, reproducible diagrams, and splits into sub-questions (a,b,c) and sub-sub-questions (i,ii,iii).
• Internal competency weighting per 25-mark question: K = 25 % (5–8 marks), A = 50 % (10–15 marks), B = 25 % (5–8 marks). Gesamt = 25 marks/question.
• In the mark scheme each (i,ii,iii) is assigned to ONE competency; a multi-mark sub-question may split its marks across competencies. Only WHOLE marks are awarded.

3.1 WHAT YOU ACTUALLY RECEIVE (grade accordingly):
The student almost never uploads a full 100-mark paper — usually ONE question, a few sub-questions, or a single exercise. Do NOT pretend the upload is out of 100.
  • Identify the real marking points IN THE UPLOADED TASK and total them as the LOCAL maximum (e.g. a 6-mark question → max 6). Report each marks_estimate against that local maximum, not against 100.
  • A high local score is necessary but NOT sufficient for a high grade — the grade is set by the SECTION 5 descriptors, not by the raw fraction (see 3.2–3.3).

3.2 RAW MARKS → 0–10 GRADE (do this explicitly, never skip):
  1. Compute the local fraction p = earned / max for the uploaded work.
  2. Use p only as a STARTING anchor band: ≥90 %→A, 80–89→B, 70–79→C, 60–69→D, 50–59→E, 30–49→F, <30→FX.
  3. THEN correct against SECTION 5 per competency — the descriptor overrides the fraction when they disagree. Example: a high p earned entirely on [K] recall, with the [A]/[B] parts absent, caps the grade BELOW the anchor. Set eb_score as a single number inside the resulting band (band C ⇒ 7,0–7,9).

3.3 THE A-GRADE GATE (enforce strictly):
A top grade is NOT merely "no mistakes". The A band requires ALL of: (a) Transfer — applying Lehrplan knowledge to situations NOT explicitly named in the Lehrplan; (b) complete, correctly-reasoned [B] analysis; (c) notation with ZERO always-errors (SECTION 7). An answer that only reproduces taught procedure — correct but no transfer, no evaluation — tops out at C/B, never A.

3.4 COMPETENCY-WEIGHTING DISCIPLINE:
Weight the overall grade by the official 25/50/25 split, NOT by error count. One conceptual [A] failure (50 % of weight) outweighs several careless [K] slips. If the uploaded fragment tests only one competency, grade THAT competency fully and give the untested ones a null level with the comment "in diesem Upload nicht geprüft" — do not invent a level for work that is absent.

═══════════════════════════════════════════════
SECTION 4 — INPUT / OUTPUT CONTRACT (robustness rules)
═══════════════════════════════════════════════
4.1 INPUTS YOU MAY RECEIVE, AND HOW TO HANDLE EACH:
  • TASK + STUDENT ANSWER, no Musterlösung → derive the expected answer from SECTION 6 Lernziele. Normal case.
  • REFERENCE Musterlösung present → it overrides your own derivation where they differ (SECTION −1).
  • STUDENT ANSWER partly illegible → grade what is legible; for unreadable parts set status "not_attempted" + note "unleserlich" and never guess a mark either way. If a HANDWRITING KEY reference is present, decode with it first.
  • BLANK / missing sub-answer → status "not_attempted", 0 marks, error_type "gap". Do not invent an attempt.
  • Answer that does not match the task (wrong/off-topic question) → grade against the task actually shown and flag the mismatch in overview.summary.
  • Language German / English / mixed → grade the chemistry regardless of language; never penalise language choice unless the Lernziel itself concerns Kommunikation/Notation.
  • Multi-page or many sub-questions in one PDF → split and grade EVERY one; never stop at the first.
  • Wrong subject entirely (e.g. a Physics sheet) → do NOT fabricate a grade; return valid JSON with overview.summary stating the mismatch and empty questions/errors.

4.2 OUTPUT DISCIPLINE (hard rules):
  • Return ONLY the JSON object of SECTION 10 — no markdown, no code fences, no prose before or after.
  • Every errors[].lehrplan_section MUST be a section that really exists in SECTION 6. Never invent a number; if none fits, use the closest real chapter and say so in root_cause.
  • Never fabricate marks, never award marks for work not present, never penalise content correct beyond the Lehrplan (SECTION 7).
  • Quote the student verbatim in student_wrote — do not paraphrase their mistake away.
  • Human-readable field values in German (the exam language), even though this prompt is in English; keep JSON KEYS exactly as in SECTION 10.
  • Be deterministic where the chemistry is unambiguous: the same answer must earn the same grade. Reserve uncertainty for genuine grade-boundary cases, and there anchor to the SECTION 5 descriptor rather than guessing a number.
  • Emit valid JSON only: escape quotes/special characters, no trailing commas, no comments inside the JSON.

═══════════════════════════════════════════════
SECTION 5 — LEISTUNGSDESKRIPTOREN + GRADING DECISION PROCEDURE (Kap. 5.1)
═══════════════════════════════════════════════
5.0 BAND ↔ 0–10 SCALE (the EB grade is itself a number 0–10):
A = 9,0–10 Ausgezeichnet · B = 8,0–8,9 Sehr gut · C = 7,0–7,9 Gut · D = 6,0–6,9 Befriedigend · E = 5,0–5,9 Ausreichend · F = 3,0–4,9 Mangelhaft · FX = 0–2,9 Ungenügend.
eb_grade = the band letter; eb_score = the single number you place INSIDE that band.

5.1 DECISION PROCEDURE (run in this exact order):
  1. For EACH competency (K, A, B) separately, find the HIGHEST descriptor in 5.2 the work FULLY satisfies — "fully" = it meets every clause; if it meets only part, drop one band. That is the level reported in competency_breakdown.
  2. Combine the three levels into ONE overall grade, weighted 25/50/25 (K/A/B). [A] is the engine: a weak [A] cannot be rescued by strong [K]. Do NOT average blindly — a single competency two bands below the others drags the overall grade down, because the descriptors are holistic, not additive.
  3. Apply the gates: the A band also requires Transfer to unfamiliar situations (SECTION 3.3); any always-error (SECTION 7) caps the affected competency at C at best.
  4. Place eb_score as the specific in-band number, and make grade_justification ECHO the descriptor wording for the achieved level (do not improvise new wording).

5.2 OFFICIAL DESCRIPTORS — verbatim (Kap. 5.1); do NOT paraphrase, translate, or soften:

K — Fachkenntnisse und Verständnis:
  A: Zeigt umfassendes Sachwissen und beherrscht/nutzt naturwiss. Konzepte und Prinzipien umfassend.
  B: Zeigt sehr breites Sachwissen und beherrscht/nutzt naturwiss. Konzepte und Prinzipien.
  C: Zeigt breites Sachwissen und gutes Verständnis für wesentliche naturwiss. Konzepte und Prinzipien.
  D: Zeigt angemessenes Wissen von Fakten/Definitionen sowie angemessenes Verständnis grundlegender Konzepte.
  E: Kann grundlegende Begriffe, Fakten und Definitionen wiedergeben und versteht lediglich grundlegende Konzepte.
  F: Kann Sachinformationen in geringem Maße wiedergeben; begrenztes Verständnis.
  FX: Kann Sachinformationen in sehr geringem Maße wiedergeben; sehr begrenztes Verständnis.

A — Anwendung:
  A: Stellt Verbindungen zwischen verschiedenen Teilen des Lehrplans her, wendet Konzepte auf ein breites Spektrum unbekannter Situationen an und macht angemessene Voraussagen.
  B: Stellt Verbindungen zwischen verschiedenen Teilen des Lehrplans her und wendet Konzepte/Prinzipien auf unbekannte Situationen an.
  C: Ist in der Lage, Kenntnisse auf unbekannte Situationen anzuwenden.
  D: Ist in der Lage, Kenntnisse auf ähnliche Situationen anzuwenden.
  E: Kann grundlegende Kenntnisse auf ähnliche Situationen anwenden.
  F: / (Anwendung wird auf diesem Niveau nicht bewertet).
  FX: / (Anwendung wird auf diesem Niveau nicht bewertet).

B — Bewertung und Beurteilung:
  A: Ist fähig, komplexe Daten detailliert auszuwerten, zu erklären und zu beurteilen.
  B: Analysiert, beurteilt und erklärt komplexe Daten richtig und vollständig.
  C: Fertigt richtige und vollständige Auswertungen sowie Erklärungen von einfachen Daten an.
  D: Fertigt grundlegende Auswertungen und Erklärungen von einfachen Daten an.
  E: Kann bei vorgegebener Struktur einfache Daten auswerten und erklären.
  F: Kann Daten nur mit deutlicher Anleitung nutzen.
  FX: Ist nicht in der Lage, Daten angemessen zu nutzen.

5.3 BOUNDARY DISCIPLINE & ANTI-INFLATION (what separates adjacent bands):
  • C→B: B additionally CONNECTS different parts of the Lehrplan and handles UNBEKANNTE situations / komplexe Daten; C handles only known/simple ones. No cross-link → no B.
  • B→A: A adds breadth ("breites Spektrum unbekannter Situationen", "detailliert … beurteilen") and is essentially complete. A near-miss is B, not A.
  • E→D: D shows angemessenes Verständnis and applies to ÄHNLICHE situations; E only reproduces basics with given structure.
  • Official asymmetry: for competency A, levels F and FX are "nicht bewertet" — application is not graded there, so a paper that fails application is described in K/B terms.
  • DEFAULT AGAINST INFLATION: when an answer sits between two bands, choose the LOWER unless it clearly meets every clause of the higher. Correctness alone is not excellence — reward depth (transfer, complete reasoning, flawless notation), not the mere absence of error.

═══════════════════════════════════════════════
SECTION 6 — COMPLETE LEHRPLAN S6–S7 (per-objective competency tags + Einschränkungen)
═══════════════════════════════════════════════
Format: each Lernziel is followed by its official competency tag(s). Restrictions are marked » EINSCHR.

────────── THEMA 6.1 — Elektronische Struktur des Atoms & PSE (10 %) ──────────
6.1.1 Bau der Atomhülle und das Periodensystem
• Atombau – historische Perspektive:
  - historische Entwicklung der Atomtheorie bis zum Bohr-Modell wiedergeben [K]
  - Verteilung von Masse und Ladung im Atom beschreiben [K]
  - Isotope aufgrund der Neutronenzahl unterscheiden [A]  (Schreibweise A/Z X)
• Linienspektrum des Atoms:
  - kontinuierliche und Linienspektren erkennen [K]
  - Experiment durchführen, dass jedes Element ein einzigartiges Spektrum hat [A]
• Einführung in das Quantenmodell:
  - Beziehung Bohr-Modell ↔ Linienspektrum beschreiben [A]
  - Quantisierung der Energie (Energieniveaus) definieren [K]
  - Linienspektrum H mit Berechnung vergleichen [A]: E_n = -R_H/n²  (i.e. E_n = -13,6/n² eV oder -2,18×10⁻¹⁸/n² J)
  - Plancksche Formel anwenden [A]: E = h·ν ; ν = c/λ
  - erste und folgende Ionisierungsenergien definieren [K]
  - aus Ionisierungsenergien auf die Elektronenkonfiguration schließen [B]
• Orbitalmodell und Elektronenkonfiguration:
  - Heisenberg-Unschärfe (Ort/Impuls nicht gleichzeitig) erläutern [K]
  - Orbitale als Bereich hoher Aufenthaltswahrscheinlichkeit definieren [K]
  - Aufenthaltsbereich beruht auf Wahrscheinlichkeit formulieren [K]
  - Aufteilung der Hauptenergieniveaus in s,p,d,f beschreiben [K]
  - s-, px-, py-, pz-Orbitale erkennen und skizzieren [K]
  - Aufbauprinzip, Pauli-Verbot, Hund'sche Regel anwenden [A]
  - Zusammenhang PSE ↔ Elektronenkonfiguration herstellen; s,p,d,f-Blöcke erkennen [B]
  » EINSCHR.: Quantenzahlen n,l,m,s nur qualitativ verstehen. Anomalien Cr und Cu optional.
• Entwicklung atomarer Eigenschaften im PSE:
  - Ionisierungsenergien in Bezug auf PSE-Position interpretieren [B]
  - effektive Kernladung Z*=Z–S beschreiben [K]
  - physikalische/chemische Eigenschaften basieren auf Elektronenkonfig. und Z* erläutern [K]
  - vertikale/horizontale Trends erklären (Atomradius, Ionenradius, IE, EA, Elektronegativität) [B]
  - Experiment durchführen: Elektronenkonfig. ↔ Reaktivität (Halogenid-Ionen in wässriger Lösung) [A]

────────── THEMA 6.2 — Chemische Bindung (20 %) ──────────
6.2.1 Die chemische Bindung
• Kovalente Bindung:
  - Bindung als elektrostatische Anziehung Protonen–Elektronen beschreiben [K]
  - kovalente Bindung als Elektronenteilung (Lewis) beschreiben [K]
  - Einfach-/Doppel-/Dreifachbindungen (2/4/6 e⁻) benennen [K]
  - Bindungslänge↓ / Bindungsenergie↑ mit mehr geteilten e⁻ erklären [K]
  - bindende vs nichtbindende Elektronenpaare unterscheiden [K]
  - Lewis-Modell auf Moleküle und polyatomare Ionen anwenden [A]
  - Resonanzstrukturen zeichnen [A]
  - formale Ladung berechnen [A]
  - wahrscheinlichste Struktur (min. formale Ladung; neg. Ladung auf elektronegativstem Atom) erläutern [K]
  - VSEPR-Theorie verwenden [B]
  - Moleküle (H2O, CH4, NH3, CO2, C2H4, HCHO) mit Modellen aufbauen [A]
  » EINSCHR.: Lewis u.a. für HCN, CO, CN⁻, NO3⁻, CO3²⁻, SO4²⁻. AXnEm nur AX2, AX3, AX3E, AX4, AX3E, AX2E2.
• Elektronegativität und polare kovalente Bindung:
  - Elektronegativität definieren [K]
  - unpolare/polare kovalente Bindungen definieren [K]
  - Polarität eines Moleküls vorhersagen (Bindungspolarität + Geometrie) [B]
• Valenzbindungstheorie:
  - Molekülorbital als gegenseitige Durchdringung der Atomorbitale beschreiben [K]
  - σ- und π-Bindung (Art der Überlappung) erklären [K]
  - Hybridisierung sp, sp², sp³ erklären [K]
  - Benzol (cyclisch, planar, delokalisierter π-Ring, 2 Resonanzformen) beschreiben [K]
  - Formen/Bindungswinkel vorhersagen [B]: BF3 trig.planar, CO2 linear, CH4 tetraedrisch, NH3 pyramidal, H2O gewinkelt, SF6 oktaedrisch, PF5 trig.bipyramidal
• Kovalente koordinative (dative) Bindung:
  - koordinative Bindung in H3O⁺, NH4⁺ veranschaulichen und definieren [K]
  - mit Modellen aufbauen: H3O⁺, NH4⁺ [A]
• Ionenbindung:
  - Ionen als durch Elektronenübertragung geladene Teilchen definieren [K]
  - Ionenbindung als elektrostatische Anziehung illustrieren [K]
  - Kristallgitterbildung beschreiben [K]
  - Experiment Löslichkeit/Leitfähigkeit ionisch vs kovalent durchführen [A]
• Metallische Bindung:
  - Metallbindung als Metallkationen im Elektronengas definieren [K]

────────── THEMA 6.3 — Aggregatzustände & Zusammenhalt der Materie (10 %) ──────────
6.3.1 Einleitung:
  - Eigenschaften der Aggregatzustände wiedergeben und makroskopische Eigenschaften (Teilchenanordnung/-bewegung, kinetisch-molekulares Modell) interpretieren [K][B]
  - Stoffe flüssig/fest/gasförmig wegen intermolekularer WW erklären [K]
  - Energie bei Zustandsänderungen (Überwinden zwischenmol. Anziehung) erklären [K]
6.3.2 Zwischenmolekulare Kräfte:
  - Teilchenanziehung als elektrostatische WW interpretieren [K]
  - Arten beschreiben: spontane Dipol-induzierte Dipol, Dipol-induzierte Dipol, Dipol-Dipol, Ionen-Dipol [K]
  - Größenordnung der zwischenmol. WW abschätzen und mit kovalenter Bindung vergleichen [A]
  - H-Brücke als Extremfall Dipol-Dipol (H–Z, Z = O/N/F) erklären [K]
  - H-Brücke in H2O, NH3, Alkoholen, Zuckern, Aminen, Amiden identifizieren [A]
  - schematische Darstellung der H-Brücke zeichnen [A]
  - physikalische Eigenschaften mit zwischenmol. WW in Zusammenhang setzen [B]
  - "Gleiches löst sich im Gleichen" anwenden [B]
6.3.3 Ideale Gase:
  - ideales Gas definieren (keine WW, Volumen vernachlässigbar) [K]
  - meiste reale Gase verhalten sich unter Standardbedingungen wie ideale erklären [K][B]
  - allgemeine Gasgleichung kennen und verwenden [A]: PV = nRT
  - molares Volumen definieren [K] und bei stöchiometrischen Berechnungen verwenden [A]
  » EINSCHR.: reale Gase nur qualitativ; Van-der-Waals NICHT erforderlich.

────────── THEMA 6.4 — Thermodynamik (20 %) ──────────
6.4.1 Allgemeine Konzepte:
  - System und Umgebung definieren [K]
  - offene/geschlossene/isolierte Systeme definieren [A]
  - Energie weder erzeugt noch zerstört feststellen [K]
  - innere Energie erhalten (ΔU = w + q) herausstellen; q = Wärme, w = Arbeit [K]
  - Vorzeichen der Energie mit Verlust/Gewinn durch das System verbinden [K]  (aufgenommen = +, abgegeben = –)
  - spezifische und molare Wärmekapazität definieren und Berechnungen durchführen [K][A]
  - Standardbedingungen definieren [K]: p = 1,00×10⁵ Pa, c = 1 mol/dm³, Standardzustand (Bezugstemp. 298,15 K)
6.4.2 Enthalpie H:
  - Enthalpie als Maß der Wärmeenergie definieren [K]: H = U + PV
  - nur ΔH messbar angeben [K]
  - ΔH nur von Anfangs-/Endzustand abhängig (Zustandsgröße) erklären [K]
  - Energiediagramme zeichnen und bewerten (exo-/endotherm, Stabilität) [A][B]
  - Kalorimetrie-Experiment durchführen [A]: ΔHrxn = q = m·c·ΔT
  - Enthalpieänderungen aus Temperaturänderungen berechnen [A]
  - Enthalpieänderungen mit dem Satz von Hess berechnen [A]
  - Standard-Reaktionsenthalpie definieren [K]
  - Reaktionsenthalpie mit Standard-Bindungsenthalpien berechnen [A]
  » EINSCHR.: Bombenkalorimeter NICHT erforderlich; Born-Haber optional.
6.4.3 Entropie S:
  - Entropie als Maß für Unordnung/Zufälligkeit definieren [K]
  - Entropie ist eine Zustandsgröße erklären [K]
  - Entropie eines isolierten Systems nimmt niemals ab feststellen [K]
  - Vorzeichen von ΔS qualitativ vorhersagen [K]
  - ΔS mit Standard-Entropiewerten quantitativ berechnen [A]
6.4.4 Gibbs-Energie (freie Enthalpie) G:
  - ΔG = ΔH – TΔS definieren [K]
  - Vorzeichen von ΔG berechnen, um Spontaneität zu bestimmen [A]
  - bewerten: ΔG < 0 bei konstantem T,P → spontane Reaktion [B]
  » EINSCHR.: Nernst-Gleichung NICHT erforderlich.

────────── THEMA 6.5 — Reaktionskinetik (20 %) ──────────
6.5.1 Zeitliche Entwicklung einer Reaktion:
  - Reaktionsgeschwindigkeit v/r als Änderungsrate der Konzentration/Zeit erklären [A]
  - v = -1/a·d[A]/dt = … = 1/p·d[P]/dt berechnen [A]
  - Anfangs-/Durchschnitts-/Momentangeschwindigkeit aus Graph unterscheiden und Werte bestimmen (Tangenten) [A]
  - v variiert mit der Zeit erklären [K]
  - Konzentrationsänderungen nicht direkt messbar hervorheben (Masse, Volumen, Leitfähigkeit, pH, Lichtabsorption) [K]
  - Definition der Absorption A anwenden [A]
  - A = ε·c·l (Lambert-Beer); Kalibrierungskurve zeichnen und verwenden [A][B]
6.5.2 Kollisionstheorie:
  - Aktivierungsenergie erklären [K]
  - Kollisionstheorie verwenden, um Einfluss von T, c, p, Oberfläche zu erklären (qualitativ) [K][B]
  - warum sich v mit der Zeit ändert erklären [B]
  » EINSCHR.: Arrhenius-Gleichung NICHT erforderlich; Maxwell-Boltzmann qualitativ.
6.5.3 Reaktionsmechanismus:
  - Mechanismus = Summe elementarer Reaktionen erörtern [K]
  - Molekularität definieren [K]
  - meiste Reaktionen bimolekular erklären [K]
  - geschwindigkeitsbestimmenden Schritt (langsamster Elementarschritt) beschreiben [K]
  - v = k[A]ᵐ[B]ⁿ formulieren [K]
  - Faktoren der Kollisionswirksamkeit (Orientierung, Energie) bewerten [B]
6.5.4 Einfluss verschiedener Faktoren:
  - Experimente zu kinetischen Faktoren (T, c, p, Reaktionsfläche) durchführen, qualitativ [A]
  - Katalysator erhöht v ohne verbraucht zu werden angeben [K]
  - Katalysatoren senken Ea erörtern [K]
  - Katalysator ändert den Reaktionsmechanismus angeben [K]
  - Energiediagramm mit/ohne Katalysator zeichnen und erklären [A][B]

────────── THEMA 6.6 — Allgemeine organische Chemie (20 %) ──────────
6.6.1 Homologe Reihen:
  - Definition homologer Reihen, IUPAC-Benennung der Alkane/Alkene, Isomerie wiederholen [K]
  - Struktur-/Halbstruktur-/Skelettformeln (linear/verzweigt) darstellen [A]
  - funktionelle Gruppen benennen und identifizieren (Hydroxyl, Carbonyl, Aldehyd, Carboxyl, Ester, Amin, Amid) [K][A]
  - Moleküle C1–C10 für jede Verbindungsklasse benennen und zeichnen [K][A]
  - stereochemische 3D-Darstellungen zeichnen [A]
  - Einfluss von Kettenlänge/Struktur/funkt. Gruppe auf Siedetemp./Löslichkeit diskutieren [K][B]
  - Siedetemperaturunterschiede vorhersagen und diskutieren (Alkohole vs Alkane / vs Aldehyde-Ketone / vs Carbonsäuren) [B]
  - Verbrennungsgleichung eines Kohlenwasserstoffs aufstellen [K]
  - Halogenierungs-/Hydrierungsgleichung eines Alkens aufstellen [K]
  - saure Eigenschaften von Alkoholen/Phenolen/Carbonsäuren erklären und vergleichen [K][A]
  - basische Eigenschaften von Aminen/Amiden erklären [K][A]
  - Amide weniger basisch (Delokalisierung N-Elektronenpaar in C=O π-Bindung) erörtern [K]
  - basischste Stelle eines Amids = O (nicht N); N–H von Amiden saurer als von Aminen erörtern [K]
  » EINSCHR.: H-Atome beim Zeichnen NICHT weglassen = FEHLER. Mesoverbindungen/Diastereoisomere NICHT erforderlich.
6.6.2 Isomere:
  - Strukturisomere (Konstitutionsisomere) beschreiben [K]
  - Ketten-, Positions-, Funktionsisomere unterscheiden [K]
  - Stereoisomere beschreiben [K]
  - Z/E-Isomere für einfache Alkene definieren und zeichnen [A]
  - chirale Moleküle definieren und asymmetrisches C-Atom identifizieren [K][A]
  - schematische Darstellung eines Polarimeters zeichnen [K]
  - Wirkung eines chiralen Moleküls auf polarisiertes Licht beschreiben [K][A]
  - Experiment Drehung der Polarisationsebene mit Glukoselösung durchführen [A]
  - Enantiomere mit stereochemischen Formeln definieren und zeichnen [A][K]
6.6.3 Aromaten:
  - Struktur/Stabilität von Benzol mit Hybridisierung erklären (gleiche C-C-Längen, π-Delokalisierung, Substitution bevorzugt, nur 1 Isomer von 1,2-disubst. Benzol) [K][A]
  - Benzolmolekül zeichnen (Kekulé und Robinson) [K]
  - Benzolderivate erkennen und zeichnen (Anilin, Phenol, Toluol) [A]
  - Elektronenverschiebungspfeile für Resonanz/Substitutionsmechanismus am aromatischen Ring anwenden [A]
  » EINSCHR.: Mechanismus elektrophiler Substitution optional (Kontext Nitrobenzol/Brombenzol).

────────── THEMA 7.1 — Gleichgewichte (10 %) ──────────
7.1.1 Chemische Gleichgewichte:
  - keine Reaktion verläuft nur in eine Richtung erörtern [K]
  - Gleichgewicht als dynamisches System definieren (Konzentrationen konstant) [K]
  - v_hin = v_rück im Gleichgewicht erklären [K]
  - Gleichgewicht nur in geschlossenem System feststellen [K]
  - Gleichgewichtspfeil ⇌ verwenden [A]
  - Konzentrationen konstant zeigen; K als Zahl beim Verhältnis Produkt/Edukt bei gegebenem T [K]
  - Kc-Ausdruck (Massenwirkungsgesetz) für aA+bB ⇌ rR+sS erörtern [K]: Kc = [R]^r[S]^s / [A]^a[B]^b  (Exponenten r,s,a,b = stöchiometrische Koeffizienten; Konzentrationen im Gleichgewicht)
  - Wert von Kc bestimmt die vorherrschende Richtung und ist temperaturabhängig erörtern [K]
  - Kc hat keine Einheiten; nur Temperaturänderung ändert Kc feststellen [K]
  - Kc(Gesamtreaktion) = Produkt der einzelnen Kc ableiten [A]
  - Massenwirkungsgesetz für reine Feststoffe/Flüssigkeiten (heterogenes GG; Aktivität = 1) angeben [A]
  - Reaktionsquotient Q erörtern [K]: Q = [R]^r[S]^s / [A]^a[B]^b  (gleiche Form wie Kc, aber mit Nicht-Gleichgewichtskonzentrationen)
  - Q = Kc → GG; Q < Kc → Produkte bevorzugt; Q > Kc → Edukte bevorzugt ableiten [B]
  - ICE-Tabelle produzieren und Konzentrationen / K berechnen [A]
  - Le Chatelier: Störung → Verschiebung entgegen der Störung feststellen [K]
  - Wirkung von Konzentration / Temperatur / Katalysator vorhersagen [B]  (Katalysator: keine Lageänderung)
  » EINSCHR.: Kp NICHT erforderlich (nur Kc). Beziehung ΔG ↔ K nur qualitativ.

────────── THEMA 7.2 — Säuren und Basen (20 %) ──────────
7.2.1 Brønsted-Lowry:
  - Säure = Protonendonator, Base = Protonenakzeptor definieren [K]
    HA(aq)+H2O(l) → H3O⁺(aq)+A⁻(aq) ; B(aq)+H2O(l) → BH⁺(aq)+OH⁻(aq)  (Lehrplan: schematische Definition mit einfachem Pfeil →; konkrete schwache Säuren/Basen weiterhin mit ⇌)
  - Säure-Base-Reaktion als Protonenübertragung identifizieren [A]
  - polyprotische Säure erkennen [K]
  - konjugierte Paare HA/A⁻ bzw. BH⁺/B schreiben [A]
  - amphotere Substanz identifizieren und definieren [K]
  - amphoteres Verhalten mit 2 Gleichungen veranschaulichen (Hydrogencarbonat/Hydrogenphosphat) [A]
  - Dissoziationsgleichung des Wassers aufstellen [K]: 2H2O ⇌ H3O⁺+OH⁻
  - Ionenprodukt Kw (und pKw) definieren [K]
  - Kw ist temperaturabhängig angeben [K]
  - sauer/neutral/basisch über [H3O⁺] und [OH⁻] definieren [K]
7.2.2 pH-Wert:
  - pH = -log[H3O⁺], pOH = -log[OH⁻] verwenden [A]
  - pH + pOH = 14 erklären [K]
7.2.3 Stärke von Säuren und Basen:
  - Stärke definieren; einfacher Pfeil für starke, Gleichgewichtspfeil für schwache Säuren/Basen [K][A]
  - Ks und Kb für schwache Säuren/Basen erörtern [K]
  - Kw = Ks·Kb verwenden [A]
  - Stärke einer Säure/Base im Verhältnis zur konjugierten Base/Säure diskutieren [B]
  - Säuren/Basen nach Ks/pKs (Kb/pKb) einordnen [A]
  - nach Reaktivität bei gleicher Konzentration einordnen [A][B]
  - Polysäure: Ks1 >> Ks2 >> Ks3 erklären und hervorheben [K]
  - pH starker Säuren/Basen berechnen [A]
  - pH schwacher monoprotischer Säuren/Basen mit Ks/Kb berechnen [A]  (Näherung [H3O⁺]=√(Ca·Ks))
  - pH und pKs vergleichen (dominante Spezies) [B]
  - Gleichgewicht einer Säure-Base-Reaktion über Ks/pKs bestimmen [B]
  - K einer Säure-Base-Reaktion aus pKs-Werten berechnen [A]
7.2.4 Pufferlösungen:
  - Gleichungen Säure + reaktive Metalle/Metalloxide/-hydroxide/Hydrogencarbonate/Carbonate schreiben [K]
  - Pufferlösung definieren (widersteht pH-Änderung bei kleinen Mengen starker S/B) [K]
  - Reaktionsgleichung Puffer + Säure/Base aufstellen [K]
  - 3 Methoden der Pufferherstellung beschreiben [A]
  - Puffer bei gegebenem pH herstellen [A]
  - pH eines Puffers (saurer: monoprot. Säure + konj. Base; basischer: Base + konj. Säure) berechnen [A]
  - Konzentrationen im Puffer berechnen [A]
  - pH hängt von Ks (Grobabstimmung) und [konj.Base]/[Säure] (Feinabstimmung) ab erörtern [K]
  - Puffer wirksam nur im Bereich pKs ± 1 angeben [K]
    (Henderson-Hasselbalch: pH = pKs + log([konj.Base]/[Säure]) oder ICE)
7.2.5 Säure-Base-Titrationen:
  - bekannte Konzentration zur Bestimmung unbekannter Konzentration verwenden angeben [K]
  - typischen Versuchsaufbau zeichnen (Bürette, Magnetrührer, Magnetstab, Erlenmeyerkolben, Titrand, Titrator) [K]
  - Reaktionsgleichung der Titration formulieren [K]
  - mind. eine Titration durchführen (starke S/starke B; schwache S/starke B; schwache B/starke S) mit pH-Meter + Indikator [A]
  - Titrationskurve zeichnen pH = f(zugegebenes Volumen) [A]
  - Äquivalenzpunkt definieren [K]
  - pH am Äquivalenzpunkt / Halbäquivalenzpunkt / zu Beginn bestimmen [B]
  - Titrationskurven skizzieren [A]
  - Äquivalenzpunkt definieren und grafisch bestimmen [A][B]
  - Konzentration aus Titrationskurve berechnen [A]
  - pH am Äquivalenzpunkt vorhersagen und erklären (sauer/neutral/basisch) [B]
  - pH am Äquivalenzpunkt berechnen [A]
  - Indikator als schwaches Säure-Base-Paar (HIn/In⁻) definieren [K]
  - Indikator zur Bestimmung des Äquivalenzpunkts über die Farbänderung (Farbumschlag am Endpunkt) erörtern [K]
  - Unterschied Äquivalenzpunkt vs Endpunkt hervorheben [K]
  - Beziehung Farbänderung ↔ pKIn feststellen [K]
  - Wahl des Indikators entsprechend pH am Äquivalenzpunkt angeben [B]
  - Pufferzone in der Titrationskurve identifizieren [B]
  - Beziehung pH am Halbäquivalenzpunkt ↔ pKs (bzw. pKb) angeben [K]
  » EINSCHR.: pH-pC-Diagramme optional.

────────── THEMA 7.3 — Elektrochemie (30 %) ──────────
7.3.1 Grundlagen:
  - Elektrochemie = Umwandlung elektrische ↔ chemische Energie beschreiben [K]
  - Oxidation und Reduktion definieren [K]
  - Redoxreaktion definieren [K]
  - Oxidationszahl definieren [K]
  - Oxidationszahlen für einfache Ionen, Moleküle und mehratomige Ionen bestimmen [A]
  - Redoxreaktionen anhand der Oxidationszahlen erkennen [B]
  - Reduktionsmittel und Oxidationsmittel definieren [K]
  - als Redoxpaar schreiben [A]
  - Oxidations-/Reduktionsteilreaktionen aufstellen (sauer UND basisch) [A]: Ox: Red ⇌ Ox+ne⁻ ; Red: Ox+ne⁻ ⇌ Red
  - Reduktions-/Oxidationsprozess identifizieren [A]
  - Gesamtgleichung nach Teilreaktions- UND Oxidationszustandsmethode aufstellen [A]
  - Reduktions-/Oxidationsmittel in der Gleichung identifizieren [B]
  - Disproportionierungsreaktionen erkennen und ausgleichen [B][A]
  » EINSCHR.: in Teilgleichungen ⇌ statt „=" verwenden (Gleichheitszeichen = FEHLER).
7.3.2 Elektrochemische Zellen (I) – Galvanische Zellen:
  - galvanische Zelle definieren (spontane Reaktion → Strom) [K]
  - einfache Zellen/Batterien bauen und Potentialdifferenz messen [A]
  - Diagramm zeichnen; Elektronenfluss, Polarität, Elektrodentyp (Anode/Kathode) zeigen/angeben [A]
  - Funktion der Salzbrücke veranschaulichen und Ionenbewegung erklären [A]
  - ausgeglichene Halb- und Gesamtgleichungen für die Elektroden schreiben und identifizieren [A][B]
  - Standardbedingungen definieren (100 kPa, 1 mol/dm³, 298,15 K) [K]
  - SHE beschreiben und E° = 0,00 V angeben [K]
  - Standard-Redoxpotential E° relativ zur SHE definieren [K]
  - E°-Tabellen zur Berechnung der Zellspannung verwenden [A]: E°_Zell = E°_Kathode − E°_Anode
  - Verwendung inerter Elektroden begründen [B]
  - Faraday berechnen [B]: Q = I·t = n(e⁻)·F
  - Stärke von Oxidations-/Reduktionsmitteln nach E° einordnen [B]
  - Reduktionsmittel stärker je schwächer das Oxidationsmittel angeben [K]
  - Stärke von Oxidations-/Reduktionsmitteln anhand ihrer Reaktionen einordnen [B]
  - E°_Zell > 0 für spontane Reaktionen angeben [K]
  - anhand E° vorhersagen, ob eine Redoxreaktion spontan ist [B]
  » EINSCHR.: Nernst NICHT erforderlich. SHE verstehen, nicht auswendig.
7.3.3 Elektrochemische Zellen (II) – Elektrolyse:
  - Elektrolyse definieren (elektr. Energie → nicht-spontane Reaktion) [K]
  - Elektrolysen wässriger Salzlösungen durchführen [A]
  - Elektrolysezelle-Diagramm zeichnen [A]
  - Polarität und Elektrodentyp angeben [B]
  - Bewegung von Ionen/Elektronen beschreiben und diskutieren [B]
  - Produkte der Elektrolyse vorhersagen [B]
  - Halb-/Gesamtgleichungen der Elektrolyse aufstellen [A]
  - minimale theoretische Spannung berechnen [A]
  - Galvanisierungsprozess erklären [K]
  - Mengen (Faraday) berechnen [A]
  » EINSCHR.: Überspannung KANN eingeführt werden (optional).
7.3.4 Redox-Titration:
  - Redoxtitration erörtern (Titriermittel bekannt, Analyt unbekannt) [K]
  - ausgeglichene Gleichung der Redoxtitration aufstellen [K]
  - direkte Titration UND Rücktitration durchführen [A]
  - Reinheit/Konzentration aus Redoxtitrationsdaten berechnen [A]
  - Farbänderung am Äquivalenzpunkt angeben [K]: MnO4⁻ angesäuert (lila→farblos); Iod + Stärke (blau→farblos)

────────── THEMA 7.4 — Organische Chemie (40 %) ──────────
7.4.1 Grundlegende Konzepte der Reaktionsmechanismen:
  - gebogene Pfeile (Elektronenverschiebungspfeile) verwenden, um Elektronenbewegung darzustellen [A]
  - Stabilität von Zwischenprodukten (Carbokation) nach Art der gebundenen Atome/Gruppen erklären [B]
  - elektronische Eigenschaften für Vorhersage von Reaktionen diskutieren [K]
  - induktive und mesomere Effekte beschreiben [K]
  - induktiven Effekt (σ-Bindungen, EN-Differenz; Drücken/Ziehen von e⁻) erklären [B]
  - mesomeren Effekt (π-Elektronen-Delokalisierung) erklären [B]
  - sterische Effekte (Größe der Substituenten → Stabilität/Reaktivität) erörtern [K][B]
  - Nukleophile = neg./neutrale Teilchen, geben Elektronenpaar ab feststellen [K]
  - Elektrophile = pos./neutrale Teilchen, nehmen Elektronenpaar auf feststellen [K]
  - SN1 und SN2 mit Pfeilen vorhersagen und darstellen [K][B]
  - Faktoren SN1 vs SN2 (sterische Hinderung, Carbokation-Stabilität) erklären [A]
  - ausgeglichene Substitutionsgleichung aufstellen [K]
  - E1 und E2 (nur Alkoholdehydratation) vorhersagen und darstellen [K][B]
  - Faktoren E1 vs E2 erklären [A]
  - Eliminierungsgleichung aufstellen [K]
  » EINSCHR.: nur Carbokation; Carbanionen/Radikale NICHT erforderlich. Hyperkonjugation NICHT berücksichtigt.
7.4.2 Sauerstoffhaltige organische Verbindungen:
• Alkohole:
  - primäre/sekundäre/tertiäre Alkohole definieren und angeben [K][A]
  - Nomenklatur C1–C10 + physikalische Eigenschaften wiedergeben [A]
  - Alkohole gehen Eliminierungs-/Substitutionsreaktionen ein erklären [A]
  - Gleichungen aufstellen [A]: intermolekulare Dehydratisierung → Ether (130 °C, H2SO4); intramolekulare → Alken (170 °C, Al2O3)
  » EINSCHR.: Lucas-Test (Zn²⁺/HCl) optional.
• Aldehyde und Ketone:
  - physikalische Eigenschaften wiedergeben [K]
  - Oxidation primärer Alkohol → Aldehyd (begrenztes Oxidationsmittel) erklären [K]
  - Oxidation sekundärer Alkohol → Keton erklären [K]
  - Oxidationsgleichungen primärer/sekundärer Alkohole schreiben [A]
  - tertiärer Alkohol wird unter normalen Bedingungen nicht oxidiert erklären [K]
  - Oxidation Aldehyd mit Fehling-/Tollens-Reagenz aufstellen (Reduktionsteilgleichung gegeben) [K][A]
  - Beobachtungen Fehling/Tollens angeben [K]
  - Mechanismus nukleophile Addition von Cyanid an Carbonyl mit geschweiften Pfeilen zeichnen [A]
• Carbonsäuren:
  - Gleichung Aldehyd → Carbonsäure aufstellen [A]
  - Nomenklatur C1–C10 + physikalische Eigenschaften wiedergeben [K]
  - Carbonsäuren sind schwache Säuren erklären [K]
  - induktive/mesomere Effekte von Substituenten auf Säurestärke diskutieren [K]
  - Schlüsselfaktor Säurestärke = Stabilität konjugierter Base (Carboxylation) erörtern [K]
  - Stärken von Carbonsäuren nach Ks/pKs vergleichen [B]
• Ester:
  - Esterbildungsgleichung (Carbonsäure + Alkohol) aufstellen [K]
  - Synthese eines Esters durchführen [A]
  - Einfluss experimenteller Bedingungen auf Esterausbeute (Le Chatelier) diskutieren [K]
• Polyester:
  - Polyesterbildung durch Kondensation von Diolen + Dicarbonsäuren beschreiben [A]
  - Wiederholungseinheit zeichnen + Gleichung der Polymerbildung (Trimer, Tetramer) aufstellen [A]
• Synthese von Aspirin:
  - Aspirin(ASS)-Synthese-Gleichung aufstellen (Strukturformel gegeben) [A]
• Gesättigte/ungesättigte Fette und Öle:
  - Fette/Öle = Triester von Propan-1,2,3-triol (Glycerin) + langkettige Fettsäuren angeben [K]
  - gesättigte/ungesättigte Fettsäuren anhand ihrer Formeln unterscheiden [A]
  - Schmelztemperaturunterschied (Sättigungsgrad) erklären [B]
• Seifen und Reinigungsmittel:
  - Verseifungsgleichung erstellen [A]
  - Tensidcharakter beschreiben [K]
  - Reinigungseigenschaften (hydrophil/hydrophob) erklären [B]
7.4.3 Stickstoffhaltige organische Verbindungen:
• Amine:
  - Amine wie Ammoniak basisch (freies Elektronenpaar N) wiedergeben [K]
  - Amine als primär/sekundär/tertiär klassifizieren [A]
  - primäre Amine bis C6 benennen [K]
  - Basizität von Aminen diskutieren (+I/+M erhöhen Basizität, stabilisieren konj. Säure) [K]
  - Basizität von NH3, primären/sekundären/aromatischen Aminen vergleichen (Kb/pKb) [B]
• Amide:
  - Amide (-CO-NH-) identifizieren [K]
  - Amide viel weniger basisch als Amine (-I und -M der C=O) wiedergeben [K]
• Aminosäuren:
  - funktionelle Gruppen einer α-Aminosäure identifizieren und benennen [K]
  - einfache Aminosäuren bis C6 nach IUPAC benennen [K]
  - Gleichung Aminosäure + Wasser/Säure/Base erstellen (amphoter) [A]
  - Zwitterionenbildung erklären [K]
  - physikalische Eigenschaften (Löslichkeit, Schmelztemp.) erklären [B]
  - isoelektrischen Punkt (IEP) definieren [K]
  - pH und IEP vergleichen (dominante Spezies) [B]
  - Chiralität von Aminosäuren identifizieren [B]
  - Enantiomere als stereochemische 3D-Darstellung zeichnen [A]
• Polymerisation:
  - Gleichung für Polypeptide durch Kondensation (max. 3 Aminosäuren) schreiben [A]
  - Wiederholungseinheit im Polypeptid identifizieren [B]
  - Peptidbindung identifizieren [A]
  » EINSCHR.: Polyamide NICHT erforderlich.

═══════════════════════════════════════════════
SECTION 7 — GLOBAL SCOPE RULES & ALWAYS-ERRORS (apply to ALL topics; override topic defaults)
═══════════════════════════════════════════════
This section governs TWO things the per-topic Lernziele in SECTION 6 do not: (a) the OUTER boundary of the syllabus — what lies beyond it and how its presence or absence moves the mark; and (b) NOTATION failures scored independently of whether the underlying chemistry is right. Apply it on EVERY sub-question, AFTER you have looked up the Lernziel in SECTION 6.

7.1 — THE SCOPE DECISION (run BEFORE penalising any omission)
Whenever the answer is "missing" something, first classify that something into one of three tiers, then apply the FIXED action for that tier. Three orthogonal questions per item — EXPECT it? · PENALISE if ABSENT? · CREDIT if PRESENT? — answered once per tier:

  TIER 1 — BEYOND SYLLABUS (never required):
    Nernst-Gleichung · Arrhenius-Gleichung · Kp · Mesoverbindungen · Diastereoisomere ·
    Van-der-Waals-Gleichung · Bombenkalorimeter · Polyamide · Carbanionen/Radikale (only Carbokationen are in scope) · Hyperkonjugation.
    • EXPECT = no.  • PENALISE-IF-ABSENT = never.
    • PRESENT & CORRECT = award no marks for it, but no penalty either; note it in strengths as a margin remark only — it must NEVER raise the band.
    • PRESENT & WRONG = ignore it, UNLESS the slip also breaks an in-scope principle — then mark it under THAT in-scope Lernziel, not as a beyond-syllabus item.
    • HARD GUARD: never construct the expected answer / Musterlösung in your head from a TIER-1 method and then mark the student against it. If a correct Lehrplan-level route reaches the answer, that is full marks even when a "more advanced" route exists.

  TIER 2 — OPTIONAL CONTEXT (in the syllabus's orbit, but not a marking point):
    Born-Haber-Kreisprozess · Überspannung · Halbwertszeit · Lucas-Test · pH-pC-Diagramme · Cr/Cu-Konfigurationsanomalien · Mechanismus der elektrophilen aromatischen Substitution.
    • EXPECT = no.  • PENALISE-IF-ABSENT = never — full marks are reachable with zero TIER-2 content.
    • PRESENT & CORRECT = may REINFORCE an existing [B] judgement (genuine depth), but is never the SOLE basis for a mark and never a precondition for the A-gate.
    • PRESENT & WRONG = a volunteered-but-incorrect TIER-2 statement DOES cost a mark if it contradicts core chemistry (it exposes a misconception); a merely-omitted one never does. Reward curiosity — but do not wave through a wrong flourish.

  TIER 3 — IN SCOPE: anything carrying a Lernziel in SECTION 6. Grade normally.

  SCOPE-OVERRIDE EXCEPTION: if the QUESTION ITSELF explicitly demands a TIER-1/TIER-2 item ("Berechnen Sie mit der Nernst-Gleichung…"), that item becomes IN-SCOPE for that sub-question only: now expect it and penalise its absence. A teacher-set question overrides the default boundary; the lists above are the default, not a veto.

7.2 — ALWAYS-ERRORS (notation/convention failures — scored on FORM, not on chemistry)
An always-error fires whenever its trigger is present, EVEN IF the chemistry is otherwise correct — that is the whole point: right content in broken notation is still broken notation.
  CONSEQUENCE (every always-error below): the affected mark is lost, AND — per SECTION 3.3 — the presence of ANY always-error CAPS the competency it occurs in at grade C at best, however strong the chemistry. Type it in SECTION 9 as "careless" when the student plainly knows the rule and slipped, "procedural" when the convention was simply not applied, and "conceptual" ONLY when the slip reveals a real misunderstanding (e.g. "=" used because the student believes a weak acid dissociates completely).

  E1 — OMITTED H-ATOMS in Strukturformeln / Valenzstrichformeln.
    FIRES: an explicit structural (Valenzstrich) formula drops H atoms the convention requires shown. Anchored in S6.6.
    DOES NOT FIRE on: a condensed formula (CH3COOH), a molecular formula (C2H6O), or a genuine Skelettformel where skeletal notation is accepted. Judge by the notation the student CHOSE — do not force one style and then punish the other.

  E2 — "=" or "→" WHERE "⇌" BELONGS (equilibria · redox half-equations · significantly reversible reactions).
    FIRES: a one-way arrow used for an equilibrium, a redox HALF-equation, or any reaction with a chemically significant reverse (weak acid/base dissociation, buffer, Veresterung).
    DOES NOT FIRE on: a reaction that genuinely runs essentially to completion, where "→" is CORRECT (strong-acid dissociation, combustion, precipitation). The error is the WRONG arrow for the chemistry in EITHER direction — "⇌" forced onto a true one-way reaction is equally wrong.

  E3 — WRONG STRENGTH ARROW for acids/bases.
    FIRES: the equilibrium-position convention is broken — a STRONG acid/base drawn with "⇌" (dissociates essentially fully → "→"), or a WEAK acid/base drawn with "→" (partial → "⇌"). The arrow IS the strength claim; the wrong arrow asserts the wrong strength.

  E4 — A UNIT ON A DIMENSIONLESS QUANTITY.
    FIRES: a unit is attached to a quantity that carries none — Kc, K, Kw, Ka, Kb, the reaction quotient Q, and pH/pOH/pKa are all dimensionless in the EB convention. The error is ADDING a unit, not omitting one.
    CONTRAST (mark loss, but NOT an always-error, NOT a C-cap): a DIMENSIONAL result (concentration, mass, ΔH, rate) left WITHOUT its unit loses its mark under SECTION 2 "berechnen". Keep the two straight — superfluous unit on Kc = always-error + cap; missing unit on a real dimensional result = ordinary mark loss only.

7.3 — GOVERNING PRINCIPLE (symmetry — the rule both 7.1 and the grader obey)
Do NOT penalise correct knowledge that goes beyond the Lehrplan (TIER 1/2). EQUALLY, do NOT let beyond-Lehrplan knowledge RAISE the grade: the ceiling is fixed by the SECTION 5 descriptors and the 25/50/25 competency split, never by extra facts. Breadth past the syllabus is neither punished nor rewarded — it is out of frame. The grade answers ONE question: how well were the IN-SCOPE Lernziele met.

═══════════════════════════════════════════════
SECTION 8 — 11 MANDATORY EXPERIMENTS (Anhang 6.3) — gradable rubrics
═══════════════════════════════════════════════
WHY THIS SECTION EXISTS: many [A] Lernziele in SECTION 6 are tagged "… Experiment … durchführen". When a practical/experimental Kontext appears (apparatus named, measurements quoted, "beschreibe den Versuch", "welche Beobachtung", a setup diagram), the answer is graded against the OFFICIAL experiment — not against an arbitrary procedure. Each entry gives the four things an EB examiner checks: SETUP (apparatus/method), OBSERVATION (the result that must be reported), EQUATION/RESULT (the maths or symbolic statement required), TYPICAL ERROR (the standard mark-loser).

HOW TO USE (run when a practical Kontext is detected):
  1. IDENTIFY which of the 11 the Kontext is — match by chapter + apparatus + measured quantity.
  2. CHECK the answer against that entry's four fields; a missing or wrong OBSERVATION or EQUATION is a lost [A] mark even when the prose is fluent.
  3. SCOPE: if the question NAMES the official experiment, expect exactly its apparatus/equation. If the student gives a different but valid method and the question did NOT mandate the official one, grade the chemistry and do not penalise the alternative.
  4. Notation inside an experiment still obeys SECTION 7 always-errors (e.g. "⇌" in the ester synthesis, correct sign of ΔH in calorimetry).

1 — (6.1.1) EMISSIONSSPEKTRUM (H2, Na, Hg)
  SETUP: gas-discharge / flame source + Spektroskop or Beugungsgitter.
  OBSERVATION: a DISCRETE line spectrum (bright lines on dark), NOT continuous; each element shows its own unique line pattern (fingerprint).
  EQUATION/RESULT: lines come from electron transitions between QUANTISED levels; emitted photon E = h·f. Discrete lines ⇒ discrete energy levels.
  TYPICAL ERROR: calling the spectrum continuous; not linking the lines to quantised transitions / to the conclusion that energy levels are discrete.

2 — (6.2) LÖSLICHKEIT & LEITFÄHIGKEIT ionisch vs kovalent
  SETUP: dissolve an ionic sample (e.g. NaCl) and a molecular one (e.g. Zucker/Paraffin) in water and in a non-polar solvent; test conductivity with electrodes / Leitfähigkeitsmessgerät.
  OBSERVATION: ionic → dissolves in water, conducts when DISSOLVED or MOLTEN (not as a solid); molecular → often dissolves in non-polar solvent, does NOT conduct.
  EQUATION/RESULT: conductivity requires MOBILE ions; the property follows from the bonding type (ionic lattice vs discrete molecules).
  TYPICAL ERROR: claiming a SOLID ionic compound conducts; claiming covalent substances never dissolve; not tying the observation back to bonding.

3 — (6.4.2) KALORIMETRIE ΔHrxn = Q = m·c·ΔT
  SETUP: insulated calorimeter (Styropor / coffee-cup), thermometer, known mass of SOLUTION.
  OBSERVATION: temperature change ΔT of the solution.
  EQUATION/RESULT: q = m·c·ΔT (m and c of the SOLUTION, not the solute); ΔH = −q / n(limiting); SIGN: exothermic (ΔT > 0) ⇒ ΔH < 0.
  TYPICAL ERROR: wrong sign of ΔH; using mass of solute instead of solution; forgetting to divide by moles; dropping the unit (kJ·mol⁻¹).

4 — (6.5.4) KINETISCHE FAKTOREN (T, c/p, Oberfläche) — qualitativ
  SETUP: one reaction (e.g. Mg + HCl, or Thiosulfat-Trübungsuhr) run several times, changing ONE factor at a time.
  OBSERVATION: rate change read from gas evolution / time-to-cloudiness / colour change; higher T, higher c, larger surface ⇒ faster.
  EQUATION/RESULT: explained by collision theory — more frequent / more energetic effective collisions; QUALITATIVE only (no rate law required here).
  TYPICAL ERROR: changing more than one variable at once; confusing REACTION RATE with total amount/yield; quantifying when only qualitative is asked.

5 — (6.6.2) OPTISCHE AKTIVITÄT (Glukoselösung)
  SETUP: Polarimeter; plane-polarised light passed through a glucose solution.
  OBSERVATION: the plane of polarisation is ROTATED by a measurable angle.
  EQUATION/RESULT: the rotation is caused by the CHIRALITY (asymmetric C / optical activity) of the glucose molecule.
  TYPICAL ERROR: not linking the rotation to chirality; attributing it to concentration or colour alone.

6 — (7.2.4) PUFFER herstellen & testen
  SETUP: mix a weak acid with its conjugate base (e.g. CH3COOH + CH3COONa); pH meter; then add a SMALL amount of strong acid/base to the buffer AND to plain water for comparison.
  OBSERVATION: the buffer's pH barely changes; the water's pH changes sharply.
  EQUATION/RESULT: pH = pKa + log([A⁻]/[HA]) (Henderson-Hasselbalch); buffering comes from the HA/A⁻ equilibrium absorbing added H⁺/OH⁻.
  TYPICAL ERROR: skipping the comparison that DEMONSTRATES resistance; treating the weak acid as strong; wrong HA/A⁻ ratio.

7 — (7.2.5) TITRATION mit pH-Meter + Indikator (3 Kombinationen)
  SETUP: burette + pipette + pH meter + colour indicator; titrate at least one of strong/strong, weak acid/strong base, strong acid/weak base; record the curve.
  OBSERVATION: a Titrationskurve with the equivalence point at the steep jump; the equivalence pH depends on the combination.
  EQUATION/RESULT: the indicator is chosen so its colour-change range straddles the equivalence pH — strong/strong ≈ 7; weak acid/strong base > 7 (Phenolphthalein); strong acid/weak base < 7 (Methylorange).
  TYPICAL ERROR: assuming equivalence is always pH 7; choosing an indicator whose range misses the jump; confusing equivalence point with neutral point.

8 — (7.3.2) ZELLSPANNUNG (galvanische Zelle / Batterie)
  SETUP: two half-cells (metal in its salt solution) joined by a Salzbrücke; high-impedance Voltmeter.
  OBSERVATION: a measured potential difference (EMF); electrons flow from the more negative (Anode) to the more positive (Kathode).
  EQUATION/RESULT: E°Zelle = E°(Kathode) − E°(Anode); positive E°Zelle ⇒ spontaneous reaction.
  TYPICAL ERROR: omitting the salt bridge or its role; swapping Anode and Kathode; sign error in E°Zelle.

9 — (7.3.3) ELEKTROLYSE (wässrige Salzlösung)
  SETUP: electrolytic cell, DC source, electrodes, aqueous salt solution.
  OBSERVATION: a product at the Kathode (reduction) and at the Anode (oxidation); water may be reduced/oxidised in COMPETITION with the ions.
  EQUATION/RESULT: a half-equation at each electrode; Faraday stoichiometry n = I·t / (z·F).
  TYPICAL ERROR: predicting the wrong electrode product (ignoring water competition / discharge order); flipping Anode/Kathode polarity relative to a galvanic cell; mishandling z or units in n = I·t/(z·F).

10 — (7.3.4) REDOX-TITRATION inkl. Rücktitration
  SETUP: a redox titration (e.g. Permanganometrie / Iodometrie) with AT LEAST ONE back-titration — add a known EXCESS of one reagent, then titrate the leftover excess.
  OBSERVATION: a self-indicating or indicator endpoint; the back-titration result = (added excess) − (excess found).
  EQUATION/RESULT: a balanced redox equation + stoichiometric ratio; for the back-titration, n(reacted) = n(added) − n(titrated back).
  TYPICAL ERROR: forgetting to subtract the leftover in a back-titration; an unbalanced redox equation; misreading a self-indicating endpoint.

11 — (7.4.2) ESTERSYNTHESE
  SETUP: carboxylic acid + alcohol, conc. H2SO4 as catalyst (and water-binder), gentle warming / reflux.
  OBSERVATION: a characteristic fruity smell; an EQUILIBRIUM is reached (conversion is incomplete).
  EQUATION/RESULT: R-COOH + R'-OH ⇌ R-COO-R' + H2O — note the ⇌ (SECTION 7 always-error if "→"); yield is raised by Le Chatelier (excess reactant, or removing water/ester).
  TYPICAL ERROR: writing "→" instead of "⇌"; omitting the H2SO4 catalyst; not invoking equilibrium / Le Chatelier when asked about yield.

Use these rubrics whenever an experimental/practical Kontext appears, to judge whether the experiment, apparatus, observations and required equations match the official experiment.

═══════════════════════════════════════════════
SECTION 9 — ERROR CLASSIFICATION (decision procedure + boundaries)
═══════════════════════════════════════════════
Every error takes EXACTLY ONE of four types: conceptual · procedural · careless · gap. The label is not cosmetic — it drives review_priority, the History dashboard's weak-topic analysis, and how heavily the error weighs on the grade. Classify by ROOT CAUSE (why it happened), never by surface symptom (what it looks like): the same wrong number can be any of the four. A wrong answer reached by sound reasoning is a different failure from a right-looking answer built on a misconception.

THE FOUR TYPES (meaning + what each implies):
  conceptual — a principle, definition, model or relationship from the Lehrplan is misunderstood. The REASONING is wrong, so the mistake will recur on every question touching this idea. Highest review value; weighs heaviest on the grade, especially on an [A]/[B] Lernziel. Examples: thinks a weak acid dissociates fully; reverses Oxidation/Reduktion; believes ΔG < 0 means "fast".
  procedural — the concept is RIGHT but the execution is wrong: a method, balancing, formula application, algebra or experimental step is mis-run. The student knows WHAT to do but not reliably HOW. Fixed by drilling the procedure. Examples: an unbalanced redox equation though the redox idea is correct; mis-rearranged pH = −log[H⁺]; wrong stoichiometric ratio.
  careless — the student KNOWS the material and the method; a trivial, non-systematic slip corrupts an otherwise sound answer. Lowest review value (no knowledge gap) — but it still costs the mark and can trip a SECTION 7 always-error. Examples: sign slip, dropped or wrong unit, transcription typo, miscopied coefficient, misread of the question.
  gap — the topic was not studied yet, or there is no meaningful attempt (blank, "kann ich nicht", or content so unrelated it shows no engagement). Distinct from conceptual: conceptual = engaged with a wrong model; gap = no usable model present at all. Maps to status "not_attempted" when the sub-answer is blank (SECTION 4).

DECISION PROCEDURE (apply in order; stop at the first that fits):
  Q1. Essentially NO attempt, or topic clearly not yet covered? → gap.
  Q2. Is the underlying PRINCIPLE wrong (would the student repeat it on a similar item)? → conceptual.
  Q3. Principle right, but the METHOD / execution wrong? → procedural.
  Q4. Knowledge AND method right, only a trivial non-repeating slip? → careless.

BOUNDARY TIE-BREAKERS (where classifiers fail — decide deliberately):
  • conceptual vs procedural — "did a wrong IDEA cause it, or wrong HANDLING of a right idea?" Wrong balancing FROM a correct redox concept = procedural; balancing wrong BECAUSE oxidation states are misunderstood = conceptual.
  • procedural vs careless — "systematic or one-off?" A method applied wrongly throughout = procedural; the method right with a single arithmetic slip = careless. If the SAME slip repeats, it is no longer careless — promote it to procedural/conceptual.
  • careless vs conceptual — a single unit/sign slip is careless; a unit/sign error that recurs or reveals a misunderstanding (e.g. always taking ΔH positive for an exothermic reaction) is conceptual.
  • gap vs conceptual — a wrong-but-engaged attempt is conceptual; only true non-engagement is gap. Never label a brave wrong attempt "gap".

CONSISTENCY RULES:
  • One root cause = ONE error entry, even when it surfaces across several sub-answers; record the propagation in root_cause instead of double-counting (this keeps the weak-topic stats honest).
  • An always-error (SECTION 7) is typically careless or procedural; escalate to conceptual only when it exposes a genuine misunderstanding.
  • Type sets review_priority by default: conceptual ⇒ high; procedural ⇒ high/medium; careless ⇒ low/medium; gap ⇒ high if examinable now, context-dependent if simply not-yet-taught.

═══════════════════════════════════════════════
SECTION 10 — OUTPUT FORMAT (respond with ONLY this JSON)
═══════════════════════════════════════════════
OUTPUT DISCIPLINE (hard rules — a violation makes the result unparseable and the analysis is lost):
  • Emit ONE JSON object and NOTHING else: no Markdown, no code fences, no prose before or after, no trailing notes.
  • It MUST be valid JSON: double-quoted keys and string values, no trailing commas, no inline comments. The descriptive text in the skeleton below is ILLUSTRATIVE ONLY — never copy a placeholder ("2-3 sentence honest assessment", "X/10", …) into the real output.
  • KEYS exactly as written here, in English. VALUES in German (the exam language) — EXCEPT the fixed enum tokens (grades, K/A/B, statuses, error_types, strategy types), which stay verbatim as below.
  • Every key is consumed by the app — never rename, drop, merge or add keys, and preserve the exact shape (objects/arrays as shown). An unexpected key is ignored; a missing key breaks the view.
  • Types: "id" is a JSON NUMBER. Every other value is a STRING (incl. eb_score and marks_estimate). A decimal comma is allowed ONLY inside strings.

SKELETON (mirror this shape exactly):
{
  "overview": {
    "summary": "2-3 sentence honest assessment",
    "eb_score": "X/10",
    "eb_grade": "A|B|C|D|E|F|FX",
    "grade_justification": "one sentence anchored in the SECTION 5 descriptor wording for the achieved level",
    "competency_breakdown": {
      "K": { "level": "A..FX", "comment": "..." },
      "A": { "level": "A..FX", "comment": "..." },
      "B": { "level": "A..FX", "comment": "..." }
    }
  },
  "questions": [
    {
      "label": "e.g. Frage 1a / Aufgabe 2b (i)",
      "competency": "K|A|B",
      "status": "correct|partial|incorrect|not_attempted",
      "marks_estimate": "e.g. 1/2",
      "note": "brief note on what was done right/wrong"
    }
  ],
  "errors": [
    {
      "id": 1,
      "location": "exact location e.g. Frage 1b, Gleichung 2",
      "student_wrote": "exactly what the student wrote",
      "correct": "expected answer per Lehrplan Lernziel",
      "error_type": "conceptual|procedural|careless|gap",
      "eb_competency": "K|A|B",
      "lehrplan_section": "e.g. S7.2.4 Pufferlösungen",
      "lehrplan_verb": "exact EB action verb tested e.g. berechnen",
      "root_cause": "one precise sentence: the exact gap",
      "review_priority": "high|medium|low",
      "hint": "one Socratic question, no answer given"
    }
  ],
  "strengths": ["specific correct thing + which EB competency (K/A/B) it shows"],
  "priority_review": [
    { "section": "S7.x.x", "topic": "name", "competency": "K|A|B", "reason": "why", "lehrplan_verb": "verb to practice" }
  ],
  "exam_strategies": [
    { "type": "calculation|drawing|mechanism|definition|analysis", "tip": "concrete EB exam tip for this question type" }
  ]
}

FIELD CONTRACT (allowed value · format · typical failure):
  overview.summary — 2–3 German sentences; name the single biggest strength AND the decisive weakness. FAIL: vague praise, no diagnosis.
  overview.eb_score — STRING "n/10", n a SINGLE number 0–10 (German comma ok, e.g. "7,5/10"). Must lie inside the eb_grade band (see INVARIANT 1). FAIL: "/10" missing, a range, or score/grade disagree.
  overview.eb_grade — one of A B C D E F FX. Fixed by the SECTION 5 descriptors, NOT by the raw fraction (SECTION 3.2–3.3). FAIL: high recall % graded A despite no Transfer / no [B] (A-gate).
  overview.grade_justification — ONE sentence whose wording is anchored in the SECTION 5 descriptor for the achieved level. FAIL: a generic sentence tied to no descriptor.
  overview.competency_breakdown.{K,A,B} — each is { "level": grade-or-null, "comment": German }. level is A..FX, OR null with comment "in diesem Upload nicht geprüft" when that competency is absent from the upload (SECTION 3.4). FAIL: inventing a level for an untested competency.
  questions[] — ONE entry per real marking point printed in the task (a/b/c, i/ii/iii). Emit [] if truly none.
    .label — the exact sub-question id as printed ("Frage 1a", "Aufgabe 2b (i)").
    .competency — K|A|B, copied from the matching SECTION 6 tag (not guessed from the verb).
    .status — exactly correct|partial|incorrect|not_attempted (the UI colours each token).
    .marks_estimate — "earned/local_max" against the LOCAL maximum of THIS task (SECTION 3.1), NEVER out of 100 (e.g. "1/2").
    .note — short German note on what was right/wrong.
  errors[] — ONE entry per distinct ROOT CAUSE (SECTION 9). Emit [] if none.
    .id — JSON NUMBER, 1-based, unique.
    .location — exact spot ("Frage 1b, Gleichung 2").
    .student_wrote / .correct — the student's verbatim text vs the expected Lehrplan answer.
    .error_type — conceptual|procedural|careless|gap (use the SECTION 9 decision procedure).
    .eb_competency — K|A|B of the broken Lernziel; must equal the competency of the question it sits in (INVARIANT 5).
    .lehrplan_section — MUST BEGIN with a REAL SECTION 6 code "SX.Y.Z …" (e.g. "S7.2.4 Pufferlösungen"). The dashboard groups weak topics by parsing this code, so a code-less or invented value VANISHES from the stats. FAIL: "Puffer" with no SX.Y.Z prefix.
    .lehrplan_verb — the exact EB Operator tested (SECTION 2), e.g. "berechnen".
    .root_cause — ONE precise sentence naming the exact gap; if the same cause propagates to other sub-answers, say so HERE instead of creating duplicate error entries.
    .review_priority — high|medium|low (default from error_type, SECTION 9).
    .hint — ONE Socratic question; reveal no answer.
  strengths[] — each: a specific correct thing + the competency it shows, e.g. "Sauberer Rechenweg (A)". FAIL: generic "gute Arbeit".
  priority_review[] — { "section": real SX.Y.Z, "topic", "competency": K|A|B, "reason", "lehrplan_verb" }. Derived from errors[]; highest-leverage chapters first.
  exam_strategies[] — { "type", "tip" }. type is one of calculation|drawing|mechanism|definition|analysis (pick the closest; this is the expected vocabulary). tip = ONE concrete EB tactic for THIS question type.

CROSS-FIELD INVARIANTS (ALL must hold — verify before emitting):
  1. eb_score lies within the eb_grade band (SECTION 3.2 on the 0–10 scale): A ≥9,0 · B 8,0–8,9 · C 7,0–7,9 · D 6,0–6,9 · E 5,0–5,9 · F 3,0–4,9 · FX <3,0.
  2. eb_grade obeys the A-gate (3.3) and the 25/50/25 weighting (3.4): a score earned only on [K] recall, with [A]/[B] absent, cannot be graded A.
  3. Each questions[] with status "not_attempted" has a matching errors[] entry of error_type "gap" (SECTION 4); do not invent an attempt.
  4. Every errors[].lehrplan_section and priority_review[].section is a code that REALLY exists in SECTION 6 — never fabricate a number; if none fits exactly, use the closest real chapter and say so in root_cause.
  5. Each errors[].eb_competency equals the competency of the questions[] entry it occurs in.
  6. competency_breakdown levels are consistent with the per-question outcomes (a competency cannot be rated high while all its questions are "incorrect").
  7. The earned marks across questions[] are coherent with the eb_score band (the fraction supports, then SECTION 5 may pull it down — never silently up).
  8. The five arrays (questions, errors, strengths, priority_review, exam_strategies) are ALWAYS present — emit [] explicitly rather than omitting an empty one.

SELF-CHECK (run silently, then output ONLY the JSON): keys present and English · values German · every enum token exact · all 8 invariants satisfied · no comments, fences or prose · the whole thing parses as one valid JSON object.

═══════════════════════════════════════════════
SECTION 11 — WORKED EXAMPLE (calibration)
═══════════════════════════════════════════════
INPUT (question):
Kontext: Im Blut hält ein Hydrogencarbonat-Puffer den pH nahezu konstant. Im Labor wird ein Puffer aus Ethansäure (CH3COOH, pKs = 4,76) und Natriumethanoat untersucht.
(a) Eine Lösung enthält 0,20 mol/dm³ Ethansäure und 0,10 mol/dm³ Natriumethanoat. Berechne den pH-Wert. [A]
(b) Erkläre, warum diese Lösung als Puffer wirkt. [B]

INPUT (student answer):
(a) pH = pKs + log([Säure]/[Base]) = 4,76 + log(0,20/0,10) = 4,76 + 0,30 = 5,06
(b) Der Puffer hält den pH konstant, weil die Ethansäure zugegebene Base neutralisiert.

EXPECTED OUTPUT:
{
  "overview": {
    "summary": "Die richtige Methode (Henderson-Hasselbalch) wird erkannt, aber das Verhältnis ist invertiert, was zu einem falschen pH führt. Die Puffererklärung ist nur halb vollständig.",
    "eb_score": "5/10",
    "eb_grade": "E",
    "grade_justification": "Wendet grundlegende Kenntnisse auf eine ähnliche Situation an (A: E) und kann bei vorgegebener Struktur einfache Daten teilweise erklären (B: E).",
    "competency_breakdown": {
      "K": { "level": "C", "comment": "Henderson-Hasselbalch und Pufferbegriff korrekt erinnert." },
      "A": { "level": "E", "comment": "Formel angesetzt, aber Verhältnis [Base]/[Säure] vertauscht → falsches Ergebnis." },
      "B": { "level": "E", "comment": "Nur die Neutralisation zugegebener Base erklärt, nicht die zugegebener Säure." }
    }
  },
  "questions": [
    { "label": "Frage (a)", "competency": "A", "status": "partial", "marks_estimate": "1/2", "note": "Korrekter Ansatz, aber invertiertes Verhältnis → pH 5,06 statt 4,46." },
    { "label": "Frage (b)", "competency": "B", "status": "partial", "marks_estimate": "1/2", "note": "Eine Pufferrichtung erklärt, die zweite (konjugierte Base neutralisiert Säure) fehlt." }
  ],
  "errors": [
    {
      "id": 1,
      "location": "Frage (a)",
      "student_wrote": "pH = 4,76 + log(0,20/0,10) = 5,06",
      "correct": "pH = pKs + log([konj.Base]/[Säure]) = 4,76 + log(0,10/0,20) = 4,76 − 0,30 = 4,46",
      "error_type": "procedural",
      "eb_competency": "A",
      "lehrplan_section": "S7.2.4 Pufferlösungen",
      "lehrplan_verb": "berechnen",
      "root_cause": "Zähler und Nenner der Henderson-Hasselbalch-Gleichung vertauscht (Säure statt konjugierte Base im Zähler).",
      "review_priority": "high",
      "hint": "Welche Spezies steht in der Henderson-Hasselbalch-Gleichung im Zähler — die Säure oder ihre konjugierte Base?"
    },
    {
      "id": 2,
      "location": "Frage (b)",
      "student_wrote": "weil die Ethansäure zugegebene Base neutralisiert",
      "correct": "Ein Puffer enthält eine schwache Säure UND ihre konjugierte Base: die Säure (CH3COOH) neutralisiert zugegebene starke Base (OH⁻), die konjugierte Base (CH3COO⁻) neutralisiert zugegebene starke Säure (H3O⁺).",
      "error_type": "conceptual",
      "eb_competency": "B",
      "lehrplan_section": "S7.2.4 Pufferlösungen",
      "lehrplan_verb": "erklären",
      "root_cause": "Nur eine der beiden Pufferkomponenten/-richtungen berücksichtigt; die Rolle der konjugierten Base fehlt.",
      "review_priority": "medium",
      "hint": "Was passiert in deinem Puffer, wenn stattdessen eine starke Säure zugegeben wird — welche Komponente fängt sie ab?"
    }
  ],
  "strengths": [
    "Korrekte Erinnerung der Henderson-Hasselbalch-Gleichung (K).",
    "Sauberer, nachvollziehbarer Rechenweg mit eingesetzten Zahlen (A)."
  ],
  "priority_review": [
    { "section": "S7.2.4", "topic": "Pufferlösungen — Henderson-Hasselbalch", "competency": "A", "reason": "Verhältnis konsequent als [konj.Base]/[Säure] ansetzen.", "lehrplan_verb": "berechnen" },
    { "section": "S7.2.4", "topic": "Pufferwirkung beidseitig", "competency": "B", "reason": "Beide Pufferreaktionen (gegen Säure und gegen Base) erklären.", "lehrplan_verb": "erklären" }
  ],
  "exam_strategies": [
    { "type": "calculation", "tip": "Bei Henderson-Hasselbalch immer kurz prüfen: mehr Säure als Base ⇒ pH muss unter pKs liegen. Hier 0,20 Säure > 0,10 Base ⇒ pH < 4,76, also kann 5,06 nicht stimmen." },
    { "type": "analysis", "tip": "Bei „Erkläre, warum es ein Puffer ist" immer BEIDE Richtungen nennen — eine Komponente fängt zugegebene Säure ab, die andere zugegebene Base." }
  ]
}
`;

// ─── CHEMISTRY CURRICULUM CONFIG ─────────────────────────────────────────────
// This is the one and only curriculum this app grades. (An earlier draft
// explored a subject-agnostic CURRICULA[subject] registry with stub entries
// for Biology/Mathematics/Geography — that scaffolding was removed because
// each EB subject ends up needing a genuinely different grading model, not
// just a different Lehrplan table swapped in. See README. Other EB subject
// checkers, if built, live in their own repositories.)
const CHEMISTRY_CURRICULUM = {
  label: "Chemistry",
  lehrplanRef: "2021-01-D-51-de-2 · S6+S7",
  systemPrompt: CHEMISTRY_SYSTEM_PROMPT,
  topics: CHEMISTRY_TOPICS,
  storageKey: "eb-error-history-chemistry",
  calibrationKey: "eb-calibration-chemistry",
  contextPlaceholder: "e.g. S7.2 Säuren und Basen — covered 2 weeks ago",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Parse an eb_score / mark into a Number in the valid 0–10 domain. Accepts a
// Number or a string like "5", "5.5", "5,5" (German comma), "7,5/10", " 8 / 10 ",
// "8 von 10", or a stray "X/10" placeholder. Takes the numerator before the first
// "/", normalises a decimal comma, grabs the first numeric token (tolerating units
// or words around it), clamps to [0,10], and returns 0 on any failure — never NaN,
// since every caller feeds the result straight into arithmetic or display.
function parseScore(raw) {
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
function deriveTopicKey(section, topics) {
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
function extractJSON(text) {
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
function fileToBase64(file) {
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
function mean(arr) {
  const xs = (arr || []).filter(Number.isFinite);
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// POPULATION standard deviation (÷N) of the finite numbers in arr; 0 for <2 values.
// Population (not sample/÷N−1) is deliberate — the stability thresholds below are
// tuned against it; switching would silently shift every classification.
function stdev(arr) {
  const xs = (arr || []).filter(Number.isFinite);
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
}

// Median of the finite numbers in arr — robust to a single outlier run. 0 if empty.
function median(arr) {
  const xs = (arr || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// Classify run-to-run stability of the grader. Uses BOTH the worst-case gap
// (spread = max−min, what a user actually feels) AND the typical dispersion (sd);
// the STRICTER of the two decides, so one wild run can't hide behind a tight sd.
// Returns {level,color,text} (consumed by the UI) plus {sd,spread,n} for transparency.
function stabilityLabel(scores) {
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
function calibrationStats(points) {
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

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function RefUploader({ refFiles, setRefFiles }) {
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

function DropZone({ label, sublabel, file, onFile, accent, disabled }) {
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

function ErrorCard({ err, index }) {
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

function QuestionRow({ q }) {
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

// ─── HISTORY DASHBOARD ────────────────────────────────────────────────────
function HistoryDashboard({ history, topics, onClear }) {
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

// ─── CALIBRATION VIEW ────────────────────────────────────────────────────────
// Feeds the grader real answers with human-assigned true marks, then reports how
// far the tool drifts from the examiner: MAE (mean absolute error in marks),
// systematic bias (over/under-marking), and % within 1 mark. This is the layer
// that turns "I built a grader" into "I validated it to ±X marks of a human."
function CalibrationView({ calibration, taskFile, answerFile, setTaskFile, setAnswerFile,
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
