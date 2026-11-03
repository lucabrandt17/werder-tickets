# Werder Ticket-Fristen als Kalender-Abo

Liest die Tabellen „Bestellfristen“, „Bearbeitungsstand“ und „Freikarten für aktive Mitglieder“ von
[Heimspiele](https://www.werder.de/tickets/maenner/heimspiele) und
[Auswärtsspiele](https://www.werder.de/tickets/maenner/auswaertsspiele) aus und erzeugt daraus
`docs/werder-tickets.ics`. GitHub Pages hostet die Datei, und iPhone/Google/Outlook abonnieren sie.

**Termine pro Spiel**
- 🎟️ Bestellphase startet (10:30, Erinnerung am Vortag und 15 Minuten vorher)
- ⏰ Letzte Chance (eine Stunde vor Ende, Erinnerung am Vortag und eine Stunde vorher)
- 🎫 Restkarten-Start, wenn er im Bearbeitungsstand angekündigt ist

## Wie es läuft
werder.de liegt hinter einem Bot-Schutz (Vercel Security Checkpoint). Deshalb liest ein lokal
installierter Edge (über `playwright-core`) die Seiten **auf diesem PC** aus. Die Windows-Aufgabenplanung
startet `run.ps1` zweimal am Tag. Nur wenn sich etwas geändert hat, wird committet und gepusht.

```
npm run update   # auslesen, schreiben, pushen
npm run dry      # nur lokal erzeugen
npm test
```

Logs: `logs/JJJJ-MM.log`. Vergangene Termine bleiben in `data/events.json` erhalten, auch wenn
Werder die Zeilen von der Seite nimmt.
