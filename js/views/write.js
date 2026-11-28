// ─────────────────────────────────────────────────────────────
// views/write.js – ✍️ Schreiben: Text links, Vorschau rechts
// ─────────────────────────────────────────────────────────────
// Neu: Radierer (Buchstaben wegwischen) und Wort-Menü (Wort antippen →
// neu würfeln, wegradieren, wiederherstellen, Buchstabe neu zeichnen).

import { getState, update, subscribe, EMPTY_EDITS, newDoc, switchDoc, deleteDoc, docTitle } from '../state.js';
import { parseChatText } from '../markdown.js';
import { layoutDocument, pageGeometry, PAGE_FORMATS, GOODNOTES_LINE } from '../layout.js';
import { renderPage } from '../render.js';
import { createPdf } from '../pdf.js';
import { strokesToPng, copyImage, shareOrDownload, fileName } from '../export.js';
import { textKey, remapEdits, hasEdits } from '../edits.js';
import { isPenSeen } from '../editor.js';
import { setForChar } from '../charsets.js';
import { icon } from '../icons.js';
import { toast, confirmDialog, showGoodnotesTip, segmented, toggle, slider, de, esc } from '../ui.js';

const INK_COLORS = [
  { value: '#1c1c1e', label: 'Schwarz' },
  { value: '#1f4fbf', label: 'Blau' },
  { value: '#c62f2f', label: 'Rot' },
  { value: '#1f7a4a', label: 'Grün' },
];

const MARKER_COLORS = [
  { value: '#ffd60a', label: 'Gelb' },
  { value: '#7ee081', label: 'Grün' },
  { value: '#ff8fc7', label: 'Pink' },
  { value: '#8ecbff', label: 'Blau' },
  { value: '#ffb35c', label: 'Orange' },
];

const HEADING_COLORS = [
  { value: '#1f4fbf', label: 'Blau' },
  { value: '#c62f2f', label: 'Rot' },
  { value: '#1f7a4a', label: 'Grün' },
  { value: '#6e3fc4', label: 'Lila' },
];

// Beispiel zum Ausprobieren – zeigt alle Lernzettel-Funktionen
const SAMPLE = `# Photosynthese

Pflanzen wandeln **Lichtenergie** in chemische Energie um.

## Das Wichtigste

1. Findet in den ==Chloroplasten== statt
2. Braucht Licht, Wasser und CO₂
3. Es entstehen Zucker und Sauerstoff

> Merke: 6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂`;

