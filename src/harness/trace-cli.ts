// Трейс сессии для человека: npm run trace [id] [-- --cwd папка]
// Без id — последняя сессия. Сеть и ключ не нужны: читаем только файл.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_CWD } from './run.ts';
import { latestSession } from './session.ts';
import { formatTrace, parseTrace, traceFile } from './trace.ts';

const { values, positionals } = parseArgs({ options: { cwd: { type: 'string' } }, allowPositionals: true });
const root = path.resolve(values.cwd ?? DEFAULT_CWD);
const id = positionals[0] ?? (await latestSession(root));
if (!id) {
  console.error(`В ${path.relative(process.cwd(), root)}/ ещё нет сессий. Запусти npm run harness.`);
  process.exit(1);
}

const file = traceFile(root, id);
const text = await readFile(file, 'utf8').catch(() => undefined);
if (text === undefined) {
  console.error(`Трейса ${path.relative(process.cwd(), file)} нет.`);
  process.exit(1);
}
console.log(`сессия ${id}`);
console.log(formatTrace(parseTrace(text)));
