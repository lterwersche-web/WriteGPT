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

test('Goodnotes-Papier: Linien genau wie im ausgemessenen Goodnotes-PDF', async () => {
  const { paperPattern, PAPER_COLORS } = await import('../js/render.js');
  const { PT, GOODNOTES_LINE } = await import('../js/layout.js');
  const pt = (mm) => Math.round((mm / PT) * 100) / 100;
  // Liniert breit: 22 Linien, Oberkante bei 49,5 pt, dann alle 25 pt
  let pen = { ...PEN, format: 'GN', paper: 'lined', lineHeight: GOODNOTES_LINE.lined };
  let geo = pageGeometry(pen);
  assert.deepEqual([pt(geo.width), pt(geo.height)], [455.04, 588.45]);
  const ys = paperPattern(geo, pen).lines.map((l) => pt(l[1]));
  assert.equal(ys.length, 22);
  assert.deepEqual(ys.slice(0, 3), [49.75, 74.75, 99.75]); // Linienmitte = Oberkante 49,5 + halbe Dicke
  assert.equal(ys.at(-1), 574.75);
  assert.equal(PAPER_COLORS.line, '#d0d2d3');
  // Text sitzt auf den Linien: 22 Zeilen pro Seite
  assert.equal(Math.floor((geo.height - geo.margin.top - geo.margin.bottom) / pen.lineHeight), 22);
  // Kariert: Kästchen 16 pt ab der Ecke oben links
  pen = { ...pen, paper: 'grid', lineHeight: GOODNOTES_LINE.grid };
  geo = pageGeometry(pen);
  const lines = paperPattern(geo, pen).lines;
  const hs = lines.filter((l) => l[1] === l[3]).map((l) => pt(l[1])).filter((v) => v > 0);
  const vs = lines.filter((l) => l[0] === l[2]).map((l) => pt(l[0])).filter((v) => v > 0);
  assert.deepEqual(hs.slice(0, 3), [15.75, 31.75, 47.75]);
  assert.deepEqual(vs.slice(0, 3), [15.75, 31.75, 47.75]);
  assert.equal(hs.at(-1), 575.75);
  assert.equal(vs.at(-1), 447.75);
});

test('Zeilenlänge: Text bricht früher um, 0 = volle Seitenbreite', () => {
  const text = 'Viele Wörter in einer langen Zeile, damit der Text umbrechen muss. '.repeat(4);
  const maxX = (l) => Math.max(...l.pages[0].glyphs.map((g) => g.x1));
  const geo = pageGeometry(PEN);
  const full = lay(text, { jitter: 0 });
  const short = lay(text, { jitter: 0, lineLength: 60 });
  assert.ok(maxX(short) <= geo.margin.left + 60 + 0.01, `zu breit: ${maxX(short)}`);
  assert.ok(maxX(full) > geo.margin.left + 100);
  assert.ok(short.pages[0].lines > full.pages[0].lines, 'kürzere Zeilen → mehr Zeilen');
  // länger als die Seite → wird auf die Seitenbreite begrenzt
  assert.equal(maxX(lay(text, { jitter: 0, lineLength: 9999 })), maxX(full));
});

test('Bereich: Text beginnt in der gewählten Zeile und bleibt im Bereich', () => {
  const text = 'Ein Satz mit einigen Wörtern für mehrere Zeilen. '.repeat(12);
  const geo = pageGeometry(PEN);
  const lh = PEN.lineHeight;
  const l = lay(text, { jitter: 0, startLine: 10, lineCount: 5, indent: 40, lineLength: 80 });
  // erste Grundlinie = Zeile 11, linker Rand um 40 mm verschoben
  const g0 = l.pages[0].glyphs.find((g) => g.idx === 0);
  assert.ok(Math.abs(g0.y1 - (geo.margin.top + 11 * lh)) < 1, `y=${g0.y1}`);
  assert.ok(g0.x0 >= geo.margin.left + 40 - 0.01);
  assert.ok(Math.max(...l.pages[0].glyphs.map((g) => g.x1)) <= geo.margin.left + 120 + 0.01);
  // nur 5 Zeilen pro Seite → Rest rutscht weiter und wird als "zu viel" gemeldet
  assert.equal(l.pages[0].lines, 15);
  assert.ok(l.pages.length > 1);
  assert.ok(l.overflowLines > 0);
  assert.deepEqual(l.area, { x0: geo.margin.left + 40, x1: geo.margin.left + 120, y0: geo.margin.top + 10 * lh, y1: geo.margin.top + 15 * lh });
});

test('Bereich: ganze Seite = kein Rahmen, keine Warnung; Kopieren ignoriert die Höhe', () => {
  const text = 'Ein Satz mit einigen Wörtern für mehrere Zeilen. '.repeat(12);
  const full = lay(text);
  assert.equal(full.area, null);
  assert.equal(full.overflowLines, 0);
  const copy = lay(text, { startLine: 10, lineCount: 2 }, { continuous: true });
  assert.equal(copy.pages.length, 1);
  assert.equal(copy.overflowLines, 0);
  // passt der Text in den Bereich, gibt es keine Warnung
  assert.equal(lay('Kurz', { startLine: 10, lineCount: 5 }).overflowLines, 0);
});

test('Schrift anpassen: größte Größe, die in den Bereich passt', async () => {
  const { fitSizeToArea } = await import('../js/layout.js');
  const blocks = parseChatText('Ein Satz mit einigen Wörtern für mehrere Zeilen. '.repeat(6));
  const font = fakeFont();
  const pen = { ...PEN, startLine: 20, lineCount: 4 };
  const over = (size) => layoutDocument(blocks, font, { ...pen, size }).overflowLines;
  assert.ok(over(pen.size) > 0, 'Ausgangslage: passt nicht');
  const size = fitSizeToArea(blocks, font, pen);
  assert.ok(size < pen.size && size >= 2.5);
  assert.equal(over(size), 0, 'passt mit der gefundenen Größe');
  assert.ok(over(size + 0.1) > 0, 'eine Stufe größer passt nicht mehr → wirklich die größte');
  // passt schon → Größe bleibt; viel zu viel Text → null
  assert.equal(fitSizeToArea(parseChatText('Kurz'), font, pen), pen.size);
  assert.equal(fitSizeToArea(parseChatText('Wort '.repeat(3000)), font, pen), null);
});
