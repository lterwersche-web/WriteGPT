// ─────────────────────────────────────────────────────────────
// views/write.js – ✍️ Schreiben: Text links, Vorschau rechts
// ─────────────────────────────────────────────────────────────

import { getState, update, subscribe } from '../state.js';
import { parseChatText } from '../markdown.js';
import { layoutDocument, PAGE_FORMATS } from '../layout.js';
import { renderPage } from '../render.js';
import { createPdf } from '../pdf.js';
import { strokesToPng, copyImage, shareOrDownload, fileName } from '../export.js';
import { setForChar } from '../charsets.js';
import { icon } from '../icons.js';
import { toast, confirmDialog, segmented, toggle, slider, de, esc } from '../ui.js';

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
        <div class="preview-scroll"><div class="pages"></div></div>
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
      <button class="btn" data-act="pen" aria-expanded="false">${icon('sliders')}<span>Stift &amp; Papier</span></button>
    </div>

    <div class="popover pen-popover" hidden role="dialog" aria-label="Stift und Papier"></div>
  `;

  const $ = (s) => el.querySelector(s);
  const textarea = $('.text-input');
  const pagesEl = $('.pages');
  const popover = $('.pen-popover');

  textarea.value = getState().text;

  // ── Text-Eingabe ─────────────────────────────────────────
  let typingTimer;
  textarea.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => update({ text: textarea.value }), 150);
  });

  // ── Layout berechnen + Vorschau malen ────────────────────
  let layout = null;
  let dirty = true;
  let frame = 0;

  function compute() {
    const { font, pen, text } = getState();
    const blocks = parseChatText(text);
    return { blocks, layout: layoutDocument(blocks, font, pen) };
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
    $('.preview-scroll').hidden = !hasFont;
    $('.char-count').textContent = `${text.length.toLocaleString('de-DE')} Zeichen`;

    layout = compute().layout;
    const n = layout.pages.length;
    $('.page-count').textContent = `${n} ${n === 1 ? 'Seite' : 'Seiten'}`;
    renderMissing(layout.missingChars);
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
      renderPage(canvas, layout.pages[i], layout.geo, pen, { scale, paper: true, missing: true });
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
    if (open) buildPenPanel();
    popover.hidden = !open;
    $('[data-act="pen"]').setAttribute('aria-expanded', open);
    $('[data-act="pen"]').classList.toggle('active', open);
  }

  // Klick außerhalb schließt das Popover
  document.addEventListener('pointerdown', (e) => {
    if (popover.hidden) return;
    if (popover.contains(e.target) || e.target.closest('[data-act="pen"]')) return;
    setPopover(false);
  });

  // ── Export ───────────────────────────────────────────────
  function readyForExport() {
    // Gerade getippten Text sofort übernehmen (nicht erst nach der Tipp-Pause)
    clearTimeout(typingTimer);
    if (textarea.value !== getState().text) update({ text: textarea.value });
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
    const { font, pen, text } = getState();
    // Ganzer Text ohne Seitenumbrüche = ein langes Bild
    const l = layoutDocument(parseChatText(text), font, pen, { continuous: true });
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
    const l = compute().layout;
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
    const l = compute().layout;
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
      update({ text });
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
    update({ text: '' });
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
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'copy') busy(btn, onCopy);
    else if (act === 'png') busy(btn, onPng);
    else if (act === 'pdf') busy(btn, onPdf);
    else if (act === 'pen') setPopover(popover.hidden);
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
    schedule();
  });
  new ResizeObserver(() => schedule()).observe(pagesEl);

  return {
    el,
    show() {
      if (dirty) schedule();
    },
    hide() {
      setPopover(false);
    },
  };
}
