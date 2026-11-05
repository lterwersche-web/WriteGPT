// ─────────────────────────────────────────────────────────────
// layout.js – Wo landet welcher Buchstabe auf der Seite?
// ─────────────────────────────────────────────────────────────
// Eingabe:  Blöcke (aus markdown.js) + deine Schrift + Stift-Einstellungen
// Ausgabe:  Seiten mit fertigen Strichen in Millimetern
//
//   { pages: [{ strokes: [{ pts: [x,y,x,y…], w }], missing: [...] }],
//     geo: { width, height, margin }, missingChars: ['ß', …] }
//
// Alles in Millimetern (mm) – so passt es 1:1 auf A4 & Co.

import { hash, rng, rangeFn } from './random.js';
import { glyphMetrics, getVariants, resolveChar } from './glyphs.js';
import { isLetter } from './charsets.js';

export const PAGE_FORMATS = {
  A4: { width: 210, height: 297, label: 'A4' },
  A5: { width: 148, height: 210, label: 'A5' },
  Letter: { width: 215.9, height: 279.4, label: 'Letter' },
};

// Die drei Schreibstile
//   spacing = Abstand zwischen Buchstaben (in Einheiten)
//   connect = Buchstaben verbinden?
//   gap     = Abstand Ende → Anfang beim Verbinden
//   overlap = wie weit sich Buchstaben überlappen dürfen
//   reach   = maximale Länge eines Verbindungsstrichs
export const STYLES = {
  print: { label: 'Druckschrift', spacing: 0.14, connect: false },
  // Halb verbunden: nur verbinden, wenn Ende & Anfang eh schon fast aneinander liegen.
  // overlap < 0 → Buchstaben behalten einen Mini-Abstand, nur der Verbindungsstrich überbrückt ihn.
  semi: { label: 'Halb verbunden', spacing: 0.07, connect: true, gap: 0.04, overlap: -0.05, reach: 0.3 },
  // Schreibschrift: (fast) immer verbinden, Buchstaben dürfen sich leicht überlappen
  cursive: { label: 'Schreibschrift', spacing: 0.07, connect: true, gap: 0.1, overlap: 0.12, reach: 1.2 },
};

const HEADING_SCALE = { h1: 1.45, h2: 1.25, h3: 1.1 };

/** Seitengröße + Ränder in mm */
export function pageGeometry(pen) {
  const f = PAGE_FORMATS[pen.format] ?? PAGE_FORMATS.A4;
  const k = f.width / 210; // A5 bekommt kleinere Ränder
  return {
    width: f.width,
    height: f.height,
    margin: { top: 22 * k, right: 14 * k, bottom: 14 * k, left: 18 * k },
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function normalize([x, y]) {
  const d = Math.hypot(x, y) || 1;
  return [x / d, y / d];
}

/** Verbindungsstrich (Bézier-Kurve) zwischen zwei Buchstaben */
function bridge(a, dirA, b, dirB) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 0.05) return null;
  const k = d * 0.4;
  // Richtung etwas nach rechts zwingen → keine komischen Schlaufen
  const fa = normalize([Math.max(dirA[0], 0.35), dirA[1]]);
  const fb = normalize([Math.max(dirB[0], 0.35), dirB[1]]);
  const c1 = [a[0] + fa[0] * k, a[1] + fa[1] * k];
  const c2 = [b[0] - fb[0] * k, b[1] - fb[1] * k];
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, u = 1 - t;
    pts.push(
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
    );
  }
  return pts;
}

/** Leicht wackelige, "handgezogene" Linie (Unterstreichung, Trennlinie) */
function handLine(x0, x1, y, R, size) {
  const pts = [];
  const n = Math.max(4, Math.round((x1 - x0) / (size * 1.5)));
  const tilt = R(-0.03, 0.03) * size;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(x0 + (x1 - x0) * t, y + tilt * t + R(-0.025, 0.025) * size);
  }
  return pts;
}

