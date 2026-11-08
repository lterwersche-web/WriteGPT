// ─────────────────────────────────────────────────────────────
// markdown.js – ChatGPT-Text "smart umwandeln"
// ─────────────────────────────────────────────────────────────
// ChatGPT schreibt in "Markdown": **fett**, # Überschrift, - Liste …
// Diese Datei macht daraus eine Liste von "Blöcken", die die App
// dann handschriftlich schreibt:
//
//   { type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'quote' | 'hr' | 'blank',
//     runs: [{ text, bold, mark, sup, sub }], // Textstücke mit Formatierung
//     indent: 0,                          // Einrückung (Listen-Ebene)
//     bullet: '•' | '1.' | null }         // Aufzählungszeichen

import { CHAR_SETS, FALLBACKS } from './charsets.js';

// Unsichtbare Markierungen für hoch-/tiefgestellten Text (aus LaTeX)
const SUP = '\u0001';
const SUB = '\u0003';
const END = '\u0002';
const ESC_STAR = '\u0005';
const ESC_UNDER = '\u0006';

// ── LaTeX (Mathe-Formeln) → normaler Text ───────────────────

const LATEX_SYMBOLS = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', approx: '≈',
  neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  infty: '∞', pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', lambda: 'λ', mu: 'μ',
  sigma: 'σ', Sigma: 'Σ', theta: 'θ', phi: 'φ', varphi: 'φ', omega: 'ω',
  Omega: 'Ω', rho: 'ρ', tau: 'τ', eta: 'η',
  rightarrow: '→', to: '→', Rightarrow: '⇒', implies: '⇒',
  leftarrow: '←', Leftrightarrow: '⇔', iff: '⇔', leftrightarrow: '↔',
  circ: '°', degree: '°', percent: '%', ldots: '…', dots: '…', cdots: '…',
  quad: ' ', qquad: '  ', sum: 'Σ', in: '∈', cup: '∪', cap: '∩',
};

const LATEX_IGNORE = new Set([
  'left', 'right', 'big', 'Big', 'bigl', 'bigr', 'Bigl', 'Bigr',
  'displaystyle', 'textstyle', 'limits', 'nolimits',
]);

const LATEX_TEXT_CMDS = new Set([
  'text', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'textbf', 'textit',
  'operatorname', 'boldsymbol', 'mathbb', 'mathcal', 'overline', 'underline', 'vec', 'hat',
]);

const LATEX_SINGLE = {
  ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', '\\': '\n',
  '{': '(', '}': ')', '%': '%', '$': '$', '&': '', '#': '#', '_': '_',
};

/** Liest ein Argument: {…} oder ein einzelnes Zeichen/Befehl */
function readArg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
    }
    return [s.slice(i + 1), s.length];
  }
  if (s[i] === '\\') {
    const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
    if (m) return [m[0], i + m[0].length];
  }
  return [s[i] ?? '', i + 1];
}

/** Klammern drumherum, wenn's mehr als ein "Ding" ist: a+b → (a+b) */
function wrap(x) {
  return x.length > 1 && /[+\-*/ ×÷·]/.test(x) ? `(${x})` : x;
}

