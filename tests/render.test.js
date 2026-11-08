import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strokeRuns } from '../js/render.js';

/** Radius des Kreises durch drei Punkte */
function radius(ax, ay, bx, by, cx, cy) {
  const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  if (cross < 1e-12) return Infinity;
  return (Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay)) / (2 * cross);
}

/** Ein zittriger Kreis wie von echter Hand: viele, sehr dichte Punkte */
function shakyCircle(r, n = 400) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble = Math.sin(i * 1.7) * 0.004;
    pts.push(Math.cos(a) * (r + wobble), Math.sin(a) * (r + wobble));
  }
  return pts;
}

test('Keine winzigen oder doppelten Teilstücke (Ursache für weiße Punkte)', () => {
  const w = 0.5;
  for (const run of strokeRuns(shakyCircle(1.2), w)) {
    for (let i = 2; i < run.length; i += 2) {
      const d = Math.hypot(run[i] - run[i - 2], run[i + 1] - run[i - 1]);
      assert.ok(d > 1e-6, 'doppelter Punkt gefunden');
    }
  }
});

test('Innerhalb eines Stücks ist keine Kurve enger als die halbe Strichdicke', () => {
  const w = 0.5;
  // Enge Kringel (wie bei e, a) + dichte Punkte
  const pts = [];
  for (let i = 0; i <= 300; i++) {
    const t = i / 30;
    pts.push(t * 0.35 + Math.cos(t * 2.4) * 0.3, Math.sin(t * 2.4) * 0.3);
  }
  for (const run of strokeRuns(pts, w)) {
    for (let i = 2; i < run.length - 2; i += 2) {
      const r = radius(run[i - 2], run[i - 1], run[i], run[i + 1], run[i + 2], run[i + 3]);
      assert.ok(r >= w / 2, `zu enge Kurve: r=${r.toFixed(3)}`);
    }
  }
});

test('Ecken bleiben spitz: das v erreicht unten wirklich die Grundlinie', () => {
  // v aus nur drei Punkten (so bleibt es nach dem Vereinfachen oft übrig)
  const v = [0, -0.5, 0.2, 0, 0.4, -0.5];
  const runs = strokeRuns(v, 0.05);
  const maxY = Math.max(...runs.flatMap((r) => r.filter((_, i) => i % 2 === 1)));
  assert.ok(maxY > -0.001, `Spitze nur bei y=${maxY.toFixed(3)}`);
  assert.equal(runs.length, 2, 'an der Spitze getrennt');
});

test('Ein einzelner Punkt bleibt ein Punkt (i-Punkt)', () => {
  assert.deepEqual(strokeRuns([1, 2], 0.5), [[1, 2]]);
  // Mini-Strich kürzer als die Mindestlänge → auch ein Punkt
  assert.equal(strokeRuns([1, 2, 1.01, 2], 0.5)[0].length, 2);
});

test('Anfang und Ende des Strichs bleiben erhalten', () => {
  const pts = [0, 0, 0.3, 0.1, 0.6, 0.15, 1, 0.1, 1.4, 0];
  const runs = strokeRuns(pts, 0.1);
  assert.deepEqual(runs[0].slice(0, 2), [0, 0]);
  assert.deepEqual(runs.at(-1).slice(-2), [1.4, 0]);
});
