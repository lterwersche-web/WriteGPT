// ─────────────────────────────────────────────────────────────
// editor.js – Das Zeichenfeld (Apple Pencil / Finger / Maus)
// ─────────────────────────────────────────────────────────────
// Nutzt "Pointer Events": EIN Event-System für Stift, Finger und Maus.
// e.pointerType sagt uns, was es war: 'pen' | 'touch' | 'mouse'.

import { BOX, GUIDES, simplify, glyphMetrics } from './glyphs.js';
import { drawStrokes } from './render.js';

const INK = '#1c1c1e';
const INK_WIDTH = 0.05; // Strichdicke im Zeichenfeld (in Einheiten)

export class GlyphEditor {
  constructor(host, { onChange } = {}) {
    this.host = host;
    this.onChange = onChange;
    this.strokes = []; // fertige Striche
    this.current = null; // Strich, der gerade gezeichnet wird
    this.pointerId = null;
    this.penSeen = false; // Wurde schon ein Apple Pencil benutzt?
    this.hint = '';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pad-canvas';
    host.append(this.canvas);

    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e));
    // iPad: Kein Scrollen/Lupe beim Zeichnen
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  /** Pixel → Einheiten */
  toUnits(e) {
    const r = this.canvas.getBoundingClientRect();
    const u = r.width / BOX.width;
    return [(e.clientX - r.left) / u, BOX.top + (e.clientY - r.top) / u];
  }

  down(e) {
    // Handballen-Erkennung: Sobald ein Stift benutzt wurde, Finger ignorieren
    if (e.pointerType === 'pen') this.penSeen = true;
    if (this.penSeen && e.pointerType === 'touch') return;
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.current = [...this.toUnits(e)];
    this.draw();
  }

  move(e) {
    if (e.pointerId !== this.pointerId || !this.current) return;
    e.preventDefault();
    // "Coalesced Events": Zwischenpunkte, die der Browser sonst verschluckt
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = this.toUnits(ev);
      const n = this.current.length;
      if (Math.hypot(x - this.current[n - 2], y - this.current[n - 1]) < 0.004) continue;
      this.current.push(x, y);
    }
    this.draw();
  }

  up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.current) {
      this.strokes.push(simplify(this.current, 0.003));
      this.current = null;
      this.draw();
      this.onChange?.();
    }
  }

  isEmpty() {
    return this.strokes.length === 0;
  }

  getData() {
    return this.strokes.length ? { strokes: this.strokes.map((s) => s.slice()) } : null;
  }

  setData(data) {
    this.strokes = data?.strokes ? data.strokes.map((s) => s.slice()) : [];
    this.current = null;
    this.draw();
  }

  undo() {
    this.strokes.pop();
    this.draw();
    this.onChange?.();
  }

  clear() {
    this.strokes = [];
    this.draw();
    this.onChange?.();
  }

  setHint(text) {
    this.hint = text;
    this.draw();
  }

  resize() {
    const w = this.host.clientWidth;
    if (!w) return;
    const h = (w * BOX.height) / BOX.width;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.draw();
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    const u = W / BOX.width; // Pixel pro Einheit
    const dpr = window.devicePixelRatio || 1;
    const y = (v) => (v - BOX.top) * u;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Hilfslinien
    const guide = (v, color, width, dash, label) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.setLineDash(dash.map((d) => d * dpr));
      ctx.beginPath();
      ctx.moveTo(0, y(v));
      ctx.lineTo(W, y(v));
      ctx.stroke();
      ctx.fillStyle = '#9aa7b9';
      ctx.font = `500 ${11 * dpr}px -apple-system, system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, 10 * dpr, y(v) - 4 * dpr);
      ctx.restore();
    };
    guide(GUIDES.ascender, '#d3dcea', 1.5, [], 'Oberlinie');
    guide(GUIDES.xHeight, '#c3d0e3', 1.5, [6, 6], 'Mittellinie');
    guide(GUIDES.baseline, '#5b9cf5', 2, [], 'Grundlinie');
    guide(GUIDES.descender, '#d3dcea', 1.5, [6, 6], 'Unterlinie');

    if (this.hint && !this.strokes.length && !this.current) {
      ctx.save();
      ctx.fillStyle = '#b4bfce';
      ctx.font = `500 ${15 * dpr}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.hint, W / 2, y(-1.25));
      ctx.restore();
    }

    // Striche (Einheiten → Pixel)
    const strokes = this.strokes.map((pts) => ({ pts, w: INK_WIDTH }));
    if (this.current) strokes.push({ pts: this.current, w: INK_WIDTH });
    drawStrokes(ctx, strokes, INK, u, 0, BOX.top);
  }
}

/**
 * Kleines Vorschaubild einer Variante (z.B. für "Variante 1 / 2 / 3").
 * Zeigt einen Ausschnitt um das Zeichen herum – mit Grundlinie, damit
 * man sieht, ob Größe & Höhe zu den anderen Varianten passen.
 */
const THUMB = { width: 1.9, top: -1.2, bottom: 0.65 };

export function drawThumb(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 64;
  const h = (w * (THUMB.bottom - THUMB.top)) / THUMB.width;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  const u = canvas.width / THUMB.width;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(91, 156, 245, 0.5)';
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(0, -THUMB.top * u);
  ctx.lineTo(canvas.width, -THUMB.top * u);
  ctx.stroke();
  if (!data) return;
  // Zeichen horizontal zentrieren
  const m = glyphMetrics(data);
  const shift = (m.minX + m.maxX) / 2 - THUMB.width / 2;
  const strokes = data.strokes.map((pts) => ({ pts, w: 0.07 }));
  drawStrokes(ctx, strokes, INK, u, shift, THUMB.top);
}