export function latexToText(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
      if (!m) { i++; continue; }
      const name = m[1];
      i += m[0].length;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const [a, i1] = readArg(s, i);
        const [b, i2] = readArg(s, i1);
        i = i2;
        out += wrap(latexToText(a)) + '/' + wrap(latexToText(b));
      } else if (name === 'sqrt') {
        if (s[i] === '[') i = s.indexOf(']', i) + 1 || s.length;
        const [a, i1] = readArg(s, i);
        i = i1;
        out += '√' + wrap(latexToText(a));
      } else if (name === 'begin' || name === 'end') {
        i = readArg(s, i)[1];
      } else if (LATEX_TEXT_CMDS.has(name)) {
        const [a, i1] = readArg(s, i);
        i = i1;
        out += latexToText(a);
      } else if (name in LATEX_SYMBOLS) {
        out += LATEX_SYMBOLS[name];
      } else if (LATEX_IGNORE.has(name)) {
        // einfach weglassen
      } else if (name.length === 1 && !/[a-zA-Z]/.test(name)) {
        out += LATEX_SINGLE[name] ?? name;
      } else {
        out += name; // \sin → sin, \log → log …
      }
    } else if (c === '^' || c === '_') {
      const [a, i1] = readArg(s, i + 1);
      i = i1;
      const inner = latexToText(a);
      if (inner === '°') out += '°';
      else if (inner) out += (c === '^' ? SUP : SUB) + inner + END;
    } else if (c === '{' || c === '}') {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// ── Emojis entfernen (die kann man nicht "handschreiben") ───

const KEEP = new Set([...CHAR_SETS.flatMap((s) => [...s.chars]), ...Object.keys(FALLBACKS)]);

function stripEmoji(s) {
  return s
    .replace(/\p{Extended_Pictographic}/gu, (ch) => (KEEP.has(ch) ? ch : ''))
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}︎️‍⃣]/gu, '');
}

// ── Inline-Formatierung: **fett**, *kursiv*, `code`, [Link](url) ──