export function createWriteView(app) {
  const el = document.createElement('section');
  el.className = 'view view-write';
  el.innerHTML = `
    <div class="write-grid">
      <div class="card text-card">
        <div class="card-head">
          <h2>Dein Text</h2>
          <div class="head-actions">
            <button class="btn btn-ghost btn-sm" data-act="docs" aria-expanded="false">${icon('docs')}<span>Meine Texte</span></button>
            <button class="btn btn-ghost btn-sm" data-act="paste">${icon('paste')}<span>Einfügen</span></button>
            <button class="btn btn-ghost btn-sm" data-act="clear">${icon('trash')}<span>Leeren</span></button>
          </div>
        </div>
        <textarea class="text-input" spellcheck="false"
          placeholder="Füg hier deinen Text ein – zum Beispiel eine Antwort von ChatGPT.&#10;&#10;**Fett**, # Überschriften und - Listen werden automatisch umgewandelt."></textarea>
        <div class="missing-banner" hidden></div>
        <div class="card-foot">
          <span class="muted char-count">0 Wörter</span>
          <button class="btn btn-ghost btn-xs" data-act="sample" hidden>${icon('sparkle')}<span>Beispiel ausprobieren</span></button>
        </div>
      </div>

      <div class="card preview-card">
        <div class="card-head">
          <h2>Vorschau <span class="chip page-count">1 Seite</span></h2>
          <div class="head-actions">
            <button class="btn btn-ghost btn-sm" data-act="shuffle" title="Zufall neu würfeln">${icon('dice')}<span>Neu mischen</span></button>
          </div>
        </div>
        <div class="preview-scroll">
          <div class="pages"></div>
          <div class="word-highlight" hidden></div>
          <div class="word-menu" hidden role="menu"></div>
        </div>
        <div class="empty-state" hidden>
          <div class="empty-icon">${icon('font')}</div>
          <h3>Noch keine Handschrift</h3>
          <p>Zeichne zuerst deine Buchstaben – danach erscheint hier jeder Text in deiner Schrift.</p>
          <button class="btn btn-primary" data-act="setup">Schrift einrichten ${icon('right')}</button>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-group">
        <button class="btn" data-act="copy">${icon('copy')}<span>Kopieren</span></button>
        <button class="btn" data-act="png">${icon('image')}<span>PNG</span></button>
        <button class="btn btn-primary" data-act="pdf">${icon('file')}<span>PDF</span></button>
      </div>
      <div class="toolbar-group">
        <button class="btn" data-act="eraser" aria-pressed="false">${icon('eraser')}<span>Radierer</span></button>
        <button class="btn" data-act="pen" aria-expanded="false">${icon('sliders')}<span>Stift &amp; Papier</span></button>
      </div>
    </div>

    <div class="eraser-bar" hidden role="toolbar" aria-label="Radierer">
      <div class="eraser-bar-top">
        <span class="eraser-hint">${icon('eraser')}<span>Wisch über Buchstaben, um sie wegzuradieren</span></span>
        <button class="btn btn-ghost btn-xs" data-act="gn-tip">${icon('info')}<span>Radieren in Goodnotes?</span></button>
      </div>
      <div class="eraser-bar-row">
        <div class="slot-erase-mode"></div>
        <div class="eraser-actions">
          <button class="btn btn-sm" data-act="undo-edit">${icon('undo')}<span>Rückgängig</span></button>
          <button class="btn btn-sm btn-ghost" data-act="reset-edits">${icon('restore')}<span>Alles zurück</span></button>
          <button class="btn btn-sm btn-primary" data-act="eraser-done">Fertig</button>
        </div>
      </div>
    </div>
    <div class="eraser-cursor" hidden></div>

    <div class="popover pen-popover" hidden role="dialog" aria-label="Stift und Papier"></div>
    <div class="popover docs-popover" hidden role="dialog" aria-label="Meine Texte"></div>
  `;

  const $ = (s) => el.querySelector(s);
  const textarea = $('.text-input');
  const pagesEl = $('.pages');
  const scrollEl = $('.preview-scroll');
  const popover = $('.pen-popover');
  const eraserBar = $('.eraser-bar');
  const cursorEl = $('.eraser-cursor');
  const menuEl = $('.word-menu');
  const highlightEl = $('.word-highlight');
  const docsEl = $('.docs-popover');

  textarea.value = getState().text;

  // ── Text setzen (+ Radierungen passend nachführen) ───────
  function setText(text) {
    const key = textKey(parseChatText(text));
    update({ text, edits: remapEdits(getState().edits ?? EMPTY_EDITS, key) });
  }

  // Beim Start: Passen die gespeicherten Radierungen zum Text?
  {
    const { text, edits } = getState();
    const key = textKey(parseChatText(text));
    if (edits.key !== key) update({ edits: remapEdits(edits, key) });
  }

  let typingTimer;
  textarea.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => setText(textarea.value), 150);
  });

  // ── Zustand für Radierer & Wort-Menü ─────────────────────
  let eraserOn = false;
  let drag = null; // läuft gerade ein Radier-Wisch? { pointerId, set, pageIndex, canvas }
  let tap = null; // wurde gerade angetippt? (fürs Wort-Menü)
  let menuWord = null; // aktuell geöffnetes Wort { w0, w1, glyph }
  const history = []; // für "Rückgängig"

  /** Radierungen, inkl. der gerade laufenden Wisch-Bewegung (als Lücke) */
  function currentEdits() {
    const { edits } = getState();
    if (!drag?.set.size) return edits;
    const erased = { ...edits.erased };
    for (const i of drag.set) erased[i] = 'gap';
    return { ...edits, erased };
  }

  // ── Layout berechnen + Vorschau malen ────────────────────
  let layout = null;
  let dirty = true;
  let frame = 0;

  function compute(opts = {}) {
    const { font, pen, text } = getState();
    return layoutDocument(parseChatText(text), font, pen, { edits: currentEdits(), ...opts });
  }

  function render() {
    frame = 0;
    if (!app.isVisible('schreiben')) {
      dirty = true;
      return;
    }
    dirty = false;
    const { font, pen, text } = getState();
    const hasFont = Object.keys(font.glyphs).length > 0;
    $('.empty-state').hidden = hasFont;
    scrollEl.hidden = !hasFont;
    layout = compute();
    const n = layout.pages.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $('.char-count').textContent = `${words.toLocaleString('de-DE')} ${words === 1 ? 'Wort' : 'Wörter'} · ${n} ${n === 1 ? 'Seite' : 'Seiten'}`;
    $('[data-act="sample"]').hidden = !!text.trim();
    $('.page-count').textContent = `${n} ${n === 1 ? 'Seite' : 'Seiten'}`;
    renderMissing(layout.missingChars);
    paintEraserBar();
    if (!hasFont) return;

    // Seiten-Canvas anlegen (wiederverwenden, wenn möglich)
    while (pagesEl.children.length > n) pagesEl.lastChild.remove();
    while (pagesEl.children.length < n) {
      const wrap = document.createElement('div');
      wrap.className = 'page';
      wrap.innerHTML = `<canvas></canvas>
        <div class="page-meta">
          <span class="page-label"></span>
          <button class="btn btn-ghost btn-xs" data-act="copy-page">${icon('copy')}<span>Seite kopieren</span></button>
        </div>
        <div class="page-hint" hidden>Deine Vorschau erscheint hier ✍️</div>`;
      pagesEl.append(wrap);
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(200, pagesEl.clientWidth);
    const scale = (cssWidth * dpr) / layout.geo.width;
    [...pagesEl.children].forEach((wrap, i) => {
      const canvas = wrap.querySelector('canvas');
      renderPage(canvas, layout.pages[i], layout.geo, pen, { scale, paper: true, missing: true, ghosts: eraserOn });
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${(cssWidth * layout.geo.height) / layout.geo.width}px`;
      wrap.dataset.index = i;
      wrap.querySelector('.page-label').textContent = `Seite ${i + 1} von ${n}`;
      wrap.querySelector('[data-act="copy-page"]').hidden = !layout.pages[i].strokes.length;
      wrap.querySelector('.page-hint').hidden = !!text.trim();
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  // ── Hinweis: fehlende Zeichen ────────────────────────────
  function renderMissing(chars) {
    const banner = $('.missing-banner');
    const drawable = chars.filter((c) => setForChar(c));
    const unsupported = chars.filter((c) => !setForChar(c));
    if (!chars.length) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const list = (arr) => arr.map((c) => `<kbd>${esc(c)}</kbd>`).join('');
    banner.innerHTML = `
      <div class="missing-icon">${icon('warning')}</div>
      <div class="missing-text">
        ${drawable.length ? `<div><strong>${drawable.length} ${drawable.length === 1 ? 'Zeichen fehlt' : 'Zeichen fehlen'}</strong> noch in deiner Schrift: ${list(drawable)}</div>` : ''}
        ${unsupported.length ? `<div class="muted">Wird ausgelassen: ${list(unsupported)}</div>` : ''}
      </div>
      ${drawable.length ? `<button class="btn btn-sm" data-act="draw-missing">Jetzt zeichnen</button>` : ''}`;
    banner.querySelector('[data-act="draw-missing"]')?.addEventListener('click', () => {
      app.navigate('schrift', { drawChar: drawable[0] });
    });
  }

  // ════════════════════════════════════════════════════════
  // RADIERER
  // ════════════════════════════════════════════════════════

  // Lücke lassen / Zusammenrücken
  const modeSwitch = segmented(
    [
      { value: 'gap', label: 'Lücke lassen' },
      { value: 'close', label: 'Zusammenrücken' },
    ],
    getState().ui.eraseMode,
    (v) => update({ ui: { ...getState().ui, eraseMode: v } }),
    { small: true },
  );
  $('.slot-erase-mode').append(modeSwitch);

  function setEraser(on) {
    eraserOn = on;
    closeWordMenu();
    if (on) setPopover(false);
    eraserBar.hidden = !on;
    pagesEl.classList.toggle('erasing', on);
    el.classList.toggle('is-erasing', on);
    const btn = $('[data-act="eraser"]');
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on);
    cursorEl.hidden = true;
    schedule(); // Geister-Buchstaben ein-/ausblenden
  }

  function paintEraserBar() {
    $('[data-act="undo-edit"]').disabled = !history.length;
    $('[data-act="reset-edits"]').disabled = !hasEdits(getState().edits);
  }

  /** Vorher-Stand merken (für Rückgängig) */
  function pushHistory() {
    history.push(structuredClone(getState().edits));
    if (history.length > 50) history.shift();
  }

  function setEdits(edits) {
    update({ edits });
  }

  /** Bildschirm-Position → Millimeter auf der Seite */
  function toMm(canvas, ev) {
    const r = canvas.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * layout.geo.width, ((ev.clientY - r.top) / r.height) * layout.geo.height];
  }

  /** Radierer-Größe in mm (mind. ca. 9 Bildschirm-Pixel, damit man trifft) */
  function eraserRadius(canvas) {
    const pxPerMm = canvas.getBoundingClientRect().width / layout.geo.width;
    return Math.max(getState().pen.size * 0.18, 9 / pxPerMm);
  }

  /** Berührt der Radierer (Kreis um mx/my) einen der Striche? */
  function hitsStrokes(strokes, mx, my, r) {
    for (const st of strokes) {
      const rr = r + st.w / 2;
      const p = st.pts;
      if (p.length === 2 && Math.hypot(p[0] - mx, p[1] - my) <= rr) return true;
      for (let i = 2; i < p.length; i += 2) {
        const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy || 1e-12;
        const t = Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / len2));
        if (Math.hypot(ax + t * dx - mx, ay + t * dy - my) <= rr) return true;
      }
    }
    return false;
  }

  function eraseAt(ev) {
    const page = layout?.pages[drag.pageIndex];
    if (!page) return;
    const [mx, my] = toMm(drag.canvas, ev);
    const r = eraserRadius(drag.canvas);
    let changed = false;
    for (const g of page.glyphs) {
      if (g.erased || drag.set.has(g.idx) || !g.strokes.length) continue;
      if (mx < g.x0 - r - 1 || mx > g.x1 + r + 1 || my < g.y0 - r - 1 || my > g.y1 + r + 1) continue;
      if (hitsStrokes(g.strokes, mx, my, r)) {
        drag.set.add(g.idx);
        changed = true;
      }
    }
    if (changed) schedule();
  }

  function finishErase() {
    const set = drag.set;
    drag = null;
    if (!set.size) return;
    pushHistory();
    const { edits, ui } = getState();
    const erased = { ...edits.erased };
    for (const i of set) erased[i] = ui.eraseMode; // erst jetzt zusammenrücken (sonst springt der Text beim Wischen)
    setEdits({ ...edits, erased });
  }

  function moveCursor(e) {
    const canvas = e.target.closest?.('.page canvas') ?? drag?.canvas;
    if (!eraserOn || !canvas || !layout) {
      cursorEl.hidden = true;
      return;
    }
    const pxPerMm = canvas.getBoundingClientRect().width / layout.geo.width;
    const d = eraserRadius(canvas) * 2 * pxPerMm;
    cursorEl.hidden = false;
    cursorEl.style.width = cursorEl.style.height = `${d}px`;
    cursorEl.style.transform = `translate(${e.clientX - d / 2}px, ${e.clientY - d / 2}px)`;
  }

  // Pencil radiert, Finger scrollt (sobald ein Pencil benutzt wurde).
  // Ohne Pencil radiert der Finger – scrollen dann außerhalb des Radier-Modus.
  const blockScroll = (e) => {
    if (!eraserOn || !e.target.closest('.page canvas')) return;
    const stylus = [...e.touches].some((t) => t.touchType === 'stylus');
    if (stylus || !isPenSeen()) e.preventDefault();
  };
  pagesEl.addEventListener('touchstart', blockScroll, { passive: false });
  pagesEl.addEventListener('touchmove', blockScroll, { passive: false });

  pagesEl.addEventListener('pointerdown', (e) => {
    const canvas = e.target.closest('.page canvas');
    if (!canvas || !layout) return;
    const pageIndex = Number(canvas.parentElement.dataset.index);
    if (eraserOn) {
      if (e.pointerType === 'touch' && isPenSeen()) return; // Finger → scrollen
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = { pointerId: e.pointerId, set: new Set(), pageIndex, canvas };
      moveCursor(e);
      eraseAt(e);
      return;
    }
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), pointerId: e.pointerId, pageIndex, canvas };
  });

  pagesEl.addEventListener('pointermove', (e) => {
    if (eraserOn && e.pointerType !== 'touch') moveCursor(e);
    if (drag && e.pointerId === drag.pointerId) {
      if (e.pointerType === 'touch') moveCursor(e);
      const events = e.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e]) eraseAt(ev);
    }
  });

  const endPointer = (e) => {
    if (drag && e.pointerId === drag.pointerId) {
      finishErase();
      if (e.pointerType === 'touch') cursorEl.hidden = true;
      return;
    }
    if (tap && e.pointerId === tap.pointerId) {
      const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
      if (e.type === 'pointerup' && moved < 10 && performance.now() - tap.t < 600) openWordMenu(tap, e);
      tap = null;
    }
  };
  pagesEl.addEventListener('pointerup', endPointer);
  pagesEl.addEventListener('pointercancel', endPointer);
  pagesEl.addEventListener('pointerleave', (e) => {
    if (!drag) cursorEl.hidden = true;
  });

  // ════════════════════════════════════════════════════════
  // WORT-MENÜ (Wort antippen)
  // ════════════════════════════════════════════════════════
  function openWordMenu(t, e) {
    const page = layout.pages[t.pageIndex];
    if (!page) return;
    const [mx, my] = toMm(t.canvas, e);
    const pxPerMm = t.canvas.getBoundingClientRect().width / layout.geo.width;
    // Nächstes Zeichen zum Finger suchen
    let best = null;
    let bestD = Infinity;
    for (const g of page.glyphs) {
      if (!isFinite(g.x0)) continue;
      const d = Math.hypot(Math.max(g.x0 - mx, 0, mx - g.x1), Math.max(g.y0 - my, 0, my - g.y1));
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (!best || bestD > 14 / pxPerMm) {
      closeWordMenu();
      return;
    }
    // Alle Zeichen dieses Worts in derselben Zeile
    const lineH = getState().pen.lineHeight;
    const midY = (best.y0 + best.y1) / 2;
    const parts = page.glyphs.filter((g) => g.w0 === best.w0 && isFinite(g.x0) && Math.abs((g.y0 + g.y1) / 2 - midY) < lineH * 0.6);
    const box = {
      x0: Math.min(...parts.map((g) => g.x0)), x1: Math.max(...parts.map((g) => g.x1)),
      y0: Math.min(...parts.map((g) => g.y0)), y1: Math.max(...parts.map((g) => g.y1)),
    };
    menuWord = { w0: best.w0, w1: best.w1, glyph: best };
    showWordMenu(t.canvas, box);
  }

  function showWordMenu(canvas, box) {
    const { edits } = getState();
    const { w0, w1, glyph } = menuWord;
    let anyErased = false;
    for (let i = w0; i <= w1; i++) if (edits.erased[i]) anyErased = true;
    const allErased = (() => {
      for (let i = w0; i <= w1; i++) if (!edits.erased[i]) return false;
      return true;
    })();
    const canRedraw = glyph.gch && setForChar(glyph.gch);

    menuEl.innerHTML = `
      ${allErased ? '' : `<button role="menuitem" data-act="wm-reroll">${icon('dice')}<span>Neu würfeln</span></button>`}
      ${allErased ? '' : `<button role="menuitem" data-act="wm-erase">${icon('eraser')}<span>Wegradieren</span></button>`}
      ${anyErased ? `<button role="menuitem" data-act="wm-restore">${icon('restore')}<span>Wiederherstellen</span></button>` : ''}
      ${canRedraw && !glyph.erased ? `<button role="menuitem" data-act="wm-redraw">${icon('pen')}<span>„${esc(glyph.gch)}“ neu zeichnen</span></button>` : ''}`;

    // Position: über dem Wort (oder darunter, wenn oben kein Platz ist)
    const sr = scrollEl.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const k = cr.width / layout.geo.width;
    const left = cr.left - sr.left + scrollEl.scrollLeft + box.x0 * k;
    const top = cr.top - sr.top + scrollEl.scrollTop + box.y0 * k;
    const w = (box.x1 - box.x0) * k;
    const h = (box.y1 - box.y0) * k;
    Object.assign(highlightEl.style, { left: `${left - 4}px`, top: `${top - 4}px`, width: `${w + 8}px`, height: `${h + 8}px` });
    highlightEl.hidden = false;

    menuEl.hidden = false;
    const mw = menuEl.offsetWidth;
    const mh = menuEl.offsetHeight;
    let mx = left + w / 2 - mw / 2;
    mx = Math.max(scrollEl.scrollLeft + 6, Math.min(mx, scrollEl.scrollLeft + scrollEl.clientWidth - mw - 6));
    let my = top - mh - 12;
    const below = my < scrollEl.scrollTop + 6;
    if (below) my = top + h + 12;
    menuEl.classList.toggle('below', below);
    menuEl.style.left = `${mx}px`;
    menuEl.style.top = `${my}px`;
    menuEl.style.setProperty('--arrow-x', `${Math.max(14, Math.min(mw - 14, left + w / 2 - mx))}px`);
  }

  function closeWordMenu() {
    menuWord = null;
    menuEl.hidden = true;
    highlightEl.hidden = true;
  }

  function wordAction(act) {
    if (!menuWord) return;
    const { w0, w1, glyph } = menuWord;
    const { edits, ui } = getState();
    if (act === 'wm-redraw') {
      closeWordMenu();
      app.navigate('schrift', { drawChar: glyph.gch, variant: glyph.variant });
      return;
    }
    pushHistory();
    const erased = { ...edits.erased };
    const reroll = { ...edits.reroll };
    for (let i = w0; i <= w1; i++) {
      if (act === 'wm-reroll') reroll[i] = (reroll[i] ?? 0) + 1;
      else if (act === 'wm-erase') erased[i] = ui.eraseMode;
      else if (act === 'wm-restore') delete erased[i];
    }
    closeWordMenu();
    setEdits({ ...edits, erased, reroll });
  }

  scrollEl.addEventListener('scroll', () => {
    if (menuWord) closeWordMenu();
  });

  // ── Stift & Papier (Popover mit 3 Tabs) ──────────────────
  /** Farbkreise zum Antippen. extra: { none: 'Label' } für "keine eigene Farbe", custom: true für Farbwähler */
  function swatchRow(colors, current, onPick, { none = null, custom = false } = {}) {
    const row = document.createElement('div');
    row.className = 'swatches';
    const paint = (value) => {
      for (const sw of row.querySelectorAll('.swatch')) {
        const isCustom = sw.classList.contains('swatch-custom');
        const known = colors.some((c) => c.value === value) || (none && value === '');
        sw.classList.toggle('active', sw.dataset.color === value || (isCustom && !known));
      }
    };
    const pick = (value) => {
      onPick(value);
      paint(value);
    };
    if (none) {
      const b = document.createElement('button');
      b.className = 'swatch swatch-none';
      b.dataset.color = '';
      b.title = none;
      b.setAttribute('aria-label', none);
      b.textContent = 'Aa';
      b.onclick = () => pick('');
      row.append(b);
    }
    for (const c of colors) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.dataset.color = c.value;
      b.style.setProperty('--c', c.value);
      b.title = c.label;
      b.setAttribute('aria-label', c.label);
      b.onclick = () => pick(c.value);
      row.append(b);
    }
    if (custom) {
      const label = document.createElement('label');
      label.className = 'swatch swatch-custom';
      label.title = 'Eigene Farbe';
      label.innerHTML = `${icon('plus')}<input type="color" aria-label="Eigene Farbe">`;
      const input = label.querySelector('input');
      input.value = current || '#1c1c1e';
      input.oninput = () => pick(input.value);
      row.append(label);
    }
    paint(current ?? '');
    return row;
  }

  function toggleRow(label, value, onChange, hint = '') {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `<span><span class="toggle-label"></span>${hint ? '<small></small>' : ''}</span>`;
    row.querySelector('.toggle-label').textContent = label;
    if (hint) row.querySelector('small').textContent = hint;
    row.append(toggle(value, onChange, label));
    return row;
  }

  function section(title, ...children) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h4>${title}</h4>`;
    sec.append(...children);
    return sec;
  }

  /** Zeilenabstand passend zum Goodnotes-Papier (nur für ausgemessene Papiere) */
  const gnLine = (paper) => (GOODNOTES_LINE[paper] ? { lineHeight: GOODNOTES_LINE[paper] } : {});

  /**
   * Regler "Zeilenlänge". Ganz rechts = volle Seitenbreite (gespeichert als 0).
   * Auf kariertem Papier rastet er auf ganze Kästchen ein, sonst auf Millimeter.
   */
  function lineLengthSlider(pen, setPen) {
    const geo = pageGeometry(pen);
    const full = geo.width - geo.margin.left - geo.margin.right;
    const grid = pen.paper === 'grid';
    const step = grid ? pen.lineHeight / 2 : 1; // ein Kästchen bzw. 1 mm
    const n = Math.floor(full / step + 1e-6); // so viele Schritte passen auf die Seite
    const min = Math.min(n, Math.ceil(30 / step)); // mindestens ca. 3 cm
    const value = pen.lineLength > 0 ? Math.max(min, Math.min(n, Math.round(pen.lineLength / step))) : n + 1;
    return slider({
      label: 'Zeilenlänge',
      min,
      max: n + 1,
      step: 1,
      value,
      format: (v) => (v > n ? 'volle Breite' : `${de((v * step) / 10)} cm${grid ? ` · ${v} Kästchen` : ''}`),
      onInput: (v) => setPen({ lineLength: v > n ? 0 : v * step }),
    });
  }

  function buildPenPanel() {
    const { pen, ui } = getState();
    const setPen = (patch) => update({ pen: { ...getState().pen, ...patch } });
    const tab = ui.penTab ?? 'pen';
    popover.innerHTML = `
      <div class="popover-head">
        <h3>Stift &amp; Papier</h3>
        <button class="btn btn-icon btn-ghost" data-act="close-pen" aria-label="Schließen">${icon('close')}</button>
      </div>
      <div class="popover-tabs"></div>
      <div class="popover-body"></div>`;
    const body = popover.querySelector('.popover-body');

    popover.querySelector('.popover-tabs').append(
      segmented(
        [
          { value: 'pen', label: 'Stift' },
          { value: 'page', label: 'Seite' },
          { value: 'study', label: 'Lernzettel' },
        ],
        tab,
        (v) => {
          update({ ui: { ...getState().ui, penTab: v } });
          buildPenPanel();
        },
      ),
    );

    if (tab === 'pen') {
      body.append(
        section(
          'Tinte',
          swatchRow(INK_COLORS, pen.color, (v) => setPen({ color: v }), { custom: true }),
          segmented(
            [
              { value: 'fineliner', label: 'Fineliner' },
              { value: 'fountain', label: 'Füller' },
            ],
            pen.nib ?? 'fineliner',
            (v) => setPen({ nib: v }),
          ),
          slider({ label: 'Stiftdicke', min: 0.2, max: 1.4, step: 0.05, value: pen.width, format: (v) => `${de(v, 2)} mm`, onInput: (v) => setPen({ width: v }) }),
        ),
        section(
          'Größe &amp; Abstände',
          slider({ label: 'Schriftgröße', min: 2.5, max: 10, step: 0.1, value: pen.size, format: (v) => `${de(v)} mm`, onInput: (v) => setPen({ size: v }) }),
          slider({ label: 'Zeilenabstand', min: 5, max: 18, step: 0.1, value: pen.lineHeight, format: (v) => `${de(v)} mm`, onInput: (v) => setPen({ lineHeight: v }) }),
          lineLengthSlider(pen, setPen),
          slider({ label: 'Buchstabenabstand', min: -0.15, max: 0.4, step: 0.01, value: pen.letterSpacing, format: (v) => (v === 0 ? 'normal' : v < 0 ? 'enger' : 'weiter'), onInput: (v) => setPen({ letterSpacing: v }) }),
          slider({ label: 'Wortabstand', min: 0.25, max: 1.2, step: 0.01, value: pen.wordSpacing, format: (v) => `${Math.round(v * 100)} %`, onInput: (v) => setPen({ wordSpacing: v }) }),
          slider({ label: 'Natürlichkeit', min: 0, max: 1, step: 0.01, value: pen.jitter, format: (v) => (v < 0.05 ? 'sauber' : `${Math.round(v * 100)} %`), onInput: (v) => setPen({ jitter: v }) }),
        ),
      );
    }

    if (tab === 'page') {
      const header = document.createElement('input');
      header.type = 'text';
      header.className = 'text-field';
      header.placeholder = 'Kopfzeile, z.B. Bio – Photosynthese';
      header.value = pen.headerText ?? '';
      header.maxLength = 60;
      header.setAttribute('aria-label', 'Kopfzeile');
      header.oninput = () => setPen({ headerText: header.value });
      body.append(
        section(
          'Papier',
          segmented(
            [
              { value: 'blank', label: 'Blanko' },
              { value: 'lined', label: 'Liniert' },
              { value: 'grid', label: 'Kariert' },
              { value: 'dots', label: 'Punkte' },
            ],
            pen.paper,
            (v) => setPen({ paper: v, ...gnLine(v) }),
          ),
          segmented(
            Object.entries(PAGE_FORMATS).map(([value, f]) => ({ value, label: f.label })),
            pen.format,
            (v) => setPen({ format: v, ...gnLine(getState().pen.paper) }),
          ),
          toggleRow('Randlinie wie im Heft', !!pen.paperMargin, (v) => setPen({ paperMargin: v })),
          toggleRow('Papier-Linien im PDF', pen.paperInPdf, (v) => setPen({ paperInPdf: v })),
        ),
        section(
          'Kopfzeile &amp; Seitenzahlen',
          header,
          toggleRow('Datum oben rechts', !!pen.headerDate, (v) => setPen({ headerDate: v })),
          toggleRow('Seitenzahlen', !!pen.pageNumbers, (v) => setPen({ pageNumbers: v })),
          toggleRow('--- startet neue Seite', !!pen.hrPageBreak, (v) => setPen({ hrPageBreak: v }), 'Praktisch für Karteikarten: eine Karte pro Abschnitt'),
        ),
      );
    }

    if (tab === 'study') {
      const help = document.createElement('div');
      help.className = 'syntax-help';
      help.innerHTML = `
        <div><code>**Text**</code><span>fett – so wie oben eingestellt</span></div>
        <div><code>==Text==</code><span>Textmarker</span></div>
        <div><code>&gt; Text</code><span>Merkkasten</span></div>
        <div><code>---</code><span>Trennlinie (oder neue Seite)</span></div>`;
      body.append(
        section(
          'Fett wird zu …',
          segmented(
            [
              { value: 'thick', label: 'Dicker' },
              { value: 'marker', label: 'Textmarker' },
              { value: 'underline', label: 'Unterstrichen' },
            ],
            pen.boldStyle ?? 'thick',
            (v) => setPen({ boldStyle: v }),
          ),
        ),
        section('Textmarker-Farbe', swatchRow(MARKER_COLORS, pen.markerColor, (v) => setPen({ markerColor: v }))),
        section(
          'Überschriften',
          swatchRow(HEADING_COLORS, pen.headingColor ?? '', (v) => setPen({ headingColor: v }), { none: 'Wie die Tinte' }),
          toggleRow('Überschriften zentrieren', !!pen.centerHeadings, (v) => setPen({ centerHeadings: v })),
        ),
        section('So schreibst du das im Text', help),
      );
    }

    const reset = document.createElement('button');
    reset.className = 'btn btn-ghost btn-sm reset-pen';
    reset.textContent = 'Standard wiederherstellen';
    reset.onclick = () => {
      app.resetPen();
      buildPenPanel();
    };
    body.append(reset);
    popover.querySelector('[data-act="close-pen"]').onclick = () => setPopover(false);
  }

  function setPopover(open) {
    if (open) {
      if (!docsEl.hidden) setDocsOpen(false);
      buildPenPanel();
      if (eraserOn) setEraser(false);
      closeWordMenu();
    }
    popover.hidden = !open;
    $('[data-act="pen"]').setAttribute('aria-expanded', open);
    $('[data-act="pen"]').classList.toggle('active', open);
  }

  // ── Meine Texte ──────────────────────────────────────────
  /** "heute, 14:32" / "gestern" / "3.11." */
  function when(ts) {
    const d = new Date(ts);
    const today = new Date();
    const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (days === 0) return `heute, ${time}`;
    if (days === 1) return `gestern, ${time}`;
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() === today.getFullYear() ? '' : d.getFullYear()}`;
  }

  function buildDocs() {
    const { docs, docId } = getState();
    const sorted = [...docs].sort((a, b) => b.updated - a.updated);
    docsEl.innerHTML = `
      <div class="popover-head">
        <h3>Meine Texte</h3>
        <div class="head-actions">
          <button class="btn btn-sm btn-primary" data-act="doc-new">${icon('plus')}<span>Neu</span></button>
          <button class="btn btn-icon btn-ghost" data-act="close-docs" aria-label="Schließen">${icon('close')}</button>
        </div>
      </div>
      <div class="doc-list" role="list"></div>
      <p class="docs-note">Alle Texte werden automatisch gespeichert – inklusive Radierungen.</p>`;
    const list = docsEl.querySelector('.doc-list');
    for (const d of sorted) {
      const row = document.createElement('div');
      row.className = `doc-row${d.id === docId ? ' active' : ''}`;
      row.setAttribute('role', 'listitem');
      const words = d.text.trim() ? d.text.trim().split(/\s+/).length : 0;
      row.innerHTML = `
        <button class="doc-open" data-id="${esc(d.id)}">
          <span class="doc-title"></span>
          <span class="doc-meta">${esc(when(d.updated))} · ${words} ${words === 1 ? 'Wort' : 'Wörter'}</span>
        </button>
        <button class="btn btn-icon btn-ghost doc-delete" data-id="${esc(d.id)}" aria-label="Text löschen">${icon('trash')}</button>`;
      row.querySelector('.doc-title').textContent = docTitle(d.text);
      list.append(row);
    }
  }

  function setDocsOpen(open) {
    if (open) {
      setPopover(false);
      if (eraserOn) setEraser(false);
      buildDocs();
      // Unter dem Button anzeigen
      const r = $('[data-act="docs"]').getBoundingClientRect();
      docsEl.style.top = `${r.bottom + 8}px`;
      docsEl.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - 372))}px`;
    }
    docsEl.hidden = !open;
    $('[data-act="docs"]').setAttribute('aria-expanded', open);
    $('[data-act="docs"]').classList.toggle('active', open);
  }

  docsEl.addEventListener('click', async (e) => {
    const open = e.target.closest('.doc-open');
    const del = e.target.closest('.doc-delete');
    if (e.target.closest('[data-act="close-docs"]')) setDocsOpen(false);
    else if (e.target.closest('[data-act="doc-new"]')) {
      history.length = 0;
      newDoc();
      setDocsOpen(false);
      textarea.focus();
      toast('Neuer Text angelegt.', 'success');
    } else if (open) {
      history.length = 0;
      switchDoc(open.dataset.id);
      setDocsOpen(false);
    } else if (del) {
      const doc = getState().docs.find((d) => d.id === del.dataset.id);
      if (doc?.text.trim()) {
        const ok = await confirmDialog({ title: 'Text löschen?', message: `„${docTitle(doc.text)}“ wird gelöscht.`, confirm: 'Löschen', danger: true });
        if (!ok) return;
      }
      deleteDoc(del.dataset.id);
      buildDocs();
    }
  });

  // Klick außerhalb schließt Popover & Wort-Menü
  document.addEventListener('pointerdown', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !e.target.closest('[data-act="pen"]')) setPopover(false);
    if (!docsEl.hidden && !docsEl.contains(e.target) && !e.target.closest('[data-act="docs"]') && !e.target.closest('.dialog')) setDocsOpen(false);
    if (menuWord && !menuEl.contains(e.target)) closeWordMenu();
  });

  // ── Tastenkürzel (iPad mit Tastatur, Mac, PC) ─────────────
  document.addEventListener('keydown', (e) => {
    if (!app.isVisible('schreiben') || document.querySelector('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const inText = !!e.target.closest?.('input, textarea');
    if (mod && e.shiftKey && key === 'c') {
      e.preventDefault();
      busy($('[data-act="copy"]'), onCopy);
    } else if (mod && e.shiftKey && key === 's') {
      e.preventDefault();
      busy($('[data-act="pdf"]'), onPdf);
    } else if (mod && !e.shiftKey && key === 'e') {
      e.preventDefault();
      setEraser(!eraserOn);
    } else if (mod && !e.shiftKey && key === 'z' && !inText && history.length) {
      e.preventDefault();
      $('[data-act="undo-edit"]').click();
    } else if (key === 'escape') {
      setPopover(false);
      setDocsOpen(false);
      closeWordMenu();
      if (eraserOn) setEraser(false);
    }
  });

  // ── Export ───────────────────────────────────────────────
  function readyForExport() {
    // Gerade getippten Text sofort übernehmen (nicht erst nach der Tipp-Pause)
    clearTimeout(typingTimer);
    if (textarea.value !== getState().text) setText(textarea.value);
    const { text, font } = getState();
    if (!Object.keys(font.glyphs).length) {
      toast('Richte zuerst deine Schrift ein.', 'error');
      return false;
    }
    if (!text.trim()) {
      toast('Schreib erst etwas ins Textfeld.', 'error');
      return false;
    }
    return true;
  }

  function warnMissing(l) {
    if (l.missingChars.length) {
      toast(`${l.missingChars.length} fehlende Zeichen wurden ausgelassen.`, 'info', 3400);
    }
  }

  async function onCopy() {
    if (!readyForExport()) return;
    const { pen } = getState();
    // Ganzer Text ohne Seitenumbrüche = ein langes Bild
    const l = compute({ continuous: true });
    try {
      await copyImage(strokesToPng(l.pages[0], pen));
      toast('Kopiert! Jetzt in Goodnotes einfügen.', 'success');
      warnMissing(l);
    } catch (err) {
      toast(err.message || 'Kopieren hat nicht geklappt.', 'error', 4000);
    }
  }

  async function onCopyPage(index) {
    const { pen } = getState();
    try {
      await copyImage(strokesToPng(layout.pages[index], pen));
      toast(`Seite ${index + 1} kopiert!`, 'success');
    } catch (err) {
      toast(err.message || 'Kopieren hat nicht geklappt.', 'error', 4000);
    }
  }

  async function onPng() {
    if (!readyForExport()) return;
    const { pen } = getState();
    const l = compute();
    const pages = l.pages.filter((p) => p.strokes.length);
    const files = [];
    for (const [i, page] of pages.entries()) {
      const blob = await strokesToPng(page, pen);
      const suffix = pages.length > 1 ? ` – Seite ${i + 1}` : '';
      files.push(new File([blob], fileName('png', suffix), { type: 'image/png' }));
    }
    const result = await shareOrDownload(files);
    if (result === 'downloaded') toast(files.length > 1 ? `${files.length} Bilder gespeichert.` : 'Bild gespeichert.', 'success');
    warnMissing(l);
  }

  async function onPdf() {
    if (!readyForExport()) return;
    const { pen } = getState();
    const l = compute();
    const blob = await createPdf(l, pen, { paper: pen.paperInPdf });
    const file = new File([blob], fileName('pdf'), { type: 'application/pdf' });
    const result = await shareOrDownload([file]);
    if (result === 'downloaded') toast('PDF gespeichert.', 'success');
    warnMissing(l);
  }

  async function onPaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return toast('Die Zwischenablage ist leer.');
      textarea.value = text;
      setText(text);
      toast('Text eingefügt.', 'success');
    } catch {
      textarea.focus();
      toast('Tippe lange ins Textfeld und wähle „Einsetzen“.', 'info', 3400);
    }
  }

  async function onClear() {
    // Bei längeren Texten lieber nachfragen
    if (textarea.value.length > 80) {
      const ok = await confirmDialog({ title: 'Text löschen?', message: 'Der komplette Text im Textfeld wird entfernt.', confirm: 'Löschen', danger: true });
      if (!ok) return;
    }
    textarea.value = '';
    history.length = 0;
    update({ text: '', edits: structuredClone(EMPTY_EDITS) });
    textarea.focus();
  }

  /** Button zeigt einen Lade-Kreisel, solange fn() arbeitet */
  function busy(btn, fn) {
    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading');
    // fn() wird SOFORT aufgerufen (wichtig für Zwischenablage & Teilen auf dem iPad)
    Promise.resolve(fn()).finally(() => btn.classList.remove('loading'));
  }

  // ── Klicks verteilen ─────────────────────────────────────
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'copy') busy(btn, onCopy);
    else if (act === 'png') busy(btn, onPng);
    else if (act === 'pdf') busy(btn, onPdf);
    else if (act === 'pen') setPopover(popover.hidden);
    else if (act === 'docs') setDocsOpen(docsEl.hidden);
    else if (act === 'sample') {
      textarea.value = SAMPLE;
      setText(SAMPLE);
    }
    else if (act === 'eraser') setEraser(!eraserOn);
    else if (act === 'eraser-done') setEraser(false);
    else if (act === 'gn-tip') showGoodnotesTip();
    else if (act === 'undo-edit') {
      const prev = history.pop();
      if (prev) setEdits(remapEdits(prev, getState().edits.key));
    } else if (act === 'reset-edits') {
      pushHistory();
      setEdits({ key: getState().edits.key, erased: {}, reroll: {} });
      toast('Alle Radierungen zurückgesetzt.', 'success');
    } else if (act.startsWith('wm-')) wordAction(act);
    else if (act === 'shuffle') {
      update({ pen: { ...getState().pen, seed: (Math.random() * 1e9) >>> 0 } });
    } else if (act === 'paste') onPaste();
    else if (act === 'clear') onClear();
    else if (act === 'setup') app.navigate('schrift');
    else if (act === 'copy-page') busy(btn, () => onCopyPage(Number(btn.closest('.page').dataset.index)));
  });

  subscribe((state, patch) => {
    if ('text' in patch && textarea.value !== state.text && (document.activeElement !== textarea || 'docId' in patch)) {
      textarea.value = state.text;
    }
    if ('docId' in patch) closeWordMenu();
    if ('ui' in patch) modeSwitch.setValue(state.ui.eraseMode);
    if (menuWord && ('edits' in patch || 'text' in patch || 'pen' in patch)) closeWordMenu();
    schedule();
  });
  new ResizeObserver(() => {
    closeWordMenu();
    schedule();
  }).observe(pagesEl);

  return {
    el,
    show() {
      if (dirty) schedule();
    },
    hide() {
      setPopover(false);
      setDocsOpen(false);
      setEraser(false);
    },
  };
}
