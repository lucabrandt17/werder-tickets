// Baut die fertige Website: Werder-Fristen (data/events.json) + eigene Termine (termine.txt)
// -> <out>/werder-tickets.ics, dazu die Abo-Seite aus docs/.
//   node src/build.js            schreibt nach _site/
//   node src/build.js --out x    schreibt nach x/
// Läuft in der GitHub Action bei jedem Push, braucht keinen Browser.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCustom } from './custom.js';
import { buildIcs } from './ics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildCalendar() {
  const store = JSON.parse(readFileSync(join(ROOT, 'data', 'events.json'), 'utf8'));
  const customFile = join(ROOT, 'termine.txt');
  const { events: custom, errors } = existsSync(customFile)
    ? parseCustom(readFileSync(customFile, 'utf8'))
    : { events: [], errors: [] };
  return { ics: buildIcs([...Object.values(store), ...custom]), werder: Object.keys(store).length, custom, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = resolve(ROOT, i > -1 ? process.argv[i + 1] : '_site');
  const { ics, werder, custom, errors } = buildCalendar();
  mkdirSync(out, { recursive: true });
  cpSync(join(ROOT, 'docs'), out, { recursive: true });
  writeFileSync(join(out, 'werder-tickets.ics'), ics);
  console.log(`${werder} Werder-Termine + ${custom.length} eigene Termine -> ${out}`);
  for (const e of errors) console.log(`::warning title=termine.txt::${e}`);
}
