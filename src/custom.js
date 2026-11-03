// Eigene Termine aus termine.txt. Eine Zeile pro Termin:
//   14.11.2026 18:00 | Treffen vorm Stadion | Ostkurve | Notiz
//   14.11.2026 18:00-20:00 | Mit Endzeit
//   05.12.2026 | Ganztägig
//   04.12.2026-06.12.2026 | Auswärtsfahrt Frankfurt | Deutsche Bank Park
// Ort und Notiz sind optional. Zeilen mit # sind Kommentare.

const LINE_RE =
  /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4}))?(?:\s+(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?)?\s*\|\s*(.+)$/;

function minutesBetween(a, b) {
  return Math.round((Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi) - Date.UTC(a.y, a.mo - 1, a.d, a.h, a.mi)) / 60000);
}

// Liefert { events, errors }. Fehlerhafte Zeilen werden übersprungen und gemeldet.
export function parseCustom(text) {
  const events = [];
  const errors = [];
  String(text)
    .split(/\r?\n/)
    .forEach((rawLine, i) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;
      const m = line.match(LINE_RE);
      if (!m) {
        errors.push(`Zeile ${i + 1}: "${line}" – Format nicht erkannt`);
        return;
      }
      const [, d1, mo1, y1, d2, mo2, y2, h1, mi1, h2, mi2, rest] = m;
      const [title, location, note] = rest.split('|').map((s) => s.trim());
      if (!title) {
        errors.push(`Zeile ${i + 1}: Titel fehlt`);
        return;
      }
      const day = { y: +y1, mo: +mo1, d: +d1 };
      const endDay = d2 ? { y: +y2, mo: +mo2, d: +d2 } : null;
      const timed = h1 != null;
      const start = timed ? { ...day, h: +h1, mi: +mi1 } : { ...day, h: 0, mi: 0 };

      const ev = {
        kind: 'eigene',
        id: `eigene|${y1}-${mo1}-${d1}|${title}`,
        title: `📌 ${title}`,
        start,
        location: location || null,
        description: note || '',
        alarms: timed ? ['-PT2H'] : [],
      };
      if (timed) {
        const end = h2 != null ? { ...(endDay ?? day), h: +h2, mi: +mi2 } : null;
        ev.durationMin = end ? minutesBetween(start, end) : 120;
        if (ev.durationMin <= 0) {
          errors.push(`Zeile ${i + 1}: Ende liegt vor dem Beginn`);
          return;
        }
      } else {
        ev.allDay = true;
        ev.endDay = endDay ?? day;
      }
      events.push(ev);
    });
  return { events, errors };
}
