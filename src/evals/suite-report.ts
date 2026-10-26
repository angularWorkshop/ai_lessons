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
  const stats = new Map<FindingKind, FindingStats>();
  for (const run of runs) {
    const kinds = new Set<FindingKind>();
    for (const finding of diagnose(run)) {
      const entry = stats.get(finding.kind) ?? { kind: finding.kind, runs: 0, count: 0, inFailed: 0 };
      entry.count += finding.count;
      if (!run.pass) entry.inFailed += finding.count;
      if (!kinds.has(finding.kind)) {
        entry.runs++;
        kinds.add(finding.kind);
      }
      stats.set(finding.kind, entry);
    }
  }
  return [...stats.values()].sort((a, b) => b.runs - a.runs || b.count - a.count);
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
  const total = runs.reduce((sum, run) => sum + run.cost, 0);
  const failed = runs.filter((run) => !run.pass).reduce((sum, run) => sum + run.cost, 0);
  const summary = summarize(runs);
  const priciest = [...summary.tasks].sort((a, b) => b.cost - a.cost)[0];
  return {
    total,
    failed,
    priciest: priciest ? { task: priciest.task, cost: priciest.cost } : undefined,
    perSolved: summary.passed === 0 ? 0 : total / summary.passed,
  };
}

const findingLine = (finding: Finding) => `    ${FINDING_LABELS[finding.kind]}: ${finding.detail}`;

// Шаг 3: отчёт целиком. Сначала итог из темы 14.1, потом каждый провал с находками, потом общая картина.
export function suiteReport(runs: TaskRun[]): string {
  const lines = [formatSuite(summarize(runs))];

  const failed = runs.filter((run) => !run.pass && run.error === undefined);
  if (failed.length > 0) {
    lines.push('', 'Не решены:');
    for (const run of failed) {
      lines.push(`  ${formatRun(run)}`);
      const findings = diagnose(run);
      lines.push(...(findings.length > 0 ? findings.map(findingLine) : ['    по трейсу ничего не видно — смотри его целиком']));
    }
  }
  const errors = runs.filter((run) => run.error !== undefined);
  if (errors.length > 0) {
    lines.push('', 'Не проверены:', ...errors.map((run) => `  ${formatRun(run)}`));
  }

  const stats = findingStats(runs);
  if (stats.length > 0) {
    lines.push('', `Находки во всех ${runs.length} прогонах:`);
    for (const stat of stats) {
      lines.push(`  ${FINDING_LABELS[stat.kind]}: прогонов ${stat.runs}, всего ${stat.count}, из них в нерешённых ${stat.inFailed}`);
    }
  }

  const cost = costBreakdown(runs);
  const share = cost.total === 0 ? 0 : Math.round((cost.failed / cost.total) * 100);
  lines.push(
    '',
    `Стоимость: всего ${dollars(cost.total)} · на нерешённые ${dollars(cost.failed)} (${share}%) · ` +
      `за решённый прогон ${dollars(cost.perSolved)}` +
      (cost.priciest ? ` · дороже всех ${cost.priciest.task} (${dollars(cost.priciest.cost)})` : ''),
  );
  return lines.join('\n');
}
