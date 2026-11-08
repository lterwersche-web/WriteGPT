// ─────────────────────────────────────────────────────────────
// state.js – Der "Speicher" der App
// ─────────────────────────────────────────────────────────────
// Alles, was die App sich merkt, steckt in EINEM Objekt (state).
// Ändert sich etwas, werden alle "Zuhörer" (subscribe) informiert
// und der Stand wird im Browser gespeichert (localStorage).
// → Deine Schrift ist auch nach dem Schließen noch da.

const STORAGE_KEY = 'writegpt:v1';
const MAX_DOCS = 40;

export const DEFAULT_PEN = {
  color: '#1c1c1e', // Tintenfarbe
  nib: 'fineliner', // Stiftart: fineliner (gleich dick) | fountain (Füller: dick-dünn)
  width: 0.5, // Stiftdicke in mm
  size: 4.5, // Schriftgröße: Grundlinie → Oberlinie in mm
  lineHeight: 9, // Zeilenabstand in mm
  letterSpacing: 0, // zusätzlicher Buchstabenabstand (in Einheiten)
  wordSpacing: 0.55, // Wortabstand (in Einheiten)
  jitter: 0.6, // Natürlichkeit 0…1
  paper: 'lined', // blank | lined | grid | dots
  paperMargin: false, // rote Randlinie wie im Schulheft
  format: 'A4', // A4 | A5 | A6 (Karteikarte) | Letter
  paperInPdf: true, // Papier-Linien im PDF mitexportieren?
  // Lernzettel
  boldStyle: 'thick', // **fett** wird: thick (dicker) | marker (Textmarker) | underline
  markerColor: '#ffd60a', // Textmarker-Farbe
  headingColor: '', // Überschriften-Farbe ('' = wie die Tinte)
  centerHeadings: false, // Überschriften zentrieren
  // Seite
  headerText: '', // Kopfzeile links, z.B. "Bio – Photosynthese"
  headerDate: false, // Datum oben rechts
  pageNumbers: false, // Seitenzahlen unten rechts
  hrPageBreak: false, // --- startet eine neue Seite (z.B. für Karteikarten)
  seed: 1, // Startwert für den Zufall ("Neu mischen" ändert ihn)
};

export const DEFAULT_FONT = {
  id: 'font-1',
  name: 'Meine Schrift',
  configured: false, // Einrichtung abgeschlossen?
  style: 'print', // print | semi | cursive
  variants: 3, // Wie oft wird jedes Zeichen gezeichnet?
  sets: { math: false, special: false }, // optionale Zeichen
  autoFix: true, // Buchstaben automatisch auf Grundlinie & Größe angleichen
  glyphs: {}, // { 'a': [variante1, variante2, …] }
};

// Änderungen in der Vorschau (Radierer & "Neu würfeln").
// Gemerkt wird pro Zeichen-Nummer (idx) im Text:
//   erased: { 12: 'gap' }  → Zeichen 12 ist wegradiert, Lücke bleibt
//           { 12: 'close' } → Zeichen 12 ist weg, Text rückt zusammen
//   reroll: { 12: 2 }      → Zeichen 12 wurde 2× neu gewürfelt
//   key:    der Text, zu dem die Nummern gehören (zum Nachführen beim Tippen)
export const EMPTY_EDITS = { key: '', erased: {}, reroll: {} };

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function newDocObject(text = '') {
  return { id: uid('doc'), text, edits: structuredClone(EMPTY_EDITS), updated: Date.now() };
}

function defaults() {
  const doc = newDocObject();
  return {
    font: structuredClone(DEFAULT_FONT),
    fontLibrary: [], // weitere (gerade nicht aktive) Schriften
    pen: { ...DEFAULT_PEN },
    text: '',
    edits: structuredClone(EMPTY_EDITS),
    docs: [doc], // "Meine Texte"
    docId: doc.id,
    ui: {
      eraseMode: 'gap', // Radierer: 'gap' = Lücke lassen, 'close' = zusammenrücken
      showTemplate: true, // beim Zeichnen die vorherige Variante blass zeigen
      onboarded: false, // Kurzanleitung schon gesehen?
      penTab: 'pen', // zuletzt geöffneter Tab in "Stift & Papier"
    },
  };
}

