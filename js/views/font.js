// ─────────────────────────────────────────────────────────────
// views/font.js – 🔤 Meine Schrift: einrichten + Schritt für Schritt zeichnen
// ─────────────────────────────────────────────────────────────
// Drei Modi:
//   'setup' → Fragen: Schreibstil, Varianten, Zeichen
//   'draw'  → Ein Zeichen nach dem anderen zeichnen (a, a, a, b, b, b …)
//   'done'  → Fertig-Bildschirm mit Beispielsatz

import { getState, update, subscribe, setGlyph, getGlyph } from '../state.js';
import { CHAR_SETS, buildSteps, describeChar, setForChar, SAMPLE_TEXT } from '../charsets.js';
import { GlyphEditor, drawThumb } from '../editor.js';
import { STYLES, layoutDocument } from '../layout.js';
import { parseChatText } from '../markdown.js';
import { drawStrokes, contentBounds } from '../render.js';
import { icon } from '../icons.js';
import { toast, segmented, toggle, esc } from '../ui.js';

const SECONDS_PER_DRAWING = 5;

// Mini-Illustrationen für die drei Schreibstile
const STYLE_ART = {
  print: '<svg viewBox="0 0 120 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30c-6 0-8-12 0-12 5 0 6 4 6 6v6"/><path d="M34 8v22m0-6c0-4 3-6 6-6s6 2 6 6-3 6-6 6-6-2-6-6"/><path d="M68 20c-2-2-4-2-6-2-4 0-6 3-6 6s2 6 6 6c2 0 4-1 6-2"/><path d="M84 18v12m0-6c0-4 2-6 6-6"/><path d="M104 18v12"/><circle cx="104" cy="11" r="1" fill="currentColor"/></svg>',
  semi: '<svg viewBox="0 0 120 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 30c4 0 6-2 8-4 0-5-1-8-4-8-4 0-5 7-1 10 3 2 6 0 8-3v5c2 0 4-2 6-4"/><path d="M27 26c2-8 3-18 6-18s0 14-1 22c2-6 5-10 8-10s4 4 2 8c-2 3-6 3-8 1"/><path d="M66 20c-2-2-4-2-6-2-4 0-6 3-6 6s2 6 6 6c3 0 6-2 8-4"/><path d="M84 18v12m0-6c0-4 2-6 6-6"/><path d="M104 18v12"/><circle cx="104" cy="11" r="1" fill="currentColor"/></svg>',
  cursive: '<svg viewBox="0 0 120 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 30c4 0 8-2 10-5 0-5-1-7-4-7-4 0-5 7-1 10 3 2 6 0 8-3v5c3 0 6-4 9-10 3-8 4-12 3-12-3 0-4 12-3 22 2-6 5-10 8-10s4 4 2 8c-2 3-5 3-6 1 4 2 8-1 11-4 2-2 4-4 7-4-3 0-6 3-6 6s3 5 6 4c3-1 5-4 8-6 1 3 0 6 0 6 2-4 4-6 7-6 2 2 4 6 7 6 2 0 4-2 6-6v6c2 0 4-2 6-4"/><circle cx="76" cy="18" r="1" fill="currentColor"/></svg>',
};

const STYLE_TEXT = {
  print: 'Buchstaben stehen einzeln nebeneinander.',
  semi: 'Manche Buchstaben gehen ineinander über.',
  cursive: 'Alles verbunden – zeichne An- und Abstriche mit.',
};

