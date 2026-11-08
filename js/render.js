// ─────────────────────────────────────────────────────────────
// render.js – Striche & Papier auf ein <canvas> malen
// ─────────────────────────────────────────────────────────────

// ── Striche in saubere Linien-Stücke ("Runs") verwandeln ─────
// Warum so aufwendig? Apples Grafik-Engine (Safari, Goodnotes) bekommt
// Probleme mit sehr vielen winzigen Kurvenstücken und sehr engen Kurven:
// Dann entstehen kleine LÖCHER im Strich (= die weißen Punkte).
// Lösung: Wir bauen den Strich aus Stücken, die garantiert "harmlos" sind.
// Jedes Stück bekommt runde Enden → an den Nahtstellen sieht man nichts.

const CORNER_COS = Math.cos((55 * Math.PI) / 180); // ab 55° Knick = Ecke
const TIGHT = 0.6; // Kurven enger als 0,6 × Strichdicke werden getrennt

/** Weiche Kurve (zentripetaler Catmull-Rom), die DURCH alle Punkte geht */
function catmullRom(run, w) {
  const m = run.length / 2;
  if (m < 3) return run;
  const step = Math.max(w * 0.3, 1e-4);
  const P = (i) => {
    // Am Anfang/Ende gespiegelte "Phantom-Punkte" → saubere Enden
    if (i < 0) return [2 * run[0] - run[2], 2 * run[1] - run[3]];
    if (i >= m) return [2 * run[(m - 1) * 2] - run[(m - 2) * 2], 2 * run[(m - 1) * 2 + 1] - run[(m - 2) * 2 + 1]];
    return [run[i * 2], run[i * 2 + 1]];
  };
  const out = [run[0], run[1]];
  for (let i = 0; i < m - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d1 = Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    const d2 = Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const d3 = Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
    // Kontrollpunkte der Bézier-Kurve zwischen p1 und p2
    const b1 = d1 < 1e-6 ? p1 : [0, 1].map((k) =>
      (d1 * d1 * p2[k] - d2 * d2 * p0[k] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[k]) / (3 * d1 * (d1 + d2)));
    const b2 = d3 < 1e-6 ? p2 : [0, 1].map((k) =>
      (d3 * d3 * p1[k] - d2 * d2 * p3[k] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[k]) / (3 * d3 * (d3 + d2)));
    const chord = d2 * d2;
    const k = Math.min(12, Math.max(1, Math.ceil(chord / step)));
    for (let j = 1; j <= k; j++) {
      const t = j / k, u = 1 - t;
      out.push(
        u * u * u * p1[0] + 3 * u * u * t * b1[0] + 3 * u * t * t * b2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * b1[1] + 3 * u * t * t * b2[1] + t * t * t * p2[1],
      );
    }
  }
  return out;
}

/** Trennt an Stellen, wo die Kurve enger ist als die Strichdicke */
function splitTight(run, w) {
  const m = run.length / 2;
  if (m < 3) return [run];
  const out = [];
  let start = 0;
  for (let i = 1; i < m - 1; i++) {
    const ax = run[i * 2 - 2], ay = run[i * 2 - 1];
    const bx = run[i * 2], by = run[i * 2 + 1];
    const cx = run[i * 2 + 2], cy = run[i * 2 + 3];
    const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    // Radius des Kreises durch die drei Punkte
    const r = cross < 1e-12 ? Infinity
      : (Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay)) / (2 * cross);
    if (r < w * TIGHT) {
      out.push(run.slice(start * 2, i * 2 + 2));
      start = i;
    }
  }
  out.push(run.slice(start * 2));
  return out;
}

/**
 * Hauptfunktion: Punkte eines Strichs → Liste von Linien-Stücken.
 * w = Strichdicke (gleiche Einheit wie die Punkte).
 * Ein Stück mit nur einem Punkt = ein Punkt (z.B. i-Punkt).
 */
export function strokeRuns(pts, w) {
  if (pts.length < 2) return [];
  // 1) Ausdünnen: Punkte, die zu nah am vorherigen liegen, fliegen raus
  const minSeg = Math.max(w * 0.12, 1e-5);
  const p = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const far = Math.hypot(pts[i] - p[p.length - 2], pts[i + 1] - p[p.length - 1]) >= minSeg;
    if (far) p.push(pts[i], pts[i + 1]);
    else if (i === pts.length - 2 && p.length > 2) {
      // Den letzten Punkt immer behalten (er ist das Strich-Ende)
      p[p.length - 2] = pts[i];
      p[p.length - 1] = pts[i + 1];
    }
  }
  const n = p.length / 2;
  if (n === 1) return [p];

  // 2) An scharfen Ecken trennen (v, z, k …) → Ecken bleiben spitz
  const runs = [];
  let start = 0;
  for (let i = 1; i < n - 1; i++) {
    const ax = p[i * 2] - p[i * 2 - 2], ay = p[i * 2 + 1] - p[i * 2 - 1];
    const bx = p[i * 2 + 2] - p[i * 2], by = p[i * 2 + 3] - p[i * 2 + 1];
    const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
    if (cos < CORNER_COS) {
      runs.push(p.slice(start * 2, i * 2 + 2));
      start = i;
    }
  }
  runs.push(p.slice(start * 2));

  // 3) Weich machen + 4) enge Kurven trennen
  return runs.flatMap((run) => splitTight(catmullRom(run, w), w));
}

