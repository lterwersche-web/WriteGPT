import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatText, parseInline } from '../js/markdown.js';
import { layoutDocument, pageGeometry, germanDate } from '../js/layout.js';
import { nibBuckets, nibWidth } from '../js/render.js';
import { createPdf } from '../js/pdf.js';
import { fakeFont, PEN } from './helpers.js';

const lay = (text, pen = {}, opts = {}) =>
  layoutDocument(parseChatText(text), fakeFont(), { ...PEN, ...pen }, { date: new Date(2026, 10, 8), ...opts });

test('==Text== wird zu Textmarker', () => {
  const runs = parseInline('Das ist ==sehr wichtig== hier');
  assert.equal(runs.map((r) => r.text).join(''), 'Das ist sehr wichtig hier');
  assert.equal(runs.find((r) => r.text === 'sehr wichtig').mark, true);
  const l = lay('Das ist ==sehr wichtig== hier');
  assert.equal(l.pages[0].markers.length, 1, 'ein durchgehender Marker über zwei Wörter');
});

test('Fett als Textmarker / Unterstrichen / Dicker', () => {
  const text = 'Ein **wichtiges** Wort';
  const marker = lay(text, { boldStyle: 'marker' });
  assert.equal(marker.pages[0].markers.length, 1);
  const thick = lay(text, { boldStyle: 'thick' });
  assert.ok(thick.pages[0].strokes.some((s) => s.w > PEN.width * 1.5));
  const ul = lay(text, { boldStyle: 'underline' });
  assert.equal(ul.pages[0].markers.length, 0);
  assert.ok(ul.pages[0].strokes.length > thick.pages[0].strokes.length, 'Unterstreichung kommt dazu');
  assert.ok(!ul.pages[0].strokes.some((s) => s.w > PEN.width * 1.5), 'nicht zusätzlich dicker');
});

test('Überschriften in eigener Farbe, Text bleibt in Tintenfarbe', () => {
  const l = lay('# Titel\nNormaler Text', { headingColor: '#1f4fbf' });
  const colored = l.pages[0].glyphs.filter((g) => g.c === '#1f4fbf').map((g) => g.ch).join('');
  assert.equal(colored, 'Titel');
  assert.ok(l.pages[0].strokes.some((s) => s.c === '#1f4fbf'));
});

test('Überschriften zentrieren', () => {
  const geo = pageGeometry(PEN);
  const l = lay('# Mitte', { centerHeadings: true, jitter: 0 });
  const g = l.pages[0].glyphs;
  const mid = (Math.min(...g.map((x) => x.x0)) + Math.max(...g.map((x) => x.x1))) / 2;
  const pageMid = (geo.margin.left + geo.width - geo.margin.right) / 2;
  assert.ok(Math.abs(mid - pageMid) < 2, `Mitte bei ${mid.toFixed(1)} statt ${pageMid.toFixed(1)}`);
});

test('> Merksatz bekommt einen gezeichneten Kasten', () => {
  const plain = lay('Merke: Wasser ist nass');
  const boxed = lay('> Merke: Wasser ist nass');
  assert.equal(boxed.pages[0].strokes.length - plain.pages[0].strokes.length, 4, '4 Kasten-Striche');
});

test('Merkkasten über den Seitenrand wird auf der nächsten Seite fortgesetzt', () => {
  const long = '> ' + 'Merksatz mit vielen Wörtern '.repeat(200);
  const l = lay(long);
  assert.ok(l.pages.length >= 2);
  // Jede Seite hat ihre eigenen 4 Kasten-Striche (ohne Glyph-Zuordnung)
  for (const p of l.pages) {
    const glyphStrokes = new Set(p.glyphs.flatMap((g) => g.strokes));
    assert.equal(p.strokes.filter((s) => !glyphStrokes.has(s)).length, 4);
  }
});

test('--- als Seitenumbruch (Karteikarten)', () => {
  const text = 'Karte eins\n\n---\n\nKarte zwei\n\n---\n\nKarte drei';
  assert.equal(lay(text).pages.length, 1);
  assert.equal(lay(text, { hrPageBreak: true }).pages.length, 3);
  assert.equal(lay(text, { hrPageBreak: true }, { continuous: true }).pages.length, 1, 'beim Kopieren kein Umbruch');
});

test('Karteikarten-Format A6 quer', () => {
  const geo = pageGeometry({ ...PEN, format: 'A6' });
  assert.equal(geo.width, 148);
  assert.equal(geo.height, 105);
});

test('Kopfzeile, Datum und Seitenzahlen auf jeder Seite', () => {
  const text = Array(30).fill('Ein ganzer Absatz mit Text für mehrere Seiten.').join('\n\n');
  const l = lay(text, { headerText: 'Bio', headerDate: true, pageNumbers: true });
  assert.ok(l.pages.length >= 2);
  l.pages.forEach((p, i) => {
    const extra = p.glyphs.filter((g) => g.idx < 0).map((g) => g.ch).join('');
    assert.equal(extra, `Bio8.11.2026${i + 1}`);
  });
  assert.equal(germanDate(new Date(2026, 0, 5)), '5.1.2026');
});

test('Kopfzeile verändert die Nummern des Texts nicht (Radierungen bleiben richtig)', () => {
  const a = lay('Hallo Welt');
  const b = lay('Hallo Welt', { headerText: 'Mathe', headerDate: true });
  const idx = (l) => l.pages[0].glyphs.filter((g) => g.idx >= 0).map((g) => `${g.idx}${g.ch}`).join();
  assert.equal(idx(a), idx(b));
});

test('Füller: Strichrichtung bestimmt die Dicke', () => {
  // waagerecht vs. schräg nach rechts oben (in Federrichtung = dünn)
  const flat = nibBuckets([[0, 0, 1, 0]]);
  const along = nibBuckets([[0, 0, 1, -0.84]]);
  const [lvlFlat] = flat.keys();
  const [lvlAlong] = along.keys();
  assert.ok(lvlAlong < lvlFlat, 'in Federrichtung dünner');
  assert.ok(nibWidth(1, 0) < nibWidth(1, 5));
});

test('PDF mit Textmarker bekommt einen Transparenz-Zustand', async () => {
  const l = lay('Ein ==markiertes== Wort', { nib: 'fountain' });
  const bytes = new Uint8Array(await (await createPdf(l, { ...PEN, nib: 'fountain' })).arrayBuffer());
  const s = Buffer.from(bytes).toString('latin1');
  assert.match(s, /\/Type \/ExtGState \/CA 0\.5 \/ca 0\.5/);
  assert.match(s, /\/ExtGState << \/GSm \d+ 0 R >>/);
});
