// Каждому тесту — своя копия data/: агент заводит тикеты, и настоящие данные трогать нельзя.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const created: string[] = [];
process.on('exit', () => created.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

export function freshData(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'support-data-'));
  created.push(dir);
  cpSync('data', dir, { recursive: true });
  return dir;
}