/** Hängt die Linien-Stücke eines Strichs an einen Canvas-Pfad an */
function traceRuns(ctx, runs, scale, ox, oy) {
  for (const run of runs) {
    ctx.moveTo((run[0] - ox) * scale, (run[1] - oy) * scale);
    if (run.length === 2) {
      // Einzelner Punkt → winzige Linie, runde Enden machen daraus einen Punkt
      ctx.lineTo((run[0] - ox) * scale + 0.01, (run[1] - oy) * scale);
      continue;
    }
    for (let i = 2; i < run.length; i += 2) {
      ctx.lineTo((run[i] - ox) * scale, (run[i + 1] - oy) * scale);
    }
  }
}

// ── Füller-Effekt ────────────────────────────────────────────
// Ein Füller hat eine schräge, breite Feder. Zieht man in Richtung der
// Feder, wird der Strich dünn – quer dazu wird er dick.
// Wir teilen jeden Strich in kleine Stücke und geben jedem Stück je nach
// Richtung eine von 6 Dicken ("Stufen"). Gleiche Stufen werden zusammen gezeichnet.
const NIB_ANGLE = (-40 * Math.PI) / 180; // Federwinkel (nach rechts oben)
const NIB_LEVELS = 5;

export function nibWidth(w, level) {
  return w * (0.35 + (0.95 * level) / NIB_LEVELS);
}

/** Stücke nach Dicken-Stufe sortieren: Map(stufe → [x0,y0,x1,y1, …]) */
export function nibBuckets(runs) {
  const buckets = new Map();
  const add = (lvl, a, b, c, d) => {
    if (!buckets.has(lvl)) buckets.set(lvl, []);
    buckets.get(lvl).push(a, b, c, d);
  };
  for (const run of runs) {
    if (run.length === 2) {
      add(3, run[0], run[1], run[0], run[1]); // einzelner Punkt
      continue;
    }
    for (let i = 2; i < run.length; i += 2) {
      const f = Math.abs(Math.sin(Math.atan2(run[i + 1] - run[i - 1], run[i] - run[i - 2]) - NIB_ANGLE));
      add(Math.round(f * NIB_LEVELS), run[i - 2], run[i - 1], run[i], run[i + 1]);
    }
  }
  return buckets;
}

/**
 * Zeichnet eine Liste von Strichen (Koordinaten × scale).
 * color = Standardfarbe (ein Strich kann eine eigene Farbe st.c haben)
 * nib   = 'fineliner' (gleich dick) oder 'fountain' (Füller)
 */
export function drawStrokes(ctx, strokes, color, scale, ox = 0, oy = 0, nib = 'fineliner') {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of strokes) {
    ctx.strokeStyle = st.c || color;
    const runs = strokeRuns(st.pts, st.w);
    if (nib === 'fountain') {
      for (const [lvl, seg] of nibBuckets(runs)) {
        ctx.lineWidth = nibWidth(st.w, lvl) * scale;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i += 4) {
          ctx.moveTo((seg[i] - ox) * scale, (seg[i + 1] - oy) * scale);
          ctx.lineTo((seg[i + 2] - ox) * scale + (seg[i] === seg[i + 2] && seg[i + 1] === seg[i + 3] ? 0.01 : 0), (seg[i + 3] - oy) * scale);
        }
        ctx.stroke();
      }
      continue;
    }
    ctx.lineWidth = st.w * scale;
    ctx.beginPath();
    traceRuns(ctx, runs, scale, ox, oy);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Textmarker ───────────────────────────────────────────────
export const MARKER_ALPHA = 0.5; // durchscheinend wie ein echter Textmarker

/** Textmarker-Streifen (werden VOR der Schrift gemalt, damit die Tinte darüber liegt) */
export function drawMarkers(ctx, markers, scale, ox = 0, oy = 0) {
  if (!markers?.length) return;
  ctx.save();
  ctx.globalAlpha = MARKER_ALPHA;
  ctx.lineCap = 'butt'; // Textmarker haben eine flache Spitze
  ctx.lineJoin = 'round';
  for (const m of markers) {
    ctx.strokeStyle = m.c;
    ctx.lineWidth = m.w * scale;
    ctx.beginPath();
    ctx.moveTo((m.pts[0] - ox) * scale, (m.pts[1] - oy) * scale);
    for (let i = 2; i < m.pts.length; i += 2) ctx.lineTo((m.pts[i] - ox) * scale, (m.pts[i + 1] - oy) * scale);
    ctx.stroke();
  }
  ctx.restore();
}

