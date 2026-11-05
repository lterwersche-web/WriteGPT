import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatText, parseInline, latexToText } from '../js/markdown.js';

const text = (block) => block.runs.map((r) => r.text).join('');

test('Überschriften werden erkannt und # entfernt', () => {
  const blocks = parseChatText('# Titel\n## Unter\n#### Klein');
  assert.deepEqual(blocks.map((b) => b.type), ['h1', 'h2', 'h3']);
  assert.equal(text(blocks[0]), 'Titel');
});

test('**fett** wird zu einem fetten Textstück ohne Sternchen', () => {
  const runs = parseInline('Das ist **wichtig** und *kursiv*.');
  assert.equal(runs.map((r) => r.text).join(''), 'Das ist wichtig und kursiv.');
  assert.equal(runs.find((r) => r.text === 'wichtig').bold, true);
});

test('Einzelnes ** ohne Partner bleibt stehen', () => {
  assert.equal(parseInline('5 ** 2').map((r) => r.text).join(''), '5 ** 2');
});

test('Multiplikation mit * wird nicht als kursiv verschluckt', () => {
  assert.equal(parseInline('3 * 4 = 12').map((r) => r.text).join(''), '3 * 4 = 12');
});

test('Listen bekommen Aufzählungszeichen und Ebenen', () => {
  const blocks = parseChatText('- Eins\n  - Zwei\n- Drei\n1. Erstens\n2) Zweitens');
  assert.deepEqual(blocks.map((b) => [b.type, b.bullet, b.indent]), [
    ['li', '•', 1],
    ['li', '•', 2],
    ['li', '•', 1],
    ['li', '1.', 1],
    ['li', '2.', 1],
  ]);
});

test('Leerzeilen werden zusammengefasst und am Rand entfernt', () => {
  const blocks = parseChatText('\n\nA\n\n\n\nB\n\n');
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'blank', 'p']);
});

test('Links, Code und Emojis werden aufgeräumt', () => {
  const [b] = parseChatText('✅ Siehe [Doku](https://x.de) und `code` 🚀');
  assert.equal(text(b), 'Siehe Doku und code');
});

test('Code-Blöcke: Zäune weg, Inhalt bleibt', () => {
  const blocks = parseChatText('```js\nlet a = 1;\n```');
  assert.equal(blocks.length, 1);
  assert.equal(text(blocks[0]), 'let a = 1;');
});

test('Trennlinie und Tabellen', () => {
  const blocks = parseChatText('---\n| A | B |\n|---|---|\n| 1 | 2 |');
  assert.equal(blocks[0].type, 'hr');
  assert.equal(text(blocks[1]), 'A – B');
  assert.equal(text(blocks[2]), '1 – 2');
});

test('LaTeX: Brüche, Wurzeln, Symbole', () => {
  assert.equal(latexToText('\\frac{a+b}{2}'), '(a+b)/2');
  assert.equal(latexToText('\\sqrt{x} \\cdot \\pi'), '√x · π');
  assert.equal(latexToText('a \\leq b'), 'a ≤ b');
});

test('LaTeX: Hochzahlen werden zu hochgestelltem Text', () => {
  const [b] = parseChatText('Fläche: \\(A = r^2 \\pi\\)');
  const sup = b.runs.find((r) => r.sup);
  assert.equal(sup.text, '2');
  assert.equal(text(b), 'Fläche: A = r2 π');
});

test('Eingerückte Zeile unter Listenpunkt gehört dazu', () => {
  const blocks = parseChatText('- Punkt\n  weiter geht es');
  assert.equal(blocks[1].hang, true);
  assert.equal(blocks[1].indent, 1);
});
