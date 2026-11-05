// ─────────────────────────────────────────────────────────────
// charsets.js – Welche Zeichen man zeichnen kann
// ─────────────────────────────────────────────────────────────
// Die Zeichen sind in "Sets" (Gruppen) sortiert. Pflicht-Sets sind
// immer dabei, optionale Sets kann man in der Einrichtung an-/abwählen.

export const CHAR_SETS = [
  {
    id: 'letters',
    name: 'Buchstaben & Umlaute',
    required: true,
    chars: 'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
  },
  {
    id: 'basics',
    name: 'Zahlen & Satzzeichen',
    required: true,
    chars: '0123456789.,!?:;-()"\'/',
  },
  {
    id: 'math',
    name: 'Mathe-Zeichen',
    required: false,
    chars: '+=×÷%<>≈²³√π',
  },
  {
    id: 'special',
    name: 'Sonderzeichen',
    required: false,
    chars: '@#&€$*§→•',
  },
];

// Namen für Zeichen, die man auf dem Bildschirm schlecht erkennt
const CHAR_NAMES = {
  '.': 'Punkt', ',': 'Komma', '!': 'Ausrufezeichen', '?': 'Fragezeichen',
  ':': 'Doppelpunkt', ';': 'Semikolon', '-': 'Bindestrich / Minus',
  '(': 'Klammer auf', ')': 'Klammer zu', '"': 'Anführungszeichen',
  "'": 'Apostroph', '/': 'Schrägstrich', '+': 'Plus', '=': 'Gleich',
  '×': 'Mal', '÷': 'Geteilt', '%': 'Prozent', '<': 'Kleiner als',
  '>': 'Größer als', '≈': 'Ungefähr', '²': 'Hoch 2', '³': 'Hoch 3',
  '√': 'Wurzel', 'π': 'Pi', '@': 'At-Zeichen', '#': 'Raute',
  '&': 'Und-Zeichen', '€': 'Euro', '$': 'Dollar', '*': 'Sternchen',
  '§': 'Paragraf', '→': 'Pfeil', '•': 'Aufzählungspunkt', 'ß': 'Eszett',
};

// Kleine Tipps, WO im Zeichenfeld das Zeichen hingehört
const CHAR_HINTS = {
  '.': 'Klein, direkt auf die Grundlinie.',
  ',': 'Auf der Grundlinie starten, leicht nach unten ziehen.',
  ';': 'Oberer Punkt auf Mittelhöhe, Komma auf der Grundlinie.',
  ':': 'Ein Punkt auf Mittelhöhe, einer auf der Grundlinie.',
  '-': 'Kurzer Strich zwischen Grund- und Mittellinie.',
  '"': 'Zwei kleine Striche oben an der Oberlinie.',
  "'": 'Ein kleiner Strich oben an der Oberlinie.',
  '²': 'Klein und hochgestellt – oben rechts zeichnen.',
  '³': 'Klein und hochgestellt – oben rechts zeichnen.',
  '•': 'Kleiner, ausgefüllter Punkt auf Mittelhöhe.',
  '×': 'Kleines x, ungefähr in Höhe der Kleinbuchstaben.',
  '+': 'Ungefähr in Höhe der Kleinbuchstaben.',
  '=': 'Ungefähr in Höhe der Kleinbuchstaben.',
  '→': 'Ungefähr auf Mittelhöhe.',
};

export function isLetter(ch) {
  return /\p{L}/u.test(ch);
}

/** Beschreibung für die Zeichen-Ansicht: z.B. "Kleinbuchstabe" */
export function describeChar(ch) {
  let title;
  if (CHAR_NAMES[ch] && !/[a-zA-Z]/.test(ch)) title = CHAR_NAMES[ch];
  else if (/\p{Ll}/u.test(ch)) title = 'Kleinbuchstabe';
  else if (/\p{Lu}/u.test(ch)) title = 'Großbuchstabe';
  else if (/\d/.test(ch)) title = 'Zahl';
  else title = 'Zeichen';

  let hint = CHAR_HINTS[ch];
  if (!hint && /\p{Ll}/u.test(ch)) {
    hint = 'Kleinbuchstaben gehen bis zur Mittellinie. Ober- und Unterlängen (wie bei b, g) gehen darüber bzw. darunter.';
  } else if (!hint && /\p{Lu}|\d/u.test(ch)) {
    hint = 'Von der Grundlinie bis zur Oberlinie.';
  }
  return { title, hint: hint ?? '' };
}

/** Alle Zeichen, die laut Einrichtung gezeichnet werden sollen */
export function enabledChars(font) {
  return CHAR_SETS
    .filter((set) => set.required || font.sets?.[set.id])
    .flatMap((set) => [...set.chars]);
}

/**
 * Die Schritt-für-Schritt-Reihenfolge: a (1), a (2), a (3), b (1) …
 * Jeder Schritt = ein Zeichen in einer Variante.
 */
export function buildSteps(font) {
  const steps = [];
  for (const ch of enabledChars(font)) {
    for (let v = 0; v < font.variants; v++) steps.push({ ch, variant: v });
  }
  return steps;
}

/** Zu welchem Set gehört ein Zeichen? (null = gibt's in keinem Set) */
export function setForChar(ch) {
  return CHAR_SETS.find((set) => set.chars.includes(ch)) ?? null;
}

// Ersatzzeichen: Wenn ein Zeichen nicht gezeichnet wurde,
// probiert die App diese Alternativen der Reihe nach aus.
// Ein Eintrag ist entweder Text ("...") oder ein Objekt:
//   s = Ersatz-Text, sup = hochgestellt, dy = verschieben, scale = Größe
export const FALLBACKS = {
  '–': ['-'], '—': ['-'], '−': ['-'], '‐': ['-'], '‑': ['-'], '_': ['-'],
  '„': ['"'], '“': ['"'], '”': ['"'], '«': ['"'], '»': ['"'],
  '‚': ["'"], '‘': ["'"], '’': ["'"], '`': ["'"], '´': ["'"],
  '…': ['...'],
  '×': ['x'], '÷': [':'], '±': ['+-'], '∓': ['-+'],
  '·': [{ s: '.', dy: -0.22 }],
  '•': [{ s: '.', dy: -0.22, scale: 1.4 }],
  '°': [{ s: 'o', sup: true, scale: 0.8 }],
  '≤': ['<=', '<'], '≥': ['>=', '>'], '≠': ['=/'], '≈': ['='],
  '→': ['->', '-'], '⇒': ['=>', '-'], '←': ['<-', '-'], '⇔': ['<=>', '='], '↔': ['<->', '-'],
  '€': ['EUR'], '&': ['+', 'und'], 'ẞ': ['SS'], 'ß': ['ss'],
  'ä': ['ae'], 'ö': ['oe'], 'ü': ['ue'], 'Ä': ['Ae'], 'Ö': ['Oe'], 'Ü': ['Ue'],
};

// Hoch- und tiefgestellte Zahlen (z.B. m², CO₂) → normale Zahl, klein & versetzt
[...'⁰¹²³⁴⁵⁶⁷⁸⁹'].forEach((ch, i) => (FALLBACKS[ch] = [{ s: String(i), sup: true }]));
[...'₀₁₂₃₄₅₆₇₈₉'].forEach((ch, i) => (FALLBACKS[ch] = [{ s: String(i), sub: true }]));
FALLBACKS['⁺'] = [{ s: '+', sup: true }];
FALLBACKS['⁻'] = [{ s: '-', sup: true }];

// Ein deutscher Satz, der fast alle Buchstaben enthält (Pangramm)
export const SAMPLE_TEXT = 'Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.';
