// Прогон eval-набора на настоящей модели.
// Запуск: npm run eval                     — весь набор
//         npm run eval -- hacked weather   — только эти кейсы
// Каждый прогон сохраняется в evals/runs/, и отчёт сравнивается с прошлым прогоном.
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { compareRuns, formatSummary, runEval, summarize, type CaseCheck, type EvalCase } from './eval.ts';
import { llmProvider, loadConfig, type Provider } from './llm.ts';
import { createSupportAgent } from './support-agent.ts';

const RUNS_DIR = 'evals/runs';
// Шлюз пускает 30 запросов в минуту. Не даём eval съесть их за двадцать секунд.
const MIN_INTERVAL_MS = 2100;

const all = JSON.parse(await readFile('evals/cases.json', 'utf8')) as EvalCase[];
const only = process.argv.slice(2);
const cases = only.length > 0 ? all.filter((item) => only.includes(item.id)) : all;
if (cases.length === 0) {
  console.error(`Нет таких кейсов: ${only.join(', ')}`);
  process.exit(1);
}

// Агент заводит обращения. Eval работает на копии данных, чтобы не мусорить в data/tickets.
const dataDir = await mkdtemp(path.join(tmpdir(), 'support-eval-'));
await cp('data', dataDir, { recursive: true });

const model = llmProvider(loadConfig());
let lastStart = 0;
const paced: Provider = {
  async complete(messages, options) {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await delay(wait);
    lastStart = Date.now();
    return model.complete(messages, options);
  },
};
// Трейс: какие инструменты звал агент в каждом кейсе. Без него провал не разобрать.
let trace: string[] = [];
const traces: string[][] = [];
const agent = createSupportAgent({
  provider: paced,
  dataDir,
  onTool: ({ call, result }) => trace.push(`${call.name} ${call.arguments} → ${result.content.split('\n')[0]}`),
});
const ask = async (question: string) => {
  trace = [];
  traces.push(trace);
  return agent.run(question);
};

console.log(`Кейсов: ${cases.length}\n`);
const checks = await runEval(cases, ask, (check) => {
  const mark = check.pass ? '✓' : '✗';
  const sources = check.sources.length > 0 ? ` [${check.sources.join(', ')}]` : '';
  const problems = check.pass ? '' : ` — ${check.problems.join('; ')}`;
  console.log(`${mark} ${check.id}: ${check.got}${sources}, шагов ${check.steps}${problems}`);
});

const summary = summarize(checks);
console.log(`\n${formatSummary(summary)}`);

// Сравнение с прошлым прогоном: какие кейсы починились, какие сломались.
await mkdir(RUNS_DIR, { recursive: true });
const previous = (await readdir(RUNS_DIR)).filter((name) => name.endsWith('.json')).sort().at(-1);
if (previous) {
  const before = JSON.parse(await readFile(path.join(RUNS_DIR, previous), 'utf8')) as { checks: CaseCheck[] };
  const { fixed, broken } = compareRuns(before.checks, checks);
  console.log(`\nПо сравнению с ${previous}: починились ${fixed.join(', ') || '—'}; сломались ${broken.join(', ') || '—'}`);
}
const file = path.join(RUNS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const saved = checks.map((check, i) => ({ ...check, trace: traces[i] ?? [] }));
await writeFile(file, `${JSON.stringify({ summary, checks: saved }, null, 2)}\n`);
console.log(`Отчёт: ${file}`);
