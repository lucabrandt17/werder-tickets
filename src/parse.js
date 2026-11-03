// Wandelt die rohen Tabellen in Kalender-Termine um.
// Alle Zeiten sind lokale Zeit Europe/Berlin und werden als
// { y, mo, d, h, mi } gespeichert (kein Date-Objekt, damit keine Zeitzonenfehler entstehen).

const DATE_RE = /(\d{1,2})\.\s*(?:(\d{1,2})\.)?\s*(\d{4}|\d{2}(?!\d))?(?:\s*,?\s*(?:um\s*)?(\d{1,2})[:.](\d{2})\s*Uhr)?/g;

function fullYear(y) {
  if (y == null) return null;
  const n = Number(y);
  return n < 100 ? 2000 + n : n;
}

// Liest alle Datumsangaben aus einem Text. Fehlende Monate/Jahre werden von der
// nächsten vollständigen Angabe übernommen ("20.-30.07.2026" -> 20.07.2026 bis 30.07.2026).
export function extractDates(text) {
  const raw = [];
  for (const m of String(text).matchAll(DATE_RE)) {
    const [, d, mo, y, h, mi] = m;
    raw.push({
      d: Number(d),
      mo: mo ? Number(mo) : null,
      y: fullYear(y),
      h: h != null ? Number(h) : null,
      mi: mi != null ? Number(mi) : null,
    });
  }
  // Nur Treffer behalten, die wirklich nach Datum aussehen (Tag 1-31 und irgendwo ein Monat).
  for (let i = raw.length - 1; i >= 0; i--) {
    const next = raw[i + 1];
    if (raw[i].mo == null && next) raw[i].mo = next.mo;
    if (raw[i].y == null && next) {
      // Jahreswechsel: "28.12.-04.01.2027" -> Start im Vorjahr
      raw[i].y = raw[i].mo > next.mo ? next.y - 1 : next.y;
    }
  }
  return raw.filter((r) => r.mo && r.y && r.d >= 1 && r.d <= 31 && r.mo >= 1 && r.mo <= 12);
}

// "20.-30.07.2026, 10:30 Uhr" / "27.07.-03.08.2026, 10:30 Uhr" /
// "10.08.2026, 10:30 Uhr - max. 07.09.2026, 10:30 Uhr" -> { start, end }
export function parsePhase(text) {
  const dates = extractDates(text);
  if (dates.length === 0) return null;
  const start = { ...dates[0] };
  const end = { ...dates[dates.length - 1] };
  const time = [start, end].find((x) => x.h != null) ?? { h: 10, mi: 30 };
  for (const x of [start, end]) {
    if (x.h == null) {
      x.h = time.h;
      x.mi = time.mi;
    }
  }
  return { start, end: dates.length > 1 ? end : null };
}

// Sucht in "weitere Informationen" nach einem Restkarten-Start mit Uhrzeit.
export function parseRestkarten(text) {
  if (!/restkarte|rückläufer|freie[rn]? verkauf|verkaufsstart/i.test(text)) return null;
  const withTime = extractDates(text).filter((x) => x.h != null);
  return withTime[0] ?? null;
}

// Saison aus einem Datum: Juli-Dezember Y -> "Y/Y+1", Januar-Juni -> "Y-1/Y".
export function seasonOf({ y, mo }) {
  const startYear = mo >= 7 ? y : y - 1;
  return `${startYear}/${String(startYear + 1).slice(2)}`;
}

function norm(name) {
  return name.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
}

// "DFB Pokal - LSK Hansa" -> "LSK Hansa (DFB-Pokal)"
function displayName(name) {
  const m = name.match(/^DFB[- ]Pokal\s*-\s*(.+)$/i);
  return m ? `${m[1].trim()} (DFB-Pokal)` : name;
}

function classify(table) {
  const h = table.headers.join(' ').toLowerCase();
  if (h.includes('bearbeitungsstand')) return 'status';
  if (h.includes('bestellphase')) {
    return /freikarte/i.test(table.section) ? 'freikarten' : 'fristen';
  }
  return 'other';
}

