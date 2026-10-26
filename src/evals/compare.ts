// Две версии агента на одном наборе. Разница в доле решённых бывает просто шумом:
// агент недетерминирован, и тот же агент дважды подряд даёт разные числа.
import { summarize } from './report.ts';
import type { TaskRun } from './runner.ts';

export interface Rate {
  passed: number;
  /** Проверенные прогоны — без ошибок шлюза. */
  checked: number;
}

export interface TaskDelta {
  task: string;
  base: Rate;
  next: Rate;
}

export interface Averages {
  steps: number;
  tokens: number;
  cost: number;
}

export interface Comparison {
  tasks: TaskDelta[];
  base: Rate;
  next: Rate;
  /** Разница долей решённых, next − base, от −1 до 1. */
  delta: number;
  /** Погрешность разницы: примерно 95% интервал. |delta| меньше — шум. */
  noise: number;
  verdict: 'лучше' | 'хуже' | 'в пределах шума';
  /** Средние на проверенный прогон. */
  baseAvg: Averages;
  nextAvg: Averages;
  /** Погрешность разницы средней цены прогона, в долларах. Цена тоже плавает от прогона к прогону. */
  costNoise: number;
}

const rate = (rate: Rate) => (rate.checked === 0 ? 0 : rate.passed / rate.checked);

// Шаг 4: погрешность доли по n прогонам. p считаем как (k + 1) / (n + 2): иначе 18 из 18 дало бы погрешность ноль,
// будто агент решает всегда. Разница двух долей — корень из суммы квадратов погрешностей, ×2 — примерно 95%.
export function noiseOf(a: Rate, b: Rate): number {
  const variance = (r: Rate) => {
    if (r.checked === 0) return 0;
    const p = (r.passed + 1) / (r.checked + 2);
    return (p * (1 - p)) / r.checked;
  };
  return 2 * Math.sqrt(variance(a) + variance(b));
}

// Шаг 4: погрешность разницы средних — та же формула, только дисперсия считается по самим значениям.
export function meanNoise(a: number[], b: number[]): number {
  const term = (values: number[]) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    return variance / values.length;
  };
  return 2 * Math.sqrt(term(a) + term(b));
}

function averages(runs: TaskRun[]): Averages {
  const checked = runs.filter((run) => run.error === undefined);
  const n = Math.max(checked.length, 1);
  return {
    steps: checked.reduce((sum, run) => sum + run.steps, 0) / n,
    tokens: checked.reduce((sum, run) => sum + run.usage.input + run.usage.output, 0) / n,
    cost: checked.reduce((sum, run) => sum + run.cost, 0) / n,
  };
}

const costs = (runs: TaskRun[]) => runs.filter((run) => run.error === undefined).map((run) => run.cost);

// Шаг 4
export function compareRuns(base: TaskRun[], next: TaskRun[]): Comparison {
  const a = summarize(base);
  const b = summarize(next);
  const ids = [...new Set([...a.tasks, ...b.tasks].map((task) => task.task))];
  const rateOf = (summary: typeof a, id: string): Rate => {
    const task = summary.tasks.find((item) => item.task === id);
    return task ? { passed: task.passed, checked: task.runs - task.errors } : { passed: 0, checked: 0 };
  };
  const baseRate = { passed: a.passed, checked: a.runs - a.errors };
  const nextRate = { passed: b.passed, checked: b.runs - b.errors };
  const delta = rate(nextRate) - rate(baseRate);
  const noise = noiseOf(baseRate, nextRate);
  return {
    tasks: ids.map((task) => ({ task, base: rateOf(a, task), next: rateOf(b, task) })),
    base: baseRate,
    next: nextRate,
    delta,
    noise,
    verdict: Math.abs(delta) <= noise ? 'в пределах шума' : delta > 0 ? 'лучше' : 'хуже',
    baseAvg: averages(base),
    nextAvg: averages(next),
    costNoise: meanNoise(costs(base), costs(next)),
  };
}

/** Цена одного прогона — доли цента, четырёх знаков мало. */
const dollars = (cost: number) => `$${cost.toFixed(6)}`;
const points = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 100))} п.п.`;
const percent = (r: Rate) => `${r.passed}/${r.checked} (${Math.round(rate(r) * 100)}%)`;
const change = (from: number, to: number) => {
  if (from === 0) return '';
  const value = Math.round(((to - from) / from) * 100);
  return value === 0 ? '' : ` (${value > 0 ? '+' : '−'}${Math.abs(value)}%)`;
};

// Шаг 5: сравнение для человека. Стрелка у задачи — только если она поменялась.
export function formatComparison(comparison: Comparison, labels: [string, string] = ['base', 'next']): string {
  const width = Math.max(...comparison.tasks.map((task) => task.task.length), 0);
  const lines = [`${labels[0]} → ${labels[1]}`];
  for (const task of comparison.tasks) {
    const diff = rate(task.next) - rate(task.base);
    const arrow = diff > 0 ? '  ↑' : diff < 0 ? '  ↓' : '';
    lines.push(`  ${task.task.padEnd(width)}  ${task.base.passed}/${task.base.checked} → ${task.next.passed}/${task.next.checked}${arrow}`);
  }
  const { baseAvg: x, nextAvg: y } = comparison;
  lines.push(
    '',
    `Решено: ${percent(comparison.base)} → ${percent(comparison.next)} · разница ${points(comparison.delta)}, шум ±${Math.round(comparison.noise * 100)} п.п. — ${comparison.verdict}`,
    `На прогон: шагов ${x.steps.toFixed(1)} → ${y.steps.toFixed(1)}${change(x.steps, y.steps)} · ` +
      `токенов ${Math.round(x.tokens)} → ${Math.round(y.tokens)}${change(x.tokens, y.tokens)} · ` +
      `${dollars(x.cost)} → ${dollars(y.cost)}${change(x.cost, y.cost)}, шум ±${dollars(comparison.costNoise)}`,
  );
  return lines.join('\n');
}
