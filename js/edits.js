// ─────────────────────────────────────────────────────────────
// edits.js – Radierungen & "Neu würfeln" dem richtigen Zeichen zuordnen
// ─────────────────────────────────────────────────────────────
// Jedes Zeichen im Text hat eine Nummer (idx): 0, 1, 2, …
// Radierst du Zeichen 12 weg, merkt sich die App "12 ist weg".
// Tippst du danach VOR Zeichen 12 etwas ein, verschieben sich alle
// Nummern. remapEdits() rechnet die Nummern dann passend um.

/**
 * Der "Schlüssel" eines Texts: alle Zeichen in genau der Reihenfolge,
 * in der layout.js sie durchnummeriert (Aufzählungszeichen zuerst).
 */
export function textKey(blocks) {
  let key = '';
  for (const b of blocks) {
    if (!b.runs) continue;
    if (b.bullet) key += b.bullet;
    for (const r of b.runs) key += r.text;
  }
  return key;
}

/**
 * Nummern nach einer Textänderung nachführen.
 * Trick: Wir suchen den gleichen Anfang und das gleiche Ende von altem
 * und neuem Text. Was davor liegt, bleibt; was dahinter liegt, verschiebt
 * sich um die Längen-Differenz; was im geänderten Mittelteil lag, fliegt raus.
 */
export function remapEdits(edits, newKey) {
  if (!edits || edits.key === newKey) return edits;
  const a = Array.from(edits.key ?? '');
  const b = Array.from(newKey);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const delta = b.length - a.length;
  const move = (obj = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const i = Number(k);
      if (i < pre) out[i] = v;
      else if (i >= a.length - suf) out[i + delta] = v;
    }
    return out;
  };
  return { key: newKey, erased: move(edits.erased), reroll: move(edits.reroll) };
}

export function hasEdits(edits) {
  return !!edits && (Object.keys(edits.erased ?? {}).length > 0 || Object.keys(edits.reroll ?? {}).length > 0);
}
