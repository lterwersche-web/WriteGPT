// ─────────────────────────────────────────────────────────────
// views/settings.js – ⚙️ Einstellungen
// ─────────────────────────────────────────────────────────────

import { getState, update, subscribe, exportBackup, importBackup, resetFont } from '../state.js';
import { CHAR_SETS, buildSteps } from '../charsets.js';
import { STYLES } from '../layout.js';
import { shareOrDownload } from '../export.js';
import { icon } from '../icons.js';
import { toast, confirmDialog, segmented, toggle, esc } from '../ui.js';

export const APP_VERSION = '1.0.0';

export function createSettingsView(app) {
  const el = document.createElement('section');
  el.className = 'view view-settings';

  function render() {
    const { font } = getState();
    const steps = buildSteps(font);
    const done = steps.filter((s) => font.glyphs[s.ch]?.[s.variant]).length;

    el.innerHTML = `
      <div class="narrow">
        <header class="page-head"><h1>Einstellungen</h1></header>

        <h2 class="group-title">Meine Schrift</h2>
        <section class="card list">
          <div class="row row-stack">
            <div class="row-text"><strong>Schreibstil</strong><span>Wie die App deine Buchstaben zusammensetzt</span></div>
            <div class="slot-style"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>Varianten pro Zeichen</strong><span>Mehr Varianten = natürlicheres Schriftbild</span></div>
            <div class="slot-variants"></div>
          </div>
          <div class="slot-sets"></div>
          <div class="row">
            <div class="row-text"><strong>Fortschritt</strong><span>${done} von ${steps.length} Zeichnungen fertig</span></div>
            <button class="btn btn-sm" data-act="font">${icon('pen')}<span>${done < steps.length ? 'Weiterzeichnen' : 'Ansehen'}</span></button>
          </div>
        </section>

        <h2 class="group-title">Daten &amp; Backup</h2>
        <section class="card list">
          <div class="row">
            <div class="row-text"><strong>Backup speichern</strong><span>Sichert deine Schrift als Datei – z.B. in iCloud Drive</span></div>
            <button class="btn btn-sm" data-act="backup">${icon('download')}<span>Speichern</span></button>
          </div>
          <div class="row">
            <div class="row-text"><strong>Backup laden</strong><span>Stellt eine gesicherte Schrift wieder her</span></div>
            <label class="btn btn-sm">${icon('upload')}<span>Datei wählen</span><input type="file" accept=".json,application/json" hidden></label>
          </div>
          <div class="row">
            <div class="row-text"><strong class="danger-text">Schrift löschen</strong><span>Entfernt alle gezeichneten Buchstaben</span></div>
            <button class="btn btn-sm btn-danger-soft" data-act="reset">${icon('trash')}<span>Löschen</span></button>
          </div>
        </section>
        <p class="group-note">Alles bleibt auf deinem Gerät – nichts wird hochgeladen. Tipp: Mach ab und zu ein Backup, falls du den Browser-Verlauf löschst.</p>

        <h2 class="group-title">App auf den Home-Bildschirm</h2>
        <section class="card install-card">
          <ol class="install-steps">
            <li><span class="step-num">1</span><div>Öffne WriteGPT in <strong>Safari</strong> auf deinem iPad.</div></li>
            <li><span class="step-num">2</span><div>Tippe oben auf das Teilen-Symbol <span class="inline-icon">${icon('share')}</span>.</div></li>
            <li><span class="step-num">3</span><div>Wähle <strong>„Zum Home-Bildschirm“</strong> – fertig! Die App funktioniert dann auch offline.</div></li>
          </ol>
        </section>

        <h2 class="group-title">So kommt der Text in Goodnotes</h2>
        <section class="card install-card">
          <ol class="install-steps">
            <li><span class="step-num">${icon('copy')}</span><div><strong>Kopieren:</strong> In WriteGPT auf „Kopieren“ tippen → in Goodnotes lange auf die Seite tippen → „Einsetzen“. Die Schrift hat keinen Hintergrund.</div></li>
            <li><span class="step-num">${icon('image')}</span><div><strong>PNG:</strong> Bild speichern oder über „Teilen“ direkt an Goodnotes schicken.</div></li>
            <li><span class="step-num">${icon('file')}</span><div><strong>PDF:</strong> Über „Teilen“ → Goodnotes als neues Dokument importieren – mit Papier-Linien.</div></li>
          </ol>
        </section>

        <p class="about">WriteGPT · Version ${esc(APP_VERSION)}</p>
      </div>`;

    el.querySelector('.slot-style').append(
      segmented(
        Object.entries(STYLES).map(([value, s]) => ({ value, label: s.label })),
        font.style,
        (v) => setFont({ style: v }),
      ),
    );
    el.querySelector('.slot-variants').append(
      segmented([1, 2, 3].map((v) => ({ value: v, label: `${v}×` })), font.variants, (v) => setFont({ variants: Number(v) }), { small: true }),
    );

    const sets = el.querySelector('.slot-sets');
    for (const set of CHAR_SETS.filter((s) => !s.required)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="row-text"><strong>${set.name}</strong><span class="set-chars">${esc([...set.chars].join(' '))}</span></div>`;
      row.append(toggle(!!font.sets[set.id], (v) => setFont({ sets: { ...getState().font.sets, [set.id]: v } }), set.name));
      sets.append(row);
    }

    el.querySelector('input[type="file"]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importBackup(await file.text());
        toast('Backup geladen!', 'success');
        render();
      } catch (err) {
        toast(err.message || 'Datei konnte nicht gelesen werden.', 'error', 4000);
      }
    });
  }

  function setFont(patch) {
    update({ font: { ...getState().font, ...patch, configured: true } });
    render();
  }

  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'font') app.navigate('schrift');
    else if (act === 'backup') {
      const d = new Date().toISOString().slice(0, 10);
      const file = new File([exportBackup()], `WriteGPT Backup ${d}.json`, { type: 'application/json' });
      const result = await shareOrDownload([file]);
      if (result !== 'cancelled') toast('Backup erstellt.', 'success');
    } else if (act === 'reset') {
      const ok = await confirmDialog({
        title: 'Schrift wirklich löschen?',
        message: 'Alle gezeichneten Buchstaben werden entfernt. Das kann man nicht rückgängig machen – außer du hast ein Backup.',
        confirm: 'Löschen',
        danger: true,
      });
      if (ok) {
        resetFont();
        toast('Schrift gelöscht.', 'success');
        render();
      }
    }
  });

  subscribe((state, patch) => {
    if ('font' in patch && app.isVisible('einstellungen') && !el.contains(document.activeElement)) render();
  });

  return {
    el,
    show: render,
    hide() {},
  };
}
