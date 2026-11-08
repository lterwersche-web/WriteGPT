// ─────────────────────────────────────────────────────────────
// state.js – Der "Speicher" der App
// ─────────────────────────────────────────────────────────────
// Alles, was die App sich merkt, steckt in EINEM Objekt (state).
// Ändert sich etwas, werden alle "Zuhörer" (subscribe) informiert
// und der Stand wird im Browser gespeichert (localStorage).
// → Deine Schrift ist auch nach dem Schließen noch da.

const STORAGE_KEY = 'writegpt:v1';

export const DEFAULT_PEN = {
  color: '#1c1c1e', // Tintenfarbe
  width: 0.5, // Stiftdicke in mm
  size: 4.5, // Schriftgröße: Grundlinie → Oberlinie in mm
  lineHeight: 9, // Zeilenabstand in mm
  letterSpacing: 0, // zusätzlicher Buchstabenabstand (in Einheiten)
  wordSpacing: 0.55, // Wortabstand (in Einheiten)
  jitter: 0.6, // Natürlichkeit 0…1
  paper: 'lined', // blank | lined | grid | dots
  format: 'A4', // A4 | A5 | Letter
  paperInPdf: true, // Papier-Linien im PDF mitexportieren?
  seed: 1, // Startwert für den Zufall ("Neu mischen" ändert ihn)
};

export const DEFAULT_FONT = {
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

function defaults() {
  return {
    font: structuredClone(DEFAULT_FONT),
    pen: { ...DEFAULT_PEN },
    text: '',
    edits: structuredClone(EMPTY_EDITS),
    ui: { eraseMode: 'gap' }, // Radierer: 'gap' = Lücke lassen, 'close' = zusammenrücken
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    const base = defaults();
    return {
      font: { ...base.font, ...saved.font, sets: { ...base.font.sets, ...saved.font?.sets } },
      pen: { ...base.pen, ...saved.pen },
      text: typeof saved.text === 'string' ? saved.text : '',
      edits: { ...base.edits, ...saved.edits },
      ui: { ...base.ui, ...saved.ui },
    };
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

// Vor dem Schließen/Wechseln der App sofort speichern
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

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

// ── Backup ───────────────────────────────────────────────────

export function exportBackup() {
  const data = { app: 'WriteGPT', version: 1, exportedAt: new Date().toISOString(), font: state.font, pen: state.pen };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (data?.app !== 'WriteGPT' || typeof data.font?.glyphs !== 'object') {
    throw new Error('Das ist keine WriteGPT-Backup-Datei.');
  }
  const base = defaults();
  update({
    font: { ...base.font, ...data.font, sets: { ...base.font.sets, ...data.font.sets } },
    pen: { ...base.pen, ...data.pen },
  });
}

export function resetFont() {
  update({ font: structuredClone(DEFAULT_FONT) });
}
