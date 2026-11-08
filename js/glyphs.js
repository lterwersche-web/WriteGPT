// ─────────────────────────────────────────────────────────────
// glyphs.js – Alles rund um einen gezeichneten Buchstaben ("Glyphe")
// ─────────────────────────────────────────────────────────────
// Ein gezeichneter Buchstabe wird als Liste von Strichen gespeichert.
// Ein Strich = alle Punkte vom Aufsetzen bis Abheben des Stifts.
// Gespeichert als flaches Array: [x0, y0, x1, y1, x2, y2, …]
//
// Koordinaten sind in "Einheiten" (nicht Pixel!), damit die Größe
// egal ist. 1 Einheit = Abstand Grundlinie → Oberlinie.
//   y = -1   Oberlinie (Großbuchstaben, Oberlängen)
//   y = -0.5 Mittellinie (Höhe der Kleinbuchstaben)
//   y =  0   Grundlinie (darauf "sitzt" die Schrift)
//   y =  0.5 Unterlinie (Unterlängen wie g, j, p)
// y wird nach UNTEN größer – so wie bei Bildschirm-Pixeln.

import { FALLBACKS } from './charsets.js';

/** Das Zeichenfeld (in Einheiten) */
export const BOX = { width: 2.6, top: -1.45, bottom: 0.8 };
BOX.height = BOX.bottom - BOX.top;

export const GUIDES = { ascender: -1, xHeight: -0.5, baseline: 0, descender: 0.5 };

/** Länge eines Strichs */
export function strokeLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) {
    len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  }
  return len;
}

/**
 * Vereinfacht einen Strich (Ramer-Douglas-Peucker-Algorithmus):
 * Punkte, die fast auf einer geraden Linie liegen, fliegen raus.
 * → Weniger Speicher, gleiche Form.
 */
export function simplify(pts, epsilon = 0.003) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1];
    const bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let maxDist = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2], py = pts[i * 2 + 1];
      // Abstand zur Linie a→b. Sonderfall: Anfang = Ende (z.B. beim "o")
      // → dann einfach Abstand zum Anfangspunkt nehmen.
      const dist = len < 1e-6
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (dist > maxDist) { maxDist = dist; idx = i; }
    }
    if (maxDist > epsilon && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(round(pts[i * 2]), round(pts[i * 2 + 1]));
  }
  return out;
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * In welche Richtung bewegt sich der Stift am Anfang bzw. Ende
 * eines Strichs? (Einheitsvektor [dx, dy])
 */
function direction(pts, atEnd) {
  const n = pts.length / 2;
  const ax = atEnd ? pts[(n - 1) * 2] : pts[0];
  const ay = atEnd ? pts[(n - 1) * 2 + 1] : pts[1];
  // Ein Stück weiter schauen, damit kleines Zittern nicht stört
  for (let k = 1; k < n; k++) {
    const i = atEnd ? n - 1 - k : k;
    const dx = pts[i * 2] - ax, dy = pts[i * 2 + 1] - ay;
    const d = Math.hypot(dx, dy);
    if (d > 0.06 || k === n - 1) {
      if (d === 0) break;
      return atEnd ? [-dx / d, -dy / d] : [dx / d, dy / d];
    }
  }
  return [1, 0];
}

const metricsCache = new WeakMap();

/**
 * Berechnet Infos über eine gezeichnete Variante:
 *  - minX/maxX: wie breit ist der Buchstabe wirklich (Tinte)
 *  - entry/exit: Wo fängt der Strich an / hört er auf?
 *    → wichtig für Schreibschrift (Buchstaben verbinden)
 */
export function glyphMetrics(variant) {
  let m = metricsCache.get(variant);
  if (m) return m;

  const strokes = variant.strokes;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (let i = 0; i < s.length; i += 2) {
      if (s[i] < minX) minX = s[i];
      if (s[i] > maxX) maxX = s[i];
      if (s[i + 1] < minY) minY = s[i + 1];
      if (s[i + 1] > maxY) maxY = s[i + 1];
    }
  }
  if (!isFinite(minX)) { minX = 0; maxX = 0.3; minY = -0.5; maxY = 0; }

  // Winzige Striche (i-Punkte, ä-Pünktchen) zählen nicht als Verbindung.
  // "Winzig" = kurz ODER passt in ein kleines Kästchen (auch gemalte Kringel-Punkte)
  const lengths = strokes.map(strokeLength);
  const longest = Math.max(0, ...lengths);
  const sizes = strokes.map((s) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < s.length; i += 2) {
      x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]);
      y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]);
    }
    return Math.hypot(x1 - x0, y1 - y0);
  });
  const isTiny = (i) => lengths[i] < 0.12 || sizes[i] < 0.16;
  // "Haupt-Striche" = mindestens halb so lang wie der längste
  // (So wird der Querstrich beim t nicht als Ende genommen.)
  const isMain = (i) => !isTiny(i) && lengths[i] >= longest * 0.5;

  let entry = null, entryDir = null, exit = null, exitDir = null;
  const first = strokes.findIndex((_, i) => !isTiny(i));
  if (first >= 0) {
    const s = strokes[first];
    entry = [s[0], s[1]];
    entryDir = direction(s, false);
  }
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (!isMain(i)) continue;
    const s = strokes[i];
    exit = [s[s.length - 2], s[s.length - 1]];
    exitDir = direction(s, true);
    break;
  }

  // Verbinden nur, wenn der Strich wirklich LINKS anfängt und RECHTS aufhört.
  // (Ein "o", das unten in der Mitte startet, wird also nicht angeklebt.)
  const w = maxX - minX;
  const entryOk = !!entry && entry[0] - minX <= w * 0.25 + 0.04;
  const exitOk = !!exit && maxX - exit[0] <= w * 0.25 + 0.04;

  m = { strokes, minX, maxX, minY, maxY, entry, entryDir, exit, exitDir, entryOk, exitOk };
  metricsCache.set(variant, m);
  return m;
}

