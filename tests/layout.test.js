import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutDocument, pageGeometry } from '../js/layout.js';
import { parseChatText } from '../js/markdown.js';
import { resolveChar, glyphMetrics, simplify } from '../js/glyphs.js';
import { buildSteps } from '../js/charsets.js';
import { fakeFont, PEN } from './helpers.js';

function xRange(page) {
  let min = Infinity, max = -Infinity;
  for (const s of page.strokes) {
    for (let i = 0; i < s.pts.length; i += 2) {
      min = Math.min(min, s.pts[i]);
      max = Math.max(max, s.pts[i]);
    }
  }
  return [min, max];
}

test('Kurzer Text passt auf eine Seite', () => {
  const l = layoutDocument(parseChatText('Hallo Welt'), fakeFont(), PEN);
  assert.equal(l.pages.length, 1);
  assert.ok(l.pages[0].strokes.length > 0);
  assert.deepEqual(l.missingChars, []);
});

test('Text bleibt innerhalb der Seitenränder (Zeilenumbruch klappt)', () => {
  const long = 'Lorem ipsum dolor sit amet consectetur '.repeat(30);
  const l = layoutDocument(parseChatText(long), fakeFont(), PEN);
  const geo = pageGeometry(PEN);
  const [min, max] = xRange(l.pages[0]);
  assert.ok(min >= geo.margin.left - 1, `links: ${min}`);
  assert.ok(max <= geo.width - geo.margin.right + 1, `rechts: ${max}`);
  assert.ok(l.pages[0].lines > 3);
});

test('Sehr langer Text erzeugt mehrere Seiten', () => {
  const para = 'Das ist ein Satz mit vielen Wörtern. '.repeat(15);
  const l = layoutDocument(parseChatText(Array(20).fill(para).join('\n\n')), fakeFont(), PEN);
  assert.ok(l.pages.length >= 2);
});

test('Endlos-Modus (für Kopieren) hat immer nur eine Seite', () => {
  const para = 'Das ist ein Satz mit vielen Wörtern. '.repeat(15);
  const l = layoutDocument(parseChatText(Array(20).fill(para).join('\n\n')), fakeFont(), PEN, { continuous: true });
  assert.equal(l.pages.length, 1);
  assert.ok(l.geo.height > 297);
});

test('Fehlende Zeichen werden gemeldet', () => {
  const l = layoutDocument(parseChatText('Hallo ✓ 漢'), fakeFont(), PEN);
  assert.deepEqual(l.missingChars.sort(), ['✓', '漢'].sort());
  assert.equal(l.pages[0].missing.length, 2);
});

test('Gleicher Seed → gleiches Ergebnis, anderer Seed → anderes', () => {
  const blocks = parseChatText('Natürlich wackelig');
  const a = layoutDocument(blocks, fakeFont(), PEN);
  const b = layoutDocument(blocks, fakeFont(), PEN);
  const c = layoutDocument(blocks, fakeFont(), { ...PEN, seed: 7 });
  assert.deepEqual(a.pages[0].strokes, b.pages[0].strokes);
  assert.notDeepEqual(a.pages[0].strokes, c.pages[0].strokes);
});

test('Schreibschrift fügt Verbindungsstriche hinzu', () => {
  const blocks = parseChatText('hallo');
  const print = layoutDocument(blocks, fakeFont({ style: 'print' }), PEN);
  const cursive = layoutDocument(blocks, fakeFont({ style: 'cursive' }), PEN);
  assert.ok(cursive.pages[0].strokes.length > print.pages[0].strokes.length);
});

test('Tippen am Ende verändert den Anfang nicht', () => {
  const a = layoutDocument(parseChatText('Hallo'), fakeFont(), PEN);
  const b = layoutDocument(parseChatText('Hallo Welt'), fakeFont(), PEN);
  const n = a.pages[0].strokes.length;
  assert.deepEqual(b.pages[0].strokes.slice(0, n), a.pages[0].strokes);
});

test('Ersatzzeichen: … → drei Punkte, ² → hochgestellte 2, é → e', () => {
  const font = fakeFont();
  assert.deepEqual(resolveChar(font, '…').map((p) => p.ch), ['.', '.', '.']);
  const sq = resolveChar(font, '²');
  assert.equal(sq[0].ch, '2');
  assert.equal(sq[0].sup, true);
  assert.equal(resolveChar(font, 'é')[0].ch, 'e');
  assert.equal(resolveChar(font, '✓'), null);
});

test('Ersatz: CO₂ → tiefgestellte 2, m² → hochgestellte 2', () => {
  const font = fakeFont();
  assert.equal(resolveChar(font, '₂')[0].sub, true);
  assert.equal(resolveChar(font, '₂')[0].ch, '2');
  assert.equal(resolveChar(font, '⁴')[0].sup, true);
});

test('Ersatz: fehlendes ß wird zu ss', () => {
  const font = fakeFont({ skip: 'ß' });
  assert.deepEqual(resolveChar(font, 'ß').map((p) => p.ch), ['s', 's']);
});

test('Schritte: jedes Zeichen in jeder Variante, optionale Sets nur wenn an', () => {
  const base = buildSteps({ variants: 3, sets: {} });
  assert.deepEqual(base.slice(0, 4), [
    { ch: 'a', variant: 0 },
    { ch: 'a', variant: 1 },
    { ch: 'a', variant: 2 },
    { ch: 'b', variant: 0 },
  ]);
  const withMath = buildSteps({ variants: 1, sets: { math: true } });
  assert.ok(withMath.some((s) => s.ch === '√'));
  assert.ok(!base.some((s) => s.ch === '√'));
});

test('Glyph-Infos: Anfang links, Ende rechts, i-Punkt zählt nicht', () => {
  const m = glyphMetrics({ strokes: [[0.2, 0, 0.2, -0.5, 0.4, 0], [0.2, -0.75, 0.21, -0.75]] });
  assert.deepEqual(m.entry, [0.2, 0]);
  assert.deepEqual(m.exit, [0.4, 0]);
  assert.ok(m.entryOk && m.exitOk);
});

test('Vereinfachen: geschlossener Kreis (o) bleibt ein Kreis', () => {
  const circle = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    circle.push(Math.cos(a) * 0.25, Math.sin(a) * 0.25);
  }
  const out = simplify(circle, 0.003);
  assert.ok(out.length / 2 >= 8, `nur ${out.length / 2} Punkte übrig`);
});

test('Vereinfachen entfernt Punkte auf einer Geraden', () => {
  const pts = [0, 0, 0.1, 0, 0.2, 0, 0.3, 0, 0.3, 0.3];
  assert.deepEqual(simplify(pts, 0.001), [0, 0, 0.3, 0, 0.3, 0.3]);
});
