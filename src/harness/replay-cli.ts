// Повторить сессию без сети: npm run replay [id] [-- --max-steps N] [-- --cwd папка]
// Модель и инструменты отвечают из трейса, а цикл, лимиты, сжатие и вывод — настоящие, из текущего кода.
// --max-steps меняет лимит шагов: «что было бы, если…» без единого запроса к модели.
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHarness } from './create.ts';
import { replay, replayProvider } from './replay.ts';
import { DEFAULT_CWD, harnessPrinter } from './run.ts';
import { latestSession } from './session.ts';
import { fromSettings, loadSettings } from './settings.ts';
import { parseTrace, traceFile } from './trace.ts';

const { values, positionals } = parseArgs({
  options: { cwd: { type: 'string' }, 'max-steps': { type: 'string' } },
  allowPositionals: true,
});
const root = path.resolve(values.cwd ?? DEFAULT_CWD);
const id = positionals[0] ?? (await latestSession(root));
if (!id) {
  console.error('Сессий нет. Запусти npm run harness.');
  process.exit(1);
}
const records = parseTrace(await readFile(traceFile(root, id), 'utf8'));

// Тот же harness, что в сессии: настройки проекта, system, лимиты, порог сжатия. Без MCP и хуков: инструменты — из записи.
const { settings } = await loadSettings({ home: os.homedir(), root });
const options = fromSettings({ settings, headless: true });
const maxSteps = values['max-steps'] === undefined ? undefined : Number(values['max-steps']);
const provider = replayProvider(records);
const harness = await createHarness({
  root,
  provider,
  ...options,
  limits: { ...options.limits, ...(maxSteps ? { maxSteps } : {}) },
  skillDirs: [path.resolve('skills'), ...(options.skillDirs ?? [])],
  mcp: { mcpServers: {} },
  hooks: {},
  stream: false,
  ...harnessPrinter(process.stdout),
});

console.log(`replay> сессия ${id} · ответов модели в записи: ${provider.remaining}${maxSteps ? ` · maxSteps ${maxSteps}` : ''}`);
const { runs, recorded } = await replay(records, harness.agent);
await harness.close();

console.log('\nreplay> как остановились задачи:');
runs.forEach((run, i) => {
  const same = run.stopReason === recorded[i] ? '=' : '≠';
  console.log(`  ${i + 1}. в записи ${recorded[i]} ${same} в replay ${run.stopReason}${run.stopReason === 'error' ? ` — ${run.answer}` : ''}`);
});
console.log(`replay> неиспользованных ответов: ${provider.remaining}, запросов к сети: 0`);
