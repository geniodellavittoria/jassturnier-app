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
- **Präsentation** — Vollbild-Ansicht für den Beamer: Titelfolie, eine Übersichtsfolie mit
  allen Gruppen der Gruppenphase, eine mit allen Finalgruppen, sowie KO-Tableau und Podest.
  Steuerung: `←`/`→` Folien, `Leertaste` Pause, `F` Vollbild.
- **Anmeldung** (`/anmelden`) — öffentliches Formular, mit dem sich Teams selbst anmelden können.
- **Verwaltung** (`/verwaltung`, passwortgeschützt) — Anmeldungen einsehen und deren Status
  nachführen, Zahlungsinformationen (IBAN, Betrag, Frist, Nachricht) konfigurieren. Für jede
  Anmeldung wird daraus ein `mailto:`-Link bzw. kopierbarer E-Mail-Text erzeugt — der Versand
  erfolgt manuell über das eigene Mail-Programm des Organisators (kein automatischer Mailversand).
- Turnierdaten (Gruppen, Teams, Punkte) werden automatisch im Browser gespeichert (localStorage).
  Anmeldungen und Zahlungsinformationen liegen dagegen serverseitig in Cloudflare D1, damit sie
  unabhängig vom Gerät des jeweiligen Teams für den Organisator sichtbar sind.

## Entwicklung

```bash
npm install
npm start          # http://localhost:4200 — nur die Turnier-Ansichten (kein Backend)
```

Für Anmeldung/Verwaltung wird die Worker-API benötigt. Entweder alles zusammen bauen und starten:

```bash
npm run cf:dev      # baut die App und startet sie inkl. API via wrangler dev
```

...oder für Live-Reload während der Entwicklung, zwei Terminals:

```bash
npx wrangler dev              # Terminal 1: nur die API (Port 8787)
npm run start:full            # Terminal 2: ng serve mit Proxy auf /api → 8787
```

Für die Verwaltung lokal ein `.dev.vars` (siehe `.dev.vars.example`) mit `ADMIN_PASSWORD` und
`SESSION_SECRET` anlegen — die Datei ist git-ignoriert.

## Produktion

Deployt als Cloudflare Worker (statische Assets + kleine API unter `/api/*`, siehe `wrangler.jsonc`).

Einmalige Einrichtung:

```bash
npx wrangler d1 create jass-turnier-db      # database_id in wrangler.jsonc eintragen
npx wrangler d1 migrations apply jass-turnier-db --remote
npx wrangler secret put ADMIN_PASSWORD      # eigenes Verwaltungs-Passwort
npx wrangler secret put SESSION_SECRET      # beliebiger langer Zufallsstring
```

Danach:

```bash
npm run deploy      # baut die App und deployt via wrangler
```

## Stack

Angular 20 (Standalone-Komponenten, Signals, OnPush, Lazy Routes), SCSS,
selbst gehostete Schriften (Fontsource: Bricolage Grotesque, Instrument Sans).
Deployment: Cloudflare Workers (statische Assets + API), Cloudflare D1 für Anmeldungen
und Zahlungsinformationen.
