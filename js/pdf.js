// ─────────────────────────────────────────────────────────────
// pdf.js – Ein PDF selbst bauen (ohne fremde Bibliothek!)
// ─────────────────────────────────────────────────────────────
// Ein PDF ist im Kern eine Textdatei mit nummerierten "Objekten":
//   1 = Katalog (Inhaltsverzeichnis) → 2 = Seitenliste → Seiten → Inhalte
// Die Inhalte sind Zeichenbefehle wie "10 20 m" (moveTo) oder "S" (Strich).
// Vorteil: Die Schrift bleibt VEKTOR → in Goodnotes gestochen scharf,
// egal wie weit man reinzoomt.

import { strokeRuns, paperPattern, PAPER_COLORS, PAPER_LINE_WIDTH, nibBuckets, nibWidth, MARKER_ALPHA } from './render.js';

const MM_TO_PT = 72 / 25.4; // PDF rechnet in "Punkt": 1 Zoll = 72 pt

function num(v, digits = 2) {
  const f = 10 ** digits;
  return (Math.round(v * f) / f).toString();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => num(v / 255, 4)); // 4 Stellen, sonst verfälscht Runden die Farbe
}

/** Zeichenbefehle für eine Seite */
function pageContent(page, geo, pen, withPaper) {
  const H = geo.height;
  // 1 Nachkommastelle reicht (0,1 pt ≈ 0,035 mm) → deutlich kleinere Datei
  const X = (x) => num(x * MM_TO_PT, 1);
  const Y = (y) => num((H - y) * MM_TO_PT, 1); // PDF: y zählt von UNTEN
  const out = [];

  if (withPaper) {
    const { lines, dots, marginLine, color } = paperPattern(geo, pen);
    out.push(`${hexToRgb(color).join(' ')} RG ${num(PAPER_LINE_WIDTH * MM_TO_PT)} w 0 J`);
    const P = (x, y) => `${num(x * MM_TO_PT)} ${num((H - y) * MM_TO_PT)}`; // Papierlinien: 2 Nachkommastellen
    for (const [x1, y1, x2, y2] of lines) out.push(`${P(x1, y1)} m ${P(x2, y2)} l S`);
    if (dots.length) {
      out.push(`${hexToRgb(PAPER_COLORS.dot).join(' ')} RG ${num(0.55 * MM_TO_PT)} w 1 J`);
      for (const [x, y] of dots) out.push(`${X(x)} ${Y(y)} m ${X(x)} ${Y(y)} l S`);
    }
    if (marginLine) {
      const [x1, y1, x2, y2] = marginLine;
      out.push(`${hexToRgb(PAPER_COLORS.margin).join(' ')} RG ${num(0.3 * MM_TO_PT)} w 0 J ${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);
    }
  }

  // Textmarker: durchscheinend (Grafik-Zustand /GSm = 50 % Deckkraft), flache Enden
  if (page.markers?.length) {
    out.push('q /GSm gs 0 J 1 j');
    for (const m of page.markers) {
      const pts = [];
      for (let i = 0; i < m.pts.length; i += 2) pts.push(`${X(m.pts[i])} ${Y(m.pts[i + 1])} ${i ? 'l' : 'm'}`);
      out.push(`${hexToRgb(m.c).join(' ')} RG ${num(m.w * MM_TO_PT)} w ${pts.join(' ')} S`);
    }
    out.push('Q');
  }

  // Tinte: runde Enden (1 J) und runde Ecken (1 j).
  // Jeder Strich besteht aus "harmlosen" Linien-Stücken (siehe strokeRuns),
  // damit Goodnotes keine Löcher (weiße Punkte) hineinrechnet.
  // Hier 2 Nachkommastellen, damit nah beieinander liegende Punkte nicht verschmelzen.
  const IX = (x) => num(x * MM_TO_PT, 2);
  const IY = (y) => num((H - y) * MM_TO_PT, 2);
  out.push('1 J 1 j');
  let lastW = null;
  let lastC = null;
  for (const st of page.strokes) {
    const c = st.c || pen.color;
    if (c !== lastC) {
      out.push(`${hexToRgb(c).join(' ')} RG`);
      lastC = c;
    }
    const runs = strokeRuns(st.pts, st.w);
    if (pen.nib === 'fountain') {
      // Füller: jede Dicken-Stufe als eigener Pfad aus kurzen Stücken
      for (const [lvl, seg] of nibBuckets(runs)) {
        const parts = [`${num(nibWidth(st.w, lvl) * MM_TO_PT)} w`];
        for (let i = 0; i < seg.length; i += 4) {
          parts.push(`${IX(seg[i])} ${IY(seg[i + 1])} m ${IX(seg[i + 2])} ${IY(seg[i + 3])} l`);
        }
        out.push(parts.join(' ') + ' S');
      }
      lastW = null;
      continue;
    }
    if (st.w !== lastW) {
      out.push(`${num(st.w * MM_TO_PT)} w`);
      lastW = st.w;
    }
    const parts = [];
    for (const run of runs) {
      const first = `${IX(run[0])} ${IY(run[1])}`;
      parts.push(`${first} m`);
      if (run.length === 2) {
        parts.push(`${first} l`); // einzelner Punkt → runder Punkt
        continue;
      }
      let last = first;
      for (let i = 2; i < run.length; i += 2) {
        const pt = `${IX(run[i])} ${IY(run[i + 1])}`;
        if (pt !== last) parts.push(`${pt} l`);
        last = pt;
      }
    }
    out.push(parts.join(' ') + ' S');
  }
  return out.join('\n');
}

/** Komprimiert Text (falls der Browser das kann) → kleinere PDF-Datei */
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Baut das PDF.
 * layout = Ergebnis von layoutDocument(), pen = Stift-Einstellungen
 */
export async function createPdf(layout, pen, { paper = true, title = 'WriteGPT' } = {}) {
  const enc = new TextEncoder();
  const { geo } = layout;
  const W = num(geo.width * MM_TO_PT);
  const H = num(geo.height * MM_TO_PT);

  // Objekte sammeln: Index 0 = Objekt Nr. 1
  const objects = [];
  const add = (parts) => objects.push(parts) && objects.length;

  const catalogId = add(null);
  const pagesId = add(null);
  const infoId = add([enc.encode(`<< /Title (${title}) /Producer (WriteGPT) >>`)]);

  // Grafik-Zustand für den durchscheinenden Textmarker
  const markerGsId = add([enc.encode(`<< /Type /ExtGState /CA ${MARKER_ALPHA} /ca ${MARKER_ALPHA} >>`)]);

  const pageIds = [];
  for (const page of layout.pages) {
    const raw = enc.encode(pageContent(page, geo, pen, paper));
    const packed = await deflate(raw);
    const data = packed ?? raw;
    const filter = packed ? ' /Filter /FlateDecode' : '';
    const contentId = add([
      enc.encode(`<< /Length ${data.length}${filter} >>\nstream\n`),
      data,
      enc.encode('\nendstream'),
    ]);
    const pageId = add([
      enc.encode(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] ` +
          `/Resources << /ExtGState << /GSm ${markerGsId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    ]);
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = [enc.encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)];
  objects[pagesId - 1] = [
    enc.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`),
  ];

  // Datei zusammensetzen + "xref" (Tabelle: wo beginnt welches Objekt?)
  const chunks = [enc.encode('%PDF-1.4\n%âãÏÓ\n')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((parts, i) => {
    offsets.push(offset);
    const head = enc.encode(`${i + 1} 0 obj\n`);
    const tail = enc.encode('\nendobj\n');
    for (const c of [head, ...parts, tail]) {
      chunks.push(c);
      offset += c.length;
    }
  });

  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n` +
    `startxref\n${offset}\n%%EOF\n`;
  chunks.push(enc.encode(xref));

  return new Blob(chunks, { type: 'application/pdf' });
}
