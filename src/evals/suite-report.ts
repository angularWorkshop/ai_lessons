// Отчёт по набору: что упало, почему и сколько стоило. Строится из прогонов с трейсами, без модели.
import { diagnose, FINDING_LABELS, type Finding, type FindingKind } from './diagnose.ts';
import { dollars, formatRun, formatSuite, summarize } from './report.ts';
import type { TaskRun } from './runner.ts';

export interface FindingStats {
  kind: FindingKind;
  /** В скольких прогонах встретилось. */
  runs: number;
  /** Сколько раз всего. */
  count: number;
  /** Из них в нерешённых прогонах. */
  inFailed: number;
}

// Шаг 3: находки по всему набору. Те, что живут и в решённых прогонах, — про цену, а не про успех.
export function findingStats(runs: TaskRun[]): FindingStats[] {
  throw new Error('TODO: шаг 3');
}

export interface CostBreakdown {
  total: number;
  /** Сколько стоили нерешённые прогоны — деньги, которые не купили результат. */
  failed: number;
  /** Самая дорогая задача и её цена за все прогоны. */
  priciest: { task: string; cost: number } | undefined;
  /** Средняя цена решённого прогона. */
  perSolved: number;
}

// Шаг 3
export function costBreakdown(runs: TaskRun[]): CostBreakdown {
  throw new Error('TODO: шаг 3');
}

const findingLine = (finding: Finding) => `    ${FINDING_LABELS[finding.kind]}: ${finding.detail}`;

// Шаг 3: отчёт целиком. Сначала итог из темы 14.1, потом каждый провал с находками, потом общая картина.
export function suiteReport(runs: TaskRun[]): string {
  throw new Error('TODO: шаг 3');
}
