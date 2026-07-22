# Jassturnier

Web-App zum Durchführen eines Jassturniers im Modus des «Spielplan Jassturnier 2025»:
Gruppenphase (Round Robin mit Streichresultat), Finalgruppen, Halbfinals, Kleiner Final und Final —
inklusive Beamer-tauglicher Präsentationsansicht im Jasstafel-Look.

## Funktionen

- **Einrichtung** — Turniername, Regeln (Runden, Streichresultat, Aufsteiger pro Gruppe),
  Gruppen und Teams mit Spielernamen. Demo-Daten des Turniers 2025 sind eingebaut.
- **Gruppenphase** — Punkteeingabe pro Runde, automatische Rangliste
  (Total abzüglich schlechtester Runde = Streichresultat), generierter Spielplan pro Gruppe.
- **Finalrunde** — Auslosung der Finalgruppen aus den Gruppenranglisten (Serpentinen-Setzung),
  Punkteeingabe, automatische Setzung der Halbfinals (Gruppensieger + bester Zweiter),
  Kleiner Final und Final mit Siegerehrung.
- **Präsentation** — Vollbild-Ansicht für den Beamer: rotierende Folien pro Gruppe mit
  Rangliste und «Jetzt an den Tischen», KO-Tableau und Podest.
  Steuerung: `←`/`→` Folien, `Leertaste` Pause, `F` Vollbild.
- Alles wird automatisch im Browser gespeichert (localStorage) — kein Server nötig.

## Entwicklung

```bash
npm install
npm start          # http://localhost:4200
```

## Produktion

```bash
npm run build      # Ausgabe in dist/jass-turnier/browser
```

Der Inhalt von `dist/jass-turnier/browser` kann auf jedem statischen Webhost
(Netlify, GitHub Pages, eigener Server) deployt werden. Für Unterpfade `--base-href` setzen.

## Stack

Angular 20 (Standalone-Komponenten, Signals, OnPush, Lazy Routes), SCSS,
selbst gehostete Schriften (Fontsource: Bricolage Grotesque, Instrument Sans).