export const PAPER_COLORS = {
  line: '#bccbe0',
  grid: '#d6dfeb',
  dot: '#a9b6c9',
  margin: '#e8a6a6', // rote Randlinie wie im Schulheft
};

/**
 * Liefert die Papier-Linien einer Seite (in mm) – für Canvas UND PDF.
 * Kariert & Gepunktet: Kästchen = halber Zeilenabstand, so liegen die
 * Schreib-Linien immer genau auf einer Kästchen-Linie.
 */
export function paperPattern(geo, pen) {
  const { width, height, margin } = geo;
  const lh = pen.lineHeight;
  const lines = [];
  const dots = [];
  if (pen.paper === 'lined') {
    for (let y = margin.top + lh; y <= height - margin.bottom + 0.01; y += lh) {
      lines.push([0, y, width, y]);
    }
  } else if (pen.paper === 'grid' || pen.paper === 'dots') {
    const g = lh / 2;
    const y0 = margin.top % g;
    const x0 = margin.left % g;
    if (pen.paper === 'grid') {
      for (let y = y0; y <= height; y += g) lines.push([0, y, width, y]);
      for (let x = x0; x <= width; x += g) lines.push([x, 0, x, height]);
    } else {
      for (let y = y0 + g; y < height; y += g) {
        for (let x = x0 + g; x < width; x += g) dots.push([x, y]);
      }
    }
  }
  // Randlinie: senkrecht, kurz vor dem Text-Anfang
  const marginLine = pen.paperMargin ? [margin.left - 3 * (width / 210), 0, margin.left - 3 * (width / 210), height] : null;
  return { lines, dots, marginLine, color: pen.paper === 'grid' ? PAPER_COLORS.grid : PAPER_COLORS.line };
}

export function drawPaper(ctx, geo, pen, scale) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, geo.width * scale, geo.height * scale);
  const { lines, dots, marginLine, color } = paperPattern(geo, pen);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 0.2 * scale);
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of lines) {
    ctx.moveTo(x1 * scale, y1 * scale);
    ctx.lineTo(x2 * scale, y2 * scale);
  }
  ctx.stroke();
  if (marginLine) {
    ctx.strokeStyle = PAPER_COLORS.margin;
    ctx.lineWidth = Math.max(1, 0.3 * scale);
    ctx.beginPath();
    ctx.moveTo(marginLine[0] * scale, marginLine[1] * scale);
    ctx.lineTo(marginLine[2] * scale, marginLine[3] * scale);
    ctx.stroke();
  }
  ctx.fillStyle = PAPER_COLORS.dot;
  const r = Math.max(0.8, 0.28 * scale);
  for (const [x, y] of dots) {
    ctx.beginPath();
    ctx.arc(x * scale, y * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Rote, gestrichelte Kästchen für fehlende Zeichen (nur Vorschau) */
export function drawMissing(ctx, missing, scale, ox = 0, oy = 0) {
  ctx.save();
  for (const m of missing) {
    const x = (m.x - ox) * scale, y = (m.y - oy) * scale;
    const w = m.w * scale, h = m.h * scale;
    ctx.fillStyle = 'rgba(255, 59, 48, 0.08)';
    ctx.strokeStyle = 'rgba(255, 59, 48, 0.7)';
    ctx.lineWidth = Math.max(1, 0.2 * scale);
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.2);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 59, 48, 0.9)';
    ctx.font = `600 ${h * 0.7}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.ch, x + w / 2, y + h / 2);
  }
  ctx.restore();
}

/** Rechteck um alle Striche einer Seite (in mm) – zum Zuschneiden */
export function contentBounds(page) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const st of [...page.strokes, ...(page.markers ?? [])]) {
    const r = (st.w / 2) * 1.3; // etwas Luft (Füller kann dicker werden)
    for (let i = 0; i < st.pts.length; i += 2) {
      minX = Math.min(minX, st.pts[i] - r);
      maxX = Math.max(maxX, st.pts[i] + r);
      minY = Math.min(minY, st.pts[i + 1] - r);
      maxY = Math.max(maxY, st.pts[i + 1] + r);
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Malt eine komplette Seite.
 * options: scale (Pixel pro mm), paper (Papier ja/nein), missing (Platzhalter zeigen),
 *          ghosts (wegradierte Buchstaben blass zeigen)
 */
export function renderPage(canvas, page, geo, pen, { scale, paper = true, missing = true, ghosts = false }) {
  canvas.width = Math.round(geo.width * scale);
  canvas.height = Math.round(geo.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (paper) drawPaper(ctx, geo, pen, scale);
  drawMarkers(ctx, page.markers, scale);
  // Wegradierte Buchstaben ganz blass anzeigen (nur im Radier-Modus)
  if (ghosts && page.ghosts?.length) {
    drawStrokes(ctx, page.ghosts.map((g) => ({ ...g, c: null })), 'rgba(120, 130, 150, 0.22)', scale);
  }
  drawStrokes(ctx, page.strokes, pen.color, scale, 0, 0, pen.nib);
  if (missing) drawMissing(ctx, page.missing, scale);
}
