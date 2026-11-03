// Öffnet die Werder-Ticketseiten in einem echten, lokal installierten Browser
// (Edge bzw. Chrome) und liest die Tabellen als Text aus.
import { chromium } from 'playwright-core';

export const PAGES = {
  heim: 'https://www.werder.de/tickets/maenner/heimspiele',
  auswaerts: 'https://www.werder.de/tickets/maenner/auswaertsspiele',
};

const CHANNELS = ['msedge', 'chrome'];

async function launch(headless) {
  let lastErr;
  for (const channel of CHANNELS) {
    try {
      return await chromium.launch({ channel, headless });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Liefert alle Tabellen der Seite als { section, headers, rows }.
// `section` ist die Überschrift des Akkordeons, in dem die Tabelle steckt
// (z. B. "FREIKARTEN FÜR AKTIVE MITGLIEDER"), sonst leer.
async function readTables(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Falls zuerst die Sicherheitsseite kommt, wartet der Browser, bis die echte Seite da ist.
  await page.waitForSelector('table', { state: 'attached', timeout: 60_000 });
  return page.$$eval('table', (tables) =>
    tables.map((table) => {
      const cellText = (td) => (td.textContent || '').replace(/\s+/g, ' ').trim();
      const rows = [...table.rows].map((tr) => [...tr.cells].map(cellText));
      const accordion = table.closest('div.border-b');
      const heading = accordion?.firstElementChild;
      const section = heading ? (heading.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      return { section, headers: rows[0] ?? [], rows: rows.slice(1) };
    }),
  );
}

export async function fetchAll({ headless = true } = {}) {
  const browser = await launch(headless);
  try {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    const result = {};
    for (const [key, url] of Object.entries(PAGES)) {
      result[key] = await readTables(page, url);
    }
    return result;
  } finally {
    await browser.close();
  }
}
