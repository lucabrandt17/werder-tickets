// Täglicher Lauf: Seiten auslesen -> Termine in data/events.json -> zu GitHub pushen.
// Den Kalender selbst baut danach die GitHub Action (src/build.js).
//   node src/main.js            normaler Lauf
//   node src/main.js --no-push  nur lokal erzeugen (inkl. Vorschau in _site/)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAll, PAGES } from './fetch.js';
import { buildEvents, fmt } from './parse.js';
import { buildCalendar } from './build.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'data', 'events.json');
const PREVIEW = join(ROOT, '_site', 'werder-tickets.ics');
const push = !process.argv.includes('--no-push');

const log = (...a) => console.log(new Date().toISOString(), ...a);

function loadStore() {
  if (!existsSync(STORE)) return {};
  return JSON.parse(readFileSync(STORE, 'utf8'));
}

function isPast({ y, mo, d }) {
  const today = new Date();
  return new Date(y, mo - 1, d + 1) < today;
}

// Neue Termine übernehmen; Termine, die von der Seite verschwunden sind, nur behalten,
// wenn sie schon vorbei sind (Werder räumt alte Zeilen manchmal ab).
function merge(oldStore, fresh) {
  const next = {};
  for (const ev of fresh) next[ev.id] = ev;
  for (const [id, ev] of Object.entries(oldStore)) {
    if (!next[id] && isPast(ev.start)) next[id] = ev;
  }
  return next;
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

async function main() {
  log('Lese werder.de …');
  const tables = await fetchAll();
  const fresh = buildEvents(tables, PAGES);
  if (fresh.length === 0) {
    throw new Error('Keine Termine gefunden – hat sich die Werder-Seite geändert? Nichts überschrieben.');
  }

  const oldStore = loadStore();
  const store = merge(oldStore, fresh);
  const added = Object.keys(store).filter((id) => !oldStore[id]);
  const changed = Object.keys(store).filter(
    (id) => oldStore[id] && JSON.stringify(oldStore[id]) !== JSON.stringify(store[id]),
  );
  const removed = Object.keys(oldStore).filter((id) => !store[id]);
  log(`${fresh.length} Termine auf der Seite, ${added.length} neu, ${changed.length} geändert, ${removed.length} entfernt.`);
  for (const id of added) log('  neu:', store[id].title, '–', fmt(store[id].start));
  for (const id of removed) log('  entfernt:', oldStore[id].title);

  if (added.length === 0 && changed.length === 0 && removed.length === 0) {
    log('Keine Änderungen.');
    return;
  }

  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n');
  log('Termine gespeichert:', STORE);

  if (!push) {
    mkdirSync(dirname(PREVIEW), { recursive: true });
    writeFileSync(PREVIEW, buildCalendar().ics);
    log('Vorschau geschrieben:', PREVIEW);
    return;
  }
  git('add', 'data/events.json');
  const summary = [
    added.length && `${added.length} neu`,
    changed.length && `${changed.length} geändert`,
    removed.length && `${removed.length} entfernt`,
  ]
    .filter(Boolean)
    .join(', ');
  git('commit', '-m', `Kalender-Update: ${summary}`);
  git('push');
  log('Gepusht.');
}

main().catch((err) => {
  log('FEHLER:', err.message);
  process.exit(1);
});
