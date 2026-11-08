import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textKey, remapEdits, hasEdits } from '../js/edits.js';
import { layoutDocument } from '../js/layout.js';
import { parseChatText } from '../js/markdown.js';
import { fixVariant } from '../js/glyphs.js';
import { fakeFont, fakeGlyph, PEN } from './helpers.js';

const visible = (l) => l.pages.flatMap((p) => p.glyphs).filter((g) => !g.erased);

test('textKey passt genau zur Nummerierung im Layout', () => {
  const blocks = parseChatText('# Titel\n- Punkt\n2. Zwei\nText');
  const l = layoutDocument(blocks, fakeFont(), PEN);
  assert.equal(l.key, textKey(blocks));
});

test('Tippen VOR einer Radierung verschiebt sie mit', () => {
  const edits = { key: 'Hallo Welt', erased: { 6: 'gap' }, reroll: { 0: 1 } };
  const moved = remapEdits(edits, 'Na, Hallo Welt');
  assert.deepEqual(moved.erased, { 10: 'gap' });
  assert.deepEqual(moved.reroll, { 4: 1 }); // das "H" ist mitgewandert
});

test('Tippen HINTER einer Radierung lässt sie stehen', () => {
  const edits = { key: 'Hallo Welt', erased: { 1: 'close' }, reroll: {} };
  assert.deepEqual(remapEdits(edits, 'Hallo Welt!!').erased, { 1: 'close' });
});

test('Wird das radierte Zeichen selbst geändert, fällt die Radierung weg', () => {
  const edits = { key: 'Hallo Welt', erased: { 6: 'gap' }, reroll: {} };
  assert.deepEqual(remapEdits(edits, 'Hallo Delt').erased, {});
  assert.equal(hasEdits(remapEdits(edits, 'Hallo Delt')), false);
});

test('Radieren mit Lücke: Buchstabe weg, Rest bleibt an seinem Platz', () => {
  const blocks = parseChatText('abc def');
  const font = fakeFont();
  const base = layoutDocument(blocks, font, PEN);
  const gap = layoutDocument(blocks, font, PEN, { edits: { erased: { 1: 'gap' } } });
  assert.equal(visible(gap).length, visible(base).length - 1);
  assert.ok(gap.pages[0].ghosts.length > 0, 'radierter Buchstabe ist als Geist da');
  const x = (l, idx) => l.pages[0].glyphs.find((g) => g.idx === idx).x0;
  assert.equal(x(gap, 4), x(base, 4)); // "d" steht noch an derselben Stelle
});

test('Radieren mit Zusammenrücken: Text rückt nach links', () => {
  const blocks = parseChatText('abc def');
  const font = fakeFont();
  const base = layoutDocument(blocks, font, PEN);
  const close = layoutDocument(blocks, font, PEN, { edits: { erased: { 1: 'close' } } });
  const x = (l, idx) => l.pages[0].glyphs.find((g) => g.idx === idx).x0;
  assert.ok(x(close, 4) < x(base, 4) - 1);
  assert.ok(!close.pages[0].glyphs.some((g) => g.idx === 1));
});

test('Ganzes Wort zusammengerückt → auch kein doppelter Wortabstand', () => {
  const blocks = parseChatText('ab cd ef');
  const font = fakeFont();
  const close = layoutDocument(blocks, font, PEN, { edits: { erased: { 3: 'close', 4: 'close' } } });
  const short = layoutDocument(parseChatText('ab ef'), font, { ...PEN, jitter: 0 });
  const closeNoJit = layoutDocument(blocks, font, { ...PEN, jitter: 0 }, { edits: { erased: { 3: 'close', 4: 'close' } } });
  const last = (l) => l.pages[0].glyphs.at(-1).x1;
  assert.ok(Math.abs(last(closeNoJit) - last(short)) < 0.01);
  assert.equal(visible(close).length, 4);
});

test('"Neu würfeln" verändert nur das angetippte Wort', () => {
  const blocks = parseChatText('eins zwei drei');
  const font = fakeFont({ variants: 3 });
  const base = layoutDocument(blocks, font, PEN);
  const rolled = layoutDocument(blocks, font, PEN, { edits: { reroll: { 5: 1, 6: 1, 7: 1, 8: 1 } } });
  const word = (l, w0) => l.pages[0].glyphs.filter((g) => g.w0 === w0).map((g) => g.strokes.map((s) => s.pts));
  assert.notDeepEqual(word(rolled, 5), word(base, 5), '"zwei" sieht anders aus');
  assert.deepEqual(word(rolled, 0), word(base, 0), '"eins" bleibt gleich');
});

test('Auto-Fix: schwebender Buchstabe landet auf der Grundlinie', () => {
  const font = fakeFont();
  // "a" absichtlich 0,25 über der Grundlinie gezeichnet
  const floating = { strokes: fakeGlyph('a').strokes.map((s) => s.map((v, i) => (i % 2 ? v - 0.25 : v))) };
  const fixed = fixVariant(font, 'a', floating);
  const maxY = Math.max(...fixed.strokes.flatMap((s) => s.filter((_, i) => i % 2)));
  assert.ok(Math.abs(maxY) < 0.02, `Unterkante bei ${maxY}`);
});

test('Auto-Fix: viel zu großer Buchstabe wird angeglichen', () => {
  const font = fakeFont();
  const huge = { strokes: fakeGlyph('a').strokes.map((s) => s.map((v) => v * 2)) };
  const fixed = fixVariant(font, 'a', huge);
  const ys = fixed.strokes.flatMap((s) => s.filter((_, i) => i % 2));
  const h = Math.max(...ys) - Math.min(...ys);
  assert.ok(h < 0.5 * 1.15, `Höhe noch ${h.toFixed(2)}`);
});

test('Auto-Fix: verirrter Mini-Strich weit weg wird entfernt, i-Punkt bleibt', () => {
  const font = fakeFont();
  const i = { strokes: [[0.5, 0, 0.5, -0.5], [0.5, -0.75, 0.51, -0.75], [2.3, 0.6, 2.31, 0.6]] };
  const fixed = fixVariant(font, 'i', i);
  assert.equal(fixed.strokes.length, 2);
});
