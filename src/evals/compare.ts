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
  throw new Error('TODO: шаг 4');
}

// Шаг 4: погрешность разницы средних — та же формула, только дисперсия считается по самим значениям.
export function meanNoise(a: number[], b: number[]): number {
  throw new Error('TODO: шаг 4');
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
  throw new Error('TODO: шаг 4');
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
  throw new Error('TODO: шаг 5');
}
