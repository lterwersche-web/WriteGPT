// ─────────────────────────────────────────────────────────────
// ui.js – Wiederverwendbare UI-Bausteine
// ─────────────────────────────────────────────────────────────

import { icon } from './icons.js';

/** Kurzer Hinweis unten am Bildschirm ("Kopiert ✓") */
export function toast(message, type = 'info', ms = 2600) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const ic = type === 'success' ? 'check' : type === 'error' ? 'warning' : 'sparkle';
  el.innerHTML = `${icon(ic)}<span></span>`;
  el.querySelector('span').textContent = message;
  host.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Schöner Bestätigungs-Dialog. Gibt true/false zurück. */
export function confirmDialog({ title, message, confirm = 'OK', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <h3></h3>
      <p></p>
      <div class="dialog-actions">
        <button class="btn" value="cancel"></button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok"></button>
      </div>`;
    dlg.querySelector('h3').textContent = title;
    dlg.querySelector('p').textContent = message;
    const [btnCancel, btnOk] = dlg.querySelectorAll('button');
    btnCancel.textContent = cancel;
    btnOk.textContent = confirm;
    const close = (result) => {
      dlg.close();
      dlg.remove();
      resolve(result);
    };
    btnCancel.onclick = () => close(false);
    btnOk.onclick = () => close(true);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * Info-Fenster mit einem Button. body = HTML (nur eigene, feste Texte!)
 */
export function infoDialog({ title, body, confirm = 'Alles klar' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog dialog-info';
    dlg.innerHTML = `<h3></h3><div class="dialog-body">${body}</div>
      <div class="dialog-actions"><button class="btn btn-primary"></button></div>`;
    dlg.querySelector('h3').textContent = title;
    const btn = dlg.querySelector('button');
    btn.textContent = confirm;
    const close = () => {
      dlg.close();
      dlg.remove();
      resolve();
    };
    btn.onclick = close;
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Erklärt, warum Goodnotes eingefügte Schrift nicht radieren kann – und was trotzdem geht */
export function showGoodnotesTip() {
  return infoDialog({
    title: 'Radieren in Goodnotes',
    body: `
      <p>Der Goodnotes-Radierer entfernt nur Striche, die <strong>direkt in Goodnotes</strong> gezeichnet wurden.
      Eingefügte Bilder und PDFs kann er nicht radieren – das liegt an Goodnotes, nicht an WriteGPT.</p>
      <ol class="tip-list">
        <li><strong>Am besten vorher:</strong> Hier in WriteGPT mit dem Radierer wegwischen oder ein Wort antippen
          → „Neu würfeln“. Erst danach kopieren.</li>
        <li><strong>Weiß-Trick in Goodnotes:</strong> Stift in Papierfarbe (meist Weiß) wählen und über die Stelle
          malen – sieht aus wie wegradiert. Klappt nur auf weißem bzw. einfarbigem Papier.</li>
        <li><strong>Ganzes Bild weg:</strong> Lasso-Werkzeug → Bild auswählen → Löschen.</li>
      </ol>`,
  });
}

/**
 * Segment-Schalter (wie bei iOS): [ A | B | C ]
 * options = [{ value, label }], onChange(value)
 */
export function segmented(options, value, onChange, { small = false } = {}) {
  const el = document.createElement('div');
  el.className = `segmented${small ? ' segmented-sm' : ''}`;
  el.setAttribute('role', 'radiogroup');
  const set = (v) => {
    for (const b of el.children) {
      const on = b.dataset.value === String(v);
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    }
  };
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.value = o.value;
    b.setAttribute('role', 'radio');
    b.textContent = o.label;
    b.onclick = () => {
      set(o.value);
      onChange(o.value);
    };
    el.append(b);
  }
  set(value);
  el.setValue = set;
  return el;
}

/** An/Aus-Schalter (wie bei iOS) */
export function toggle(checked, onChange, label = '') {
  const el = document.createElement('label');
  el.className = 'switch';
  el.innerHTML = '<input type="checkbox" role="switch"><span class="switch-track"></span>';
  const input = el.querySelector('input');
  input.checked = checked;
  if (label) input.setAttribute('aria-label', label);
  input.onchange = () => onChange(input.checked);
  el.setValue = (v) => (input.checked = v);
  return el;
}

/**
 * Schieberegler mit Beschriftung + Wert.
 * format(v) → Text für die Anzeige, z.B. "4,5 mm"
 */
export function slider({ label, min, max, step, value, format, onInput }) {
  const el = document.createElement('div');
  el.className = 'slider-row';
  el.innerHTML = `
    <div class="slider-head"><span class="slider-label"></span><span class="slider-value"></span></div>
    <input type="range">`;
  el.querySelector('.slider-label').textContent = label;
  const out = el.querySelector('.slider-value');
  const input = el.querySelector('input');
  Object.assign(input, { min, max, step, value });
  input.setAttribute('aria-label', label);
  const paint = () => {
    out.textContent = format(Number(input.value));
    const pct = ((input.value - min) / (max - min)) * 100;
    input.style.setProperty('--pct', `${pct}%`);
  };
  input.oninput = () => {
    paint();
    onInput(Number(input.value));
  };
  paint();
  el.setValue = (v) => {
    input.value = v;
    paint();
  };
  return el;
}

/** Zahl deutsch formatieren: 4.5 → "4,5" */
export function de(n, digits = 1) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** HTML-Sonderzeichen entschärfen (Sicherheit!) */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
