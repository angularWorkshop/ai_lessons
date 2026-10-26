// Метрики набора: доля решённых прогонов, шаги, токены, цена, время. И отчёт, который читает человек.
import type { Usage } from '../llm.ts';
import type { TaskRun } from './runner.ts';

export interface TaskSummary {
  task: string;
  runs: number;
  passed: number;
  /** Прогоны, упавшие с ошибкой шлюза: не проверены. */
  errors: number;
  /** По прогону на символ: ✓ решено, ✗ не решено, ! ошибка. */
  marks: string;
  /** Среднее число шагов в проверенных прогонах. */
  steps: number;
  usage: Usage;
  cost: number;
  ms: number;
}

export interface SuiteSummary {
  tasks: TaskSummary[];
  runs: number;
  passed: number;
  errors: number;
  /** passed / проверенные прогоны (без ошибок), от 0 до 1. */
  passRate: number;
  /** Задачи, решённые во всех проверенных прогонах. */
  solvedAlways: number;
  /** Задачи, решённые хотя бы в одном прогоне. */
  solvedOnce: number;
  /** Задачи, где результат плавает: есть и решённые прогоны, и нет. */
  flaky: string[];
  /** Среднее число шагов на проверенный прогон. */
  steps: number;
  usage: Usage;
  cost: number;
  ms: number;
}

const mark = (run: TaskRun) => (run.error !== undefined ? '!' : run.pass ? '✓' : '✗');
const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output });
const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

// Шаг 4: одна задача — все её прогоны.
function summarizeTask(task: string, runs: TaskRun[]): TaskSummary {
  const checked = runs.filter((run) => run.error === undefined);
  return {
    task,
    runs: runs.length,
    passed: checked.filter((run) => run.pass).length,
    errors: runs.length - checked.length,
    marks: runs.map(mark).join(''),
    steps: average(checked.map((run) => run.steps)),
    usage: runs.reduce((sum, run) => addUsage(sum, run.usage), { input: 0, output: 0 }),
    cost: runs.reduce((sum, run) => sum + run.cost, 0),
    ms: runs.reduce((sum, run) => sum + run.ms, 0),
  };
}

// Шаг 4: весь набор. Задачи — в порядке первого появления.
export function summarize(runs: TaskRun[]): SuiteSummary {
  const byTask = new Map<string, TaskRun[]>();
  for (const run of runs) {
    byTask.set(run.task, [...(byTask.get(run.task) ?? []), run]);
  }
  const tasks = [...byTask].map(([task, taskRuns]) => summarizeTask(task, taskRuns));
  const checked = runs.filter((run) => run.error === undefined);
  const passed = checked.filter((run) => run.pass).length;
  const tried = tasks.filter((task) => task.runs > task.errors);
  return {
    tasks,
    runs: runs.length,
    passed,
    errors: runs.length - checked.length,
    passRate: checked.length === 0 ? 0 : passed / checked.length,
    solvedAlways: tried.filter((task) => task.passed === task.runs - task.errors).length,
    solvedOnce: tasks.filter((task) => task.passed > 0).length,
    flaky: tried.filter((task) => task.passed > 0 && task.passed < task.runs - task.errors).map((task) => task.task),
    steps: average(checked.map((run) => run.steps)),
    usage: tasks.reduce((sum, task) => addUsage(sum, task.usage), { input: 0, output: 0 }),
    cost: tasks.reduce((sum, task) => sum + task.cost, 0),
    ms: tasks.reduce((sum, task) => sum + task.ms, 0),
  };
}

export const dollars = (cost: number) => `$${cost.toFixed(4)}`;
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} с`;

// Строка про один прогон — демо печатает её, как только прогон закончился.
export function formatRun(run: TaskRun): string {
  const result = run.error !== undefined ? `ошибка — ${run.error}` : run.detail;
  return (
    `${mark(run)} ${run.task} #${run.attempt} · ${run.stopReason} · шагов ${run.steps} · ` +
    `токенов ${run.usage.input + run.usage.output} · ${dollars(run.cost)} · ${seconds(run.ms)} · ${result}`
  );
}

// Шаг 5: отчёт по набору. Сначала задачи, потом итог.
export function formatSuite(summary: SuiteSummary): string {
  const width = Math.max(...summary.tasks.map((task) => task.task.length), 0);
  const lines = summary.tasks.map(
    (task) =>
      `${task.task.padEnd(width)}  ${task.marks}  ${task.passed}/${task.runs - task.errors} · шагов ${task.steps.toFixed(1)} · ` +
      `токенов ${task.usage.input + task.usage.output} · ${dollars(task.cost)} · ${seconds(task.ms)}`,
  );
  const checked = summary.runs - summary.errors;
  const percent = Math.round(summary.passRate * 100);
  lines.push(
    '',
    `Решено прогонов: ${summary.passed}/${checked} (${percent}%) · задач всегда: ${summary.solvedAlways}/${summary.tasks.length} · хоть раз: ${summary.solvedOnce}/${summary.tasks.length}`,
  );
  if (summary.flaky.length > 0) {
    lines.push(`Плавают: ${summary.flaky.join(', ')}`);
  }
  if (summary.errors > 0) {
    lines.push(`Не проверено из-за ошибок: ${summary.errors}`);
  }
  lines.push(
    `Шагов в среднем: ${summary.steps.toFixed(1)} · токенов: вход ${summary.usage.input} · выход ${summary.usage.output} · ` +
      `${dollars(summary.cost)} · ${seconds(summary.ms)}`,
  );
  return lines.join('\n');
}
