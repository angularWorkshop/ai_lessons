// npm run evals — прогнать агента для кода на наборе задач из evals/tasks.
// npm run evals -- --runs=1 --task=slugify,last-page --keep
import { parseArgs } from 'node:util';
import { loadConfig } from '../llm.ts';
import { llmProvider } from '../provider.ts';
import { codeAgent } from './agent-under-test.ts';
import { formatRun, formatSuite, summarize } from './report.ts';
import { runSuite } from './runner.ts';
import { TASKS } from './tasks.ts';

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    task: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
});

const runs = Number(values.runs);
const ids = values.task?.split(',').map((id) => id.trim());
const tasks = ids ? TASKS.filter((task) => ids.includes(task.id)) : TASKS;
if (!Number.isInteger(runs) || runs < 1 || tasks.length === 0) {
  console.error(`Нужно --runs=N (N ≥ 1) и задачи из списка: ${TASKS.map((task) => task.id).join(', ')}`);
  process.exit(2);
}

console.log(`Задач: ${tasks.length}, прогонов на задачу: ${runs}\n`);
const results = await runSuite(tasks, codeAgent(llmProvider(loadConfig())), {
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
console.log(`\n${formatSuite(summarize(results))}`);