function mergeFont(base, saved) {
  return { ...base, ...saved, sets: { ...base.sets, ...saved?.sets } };
}

function load() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    const base = defaults();
    const s = {
      font: mergeFont(base.font, saved.font),
      fontLibrary: Array.isArray(saved.fontLibrary) ? saved.fontLibrary : [],
      pen: { ...base.pen, ...saved.pen },
      text: typeof saved.text === 'string' ? saved.text : '',
      edits: { ...base.edits, ...saved.edits },
      docs: Array.isArray(saved.docs) && saved.docs.length ? saved.docs : null,
      docId: saved.docId,
      ui: { ...base.ui, ...saved.ui },
    };
    // Ältere Version ohne "Meine Texte": aktuellen Text als ersten Text übernehmen
    if (!s.docs) {
      const doc = { ...newDocObject(s.text), edits: s.edits };
      s.docs = [doc];
      s.docId = doc.id;
    }
    if (!s.docs.some((d) => d.id === s.docId)) s.docId = s.docs[0].id;
    // Wer schon eine Schrift hat, braucht keine Kurzanleitung mehr
    if (Object.keys(s.font.glyphs).length && saved.ui?.onboarded === undefined) s.ui.onboarded = true;
    return s;
  } catch {
    return defaults();
  }
}

const listeners = new Set();
let state = load();
let saveTimer = null;
let onSaveError = null;

export function getState() {
  return state;
}

/** Ändert einen Teil des States, z.B. update({ pen: { ...pen, color: '#f00' } }) */
export function update(patch) {
  state = { ...state, ...patch };
  // Text & Radierungen automatisch im aktuellen Eintrag von "Meine Texte" mitspeichern
  if (('text' in patch || 'edits' in patch) && !('docs' in patch)) {
    state.docs = state.docs.map((d) =>
      d.id === state.docId ? { ...d, text: state.text, edits: state.edits, updated: Date.now() } : d,
    );
  }
  for (const fn of listeners) fn(state, patch);
  scheduleSave();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onStorageError(fn) {
  onSaveError = fn;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

export function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    onSaveError?.(err);
  }
}

// Vor dem Schließen/Wechseln der App sofort speichern (nur im Browser)
if (typeof document !== 'undefined') {
  addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
}

// ── Hilfsfunktionen für Glyphen ──────────────────────────────

export function setGlyph(ch, variant, data) {
  const glyphs = { ...state.font.glyphs };
  const list = [...(glyphs[ch] ?? [])];
  list[variant] = data;
  // Lücken am Ende abschneiden
  while (list.length && !list.at(-1)) list.pop();
  if (list.length) glyphs[ch] = list;
  else delete glyphs[ch];
  update({ font: { ...state.font, glyphs } });
}

export function getGlyph(ch, variant) {
  return state.font.glyphs[ch]?.[variant] ?? null;
}

// ── Meine Texte ──────────────────────────────────────────────

