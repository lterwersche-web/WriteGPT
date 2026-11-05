// ─────────────────────────────────────────────────────────────
// pdf.js – Ein PDF selbst bauen (ohne fremde Bibliothek!)
// ─────────────────────────────────────────────────────────────
// Ein PDF ist im Kern eine Textdatei mit nummerierten "Objekten":
//   1 = Katalog (Inhaltsverzeichnis) → 2 = Seitenliste → Seiten → Inhalte
// Die Inhalte sind Zeichenbefehle wie "10 20 m" (moveTo) oder "S" (Strich).
// Vorteil: Die Schrift bleibt VEKTOR → in Goodnotes gestochen scharf,
// egal wie weit man reinzoomt.

import { smoothPath, paperPattern, PAPER_COLORS } from './render.js';

const MM_TO_PT = 72 / 25.4; // PDF rechnet in "Punkt": 1 Zoll = 72 pt

function num(v, digits = 2) {
  const f = 10 ** digits;
  return (Math.round(v * f) / f).toString();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => num(v / 255));
}

/** Zeichenbefehle für eine Seite */
function pageContent(page, geo, pen, withPaper) {
  const H = geo.height;
  // 1 Nachkommastelle reicht (0,1 pt ≈ 0,035 mm) → deutlich kleinere Datei
  const X = (x) => num(x * MM_TO_PT, 1);
  const Y = (y) => num((H - y) * MM_TO_PT, 1); // PDF: y zählt von UNTEN
  const out = [];

  if (withPaper) {
    const { lines, dots, color } = paperPattern(geo, pen);
    out.push(`${hexToRgb(color).join(' ')} RG ${num(0.2 * MM_TO_PT)} w 0 J`);
    for (const [x1, y1, x2, y2] of lines) out.push(`${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);
    if (dots.length) {
      out.push(`${hexToRgb(PAPER_COLORS.dot).join(' ')} RG ${num(0.55 * MM_TO_PT)} w 1 J`);
      for (const [x, y] of dots) out.push(`${X(x)} ${Y(y)} m ${X(x)} ${Y(y)} l S`);
    }
  }

  // Tinte: runde Enden (1 J) und runde Ecken (1 j)
  out.push(`${hexToRgb(pen.color).join(' ')} RG 1 J 1 j`);
  let lastW = null;
  for (const st of page.strokes) {
    if (st.w !== lastW) {
      out.push(`${num(st.w * MM_TO_PT)} w`);
      lastW = st.w;
    }
    let cx = 0, cy = 0; // aktuelle Position (für Kurven-Umrechnung)
    const parts = [];
    for (const c of smoothPath(st.pts)) {
      if (c[0] === 'M') {
        parts.push(`${X(c[1])} ${Y(c[2])} m`);
        [cx, cy] = [c[1], c[2]];
      } else if (c[0] === 'L') {
        parts.push(`${X(c[1])} ${Y(c[2])} l`);
        [cx, cy] = [c[1], c[2]];
      } else {
        // PDF kann nur kubische Kurven → quadratische umrechnen
        const [, qx, qy, x, y] = c;
        const c1x = cx + (2 / 3) * (qx - cx), c1y = cy + (2 / 3) * (qy - cy);
        const c2x = x + (2 / 3) * (qx - x), c2y = y + (2 / 3) * (qy - y);
        parts.push(`${X(c1x)} ${Y(c1y)} ${X(c2x)} ${Y(c2y)} ${X(x)} ${Y(y)} c`);
        [cx, cy] = [x, y];
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
          `/Resources << >> /Contents ${contentId} 0 R >>`,
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
