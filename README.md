# ✍️ WriteGPT

**Schreib jeden Text in deiner eigenen Handschrift – perfekt für Goodnotes.**

Du zeichnest einmal deine Buchstaben mit dem Apple Pencil. Danach kannst du jeden Text
(z.B. eine Antwort von ChatGPT) einfügen und bekommst ihn in deiner Handschrift zurück:
als Bild zum Einfügen, als PNG oder als PDF.

---

## So benutzt du die App

| Schritt | Bereich | Was passiert |
|---|---|---|
| 1 | **Meine Schrift** | Drei Fragen beantworten: Schreibstil, wie oft du jedes Zeichen zeichnest (1–3×), welche Zeichen du brauchst. |
| 2 | **Meine Schrift** | Schritt für Schritt zeichnen: a → a → a → b → … Alles wird automatisch gespeichert. |
| 3 | **Schreiben** | Text links einfügen → rechts erscheint die Live-Vorschau in deiner Handschrift. |
| 4 | **Schreiben** | **Kopieren** (direkt in Goodnotes einfügen), **PNG** oder **PDF** (über „Teilen“ → Goodnotes). |

**Gut zu wissen**

- ChatGPT-Formatierung wird automatisch umgewandelt: `**fett**` → dicker geschrieben,
  `# Überschrift` → größer + unterstrichen, `- Liste` → saubere Aufzählungspunkte,
  Mathe-Formeln wie `\frac{a}{b}` oder `x^2` → `a/b` und hochgestellte 2.
- Fehlt dir ein Zeichen, zeigt die Vorschau ein rotes Kästchen und einen Button „Jetzt zeichnen“.
- Unter **Stift & Papier** stellst du Tintenfarbe, Stiftdicke, Größe, Abstände, „Natürlichkeit“
  (wie stark die Schrift wackelt) und das Papier (blanko, liniert, kariert, gepunktet; A4/A5/Letter) ein.
- **Neu mischen** würfelt die Zufalls-Schwankungen neu.
- Alles bleibt **auf deinem Gerät**. Mach in den Einstellungen ab und zu ein **Backup**.

---

## Die App online stellen (GitHub Pages, kostenlos)

1. Auf GitHub ins Repository → **Settings** → **Pages**
2. Bei **Source**: „Deploy from a branch“ wählen
3. Branch auswählen (z.B. `main`) und Ordner **`/ (root)`** → **Save**
4. Nach ca. 1 Minute läuft die App unter `https://<dein-name>.github.io/WriteGPT/`
5. Auf dem iPad in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**

> Hinweis: GitHub Pages ist für **öffentliche** Repositories kostenlos. Für private Repos
> braucht man GitHub Pro.

---

## Am Computer testen

```bash
npm start   # startet einen Mini-Server → http://localhost:8080
npm test    # führt die automatischen Tests aus
```

Man braucht nur [Node.js](https://nodejs.org) – keine weiteren Pakete.
(Einfach `index.html` doppelklicken geht nicht: JavaScript-Module brauchen einen Server.)

---

## Wie ist das Projekt aufgebaut?

```
WriteGPT/
├── index.html            Grundgerüst der Seite
├── css/style.css         Das komplette Design (Farben ganz oben als Variablen)
├── js/
│   ├── main.js           Startpunkt: Navigation + die drei Bereiche
│   ├── state.js          Speicher der App (localStorage) + Backup
│   ├── charsets.js       Welche Zeichen es gibt + Ersatzzeichen
│   ├── glyphs.js         Infos über gezeichnete Buchstaben (Breite, Anfang, Ende)
│   ├── editor.js         Das Zeichenfeld für Apple Pencil / Finger
│   ├── markdown.js       ChatGPT-Text → saubere Blöcke (Überschrift, Liste, …)
│   ├── layout.js         Herzstück: Wo landet welcher Buchstabe auf der Seite?
│   ├── render.js         Malt Striche & Papier auf ein <canvas>
│   ├── pdf.js            Baut ein PDF selbst – ohne fremde Bibliothek
│   ├── export.js         PNG, Zwischenablage, Teilen, Herunterladen
│   ├── random.js         Wiederholbarer Zufall (für natürliche Schwankungen)
│   ├── ui.js             Bausteine: Toast, Dialog, Schalter, Schieberegler
│   ├── icons.js          Symbole als SVG
│   └── views/            Die drei Bereiche: write.js, font.js, settings.js
├── sw.js                 Service Worker → App funktioniert offline
├── manifest.webmanifest  Infos für „Zum Home-Bildschirm“ (Name, Icon, Farben)
├── icons/                App-Icons
├── tests/                Automatische Tests (node --test)
└── tools/                Mini-Server + Icon-Generator
```

---

## Wie funktioniert das eigentlich? (Kurz erklärt)

1. **Zeichnen:** Das Zeichenfeld hört auf „Pointer Events“ – ein Event-System für Stift,
   Finger und Maus. Jeder Strich wird als Liste von Punkten gespeichert. Sobald du den
   Apple Pencil benutzt, werden Finger ignoriert (Handballen-Erkennung).
2. **Einheiten statt Pixel:** Punkte werden relativ zu den Hilfslinien gespeichert
   (Grundlinie = 0, Oberlinie = −1). So kann man die Schrift später beliebig groß machen.
3. **Vereinfachen:** Der *Ramer-Douglas-Peucker-Algorithmus* wirft Punkte raus, die fast auf
   einer geraden Linie liegen → weniger Speicher, gleiche Form.
4. **Layout:** Für jeden Buchstaben wird eine Variante zufällig gewählt, minimal gedreht,
   skaliert und verschoben. Wörter, die nicht mehr in die Zeile passen, rutschen in die nächste.
   Bei Schreibschrift wird das Ende eines Buchstabens mit dem Anfang des nächsten verbunden
   (Bézier-Kurve).
5. **Zufall mit Seed:** Derselbe Startwert erzeugt immer dieselben „Zufallszahlen“ → die
   Vorschau wackelt beim Tippen nicht ständig hin und her.
6. **Export:** PNG = Canvas als Bild. PDF = Vektor-Zeichenbefehle → gestochen scharf in Goodnotes.
