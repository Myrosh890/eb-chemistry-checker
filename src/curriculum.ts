// EB Chemistry curriculum data: the topic map, competency framework, error
// type metadata, and the focus-hint builder injected into grading requests.
// This is the file to edit when correcting or extending Lehrplan content
// (e.g. the Alkohole / Polyamide follow-ups noted in the README) — it has
// no UI code and no dependency on React.

import { CHEMISTRY_SYSTEM_PROMPT } from "./systemPrompt";

// Shared EB competency framework (same 3-competency model across all sciences)
export const EB_COMPETENCIES = {
  K: { label: "Kenntnisse & Verständnis", color: "#3aa6c4", weight: "25%" },
  A: { label: "Anwendung", color: "#62cfc4", weight: "50%" },
  B: { label: "Analyse & Bewertung", color: "#ef7155", weight: "25%" },
};

// Hardcoded error-type labels. These four keys ("conceptual", "procedural",
// "careless", "gap") also appear in the JSON schema inside systemPrompt.ts
// and in the dashboard counter initialization in components/HistoryDashboard.tsx.
// Renaming or adding a type requires updating all three locations together.
export const ERROR_META = {
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
export const CHEMISTRY_TOPICS = {
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
export function buildFocusHint(topicKey) {
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

// ─── CHEMISTRY CURRICULUM CONFIG ─────────────────────────────────────────────
// This is the one and only curriculum this app grades. (An earlier draft
// explored a subject-agnostic CURRICULA[subject] registry with stub entries
// for Biology/Mathematics/Geography — that scaffolding was removed because
// each EB subject ends up needing a genuinely different grading model, not
// just a different Lehrplan table swapped in. See README. Other EB subject
// checkers, if built, live in their own repositories.)
export const CHEMISTRY_CURRICULUM = {
  label: "Chemistry",
  lehrplanRef: "2021-01-D-51-de-2 · S6+S7",
  systemPrompt: CHEMISTRY_SYSTEM_PROMPT,
  topics: CHEMISTRY_TOPICS,
  storageKey: "eb-error-history-chemistry",
  calibrationKey: "eb-calibration-chemistry",
  contextPlaceholder: "e.g. S7.2 Säuren und Basen — covered 2 weeks ago",
};
