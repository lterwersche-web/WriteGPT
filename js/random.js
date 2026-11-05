// ─────────────────────────────────────────────────────────────
// random.js – Zufall, der sich wiederholen lässt
// ─────────────────────────────────────────────────────────────
// Math.random() gibt jedes Mal etwas anderes aus. Dann würde die
// Vorschau bei jedem Tastendruck komplett neu "wackeln".
// Deshalb: Ein Zufallsgenerator mit "Seed" (Startwert).
// Gleicher Seed → immer die gleichen Zufallszahlen.

/** Macht aus mehreren Zahlen eine "zufällig aussehende" Zahl (Hash). */
export function hash(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= Math.floor(n) >>> 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Zufallsgenerator "mulberry32": gibt Zahlen zwischen 0 und 1 zurück. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Praktisch: Zufallszahl zwischen min und max */
export function rangeFn(next) {
  return (min, max) => min + (max - min) * next();
}
