import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPdf } from '../js/pdf.js';
import { layoutDocument } from '../js/layout.js';
import { parseChatText } from '../js/markdown.js';
import { fakeFont, PEN } from './helpers.js';

async function build(text, pen = PEN) {
  const layout = layoutDocument(parseChatText(text), fakeFont(), pen);
  const blob = await createPdf(layout, pen, { paper: true });
  return { layout, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

test('PDF beginnt mit %PDF und endet mit %%EOF', async () => {
  const { bytes } = await build('Hallo Welt');
  const s = latin1(bytes);
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
});

test('xref-Tabelle zeigt auf die richtigen Stellen', async () => {
  const { bytes } = await build('# Titel\n\nText **fett**\n- Liste');
  const s = latin1(bytes);
  const startxref = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.slice(startxref).startsWith('xref'));
  const entries = [...s.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((offset, i) => {
    assert.ok(s.slice(offset).startsWith(`${i + 1} 0 obj`), `Objekt ${i + 1} an falscher Stelle`);
  });
});

test('Seitenanzahl im PDF stimmt mit dem Layout überein', async () => {
  const para = 'Das ist ein Satz mit vielen Wörtern. '.repeat(15);
  const { layout, bytes } = await build(Array(20).fill(para).join('\n\n'));
  const s = latin1(bytes);
  assert.equal(Number(/\/Count (\d+)/.exec(s)[1]), layout.pages.length);
  assert.equal((s.match(/\/Type \/Page /g) || []).length, layout.pages.length);
});

test('A5-Format hat die richtige Seitengröße', async () => {
  const { bytes } = await build('Hallo', { ...PEN, format: 'A5' });
  assert.match(latin1(bytes), /\/MediaBox \[0 0 419\.53 595\.28\]/);
});
