import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

/** Порт из PORT, потом из config.json, а если нет и там — 3000. */
export const PORT = Number(process.env.PORT ?? config.port ?? 3000);

export function address() {
  return `http://${config.host}:${PORT}`;
}