export function parseInline(src, base = {}) {
  let s = src
    .replace(/\\\*/g, ESC_STAR)
    .replace(/\\_/g, ESC_UNDER)
    .replace(/\\([`#>\-[\]()!.+])/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // Bilder
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // Links → nur Text
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/~~(.+?)~~/g, '$1') // ~~durchgestrichen~~
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ''); // HTML-Tags

  // **fett** / __fett__ → bold: true   ·   ==markiert== → mark: true (Textmarker)
  const parts = s.split(/(\*\*|__|==)/);
  const isBold = (p) => p === '**' || p === '__';
  const boldCount = parts.filter(isBold).length;
  const markCount = parts.filter((p) => p === '==').length;
  // ungerade Anzahl → das letzte Zeichen bleibt normaler Text
  let boldLeft = boldCount - (boldCount % 2);
  let markLeft = markCount - (markCount % 2);
  let bold = !!base.bold;
  let mark = false;
  const segments = [];
  for (const part of parts) {
    if (isBold(part) && boldLeft > 0) {
      bold = !bold;
      boldLeft--;
      continue;
    }
    if (part === '==' && markLeft > 0) {
      mark = !mark;
      markLeft--;
      continue;
    }
    if (part) segments.push({ text: part, bold, mark });
  }

  const runs = [];
  const same = (a, b) => a.bold === b.bold && a.mark === b.mark && a.sup === b.sup && a.sub === b.sub;
  const push = (text, flags) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && same(last, flags)) last.text += text;
    else runs.push({ text, ...flags });
  };

  for (const seg of segments) {
    // *kursiv* / _kursiv_ → Sternchen weg (Kursiv kann Handschrift eh nicht)
    const text = seg.text
      .replace(/(^|[^\w*])\*([^\s*](?:[^*]*[^\s*])?)\*(?![\w*])/g, '$1$2')
      .replace(/(^|[^\w])_([^\s_](?:[^_]*[^\s_])?)_(?!\w)/g, '$1$2')
      .replaceAll(ESC_STAR, '*')
      .replaceAll(ESC_UNDER, '_');

    // Hoch-/Tiefstellung aus LaTeX auswerten
    const stack = [];
    let buf = '';
    const flags = () => ({
      bold: seg.bold,
      mark: seg.mark,
      sup: stack.at(-1) === 'sup',
      sub: stack.at(-1) === 'sub',
    });
    for (const ch of text) {
      if (ch === SUP || ch === SUB || ch === END) {
        push(buf, flags());
        buf = '';
        if (ch === END) stack.pop();
        else stack.push(ch === SUP ? 'sup' : 'sub');
      } else {
        buf += ch;
      }
    }
    push(buf, flags());
  }

  // Doppelte Leerzeichen zusammenfassen
  for (const r of runs) r.text = r.text.replace(/[ \t ]{2,}/g, ' ');
  return runs.filter((r) => r.text.length);
}

// ── Zeilen → Blöcke ─────────────────────────────────────────

export function parseChatText(raw) {
  let text = String(raw ?? '').replace(/\r\n?/g, '\n');
  text = stripEmoji(text);

  // Mathe-Formeln: \[ … \], $$ … $$, \( … \)
  text = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n${latexToText(m).trim()}\n`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => `\n${latexToText(m).trim()}\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => latexToText(m));

  const blocks = [];
  const listStack = []; // Einrückungen der offenen Listen-Ebenen
  let inCode = false;

  const listLevel = (spaces) => {
    while (listStack.length && listStack.at(-1) > spaces) listStack.pop();
    if (!listStack.length || listStack.at(-1) < spaces) listStack.push(spaces);
    return listStack.length;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    let m;

    // ```Code-Blöcke```: Zäune weg, Inhalt bleibt
    if (/^(```|~~~)/.test(trimmed)) { inCode = !inCode; continue; }
    if (inCode) {
      if (trimmed) blocks.push({ type: 'p', runs: [{ text: trimmed, bold: false, sup: false, sub: false }], indent: 1, bullet: null });
      else blocks.push({ type: 'blank' });
      continue;
    }

    if (!trimmed) { blocks.push({ type: 'blank' }); continue; }

    // --- oder *** → Trennlinie
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      listStack.length = 0;
      blocks.push({ type: 'hr' });
      continue;
    }

    // Tabellen-Trennzeile |---|---| → weg
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(trimmed)) continue;

    // # Überschrift
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed))) {
      listStack.length = 0;
      const level = Math.min(m[1].length, 3);
      blocks.push({ type: `h${level}`, runs: parseInline(m[2]), indent: 0, bullet: null });
      continue;
    }

    // - Liste / * Liste / • Liste
    if ((m = /^(\s*)[-*+•●▪◦‣]\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'li', runs: parseInline(m[2]), indent: listLevel(m[1].length), bullet: '•' });
      continue;
    }

    // 1. Nummerierte Liste
    if ((m = /^(\s*)(\d{1,3})[.)]\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'li', runs: parseInline(m[3]), indent: listLevel(m[1].length), bullet: `${m[2]}.` });
      continue;
    }

    // > Zitat
    if ((m = /^>\s?(.*)$/.exec(trimmed))) {
      blocks.push({ type: 'quote', runs: parseInline(m[1]), indent: 1, bullet: null });
      continue;
    }

    // | Tabelle | Zeile |
    if (/^\|.*\|$/.test(trimmed)) {
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim()).filter(Boolean);
      blocks.push({ type: 'p', runs: parseInline(cells.join(' – ')), indent: 0, bullet: null });
      continue;
    }

    // Eingerückte Zeile direkt unter einem Listenpunkt → gehört dazu
    const prev = blocks.at(-1);
    const leading = line.length - line.trimStart().length;
    if (leading >= 2 && prev && (prev.type === 'li' || prev.hang)) {
      blocks.push({ type: 'p', runs: parseInline(trimmed), indent: prev.indent, bullet: null, hang: true });
      continue;
    }

    listStack.length = 0;
    blocks.push({ type: 'p', runs: parseInline(trimmed), indent: 0, bullet: null });
  }

  // Leerzeilen aufräumen: keine am Anfang/Ende, nie zwei hintereinander
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'blank' && b.runs && !b.runs.length) continue;
    if (b.type === 'blank' && (!out.length || out.at(-1).type === 'blank')) continue;
    out.push(b);
  }
  while (out.length && out.at(-1).type === 'blank') out.pop();
  return out;
}