/** Text in Wörter zerlegen. Jedes Zeichen bekommt eine feste Nummer (idx) für den Zufall. */
function splitWords(runs, counter) {
  const words = [];
  let cur = [];
  for (const run of runs) {
    for (const ch of run.text) {
      const idx = counter.value++;
      if (/\s/.test(ch)) {
        if (cur.length) words.push(cur);
        cur = [];
      } else {
        cur.push({ ch, idx, bold: run.bold, sup: run.sup, sub: run.sub });
      }
    }
  }
  if (cur.length) words.push(cur);
  return words;
}

export function layoutDocument(blocks, font, pen, { continuous = false } = {}) {
  const geo = pageGeometry(pen);
  const { margin } = geo;
  const left = margin.left;
  const right = geo.width - margin.right;
  const lh = pen.lineHeight;
  const maxLines = continuous
    ? Infinity
    : Math.max(1, Math.floor((geo.height - margin.top - margin.bottom) / lh));
  const style = STYLES[font.style] ?? STYLES.print;
  const jit = clamp(pen.jitter, 0, 1);
  const seed = pen.seed >>> 0;

  const pages = [];
  const missingChars = new Set();
  const lastVariant = new Map();
  const resolveCache = new Map();
  const counter = { value: 0 };
  let page;
  let lineNo = 0;
  let lineCounter = 0;

  const newPage = () => {
    page = { strokes: [], missing: [], lines: 0 };
    pages.push(page);
    lineNo = 0;
  };
  newPage();

  const advance = () => {
    lineNo++;
    page.lines = lineNo;
    if (lineNo >= maxLines) newPage();
  };

  const resolve = (ch) => {
    if (!resolveCache.has(ch)) resolveCache.set(ch, resolveChar(font, ch));
    return resolveCache.get(ch);
  };

  // ── Ein Wort setzen (Buchstabe für Buchstabe) ────────────
  // Ergebnis relativ zum Wortanfang: x ab 0, Grundlinie bei y = 0
  function layoutWord(chars, sizeH) {
    const out = { strokes: [], missing: [], width: 0 };
    let cursor = 0;
    let prev = null; // Infos über den vorherigen Buchstaben

    for (const c of chars) {
      const pieces = resolve(c.ch);
      const width = pen.width * (c.bold ? 1.6 : 1);

      if (!pieces) {
        // Zeichen fehlt → Platzhalter (nur in der Vorschau sichtbar)
        missingChars.add(c.ch);
        const w = 0.55 * sizeH;
        const h = 0.8 * sizeH;
        out.missing.push({ x: cursor, y: -h, w, h, ch: c.ch });
        cursor += w + 0.12 * sizeH;
        out.width = Math.max(out.width, cursor);
        prev = null;
        continue;
      }

      pieces.forEach((piece, pi) => {
        const R = rangeFn(rng(hash(seed, c.idx, pi)));
        const variants = getVariants(font, piece.ch);

        // Variante wählen – möglichst nicht zweimal dieselbe hintereinander
        let vi = Math.floor(R(0, variants.length));
        if (variants.length > 1 && lastVariant.get(piece.ch) === vi) {
          vi = (vi + 1 + Math.floor(R(0, variants.length - 1))) % variants.length;
        }
        lastVariant.set(piece.ch, vi);
        const g = glyphMetrics(variants[vi]);

        const sup = c.sup || piece.sup;
        const sub = (c.sub || piece.sub) && !sup;
        const sizeL = sizeH * (piece.scale ?? 1) * (sup || sub ? 0.62 : 1);

        // Natürliche Schwankungen: Größe, Neigung, Höhe
        const s = sizeL * (1 + jit * R(-0.05, 0.05));
        const rot = (jit * R(-2.5, 2.5) * Math.PI) / 180;
        const dy =
          jit * R(-0.035, 0.035) * sizeH +
          (piece.dy ?? 0) * sizeH +
          (sup ? -0.42 * sizeH : sub ? 0.2 * sizeH : 0);

        const cos = Math.cos(rot), sin = Math.sin(rot);
        const pivot = (g.minX + g.maxX) / 2;
        const tf = (x, y) => {
          const px = x - pivot;
          return [(px * cos - y * sin) * s, (px * sin + y * cos) * s + dy];
        };
        const rotDir = (d) => [d[0] * cos - d[1] * sin, d[0] * sin + d[1] * cos];

        const strokes = g.strokes.map((st) => {
          const o = new Array(st.length);
          for (let i = 0; i < st.length; i += 2) {
            const [x, y] = tf(st[i], st[i + 1]);
            o[i] = x;
            o[i + 1] = y;
          }
          return o;
        });

        let tMin = Infinity, tMax = -Infinity;
        for (const st of strokes) {
          for (let i = 0; i < st.length; i += 2) {
            if (st[i] < tMin) tMin = st[i];
            if (st[i] > tMax) tMax = st[i];
          }
        }

        const letter = isLetter(piece.ch) && !sup && !sub;
        const entry = g.entry && tf(...g.entry);
        const exit = g.exit && tf(...g.exit);
        const canEnter = style.connect && letter && g.entryOk;
        const canExit = style.connect && letter && g.exitOk;

        // Normale Position: mit Abstand hinter den letzten Buchstaben
        let offset = cursor - tMin;
        let connected = false;

        // Schreibschrift: Anfang dieses Buchstabens ans Ende des letzten setzen
        if (prev?.canExit && canEnter) {
          const target = prev.exit[0] + (style.gap + pen.letterSpacing) * sizeL - entry[0];
          const minOffset = prev.maxX - style.overlap * sizeL - tMin;
          const candidate = Math.max(target, minOffset);
          const dist = Math.hypot(entry[0] + candidate - prev.exit[0], entry[1] - prev.exit[1]);
          if (dist <= style.reach * sizeL) {
            offset = candidate;
            connected = true;
          }
        }

        if (connected) {
          const b = bridge(prev.exit, prev.exitDir, [entry[0] + offset, entry[1]], rotDir(g.entryDir));
          if (b) out.strokes.push({ pts: b, w: prev.width });
        }

        for (const st of strokes) {
          for (let i = 0; i < st.length; i += 2) st[i] += offset;
          out.strokes.push({ pts: st, w: width });
        }

        const maxX = tMax + offset;
        cursor = maxX + (style.spacing + pen.letterSpacing + jit * R(-0.03, 0.03)) * sizeL;
        out.width = Math.max(out.width, maxX);
        prev = {
          canExit,
          exit: exit && [exit[0] + offset, exit[1]],
          exitDir: g.exitDir && rotDir(g.exitDir),
          maxX,
          width,
        };
      });
    }
    return out;
  }

  /** Aufzählungspunkt • (gezeichnet, falls vorhanden – sonst ein Tinten-Punkt) */
  function bulletWord(bullet, sizeH, idx) {
    if (bullet !== '•') {
      return layoutWord([...bullet].map((ch, i) => ({ ch, idx: idx + i })), sizeH);
    }
    if (getVariants(font, '•').length) return layoutWord([{ ch: '•', idx }], sizeH);
    const r = 0.03 * sizeH;
    const y = -0.27 * sizeH;
    return {
      strokes: [{ pts: [0, y, r, y + r * 0.3], w: Math.max(pen.width * 2.2, sizeH * 0.13) }],
      missing: [],
      width: r,
    };
  }

  // ── Eine fertige Zeile auf die Seite legen ───────────────
  function commitLine(items, extra = {}) {
    const baseY = margin.top + (lineNo + 1) * lh;
    const R = rangeFn(rng(hash(seed, 0x51, lineCounter++)));
    // Ganze Zeile minimal schief + leicht verschoben (wie echt)
    const slope = jit * R(-0.0045, 0.0045);
    const lift = jit * R(-0.04, 0.04) * pen.size;
    const map = (x, y) => [x, baseY + y + lift + slope * (x - left)];

    for (const { word, x } of items) {
      for (const st of word.strokes) {
        const pts = new Array(st.pts.length);
        for (let i = 0; i < pts.length; i += 2) {
          const [X, Y] = map(st.pts[i] + x, st.pts[i + 1]);
          pts[i] = X;
          pts[i + 1] = Y;
        }
        page.strokes.push({ pts, w: st.w });
      }
      for (const m of word.missing) {
        const [X, Y] = map(m.x + x, m.y);
        page.missing.push({ x: X, y: Y, w: m.w, h: m.h, ch: m.ch });
      }
    }

    // Unterstreichung (Überschriften) oder Trennlinie (---)
    if (extra.line) {
      const { x0, x1, y } = extra.line;
      const pts = handLine(x0, x1, y, R, pen.size);
      for (let i = 0; i < pts.length; i += 2) {
        [pts[i], pts[i + 1]] = map(pts[i], pts[i + 1]);
      }
      page.strokes.push({ pts, w: pen.width });
    }
    advance();
  }

  // ── Alle Blöcke durchgehen ───────────────────────────────
  let prevType = null;
  for (const block of blocks) {
    if (block.type === 'blank') {
      if (lineNo > 0) advance();
      prevType = 'blank';
      continue;
    }
    if (block.type === 'hr') {
      commitLine([], { line: { x0: left, x1: right, y: -0.3 * pen.size } });
      prevType = 'hr';
      continue;
    }

    const scale = HEADING_SCALE[block.type] ?? 1;
    const isHeading = scale !== 1;
    const sizeH = pen.size * scale;

    // Überschrift: Leerzeile davor (außer ganz oben)
    if (isHeading && lineNo > 0 && prevType && prevType !== 'blank') advance();

    const indentX = left + (block.indent ?? 0) * pen.size * 1.6;
    let textX = indentX;
    const items = [];
    if (block.bullet) {
      const bw = bulletWord(block.bullet, sizeH, counter.value);
      items.push({ word: bw, x: indentX });
      textX = indentX + Math.max(bw.width + pen.size * 0.5, pen.size);
    } else if (block.hang) {
      textX = indentX + pen.size;
    }

    const words = splitWords(block.runs, counter);
    let x = textX;
    let lineStart = textX;
    let hasText = false;

    const flush = () => {
      const extra = isHeading && hasText
        ? { line: { x0: lineStart - 0.05 * sizeH, x1: x + 0.08 * sizeH, y: 0.3 * sizeH } }
        : {};
      commitLine(items.splice(0), extra);
      x = lineStart = textX;
      hasText = false;
    };

    for (const chars of words) {
      const R = rangeFn(rng(hash(seed, 0x77, chars[0].idx)));
      const gap = (pen.wordSpacing + jit * R(-0.06, 0.06)) * sizeH;
      let word = layoutWord(chars, sizeH);

      // Passt nicht mehr in die Zeile → neue Zeile
      if (hasText && x + gap + word.width > right) flush();

      // Wort ist länger als eine ganze Zeile → in Stücke schneiden
      let rest = chars;
      while (!hasText && word.width > right - x && rest.length > 1) {
        let k = rest.length - 1;
        let part = layoutWord(rest.slice(0, k), sizeH);
        while (k > 1 && part.width > right - x) part = layoutWord(rest.slice(0, --k), sizeH);
        items.push({ word: part, x });
        x += part.width;
        hasText = true;
        flush();
        rest = rest.slice(k);
        word = layoutWord(rest, sizeH);
      }

      if (hasText) x += gap;
      items.push({ word, x });
      x += word.width;
      hasText = true;
    }
    flush();
    prevType = block.type;
  }

  // Leere letzte Seite entfernen
  const last = pages.at(-1);
  if (pages.length > 1 && !last.strokes.length && !last.missing.length) pages.pop();

  if (continuous) {
    geo.height = margin.top + (pages[0].lines + 1) * lh + margin.bottom;
  }

  return { pages, geo, missingChars: [...missingChars] };
}
