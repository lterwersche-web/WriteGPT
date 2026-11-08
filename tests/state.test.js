import { test } from 'node:test';
import assert from 'node:assert/strict';

// state.js speichert im Browser-Speicher – hier ein einfacher Ersatz für Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
};

const S = await import('../js/state.js');

test('Meine Texte: neuer Text, wechseln, Text wird automatisch gespeichert', () => {
  S.update({ text: 'Erster Text' });
  const first = S.getState().docId;
  S.newDoc();
  assert.equal(S.getState().text, '');
  S.update({ text: 'Zweiter Text' });
  S.switchDoc(first);
  assert.equal(S.getState().text, 'Erster Text');
  const titles = S.getState().docs.map((d) => S.docTitle(d.text)).sort();
  assert.deepEqual(titles, ['Erster Text', 'Zweiter Text']);
});

test('Meine Texte: Löschen des aktiven Texts wechselt zum nächsten', () => {
  const before = S.getState().docs.length;
  S.deleteDoc(S.getState().docId);
  assert.equal(S.getState().docs.length, before - 1);
  assert.ok(S.getState().docs.some((d) => d.id === S.getState().docId));
});

test('docTitle: Markdown-Zeichen weg, lange Titel gekürzt', () => {
  assert.equal(S.docTitle('# **Photosynthese**\nText'), 'Photosynthese');
  assert.equal(S.docTitle('   \n\n'), 'Leerer Text');
  assert.ok(S.docTitle('x'.repeat(100)).length <= 48);
});

test('Meine Schriften: anlegen, wechseln, umbenennen, löschen', () => {
  S.setGlyph('a', 0, { strokes: [[0, 0, 1, 1]] });
  const firstId = S.getState().font.id;
  const newId = S.createFont('Schreibschrift');
  assert.equal(S.getState().font.id, newId);
  assert.deepEqual(S.getState().font.glyphs, {}, 'neue Schrift ist leer');
  S.switchFont(firstId);
  assert.ok(S.getState().font.glyphs.a, 'alte Schrift wieder da');
  S.renameFont(newId, 'Schön');
  assert.ok(S.allFonts().some((f) => f.id === newId && f.name === 'Schön'));
  S.deleteFont(newId);
  assert.equal(S.allFonts().length, 1);
});

test('Backup enthält alle Schriften und lässt sich wieder laden', async () => {
  S.createFont('Zweite');
  S.setGlyph('b', 0, { strokes: [[0, 0, 1, 1]] });
  const json = await S.exportBackup().text();
  const data = JSON.parse(json);
  assert.equal(data.fontLibrary.length, 1);
  S.importBackup(json);
  assert.equal(S.allFonts().length, 2);
});
