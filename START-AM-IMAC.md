# 🚀 WriteGPT am iMac weitermachen

So bringst du das Projekt vom iPad auf den iMac und arbeitest mit Claude Code weiter –
ganz ohne GitHub.

## 1. Datei rüberschicken
1. Auf dem iPad die Datei **WriteGPT-fuer-iMac.zip** in der **Dateien**-App speichern
   (z.B. in iCloud Drive).
2. Auf den iMac schicken: per **AirDrop** – oder einfach über **iCloud Drive** im Finder öffnen.
3. Am iMac die ZIP **doppelklicken** → es entsteht der Ordner **WriteGPT**.
   Am besten nach **Dokumente** verschieben.

> Der komplette Versionsverlauf steckt im versteckten Ordner `.git`.
> Sichtbar machen im Finder: **⌘ + ⇧ + .** (Punkt). Nicht löschen!

## 2. Claude Code installieren (einmalig)
Voraussetzungen: macOS 13 oder neuer und ein bezahlter Claude-Tarif (Pro, Max …) –
im kostenlosen Tarif ist Claude Code nicht enthalten.

**Variante A – Desktop-App (ohne Terminal):**
1. Die Claude-Desktop-App für macOS laden und installieren, einloggen.
2. Den Tab **Code** öffnen.
3. Unter dem Eingabefeld bei der Umgebung **Local** wählen.
4. Daneben den Projektordner auswählen → **WriteGPT**.

**Variante B – Terminal:**
1. Programm **Terminal** öffnen (⌘ + Leertaste → „Terminal“).
2. Diesen Befehl einfügen und Enter drücken:
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```
3. Ein **neues** Terminal-Fenster öffnen und prüfen: `claude --version` → zeigt eine Versionsnummer.
4. In den Projektordner wechseln: `cd ` tippen (mit Leerzeichen), den Ordner **WriteGPT** aus dem
   Finder ins Terminal ziehen, Enter.
5. `claude` eintippen, Enter → beim ersten Mal im Browser einloggen.

## 3. Loslegen
Schreib Claude als erstes zum Beispiel:

> Lies CLAUDE.md und README.md, zeig mir den Git-Verlauf und lass die Tests laufen.

Claude liest `CLAUDE.md` automatisch und kennt dann das ganze Projekt.
Im Verlauf sollten 5 Versionen stehen (die neueste: „Projekt für den iMac vorbereitet“).

**Für Tests & Vorschau am Mac** (`npm test`, `npm start`) braucht man **Node.js**
(die LTS-Version von nodejs.org). Claude Code selbst braucht es nicht – Claude hilft dir beim Installieren.

## Hilfe
- Installation: https://code.claude.com/docs/en/setup
- Erste Schritte: https://code.claude.com/docs/en/quickstart
- Desktop-App: https://code.claude.com/docs/en/desktop
- „command not found“ nach der Installation: https://code.claude.com/docs/en/troubleshoot-install