// tables: Ergebnis von fetchAll() -> Liste von Kalender-Terminen
export function buildEvents(tables, pages) {
  const events = [];
  for (const [venue, list] of Object.entries(tables)) {
    const url = pages[venue];
    const venueLabel = venue === 'heim' ? 'Heim' : 'Auswärts';
    const statusTable = list.find((t) => classify(t) === 'status');
    const status = new Map(
      (statusTable?.rows ?? []).map((r) => [norm(r[0] ?? ''), { stand: r[1], frei: r[2], info: r[3] }]),
    );
    const findStatus = (opponent) => {
      const key = norm(opponent);
      if (status.has(key)) return status.get(key);
      for (const [k, v] of status) if (k && (key.endsWith(k) || k.endsWith(key))) return v;
      return null;
    };

    for (const table of list) {
      const kind = classify(table);
      if (kind !== 'fristen' && kind !== 'freikarten') continue;
      for (const row of table.rows) {
        const [spieltermin = '', rawOpponent = '', phaseText = '', info = ''] = row;
        const opponent = displayName(rawOpponent);
        if (!opponent || opponent === '-') continue;
        const phase = parsePhase(phaseText);
        if (!phase) continue;
        const st = kind === 'fristen' ? findStatus(opponent) : null;
        const label = kind === 'freikarten' ? 'Freikarten aktive Mitglieder' : 'Bestellphase';
        const season = seasonOf(phase.start);
        const details = [
          `${venueLabel}spiel: ${opponent}`,
          `Spieltermin: ${spieltermin || 'noch offen'}`,
          `${label}: ${phaseText}`,
          info && info !== '-' ? `Hinweis: ${info}` : null,
          st?.stand && st.stand !== '-' ? `Bearbeitungsstand: ${st.stand}` : null,
          url,
        ].filter(Boolean);
        const base = { venue, opponent, season, url, kind };

        events.push({
          ...base,
          id: `${kind}-start|${venue}|${opponent}|${season}`,
          title: `🎟️ ${label} startet: ${venueLabel} vs ${opponent}`,
          start: phase.start,
          durationMin: 30,
          alarms: ['-P1D', '-PT15M'],
          description: details.join('\n'),
        });
        // "Bestellannahme wegen hoher Nachfrage vorzeitig beendet." -> keine Erinnerung ans Ende mehr
        const closedEarly = /vorzeitig beendet|ausverkauft|keine (weiteren )?bestellungen/i.test(info);
        if (phase.end && !closedEarly) {
          const endEvent = { ...phase.end };
          // Termin endet zur genannten Uhrzeit, beginnt eine Stunde vorher.
          const startEnd = { ...endEvent, h: endEvent.h - 1 };
          events.push({
            ...base,
            id: `${kind}-ende|${venue}|${opponent}|${season}`,
            title: `⏰ Letzte Chance: ${label} ${venueLabel} vs ${opponent}`,
            start: startEnd,
            durationMin: 60,
            alarms: ['-P1D', '-PT1H'],
            description: [
              `Die ${label} endet voraussichtlich am ${fmt(endEvent)} Uhr – lieber vorher bestellen!`,
              ...details,
            ].join('\n'),
          });
        }
      }
    }

    // Restkarten-Starts aus dem Bearbeitungsstand
    for (const row of statusTable?.rows ?? []) {
      const [opponent = '', stand = '', , info = ''] = row;
      const when = parseRestkarten(info);
      if (!opponent || !when) continue;
      const season = seasonOf(when);
      const membersOnly = /nur für mitglieder|ausschließlich für mitglieder/i.test(info);
      events.push({
        venue,
        opponent,
        season,
        url,
        kind: 'restkarten',
        id: `restkarten|${venue}|${opponent}|${season}`,
        title: `🎫 Restkarten: ${venueLabel} vs ${opponent}${membersOnly ? ' (nur Mitglieder)' : ''}`,
        start: when,
        durationMin: 30,
        alarms: ['-PT1H', '-PT5M'],
        description: [`${venueLabel}spiel: ${opponent}`, `Bearbeitungsstand: ${stand}`, `Info: ${info}`, url].join(
          '\n',
        ),
      });
    }
  }
  return events;
}

export function fmt({ d, mo, y, h, mi }) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d)}.${p(mo)}.${y}${h != null ? `, ${p(h)}:${p(mi)}` : ''}`;
}
