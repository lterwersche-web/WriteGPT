// ─────────────────────────────────────────────────────────────
// export.js – Raus aus der App: PNG, PDF, Zwischenablage, Teilen
// ─────────────────────────────────────────────────────────────

import { contentBounds, drawStrokes, drawMarkers } from './render.js';

// iPad-Safari erlaubt Canvas-Bilder bis ca. 16 Megapixel
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 16_000;

/**
 * Transparentes PNG nur mit der Schrift (zugeschnitten auf den Text).
 * pxPerMm = Auflösung (12 px/mm ≈ 300 dpi → gestochen scharf)
 */
export function strokesToPng(page, pen, pxPerMm = 12) {
  const b = contentBounds(page);
  if (!b) return Promise.resolve(null);
  const pad = 1.5; // mm Rand
  const w = b.width + pad * 2;
  const h = b.height + pad * 2;
  const scale = Math.min(pxPerMm, Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / w, MAX_SIDE / h);

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d');
  drawMarkers(ctx, page.markers, scale, b.minX - pad, b.minY - pad);
  drawStrokes(ctx, page.strokes, pen.color, scale, b.minX - pad, b.minY - pad, pen.nib);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      canvas.width = canvas.height = 0; // Speicher freigeben (wichtig auf dem iPad)
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Bild in die Zwischenablage kopieren.
 * Safari will ein "Promise" direkt beim Antippen – deshalb übergeben
 * wir das noch nicht fertige Bild (blobPromise) sofort.
 */
export async function copyImage(blobPromise) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Dein Browser kann keine Bilder kopieren. Nutze stattdessen „PNG“.');
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
  } catch (err) {
    // Manche Browser (Chrome) wollen das fertige Bild statt eines Promise
    const blob = await blobPromise;
    if (!blob) throw err;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
}

/**
 * Dateien teilen (iPad: Teilen-Menü → „Goodnotes“) oder herunterladen.
 * Gibt 'shared', 'downloaded' oder 'cancelled' zurück.
 */
export async function shareOrDownload(files) {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Teilen hat nicht geklappt → normal herunterladen
    }
  }
  for (const file of files) download(file, file.name);
  return 'downloaded';
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Dateiname mit Datum, z.B. "WriteGPT 2026-11-05.pdf" */
export function fileName(ext, suffix = '') {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `WriteGPT ${date}${suffix}.${ext}`;
}
