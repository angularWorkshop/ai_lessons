// npm run evals — прогнать агента для кода на наборе задач из evals/tasks.
// npm run evals -- --runs=1 --task=slugify,last-page --keep
// Тема 14.3: прогоны с трейсами сохраняются в .agent/evals/<label>.jsonl. --variant — какую версию агента гонять.
import { parseArgs } from 'node:util';
import { loadConfig } from '../llm.ts';
import { llmProvider } from '../provider.ts';
import { codeAgent, VARIANTS } from './agent-under-test.ts';
import { formatRun } from './report.ts';
import { runSuite } from './runner.ts';
import { runsFile, saveRuns } from './store.ts';
import { suiteReport } from './suite-report.ts';
import { TASKS } from './tasks.ts';

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    task: { type: 'string' },
    keep: { type: 'boolean', default: false },
    variant: { type: 'string', default: 'base' },
    label: { type: 'string' },
  },
});

const runs = Number(values.runs);
const ids = values.task?.split(',').map((id) => id.trim());
const tasks = ids ? TASKS.filter((task) => ids.includes(task.id)) : TASKS;
const variant = VARIANTS[values.variant];
if (!Number.isInteger(runs) || runs < 1 || tasks.length === 0 || !variant) {
  console.error(
    `Нужно --runs=N (N ≥ 1), задачи из списка: ${TASKS.map((task) => task.id).join(', ')} ` +
      `и версия агента из списка: ${Object.keys(VARIANTS).join(', ')}`,
  );
  process.exit(2);
}
const file = runsFile(values.label ?? values.variant);

console.log(`Задач: ${tasks.length}, прогонов на задачу: ${runs}, версия агента: ${values.variant}\n`);
const results = await runSuite(tasks, codeAgent(llmProvider(loadConfig()), variant), {
  runs,
  keep: values.keep,
  // Точка на каждый шаг агента: видно, что он работает.
  onEvent: (event) => {
    if (event.type === 'step') process.stdout.write('.');
  },
  onRun: (run) => {
    process.stdout.write('\n');
    console.log(formatRun(run));
    if (run.dir) console.log(`  копия: ${run.dir}`);
  },
});
await saveRuns(file, results);
console.log(`\n${suiteReport(results)}`);
console.log(`\nПрогоны с трейсами — в ${file}. Разбор: npm run evals-report -- ${values.label ?? values.variant}`);