/** Alle gezeichneten Varianten eines Zeichens (leere Plätze fliegen raus) */
export function getVariants(font, ch) {
  const list = font.glyphs?.[ch];
  if (!list) return [];
  return list.slice(0, font.variants).filter((v) => v && v.strokes?.length);
}

export function hasGlyph(font, ch) {
  return getVariants(font, ch).length > 0;
}

// ─────────────────────────────────────────────────────────────
// Auto-Fix: gezeichnete Buchstaben automatisch angleichen
// ─────────────────────────────────────────────────────────────
// Beim Zeichnen landet nicht jeder Buchstabe perfekt auf der Grundlinie
// und nicht jeder ist gleich groß. Im fertigen Text "hüpft" die Schrift dann.
// Der Auto-Fix schaut sich ALLE deine Buchstaben an, merkt sich deinen
// typischen Stil (Durchschnitt = Median) und rückt Ausreißer zurecht.
// Deine gespeicherten Zeichnungen bleiben dabei unverändert.

// Gruppen von Buchstaben, die gleich hoch sein sollten
const CATEGORY = {};
for (const ch of 'acemnorsuvwxäöüi') CATEGORY[ch] = 'x'; // bis zur Mittellinie
for (const ch of 'bdhkl') CATEGORY[ch] = 'asc'; // mit Oberlänge
for (const ch of 'ABCDEFGHIKLMNOPRSTUVWXYZÄÖÜ0123456789') CATEGORY[ch] = 'cap';
for (const ch of 'gpqyj') CATEGORY[ch] = 'desc'; // mit Unterlänge
CATEGORY.t = 'base'; // nur auf die Grundlinie rücken (Höhe ist beim t sehr unterschiedlich)

/** Ist der Strich nur ein Pünktchen / Mini-Strich? */
function isMark(s) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < s.length; i += 2) {
    x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]);
    y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]);
  }
  return strokeLength(s) < 0.12 || Math.hypot(x1 - x0, y1 - y0) < 0.16;
}

/** Rechteck um den "Körper" des Buchstabens (ohne Punkte) */
function bodyBox(strokes) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of strokes) {
    if (isMark(s)) continue;
    for (let i = 0; i < s.length; i += 2) {
      x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]);
      y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]);
    }
  }
  if (!isFinite(x0)) return null;
  return { left: x0, right: x1, top: y0, bottom: y1, cx: (x0 + x1) / 2, height: y1 - y0 };
}

/**
 * Entfernt "verirrte" Mini-Striche weit weg vom Buchstaben
 * (z.B. Handballen oder ein versehentlicher Tipp mit dem Pencil).
 * i-Punkte, ä-Punkte usw. liegen nah genug dran und bleiben.
 */
function removeStrays(strokes) {
  const body = bodyBox(strokes);
  if (!body) return strokes;
  const kept = strokes.filter((s) => {
    if (!isMark(s)) return true;
    let sx = 0, sy = 0;
    for (let i = 0; i < s.length; i += 2) { sx += s[i]; sy += s[i + 1]; }
    const n = s.length / 2;
    const dx = Math.max(body.left - sx / n, 0, sx / n - body.right);
    const dy = Math.max(body.top - sy / n, 0, sy / n - body.bottom);
    return Math.hypot(dx, dy) <= 0.6;
  });
  return kept.length === strokes.length ? strokes : kept;
}

