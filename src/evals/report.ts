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
  throw new Error('TODO: шаг 4');
}

// Шаг 4: весь набор. Задачи — в порядке первого появления.
export function summarize(runs: TaskRun[]): SuiteSummary {
  throw new Error('TODO: шаг 4');
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
  throw new Error('TODO: шаг 5');
}
