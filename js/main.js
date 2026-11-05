// ─────────────────────────────────────────────────────────────
// main.js – Startpunkt der App
// ─────────────────────────────────────────────────────────────
// Baut die Navigation oben, erstellt die drei Bereiche und
// schaltet zwischen ihnen um (über die Adresse: #schreiben usw.).

import { getState, update, onStorageError, DEFAULT_PEN } from './state.js';
import { createWriteView } from './views/write.js';
import { createFontView } from './views/font.js';
import { createSettingsView } from './views/settings.js';
import { icon } from './icons.js';
import { toast } from './ui.js';

const TABS = [
  { id: 'schreiben', label: 'Schreiben', icon: 'pen' },
  { id: 'schrift', label: 'Meine Schrift', icon: 'font' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'gear' },
];

let current = null;

// Das "app"-Objekt geben wir an alle Bereiche weiter,
// damit sie z.B. zu einem anderen Bereich wechseln können.
const app = {
  navigate(id, params) {
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    show(id, params);
  },
  isVisible(id) {
    return current === id;
  },
  resetPen() {
    update({ pen: { ...DEFAULT_PEN, seed: getState().pen.seed } });
  },
};

const views = {
  schreiben: createWriteView(app),
  schrift: createFontView(app),
  einstellungen: createSettingsView(app),
};

// ── Navigation oben ──────────────────────────────────────────
const nav = document.querySelector('.tabs');
for (const tab of TABS) {
  const a = document.createElement('a');
  a.href = `#${tab.id}`;
  a.className = 'tab';
  a.dataset.tab = tab.id;
  a.innerHTML = `${icon(tab.icon)}<span>${tab.label}</span>`;
  nav.append(a);
}

const main = document.querySelector('main');
for (const v of Object.values(views)) {
  v.el.hidden = true;
  main.append(v.el);
}

function show(id, params) {
  if (!views[id]) id = 'schreiben';
  if (current && current !== id) {
    views[current].hide();
    views[current].el.hidden = true;
  }
  current = id;
  views[id].el.hidden = false;
  for (const t of nav.children) {
    const on = t.dataset.tab === id;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  document.body.dataset.view = id;
  views[id].show(params);
}

window.addEventListener('hashchange', () => show(location.hash.slice(1)));

// Start: Noch keine Schrift? → direkt zur Einrichtung
const hasFont = Object.keys(getState().font.glyphs).length > 0;
show(location.hash.slice(1) || (hasFont ? 'schreiben' : 'schrift'));

// Browser bitten, unsere Daten nicht automatisch zu löschen (Safari räumt sonst manchmal auf)
navigator.storage?.persist?.().catch(() => {});

onStorageError(() => {
  toast('Speicher voll – bitte ein Backup machen (Einstellungen).', 'error', 5000);
});

// ── Offline-Modus (Service Worker) ───────────────────────────
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
