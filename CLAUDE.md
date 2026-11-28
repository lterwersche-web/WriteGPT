# WriteGPT – Projekt-Notizen für Claude

## Worum geht's?
Web-App (PWA) fürs iPad: Man zeichnet einmal jeden Buchstaben mit dem Apple Pencil,
danach schreibt die App beliebigen Text in dieser Handschrift – als Vorschau, zum Kopieren
(transparentes PNG), als PNG-Datei oder als PDF, z.B. zum Einfügen in Goodnotes.
Schwerpunkt: Notizen, Lernzettel und Karteikarten in der eigenen Schrift.

## Technik
- Reines HTML, CSS und JavaScript (ES-Module). **Kein Framework, kein Build-Schritt, keine Abhängigkeiten.**
- Daten liegen im Browser (`localStorage`, Schlüssel `writegpt:v1`), Service Worker (`sw.js`) für Offline.
- Lokal starten: `npm start` → http://localhost:8080 (braucht Node.js)
- Tests: `npm test` (Node-Testrunner, aktuell 68 Tests in `tests/`)
- Hosting: GitHub Pages (Settings → Pages → Zweig `claude/bold-faraday-15484t`, Ordner `/ (root)`). `.nojekyll` nicht löschen.
- Code liegt auf GitHub: `lterwersche-web/WriteGPT`, Zweig `claude/bold-faraday-15484t` (Remote `origin`).

