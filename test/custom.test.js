import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCustom } from '../src/custom.js';
import { buildIcs } from '../src/ics.js';

const sample = `
# Kommentar
14.11.2026 18:00 | Treffen vorm Stadion | Ostkurve
14.11.2026 18:00-20:30 | Stammtisch | Kneipe | Tisch reserviert
05.12.2026 | Ganztägig
04.12.2026-06.12.2026 | Auswärtsfahrt Frankfurt | Deutsche Bank Park
Kaputte Zeile ohne Datum
`;

test('Eigene Termine werden erkannt', () => {
  const { events, errors } = parseCustom(sample);
  assert.equal(events.length, 4);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Zeile 7/);

  const [treffen, stammtisch, tag, fahrt] = events;
  assert.deepEqual(treffen.start, { y: 2026, mo: 11, d: 14, h: 18, mi: 0 });
  assert.equal(treffen.durationMin, 120);
  assert.equal(treffen.location, 'Ostkurve');
  assert.equal(stammtisch.durationMin, 150);
  assert.equal(stammtisch.description, 'Tisch reserviert');
  assert.ok(tag.allDay);
  assert.deepEqual(fahrt.endDay, { y: 2026, mo: 12, d: 6 });
});

test('Ganztägige Termine im ICS mit exklusivem Ende', () => {
  const { events } = parseCustom('04.12.2026-06.12.2026 | Auswärtsfahrt | Frankfurt');
  const ics = buildIcs(events);
  assert.match(ics, /DTSTART;VALUE=DATE:20261204\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261207\r\n/);
  assert.match(ics, /LOCATION:Frankfurt\r\n/);
});

test('Ende vor Beginn wird abgelehnt', () => {
  const { events, errors } = parseCustom('14.11.2026 20:00-18:00 | Falsch');
  assert.equal(events.length, 0);
  assert.equal(errors.length, 1);
});
