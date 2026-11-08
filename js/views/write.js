// ─────────────────────────────────────────────────────────────
// views/write.js – ✍️ Schreiben: Text links, Vorschau rechts
// ─────────────────────────────────────────────────────────────
// Neu: Radierer (Buchstaben wegwischen) und Wort-Menü (Wort antippen →
// neu würfeln, wegradieren, wiederherstellen, Buchstabe neu zeichnen).

import { getState, update, subscribe, EMPTY_EDITS } from '../state.js';
import { parseChatText } from '../markdown.js';
import { layoutDocument, PAGE_FORMATS } from '../layout.js';
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

export function createWriteView(app) {
  const el = document.createElement('section');
  el.className = 'view view-write';
  el.innerHTML = `
    <div class="write-grid">
      <div class="card text-card">
        <div class="card-head">
          <h2>Dein Text</h2>
          <div class="head-actions">
            <button class="btn btn-ghost btn-sm" data-act="paste">${icon('paste')}<span>Einfügen</span></button>
            <button class="btn btn-ghost btn-sm" data-act="clear">${icon('trash')}<span>Leeren</span></button>
          </div>
        </div>
        <textarea class="text-input" spellcheck="false"
          placeholder="Füg hier deinen Text ein – zum Beispiel eine Antwort von ChatGPT.&#10;&#10;**Fett**, # Überschriften und - Listen werden automatisch umgewandelt."></textarea>
        <div class="missing-banner" hidden></div>
        <div class="card-foot"><span class="muted char-count">0 Zeichen</span></div>
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
    $('.char-count').textContent = `${text.length.toLocaleString('de-DE')} Zeichen`;

    layout = compute();
    const n = layout.pages.length;
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

  // ── Stift & Papier (Popover) ─────────────────────────────
  function buildPenPanel() {
    const { pen } = getState();
    const setPen = (patch) => update({ pen: { ...getState().pen, ...patch } });
    popover.innerHTML = `
      <div class="popover-head">
        <h3>Stift &amp; Papier</h3>
        <button class="btn btn-icon btn-ghost" data-act="close-pen" aria-label="Schließen">${icon('close')}</button>
      </div>
      <div class="popover-body">
        <section><h4>Tinte</h4><div class="swatches"></div><div class="slot-width"></div></section>
        <section><h4>Größe &amp; Abstände</h4><div class="slot-sizes"></div></section>
        <section><h4>Papier</h4><div class="slot-paper"></div></section>
        <button class="btn btn-ghost btn-sm reset-pen">Standard wiederherstellen</button>
      </div>`;

    // Farben
    const swatches = popover.querySelector('.swatches');
    const paintSwatches = () => {
      const c = getState().pen.color.toLowerCase();
      for (const s of swatches.querySelectorAll('.swatch')) {
        s.classList.toggle('active', s.dataset.color === c || (s.classList.contains('swatch-custom') && !INK_COLORS.some((i) => i.value === c)));
      }
    };
    for (const c of INK_COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.dataset.color = c.value;
      b.style.setProperty('--c', c.value);
      b.title = c.label;
      b.setAttribute('aria-label', c.label);
      b.onclick = () => {
        setPen({ color: c.value });
        paintSwatches();
      };
      swatches.append(b);
    }
    const custom = document.createElement('label');
    custom.className = 'swatch swatch-custom';
    custom.title = 'Eigene Farbe';
    custom.innerHTML = `${icon('plus')}<input type="color" aria-label="Eigene Farbe">`;
    const colorInput = custom.querySelector('input');
    colorInput.value = pen.color;
    colorInput.oninput = () => {
      setPen({ color: colorInput.value });
      paintSwatches();
    };
    swatches.append(custom);
    paintSwatches();

    popover.querySelector('.slot-width').append(
      slider({ label: 'Stiftdicke', min: 0.2, max: 1.4, step: 0.05, value: pen.width, format: (v) => `${de(v, 2)} mm`, onInput: (v) => setPen({ width: v }) }),
    );

    popover.querySelector('.slot-sizes').append(
      slider({ label: 'Schriftgröße', min: 2.5, max: 10, step: 0.1, value: pen.size, format: (v) => `${de(v)} mm`, onInput: (v) => setPen({ size: v }) }),
      slider({ label: 'Zeilenabstand', min: 5, max: 18, step: 0.1, value: pen.lineHeight, format: (v) => `${de(v)} mm`, onInput: (v) => setPen({ lineHeight: v }) }),
      slider({ label: 'Buchstabenabstand', min: -0.15, max: 0.4, step: 0.01, value: pen.letterSpacing, format: (v) => (v === 0 ? 'normal' : v < 0 ? 'enger' : 'weiter'), onInput: (v) => setPen({ letterSpacing: v }) }),
      slider({ label: 'Wortabstand', min: 0.25, max: 1.2, step: 0.01, value: pen.wordSpacing, format: (v) => `${Math.round(v * 100)} %`, onInput: (v) => setPen({ wordSpacing: v }) }),
      slider({ label: 'Natürlichkeit', min: 0, max: 1, step: 0.01, value: pen.jitter, format: (v) => (v < 0.05 ? 'sauber' : `${Math.round(v * 100)} %`), onInput: (v) => setPen({ jitter: v }) }),
    );

    const paperSlot = popover.querySelector('.slot-paper');
    paperSlot.append(
      segmented(
        [
          { value: 'blank', label: 'Blanko' },
          { value: 'lined', label: 'Liniert' },
          { value: 'grid', label: 'Kariert' },
          { value: 'dots', label: 'Punkte' },
        ],
        pen.paper,
        (v) => setPen({ paper: v }),
      ),
      segmented(
        Object.entries(PAGE_FORMATS).map(([value, f]) => ({ value, label: f.label })),
        pen.format,
        (v) => setPen({ format: v }),
      ),
    );
    const pdfRow = document.createElement('div');
    pdfRow.className = 'toggle-row';
    pdfRow.innerHTML = '<span>Papier-Linien im PDF</span>';
    pdfRow.append(toggle(pen.paperInPdf, (v) => setPen({ paperInPdf: v }), 'Papier-Linien im PDF'));
    paperSlot.append(pdfRow);

    popover.querySelector('.reset-pen').onclick = () => {
      app.resetPen();
      buildPenPanel();
    };
    popover.querySelector('[data-act="close-pen"]').onclick = () => setPopover(false);
  }

  function setPopover(open) {
    if (open) {
      buildPenPanel();
      if (eraserOn) setEraser(false);
      closeWordMenu();
    }
    popover.hidden = !open;
    $('[data-act="pen"]').setAttribute('aria-expanded', open);
    $('[data-act="pen"]').classList.toggle('active', open);
  }

  // Klick außerhalb schließt Popover & Wort-Menü
  document.addEventListener('pointerdown', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !e.target.closest('[data-act="pen"]')) setPopover(false);
    if (menuWord && !menuEl.contains(e.target)) closeWordMenu();
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
    if ('text' in patch && textarea.value !== state.text && document.activeElement !== textarea) {
      textarea.value = state.text;
    }
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
      setEraser(false);
    },
  };
}
