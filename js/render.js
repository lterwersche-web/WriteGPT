// ─────────────────────────────────────────────────────────────
// render.js – Striche & Papier auf ein <canvas> malen
// ─────────────────────────────────────────────────────────────

/**
 * Macht aus vielen Punkten eine weiche Kurve.
 * Trick: Wir ziehen die Linie nicht durch die Punkte selbst, sondern
 * durch die Mitte zwischen zwei Punkten – die Punkte werden zu
 * "Magneten" (Kontrollpunkten). So verschwinden Ecken & Zittern.
 *
 * Gibt Befehle zurück: ['M', x, y] = hinsetzen, ['Q', cx, cy, x, y] = Kurve,
 * ['L', x, y] = gerade Linie. Wird für Canvas UND PDF benutzt.
 */
export function smoothPath(pts) {
  const n = pts.length / 2;
  const cmds = [['M', pts[0], pts[1]]];
  if (n === 1) {
    cmds.push(['L', pts[0] + 0.001, pts[1]]);
    return cmds;
  }
  if (n === 2) {
    cmds.push(['L', pts[2], pts[3]]);
    return cmds;
  }
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const mx = (x + pts[i * 2 + 2]) / 2, my = (y + pts[i * 2 + 3]) / 2;
    cmds.push(['Q', x, y, mx, my]);
  }
  cmds.push(['L', pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]]);
  return cmds;
}

/** Zeichnet eine Liste von Strichen (Koordinaten × scale) */
export function drawStrokes(ctx, strokes, color, scale, ox = 0, oy = 0) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of strokes) {
    ctx.lineWidth = st.w * scale;
    ctx.beginPath();
    for (const c of smoothPath(st.pts)) {
      if (c[0] === 'M') ctx.moveTo((c[1] - ox) * scale, (c[2] - oy) * scale);
      else if (c[0] === 'L') ctx.lineTo((c[1] - ox) * scale, (c[2] - oy) * scale);
      else ctx.quadraticCurveTo((c[1] - ox) * scale, (c[2] - oy) * scale, (c[3] - ox) * scale, (c[4] - oy) * scale);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export const PAPER_COLORS = {
  line: '#bccbe0',
  grid: '#d6dfeb',
  dot: '#a9b6c9',
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
  return { lines, dots, color: pen.paper === 'grid' ? PAPER_COLORS.grid : PAPER_COLORS.line };
}

export function drawPaper(ctx, geo, pen, scale) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, geo.width * scale, geo.height * scale);
  const { lines, dots, color } = paperPattern(geo, pen);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 0.2 * scale);
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of lines) {
    ctx.moveTo(x1 * scale, y1 * scale);
    ctx.lineTo(x2 * scale, y2 * scale);
  }
  ctx.stroke();
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
  for (const st of page.strokes) {
    const r = st.w / 2;
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
 * options: scale (Pixel pro mm), paper (Papier ja/nein), missing (Platzhalter zeigen)
 */
export function renderPage(canvas, page, geo, pen, { scale, paper = true, missing = true }) {
  canvas.width = Math.round(geo.width * scale);
  canvas.height = Math.round(geo.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (paper) drawPaper(ctx, geo, pen, scale);
  drawStrokes(ctx, page.strokes, pen.color, scale);
  if (missing) drawMissing(ctx, page.missing, scale);
}
