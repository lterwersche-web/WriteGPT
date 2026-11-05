// Test-Hilfen: eine künstliche "Handschrift", damit wir das Layout
// ohne echte Zeichnungen testen können.

import { CHAR_SETS } from '../js/charsets.js';

/** Einfache Glyphe: ein Kasten + Diagonale, Breite je nach Zeichen */
export function fakeGlyph(ch, variant = 0) {
  const lower = ch === ch.toLowerCase() && /\p{L}/u.test(ch);
  const top = lower ? -0.5 : -1;
  const w = ch === 'm' || ch === 'w' ? 0.7 : ch === 'i' || ch === '.' ? 0.12 : 0.45;
  const x0 = 0.4 + variant * 0.01;
  return {
    strokes: [
      // Hauptstrich: startet links unten, endet rechts unten (gut verbindbar)
      [x0, 0, x0, top, x0 + w, top, x0 + w, 0],
      // kurzer Querstrich
      [x0, top / 2, x0 + w * 0.6, top / 2],
    ],
  };
}

export function fakeFont({ style = 'print', variants = 2, sets = {}, skip = '' } = {}) {
  const glyphs = {};
  for (const set of CHAR_SETS) {
    if (!set.required && !sets[set.id]) continue;
    for (const ch of set.chars) {
      if (skip.includes(ch)) continue;
      glyphs[ch] = Array.from({ length: variants }, (_, v) => fakeGlyph(ch, v));
    }
  }
  return { configured: true, style, variants, sets, glyphs };
}

export const PEN = {
  color: '#1c1c1e',
  width: 0.5,
  size: 4.5,
  lineHeight: 9,
  letterSpacing: 0,
  wordSpacing: 0.55,
  jitter: 0.6,
  paper: 'lined',
  format: 'A4',
  paperInPdf: true,
  seed: 42,
};
