import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePhase, parseRestkarten, seasonOf, buildEvents } from '../src/parse.js';
import { buildIcs } from '../src/ics.js';

const t = (y, mo, d, h, mi) => ({ y, mo, d, h, mi });

test('Bestellphase innerhalb eines Monats', () => {
  assert.deepEqual(parsePhase('02.-09.11.2026, 10:30 Uhr'), {
    start: t(2026, 11, 2, 10, 30),
    end: t(2026, 11, 9, 10, 30),
  });
});

test('Bestellphase über Monatsgrenze', () => {
  assert.deepEqual(parsePhase('27.07.-03.08.2026, 10:30 Uhr'), {
    start: t(2026, 7, 27, 10, 30),
    end: t(2026, 8, 3, 10, 30),
  });
});

test('Bestellphase über Jahreswechsel', () => {
  const { start, end } = parsePhase('28.12.-04.01.2027, 10:30 Uhr');
  assert.deepEqual(start, t(2026, 12, 28, 10, 30));
  assert.deepEqual(end, t(2027, 1, 4, 10, 30));
});

test('Freikarten-Format mit zwei vollen Daten', () => {
  assert.deepEqual(parsePhase('10.08.2026, 10:30 Uhr - max. 07.09.2026, 10:30 Uhr'), {
    start: t(2026, 8, 10, 10, 30),
    end: t(2026, 9, 7, 10, 30),
  });
});

test('Keine Phase', () => {
  assert.equal(parsePhase('-'), null);
  assert.equal(parsePhase('Wird noch bekanntgegeben.'), null);
});

test('Restkarten-Hinweise', () => {
  assert.deepEqual(
    parseRestkarten('Restkartenverkauf startet voraussichtlich am 03.11.2026 10:30 Uhr - Nur für Mitglieder!'),
    t(2026, 11, 3, 10, 30),
  );
  assert.deepEqual(
    parseRestkarten('Aufgrund technischer Probleme startet der Restkartenverkauf voraussichtlich 07.10.2026 15:30 Uhr.'),
    t(2026, 10, 7, 15, 30),
  );
  assert.equal(parseRestkarten('ggf. Restkarten im Onlineshop'), null);
});

test('Saison', () => {
  assert.equal(seasonOf({ y: 2026, mo: 11 }), '2026/27');
  assert.equal(seasonOf({ y: 2027, mo: 1 }), '2026/27');
});

test('Echte Seitendaten ergeben gültigen Kalender', () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/raw.json', import.meta.url), 'utf8'));
  const events = buildEvents(raw, { heim: 'https://x/heim', auswaerts: 'https://x/ausw' });
  const titles = events.map((e) => e.title);
  assert.ok(titles.includes('🎟️ Bestellphase startet: Heim vs 1. FC Union Berlin'));
  assert.ok(titles.includes('🎟️ Bestellphase startet: Auswärts vs FC Schalke 04'));
  assert.ok(titles.some((x) => x.startsWith('🎫 Restkarten: Heim vs Hamburger SV')));
  assert.ok(titles.some((x) => x.includes('Freikarten')));
  assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'IDs eindeutig');

  const ics = buildIcs(events);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, events.length);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
});
