// Erzeugt eine iCalendar-Datei (RFC 5545), die iPhone, Google und Outlook abonnieren können.
import { createHash } from 'node:crypto';

const TZ = 'Europe/Berlin';
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const p = (n) => String(n).padStart(2, '0');

function localStamp({ y, mo, d, h, mi }) {
  return `${y}${p(mo)}${p(d)}T${p(h)}${p(mi)}00`;
}

function addMinutes(t, minutes) {
  // Rechnen in UTC ist hier nur Kalenderarithmetik, die Zeitzone bleibt TZID.
  const dt = new Date(Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi + minutes));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes() };
}

function dateStamp({ y, mo, d }) {
  return `${y}${p(mo)}${p(d)}`;
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Zeilen nach 75 Bytes umbrechen (UTF-8-sicher).
function fold(line) {
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function uidFor(id) {
  return `${createHash('sha1').update(id).digest('hex').slice(0, 20)}@werder-tickets`;
}

export function buildIcs(events, { name = 'Werder Tickets – Bestellfristen', now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//werder-tickets//Bestellfristen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-CALDESC:Bestellphasen\\, Freikarten und Restkarten von werder.de (inoffiziell\\, automatisch erstellt)',
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...VTIMEZONE,
  ];
  const stamp = utcStamp(now);
  const sorted = [...events].sort((a, b) => localStamp(a.start).localeCompare(localStamp(b.start)));
  for (const ev of sorted) {
    lines.push('BEGIN:VEVENT', `UID:${uidFor(ev.id)}`, `DTSTAMP:${stamp}`);
    if (ev.allDay) {
      // DTEND ist bei ganztägigen Terminen exklusiv, also Folgetag.
      lines.push(
        `DTSTART;VALUE=DATE:${dateStamp(ev.start)}`,
        `DTEND;VALUE=DATE:${dateStamp(addMinutes({ ...ev.endDay, h: 0, mi: 0 }, 24 * 60))}`,
      );
    } else {
      lines.push(
        `DTSTART;TZID=${TZ}:${localStamp(ev.start)}`,
        `DTEND;TZID=${TZ}:${localStamp(addMinutes(ev.start, ev.durationMin))}`,
      );
    }
    lines.push(`SUMMARY:${escapeText(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.url) lines.push(`URL:${ev.url}`);
    lines.push(`CATEGORIES:${escapeText(ev.kind)}`, ev.kind === 'eigene' ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT');
    for (const trigger of ev.alarms ?? []) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(ev.title)}`,
        `TRIGGER:${trigger}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