const median = (arr) => {
  if (arr.length < 3) return null; // zu wenige Daten → lieber nichts ändern
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const clampNum = (v, a, b) => Math.min(b, Math.max(a, v));

const statsCache = new WeakMap();
const fixCache = new WeakMap();

/** Dein typischer Stil: Wie groß sind deine Buchstaben im Schnitt, wo ist deine Grundlinie? */
function fontStats(font) {
  const cached = statsCache.get(font.glyphs);
  if (cached && cached.variants === font.variants) return cached;
  const heights = { x: [], asc: [], cap: [], desc: [] };
  const bottoms = [];
  const xTops = [];
  for (const [ch, list] of Object.entries(font.glyphs)) {
    const cat = CATEGORY[ch];
    if (!cat) continue;
    for (const v of list.slice(0, font.variants)) {
      const b = v?.strokes?.length && bodyBox(v.strokes);
      if (!b) continue;
      if (heights[cat]) heights[cat].push(b.height);
      if (cat === 'desc') continue;
      bottoms.push(b.bottom);
      if (cat === 'x') xTops.push(b.top);
    }
  }
  const stats = {
    variants: font.variants,
    height: Object.fromEntries(Object.entries(heights).map(([k, v]) => [k, median(v)])),
    base: clampNum(median(bottoms) ?? 0, -0.15, 0.15),
    xTop: median(xTops) ?? -0.5,
  };
  statsCache.set(font.glyphs, stats);
  return stats;
}

/**
 * Gibt eine angeglichene Kopie einer Variante zurück:
 *  1. verirrte Mini-Striche weg
 *  2. Größe: Ausreißer (mehr als ±12 % vom Durchschnitt) werden angepasst
 *  3. Höhe: Buchstabe wird auf deine Grundlinie gerückt
 *     (bei g, p, q, y, j: oben an die Mittellinie)
 */
export function fixVariant(font, ch, variant) {
  const stats = fontStats(font);
  let cache = fixCache.get(stats);
  if (!cache) fixCache.set(stats, (cache = new WeakMap()));
  const hit = cache.get(variant);
  if (hit) return hit;

  const strokes = removeStrays(variant.strokes);
  const cat = CATEGORY[ch];
  const b = cat && bodyBox(strokes);
  let result = strokes === variant.strokes ? variant : { strokes };

  if (b) {
    const ref = stats.height[cat];
    let s = 1;
    if (ref && b.height > 0.05) {
      if (b.height > ref * 1.12) s = (ref * 1.12) / b.height;
      else if (b.height < ref * 0.88) s = (ref * 0.88) / b.height;
      s = clampNum(s, 0.45, 2);
    }
    // Skalieren um einen festen Punkt (unten bzw. bei Unterlängen: oben)
    const py = cat === 'desc' ? b.top : b.bottom;
    const dy = cat === 'desc'
      ? clampNum(stats.xTop - b.top, -0.35, 0.35)
      : clampNum(stats.base - b.bottom, -0.4, 0.4);
    if (s !== 1 || Math.abs(dy) > 0.005) {
      result = {
        strokes: strokes.map((st) => {
          const o = new Array(st.length);
          for (let i = 0; i < st.length; i += 2) {
            o[i] = b.cx + (st[i] - b.cx) * s;
            o[i + 1] = py + (st[i + 1] - py) * s + dy;
          }
          return o;
        }),
      };
    }
  }
  cache.set(variant, result);
  return result;
}

/**
 * Findet heraus, wie ein Zeichen geschrieben werden kann.
 * Gibt eine Liste von "Teilen" zurück, z.B.:
 *   'a'  → [{ ch: 'a' }]
 *   '…'  → [{ ch: '.' }, { ch: '.' }, { ch: '.' }]   (Ersatz)
 *   '²'  → [{ ch: '2', sup: true }]                  (Ersatz)
 *   '✓'  → null                                      (fehlt!)
 */
export function resolveChar(font, ch, depth = 0) {
  if (hasGlyph(font, ch)) return [{ ch }];
  if (depth > 3) return null;

  const options = [...(FALLBACKS[ch] ?? [])];
  // Akzente entfernen: é → e, ç → c …
  const plain = ch.normalize('NFD').replace(/\p{M}/gu, '');
  if (plain !== ch && plain.length) options.push(plain);
  // Groß/klein tauschen als letzte Rettung
  const swapped = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  if (swapped !== ch && swapped.length === 1) options.push(swapped);

  for (const opt of options) {
    const o = typeof opt === 'string' ? { s: opt } : opt;
    const parts = [];
    let ok = true;
    for (const c of o.s) {
      const sub = resolveChar(font, c, depth + 1);
      if (!sub) { ok = false; break; }
      for (const p of sub) {
        parts.push({
          ...p,
          sup: p.sup || o.sup || false,
          sub: p.sub || o.sub || false,
          dy: (p.dy ?? 0) + (o.dy ?? 0),
          scale: (p.scale ?? 1) * (o.scale ?? 1),
        });
      }
    }
    if (ok) return parts;
  }
  return null;
}