/** Titel eines Texts = erste Zeile ohne Markdown-Zeichen */
export function docTitle(text) {
  const line = (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const clean = line.replace(/^#+\s*|^[-*+>]\s+|^\d+[.)]\s+/, '').replace(/[*_`=#]/g, '').trim();
  return clean ? (clean.length > 48 ? `${clean.slice(0, 47)}…` : clean) : 'Leerer Text';
}

/** Leere Texte (außer dem aktuellen) aufräumen und Anzahl begrenzen */
function tidyDocs(docs, keepId) {
  const kept = docs.filter((d) => d.id === keepId || d.text.trim());
  kept.sort((a, b) => b.updated - a.updated);
  return kept.slice(0, MAX_DOCS);
}

export function newDoc(text = '') {
  const doc = newDocObject(text);
  update({ docs: tidyDocs([doc, ...state.docs], doc.id), docId: doc.id, text: doc.text, edits: doc.edits });
  return doc.id;
}

export function switchDoc(id) {
  const doc = state.docs.find((d) => d.id === id);
  if (!doc || id === state.docId) return;
  update({ docs: tidyDocs(state.docs, id), docId: id, text: doc.text, edits: doc.edits ?? structuredClone(EMPTY_EDITS) });
}

export function deleteDoc(id) {
  let docs = state.docs.filter((d) => d.id !== id);
  if (!docs.length) docs = [newDocObject()];
  if (id !== state.docId) {
    update({ docs });
    return;
  }
  const next = docs[0];
  update({ docs, docId: next.id, text: next.text, edits: next.edits ?? structuredClone(EMPTY_EDITS) });
}

// ── Meine Schriften ──────────────────────────────────────────
// Die aktive Schrift steckt in state.font, alle anderen in state.fontLibrary.

export function allFonts() {
  return [state.font, ...state.fontLibrary].map((f) => ({ id: f.id, name: f.name, active: f.id === state.font.id, count: Object.keys(f.glyphs ?? {}).length }));
}

export function createFont(name) {
  const font = { ...structuredClone(DEFAULT_FONT), id: uid('font'), name: name || 'Neue Schrift' };
  update({ fontLibrary: [state.font, ...state.fontLibrary], font });
  return font.id;
}

export function switchFont(id) {
  if (id === state.font.id) return;
  const target = state.fontLibrary.find((f) => f.id === id);
  if (!target) return;
  update({ font: mergeFont(DEFAULT_FONT, target), fontLibrary: [state.font, ...state.fontLibrary.filter((f) => f.id !== id)] });
}

export function renameFont(id, name) {
  const clean = String(name ?? '').trim().slice(0, 40);
  if (!clean) return;
  if (id === state.font.id) update({ font: { ...state.font, name: clean } });
  else update({ fontLibrary: state.fontLibrary.map((f) => (f.id === id ? { ...f, name: clean } : f)) });
}

export function deleteFont(id) {
  if (id !== state.font.id) {
    update({ fontLibrary: state.fontLibrary.filter((f) => f.id !== id) });
    return;
  }
  // Aktive Schrift löschen → nächste nehmen (oder eine leere neue)
  const [next, ...rest] = state.fontLibrary;
  update({ font: next ? mergeFont(DEFAULT_FONT, next) : { ...structuredClone(DEFAULT_FONT), id: uid('font') }, fontLibrary: rest });
}

// ── Backup ───────────────────────────────────────────────────

export function exportBackup() {
  const data = {
    app: 'WriteGPT',
    version: 2,
    exportedAt: new Date().toISOString(),
    font: state.font,
    fontLibrary: state.fontLibrary,
    pen: state.pen,
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (data?.app !== 'WriteGPT' || typeof data.font?.glyphs !== 'object') {
    throw new Error('Das ist keine WriteGPT-Backup-Datei.');
  }
  const base = defaults();
  const imported = mergeFont(base.font, data.font);
  // Gleiche Schrift schon vorhanden? → ersetzen, sonst zusätzlich aufnehmen
  const others = [state.font, ...state.fontLibrary].filter((f) => f.id !== imported.id && Object.keys(f.glyphs ?? {}).length);
  const library = [...(Array.isArray(data.fontLibrary) ? data.fontLibrary : []), ...others].filter(
    (f, i, arr) => f.id !== imported.id && arr.findIndex((g) => g.id === f.id) === i,
  );
  update({ font: imported, fontLibrary: library, pen: { ...base.pen, ...data.pen } });
}

export function resetFont() {
  update({ font: { ...structuredClone(DEFAULT_FONT), id: state.font.id, name: state.font.name } });
}