## Aufbau
| Datei | Aufgabe |
|---|---|
| `js/main.js` | Start, Navigation (#schreiben, #schrift, #einstellungen), Kurzanleitung |
| `js/state.js` | Zustand + Speichern: aktive Schrift, `fontLibrary`, `docs` (Meine Texte), `pen`, `edits`, `ui`, Backup |
| `js/charsets.js` | Zeichen-Sets, Schritte (a, a, a, b …), Ersatzzeichen (FALLBACKS) |
| `js/glyphs.js` | Einheiten/Box, `simplify` (RDP), `glyphMetrics`, `resolveChar`, **Auto-Fix** `fixVariant` |
| `js/editor.js` | Zeichenfeld (Pointer Events, Handballen-/Abpraller-Filter, Vorlage) |
| `js/markdown.js` | ChatGPT-Markdown/LaTeX → Blöcke mit Runs `{text, bold, mark, sup, sub}` |
| `js/layout.js` | Herzstück: Blöcke → Seiten mit Strichen (mm), Glyph-Boxen, Marker, Merkkasten, Kopfzeile |
| `js/edits.js` | Radierungen/Neu-Würfeln pro Zeichen-Nummer (`idx`) + Nachführen bei Textänderung |
| `js/render.js` | Canvas: `strokeRuns`, Füller (`nibBuckets`), Textmarker, Papier |
| `js/pdf.js` | Eigener PDF-Writer (Vektor, ExtGState für durchscheinenden Textmarker) |
| `js/export.js` | PNG, Zwischenablage, Teilen/Download |
| `js/ui.js`, `js/icons.js` | Dialoge, Toasts, Schalter, Slider, SVG-Icons |
| `js/views/*.js` | Die drei Bereiche: write, font, settings |

## Wichtige Konzepte (nicht kaputt machen!)
- **Einheiten:** 1 Einheit = Grundlinie → Oberlinie, y zeigt nach unten (Mittellinie −0,5, Unterlinie +0,5).
  Zeichenfeld = 2,6 × 2,25 Einheiten. Layout rechnet in mm.
- **`strokeRuns`** zerlegt Striche in „harmlose“ Stücke (ausdünnen, an Ecken trennen, Catmull-Rom,
  enge Kurven trennen). Grund: Apples Grafik-Engine (Safari/Goodnotes) macht sonst Löcher
  („weiße Punkte“). Nicht zurück zu langen Quadratic-Pfaden wechseln.
- **`idx`:** Jedes Zeichen im Text hat eine feste Nummer (Aufzählungszeichen zuerst, dann Runs,
  siehe `textKey`). Zufall, Radierungen und Neu-Würfeln hängen daran. Kopfzeile/Seitenzahlen nutzen negative idx.
- **Zufall mit Seed** (`random.js`): gleiche Eingabe → gleiches Bild. Variantenwahl ist pro Wort,
  damit „Neu würfeln“ nur ein Wort ändert.
- **Auto-Fix** ändert nie die gespeicherten Zeichnungen, nur die Darstellung.

## Konventionen
- Code-Kommentare und UI-Texte auf **Deutsch**, einfach erklärt (der Besitzer lernt programmieren).
- Design: Apple-Stil, clean & hell, Akzent Blau `#007aff`, automatischer Dark Mode.
  Alle Farben als CSS-Variablen oben in `css/style.css`.
- Neue Datei in `js/`? → in `sw.js` (`FILES`) eintragen und `CACHE`-Version erhöhen.
- Nach Änderungen: `npm test` laufen lassen und im Browser prüfen (iPad-Breite 1180×820, hoch 820×1180, Handy 390×844, Dark Mode).
- Test-Schriften: `tests/helpers.js` (`fakeFont`) erzeugt eine künstliche Handschrift.

## Zusammenarbeit
- Auf Deutsch antworten, locker und einfach erklären.
- Bei Design/Aufbau-Entscheidungen erst nachfragen, wie es gewünscht ist.
- Am Ende kurz erklären, **was** gemacht wurde und **wie** es funktioniert.

## Stand (Version 1.3.0)
- Schrift einrichten (Druck/halb verbunden/Schreibschrift, 1–3 Varianten, optionale Zeichen),
  Schritt-für-Schritt-Zeichnen mit Vorlage, mehrere Schriften.
- Schreiben: Live-Vorschau, Meine Texte, Radierer (Lücke/Zusammenrücken), Wort-Menü,
  Lernzettel (Textmarker, farbige/zentrierte Überschriften, Merkkasten), Kopfzeile/Datum/Seitenzahlen,
  Karteikarten (A6, `---` = neue Seite), Füller, Export PNG/PDF/Kopieren, Tastenkürzel.
- „Weiße Punkte“: laut Besitzer auf dem iPad behoben.
- **Goodnotes-Papier** (Format `GN`, Standard): ausgemessen an exportierten Goodnotes-PDFs und per
  Pixelvergleich geprüft. Seite 455,04 × 588,45 pt, Linien `#d0d2d3`, 0,5 pt dick.
  Liniert breit = 25 pt, Kariert = 16-pt-Kästchen ab Ecke oben links (`GOODNOTES_LINE` in `layout.js`).
  Papier antippen setzt den passenden Zeilenabstand. Das Muster folgt immer `pen.lineHeight`.
- **Bereich der Seite** (Stift & Papier → Seite): Vorlagen (oben/unten ½ ⅓ ¼, links/rechts ½) und
  Feinregler. Gespeichert als `pen.startLine`, `pen.lineCount`, `pen.indent` (mm), `pen.lineLength` (mm);
  alles 0 = ganze Seite. Gerechnet wird in ganzen Zeilen bzw. Kästchen, damit der Text auf den Linien sitzt.
  Vorschau zeigt einen Rahmen (`layout.area`), `layout.overflowLines` löst den Hinweis „Passt nicht“ aus; der Knopf „Schrift anpassen“
  (`fitSizeToArea`) verkleinert nur die Schriftgröße, nie den Zeilenabstand.
  Beim Kopieren (`continuous`) zählt nur die Breite.
- Offen: Goodnotes „Liniert schmal“, „Gepunktet“ und Größe A4 sind NICHT ausgemessen (PDFs fehlen) – nicht raten.
- Offen: Kopiertes Bild in Goodnotes unscharf – Auflösung auf 24 px/mm erhöht, Bestätigung auf dem iPad fehlt.
