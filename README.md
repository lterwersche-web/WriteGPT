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
- **Radierer** (unten in der Leiste): Mit dem Stift über Buchstaben wischen → sie verschwinden.
  Wählbar: *Lücke lassen* oder *Zusammenrücken*. Mit „Rückgängig“ und „Alles zurück“.
- **Wort antippen** → *Neu würfeln* (andere Varianten), *Wegradieren*, *Wiederherstellen*
  oder *„x“ neu zeichnen* (springt direkt zur Zeichnung, die komisch aussieht).
- **Automatisch ausrichten** (Einstellungen, standardmäßig an): rückt Buchstaben auf die
  Grundlinie, gleicht zu große/kleine Buchstaben an und entfernt verirrte Mini-Striche.
- **Vorlage beim Zeichnen:** Die vorherige Variante liegt blass im Hintergrund → gleichmäßigere Schrift.

### Lernzettel & Karteikarten (Stift & Papier → Tabs „Seite“ und „Lernzettel“)

| Was | So geht's |
|---|---|
| Textmarker | `==Text==` im Text – oder **fett** automatisch als Textmarker |
| Fett als … | Dicker · Textmarker · Unterstrichen |
| Überschriften | eigene Farbe, optional zentriert |
| Merkkasten | `> Merke: …` → handgezeichneter Kasten |
| Kopfzeile | Thema links, Datum rechts – auf jeder Seite |
| Seitenzahlen | unten rechts, in deiner Handschrift |
| Karteikarten | Format „Karte“ (A6 quer) + „--- startet neue Seite“ |
| Heft-Look | rote Randlinie, liniert/kariert/gepunktet |
| Füller | Stiftart „Füller“: Strich wird je nach Richtung dick oder dünn |

### Organisation

- **Meine Texte:** beliebig viele Texte speichern und wechseln (inkl. Radierungen).
- **Meine Schriften:** mehrere Handschriften (z.B. Druck- & Schreibschrift, Geschwister).
- **Beispiel ausprobieren:** ein Klick zeigt alle Lernzettel-Funktionen.
- **Tastenkürzel:** ⌘⇧C kopieren · ⌘⇧S PDF · ⌘E Radierer · ⌘Z rückgängig · Esc schließen.
- Unter **Stift & Papier** stellst du Tintenfarbe, Stiftdicke, Größe, Abstände, „Natürlichkeit“
  (wie stark die Schrift wackelt) und das Papier (blanko, liniert, kariert, gepunktet; A4/A5/Letter) ein.
- **Neu mischen** würfelt die Zufalls-Schwankungen neu.
- Alles bleibt **auf deinem Gerät**. Mach in den Einstellungen ab und zu ein **Backup**.

> **Radieren in Goodnotes:** Der Goodnotes-Radierer wirkt nur auf Striche, die direkt in
> Goodnotes gezeichnet wurden – nicht auf eingefügte Bilder oder PDFs. Deshalb: vorher in
> WriteGPT radieren, oder in Goodnotes mit einem weißen Stift drübermalen.

---

## Die App online stellen (Netlify, kostenlos – ohne GitHub)

1. Die Datei **WriteGPT-zum-Hochladen.zip** entpacken (oder diesen Projektordner nehmen).
2. **https://app.netlify.com/drop** öffnen.
3. Den Ordner auf die Fläche ziehen → nach ein paar Sekunden läuft die App unter einer `…netlify.app`-Adresse.
4. **Wichtig:** Ein kostenloses Netlify-Konto anlegen und die Seite „claimen“ – sonst wird sie nach
   kurzer Zeit (ca. 1 Stunde) wieder gelöscht. Im Konto kannst du auch einen schöneren Namen wählen.
5. Auf dem iPad in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.

**Update einspielen:** In Netlify die Seite öffnen → *Deploys* → den neuen Ordner in die Upload-Fläche ziehen.

> Tipp: Ordner hochladen klappt am Computer am zuverlässigsten. Die Datei `_headers` sorgt dafür,
> dass iPads Updates sofort bekommen.

---

## Sichern & Weiterarbeiten (ohne GitHub)

- **Sicherung:** Die Datei **WriteGPT-komplett-mit-Verlauf.zip** enthält alles – inklusive der
  kompletten Versionsgeschichte (Ordner `.git`). In iCloud Drive o.ä. aufheben.
- **Mit Claude weiterarbeiten:** Am einfachsten mit **Claude Code am Computer** (Desktop-App oder
  Terminal): ZIP entpacken, Ordner öffnen, loslegen – dafür braucht man kein GitHub.
- Versionsverwaltung funktioniert ganz normal lokal mit `git` (`git log`, `git commit` …).

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
│   ├── state.js          Speicher: Schriften, Texte, Einstellungen (localStorage) + Backup
│   ├── charsets.js       Welche Zeichen es gibt + Ersatzzeichen
│   ├── glyphs.js         Infos über gezeichnete Buchstaben (Breite, Anfang, Ende)
│   ├── editor.js         Das Zeichenfeld für Apple Pencil / Finger
│   ├── markdown.js       ChatGPT-Text → saubere Blöcke (Überschrift, Liste, ==Marker==, …)
│   ├── edits.js          Radierungen & „Neu würfeln“ dem richtigen Zeichen zuordnen
│   ├── layout.js         Herzstück: Wo landet welcher Buchstabe auf der Seite?
│   ├── render.js         Malt Striche & Papier auf ein <canvas>
│   ├── pdf.js            Baut ein PDF selbst – ohne fremde Bibliothek
│   ├── export.js         PNG, Zwischenablage, Teilen, Herunterladen
│   ├── random.js         Wiederholbarer Zufall (für natürliche Schwankungen)
│   ├── ui.js             Bausteine: Toast, Dialog, Schalter, Schieberegler
│   ├── icons.js          Symbole als SVG
│   └── views/            Die drei Bereiche: write.js, font.js, settings.js
├── sw.js                 Service Worker → App funktioniert offline
├── _headers              Einstellungen für das Hosting bei Netlify
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
7. **Saubere Striche:** Jeder Strich wird in „harmlose“ Stücke zerlegt (zu dichte Punkte raus,
   an Ecken trennen, weiche Kurve durch die Punkte, sehr enge Kurven trennen). Sonst entstehen in
   Apples Grafik-Engine (Goodnotes, Safari) kleine Löcher – die „weißen Punkte“.
8. **Auto-Fix:** Die App berechnet aus allen deinen Buchstaben den typischen Wert (Median) für
   Größe und Grundlinie und rückt Ausreißer zurecht – deine Zeichnungen selbst bleiben unverändert.
9. **Füller:** Jedes Strich-Stück bekommt je nach Richtung (Winkel zur schrägen Feder) eine von
   6 Dicken. Gleiche Dicken werden gemeinsam gezeichnet.
10. **Textmarker im PDF:** Ein PDF-„Grafik-Zustand“ (ExtGState) mit 50 % Deckkraft macht den
    Marker durchscheinend – genau wie ein echter Textmarker.