export function createFontView(app) {
  const el = document.createElement('section');
  el.className = 'view view-font';

  let mode = null; // 'setup' | 'draw' | 'done'
  let step = 0;
  let steps = [];
  let editor = null;

  const font = () => getState().font;
  const isDone = (s) => !!getGlyph(s.ch, s.variant);
  const doneCount = () => steps.filter(isDone).length;

  function refreshSteps() {
    steps = buildSteps(font());
  }

  // ════════════════════════════════════════════════════════
  // 1) EINRICHTUNG
  // ════════════════════════════════════════════════════════
  function setMode(m) {
    mode = m;
    el.classList.toggle('is-drawing', m === 'draw');
  }

  function renderSetup() {
    setMode('setup');
    editor = null;
    const f = font();
    // Entwurf: wird erst bei "Los geht's" gespeichert
    const draft = { style: f.style, variants: f.variants, sets: { ...f.sets } };
    const editing = f.configured;

    el.innerHTML = `
      <div class="narrow">
        <header class="page-head">
          <h1>${editing ? 'Einrichtung ändern' : 'Meine Schrift einrichten'}</h1>
          <p>Drei kurze Fragen – dann zeichnest du Schritt für Schritt deine Buchstaben.</p>
          <span class="chip chip-soft font-chip">${icon('font')}${esc(f.name ?? 'Meine Schrift')}</span>
        </header>

        <section class="card setup-card">
          <div class="setup-title"><span class="step-num">1</span><h3>Wie schreibst du?</h3></div>
          <div class="choice-grid style-choices"></div>
        </section>

        <section class="card setup-card">
          <div class="setup-title"><span class="step-num">2</span><h3>Wie oft willst du jedes Zeichen zeichnen?</h3></div>
          <p class="muted">Mehr Varianten = echtere Schrift. Beim Schreiben wechselt die App zufällig zwischen ihnen – so sieht nicht jedes „e“ gleich aus.</p>
          <div class="slot-variants"></div>
          <div class="variant-demo"></div>
        </section>

        <section class="card setup-card">
          <div class="setup-title"><span class="step-num">3</span><h3>Welche Zeichen brauchst du?</h3></div>
          <div class="set-list"></div>
        </section>

        <div class="setup-foot">
          <div class="summary"></div>
          <button class="btn btn-primary btn-lg" data-act="start">${editing ? 'Speichern' : 'Los geht’s'} ${icon('right')}</button>
        </div>
      </div>`;

    // Schreibstil
    const styleGrid = el.querySelector('.style-choices');
    for (const [id, s] of Object.entries(STYLES)) {
      const b = document.createElement('button');
      b.className = 'choice';
      b.dataset.value = id;
      b.innerHTML = `<div class="choice-art">${STYLE_ART[id]}</div><strong>${s.label}</strong><span>${STYLE_TEXT[id]}</span>`;
      b.onclick = () => {
        draft.style = id;
        paintStyle();
      };
      styleGrid.append(b);
    }
    const paintStyle = () => {
      for (const b of styleGrid.children) b.classList.toggle('active', b.dataset.value === draft.style);
    };
    paintStyle();

    // Varianten
    const demo = el.querySelector('.variant-demo');
    const paintDemo = () => {
      // Zeigt die Reihenfolge: a₁ → a₂ → a₃ → b₁ …
      demo.innerHTML = 'Reihenfolge: ' +
        Array.from({ length: draft.variants }, (_, i) => `<span>a<sub>${i + 1}</sub></span>`).join('<i>→</i>') +
        '<i>→</i><span>b<sub>1</sub></span><i>→</i><span class="muted">…</span>';
    };
    el.querySelector('.slot-variants').append(
      segmented(
        [1, 2, 3].map((v) => ({ value: v, label: `${v}×` })),
        draft.variants,
        (v) => {
          draft.variants = Number(v);
          paintDemo();
          paintSummary();
        },
      ),
    );
    paintDemo();

    // Zeichen-Sets
    const list = el.querySelector('.set-list');
    for (const set of CHAR_SETS) {
      const row = document.createElement('div');
      row.className = 'set-row';
      const preview = [...set.chars].slice(0, 14).join(' ') + (set.chars.length > 14 ? ' …' : '');
      row.innerHTML = `
        <div class="set-text">
          <strong>${set.name} <span class="chip">${[...set.chars].length}</span></strong>
          <span class="set-chars">${esc(preview)}</span>
        </div>`;
      if (set.required) {
        row.insertAdjacentHTML('beforeend', '<span class="chip chip-soft">immer dabei</span>');
      } else {
        row.append(
          toggle(!!draft.sets[set.id], (v) => {
            draft.sets[set.id] = v;
            paintSummary();
          }, set.name),
        );
      }
      list.append(row);
    }

    const paintSummary = () => {
      const count = CHAR_SETS.filter((s) => s.required || draft.sets[s.id]).reduce((n, s) => n + [...s.chars].length, 0);
      const total = count * draft.variants;
      const minutes = Math.max(1, Math.round((total * SECONDS_PER_DRAWING) / 60));
      el.querySelector('.summary').innerHTML =
        `<strong>${count} Zeichen × ${draft.variants} = ${total} Zeichnungen</strong><span>ca. ${minutes} Minuten · Fortschritt wird automatisch gespeichert</span>`;
    };
    paintSummary();

    el.querySelector('[data-act="start"]').onclick = () => {
      update({ font: { ...font(), ...draft, configured: true } });
      refreshSteps();
      const first = steps.findIndex((s) => !isDone(s));
      if (first === -1) renderDone();
      else renderDraw(first);
    };
  }

  // ════════════════════════════════════════════════════════
  // 2) ZEICHNEN – Schritt für Schritt
  // ════════════════════════════════════════════════════════
  function renderDraw(index) {
    setMode('draw');
    refreshSteps();
    step = Math.max(0, Math.min(index, steps.length - 1));

    el.innerHTML = `
      <div class="draw-wrap">
        <div class="draw-top">
          <button class="btn btn-ghost btn-sm" data-act="setup">${icon('left')}<span>Einrichtung</span></button>
          <div class="progress" role="progressbar" aria-label="Fortschritt">
            <div class="progress-bar"><span></span></div>
            <span class="progress-label"></span>
          </div>
          <label class="jump">
            ${icon('search')}
            <input type="text" maxlength="2" placeholder="Springe zu …" aria-label="Zu Zeichen springen" autocapitalize="off" autocomplete="off" spellcheck="false">
          </label>
          <button class="btn btn-ghost btn-sm" data-act="finish" hidden>${icon('check')}<span>Fertig</span></button>
        </div>

        <div class="draw-grid">
          <aside class="card char-card">
            <div class="char-big"></div>
            <div class="char-meta">
              <div class="char-title"></div>
              <div class="char-variant"></div>
            </div>
            <div class="variant-thumbs"></div>
            <p class="char-hint"></p>
          </aside>

          <div class="card pad-card">
            <div class="pad-head">
              <span class="muted pad-label">Zeichne hier</span>
              <div class="head-actions">
                <button class="btn btn-ghost btn-sm" data-act="template" aria-pressed="false" title="Andere Variante blass im Hintergrund zeigen">${icon('eye')}<span>Vorlage</span></button>
                <button class="btn btn-ghost btn-sm" data-act="undo">${icon('undo')}<span>Rückgängig</span></button>
                <button class="btn btn-ghost btn-sm" data-act="clear">${icon('trash')}<span>Leeren</span></button>
              </div>
            </div>
            <div class="pad-host"></div>
          </div>
        </div>

        <div class="draw-nav">
          <button class="btn btn-lg" data-act="prev">${icon('left')}<span>Zurück</span></button>
          <div class="spacer"></div>
          <button class="btn btn-lg btn-ghost" data-act="skip">${icon('skip')}<span>Überspringen</span></button>
          <button class="btn btn-lg btn-primary" data-act="next"><span>Weiter</span>${icon('right')}</button>
        </div>
      </div>`;

    // Jede Änderung im Zeichenfeld sofort speichern
    editor = new GlyphEditor(el.querySelector('.pad-host'), {
      onChange: () => {
        const s = steps[step];
        setGlyph(s.ch, s.variant, editor.getData());
        paintDrawState();
      },
    });

    const jump = el.querySelector('.jump input');
    jump.addEventListener('input', () => {
      const ch = [...jump.value.trim()].pop();
      if (!ch) return;
      jump.value = '';
      jump.blur();
      jumpToChar(ch);
    });

    loadStep();
  }

  function loadStep() {
    const s = steps[step];
    const info = describeChar(s.ch);
    const n = font().variants;
    el.querySelector('.char-big').textContent = s.ch;
    el.querySelector('.char-title').textContent = info.title;
    el.querySelector('.char-variant').textContent = n > 1 ? `Variante ${s.variant + 1} von ${n}` : '';
    el.querySelector('.char-hint').textContent =
      font().style === 'cursive' && /\p{L}/u.test(s.ch)
        ? `${info.hint} Zeichne den Verbindungsstrich am Anfang und Ende mit.`
        : info.hint;
    editor.setData(getGlyph(s.ch, s.variant));
    editor.setHint(n > 1 && s.variant > 0 ? 'Nochmal – diesmal ein bisschen anders' : '');
    paintTemplate();
    paintThumbs();
    paintDrawState();
  }

  /** Vorlage = eine andere, schon gezeichnete Variante desselben Zeichens */
  function paintTemplate() {
    const on = getState().ui.showTemplate !== false;
    const btn = el.querySelector('[data-act="template"]');
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on);
    const s = steps[step];
    const n = font().variants;
    let tpl = null;
    if (on && n > 1) {
      // Reihenfolge: erst die Varianten davor (nächste zuerst), dann die danach
      const before = [...Array(s.variant).keys()].reverse(); // z.B. 1, 0
      const after = [...Array(n).keys()].filter((v) => v > s.variant); // z.B. 2
      for (const v of [...before, ...after]) {
        tpl = getGlyph(s.ch, v);
        if (tpl) break;
      }
    }
    btn.hidden = n < 2;
    editor.setTemplate(tpl);
  }

  function paintThumbs() {
    const s = steps[step];
    const n = font().variants;
    const wrap = el.querySelector('.variant-thumbs');
    wrap.hidden = n < 2;
    wrap.innerHTML = '';
    for (let v = 0; v < n; v++) {
      const b = document.createElement('button');
      b.className = `thumb${v === s.variant ? ' active' : ''}`;
      b.setAttribute('aria-label', `Variante ${v + 1}`);
      b.innerHTML = `<canvas></canvas><span>${v + 1}</span>`;
      b.onclick = () => goTo(steps.findIndex((x) => x.ch === s.ch && x.variant === v));
      wrap.append(b);
      requestAnimationFrame(() => drawThumb(b.querySelector('canvas'), getGlyph(s.ch, v)));
    }
  }

  function paintDrawState() {
    if (mode !== 'draw') return;
    const done = doneCount();
    const pct = steps.length ? (done / steps.length) * 100 : 0;
    el.querySelector('.progress-bar span').style.width = `${pct}%`;
    el.querySelector('.progress-label').textContent = `${done} / ${steps.length}`;
    el.querySelector('.progress').setAttribute('aria-valuenow', Math.round(pct));
    el.querySelector('[data-act="finish"]').hidden = done < steps.length;
    el.querySelector('[data-act="next"]').disabled = editor.isEmpty();
    el.querySelector('[data-act="prev"]').disabled = step === 0;
    const isLast = step === steps.length - 1;
    el.querySelector('[data-act="next"] span').textContent = isLast ? 'Fertig' : 'Weiter';
    el.querySelector('[data-act="skip"]').hidden = isLast;
    // Vorschaubild der aktuellen Variante aktualisieren
    const s = steps[step];
    const thumb = el.querySelectorAll('.thumb canvas')[s.variant];
    if (thumb) drawThumb(thumb, getGlyph(s.ch, s.variant));
  }

  function goTo(index) {
    if (index < 0 || index >= steps.length) return;
    step = index;
    loadStep();
  }

  function next() {
    if (step < steps.length - 1) goTo(step + 1);
    else renderDone();
  }

  /** Springt zu einem Zeichen – wenn angegeben, direkt zu einer bestimmten Variante */
  function jumpToChar(ch, variant = 0) {
    const exact = steps.findIndex((s) => s.ch === ch && s.variant === variant);
    const idx = exact >= 0 ? exact : steps.findIndex((s) => s.ch === ch);
    if (idx >= 0) {
      if (mode !== 'draw') renderDraw(idx);
      else goTo(idx);
      return;
    }
    const set = setForChar(ch);
    if (set && !set.required) {
      // Optionales Set aktivieren und hinspringen
      update({ font: { ...font(), configured: true, sets: { ...font().sets, [set.id]: true } } });
      toast(`${set.name} wurden aktiviert.`, 'success');
      refreshSteps();
      renderDraw(steps.findIndex((s) => s.ch === ch));
      return;
    }
    toast(`„${ch}“ kann man (noch) nicht zeichnen.`, 'error');
  }

  // ════════════════════════════════════════════════════════
  // 3) FERTIG
  // ════════════════════════════════════════════════════════
  function renderDone() {
    setMode('done');
    editor = null;
    refreshSteps();
    const done = doneCount();
    const missing = steps.length - done;

    el.innerHTML = `
      <div class="narrow">
        <section class="card done-hero">
          <div class="done-badge ${missing ? 'warn' : ''}">${icon(missing ? 'warning' : 'check')}</div>
          <h1>${missing ? 'Fast fertig!' : 'Deine Schrift ist ready!'}</h1>
          <p>${missing
            ? `${done} von ${steps.length} Zeichnungen sind gespeichert – ${missing} fehlen noch. Fehlende Zeichen werden beim Schreiben ersetzt oder ausgelassen.`
            : `Alle ${steps.length} Zeichnungen sind gespeichert. So sieht deine Handschrift aus:`}</p>
          <div class="sample"><canvas></canvas></div>
          <div class="done-actions">
            ${missing ? `<button class="btn btn-lg" data-act="draw-missing">${icon('pen')}<span>Fehlende zeichnen</span></button>` : ''}
            <button class="btn btn-primary btn-lg" data-act="write"><span>Zum Schreiben</span>${icon('right')}</button>
          </div>
        </section>

        <section class="card list">
          <div class="row">
            <div class="row-text"><strong>Einzelnes Zeichen verbessern</strong><span>Tipp das Zeichen ein, z.B. „g“</span></div>
            <label class="jump">${icon('search')}<input type="text" maxlength="2" placeholder="Zeichen" aria-label="Zeichen verbessern" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          </div>
          <div class="row">
            <div class="row-text"><strong>Alles nochmal durchgehen</strong><span>Startet bei „${esc(steps[0]?.ch ?? 'a')}“ – deine Zeichnungen bleiben erhalten</span></div>
            <button class="btn btn-sm" data-act="restart">Von vorne</button>
          </div>
          <div class="row">
            <div class="row-text"><strong>Einrichtung ändern</strong><span>Schreibstil, Varianten oder Zeichen</span></div>
            <button class="btn btn-sm" data-act="setup">Ändern</button>
          </div>
        </section>
      </div>`;

    const jump = el.querySelector('.jump input');
    jump.addEventListener('input', () => {
      const ch = [...jump.value.trim()].pop();
      if (!ch) return;
      jump.value = '';
      jumpToChar(ch);
    });

    requestAnimationFrame(paintSample);
  }

  function paintSample() {
    const canvas = el.querySelector('.sample canvas');
    if (!canvas) return;
    const { pen } = getState();
    const l = layoutDocument(parseChatText(SAMPLE_TEXT), font(), { ...pen, format: 'A5', size: 6, lineHeight: 12 }, { continuous: true });
    const page = l.pages[0];
    const b = contentBounds(page);
    const cssW = canvas.parentElement.clientWidth;
    if (!b || !cssW) return;
    const pad = 3;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min((cssW * dpr) / (b.width + pad * 2), 8 * dpr);
    canvas.width = Math.round((b.width + pad * 2) * scale);
    canvas.height = Math.round((b.height + pad * 2) * scale);
    canvas.style.width = `${canvas.width / dpr}px`;
    drawStrokes(canvas.getContext('2d'), page.strokes, pen.color, scale, b.minX - pad, b.minY - pad);
  }

  // ── Klicks & Tastatur ────────────────────────────────────
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'setup') renderSetup();
    else if (act === 'undo') editor?.undo();
    else if (act === 'template') {
      update({ ui: { ...getState().ui, showTemplate: getState().ui.showTemplate === false } });
      paintTemplate();
    }
    else if (act === 'clear') editor?.clear();
    else if (act === 'prev') goTo(step - 1);
    else if (act === 'skip') goTo(step + 1);
    else if (act === 'next') next();
    else if (act === 'finish') renderDone();
    else if (act === 'write') app.navigate('schreiben');
    else if (act === 'restart') renderDraw(0);
    else if (act === 'draw-missing') renderDraw(steps.findIndex((s) => !isDone(s)));
  });

  document.addEventListener('keydown', (e) => {
    if (mode !== 'draw' || !app.isVisible('schrift')) return;
    if (e.target.closest('input, textarea, button')) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      editor.undo();
    } else if (e.key === 'Enter' && !editor.isEmpty()) next();
    else if (e.key === 'ArrowLeft') goTo(step - 1);
    else if (e.key === 'ArrowRight') goTo(step + 1);
  });

  // Einstellungen geändert (z.B. Varianten in "Einstellungen") → neu aufbauen
  subscribe((state, patch) => {
    if (!('font' in patch) || !app.isVisible('schrift')) return;
    if (mode === 'done') {
      refreshSteps();
      paintSample();
    }
  });

  window.addEventListener('resize', () => {
    if (mode === 'done') paintSample();
  });

  return {
    el,
    show(params = {}) {
      refreshSteps();
      if (params.drawChar) return jumpToChar(params.drawChar, params.variant ?? 0);
      if (!font().configured) return renderSetup();
      if (mode === 'draw') {
        // Weiter da, wo man war (Einstellungen könnten sich geändert haben)
        return renderDraw(Math.min(step, steps.length - 1));
      }
      if (mode === 'setup') return renderSetup();
      const first = steps.findIndex((s) => !isDone(s));
      if (first === -1) renderDone();
      else renderDraw(first);
    },
    hide() {},
  };
}
