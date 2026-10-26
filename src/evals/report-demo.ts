// npm run evals-report -- base              отчёт по сохранённым прогонам
// npm run evals-report -- base lean         два отчёта и сравнение версий
// npm run evals-report -- base --trace=email-check#2   трейс одного прогона целиком
// Модель не нужна: всё строится из .agent/evals/*.jsonl.
import { parseArgs } from 'node:util';
import { compareRuns, formatComparison } from './compare.ts';
import { loadRuns, runsFile } from './store.ts';
import { suiteReport } from './suite-report.ts';
import { formatTrace } from './trace.ts';

const { values, positionals } = parseArgs({ options: { trace: { type: 'string' } }, allowPositionals: true });
if (positionals.length < 1 || positionals.length > 2) {
  console.error('Запуск: npm run evals-report -- <метка> [вторая метка] [--trace=задача#номер]');
  process.exit(2);
}

const sets = await Promise.all(positionals.map(async (label) => ({ label, runs: await loadRuns(runsFile(label)) })));

if (values.trace) {
  const [task, attempt = '1'] = values.trace.split('#');
  const run = sets[0].runs.find((item) => item.task === task && item.attempt === Number(attempt));
  if (!run) {
    console.error(`В ${sets[0].label} нет прогона ${values.trace}`);
    process.exit(2);
  }
  console.log(`${task} #${attempt} · ${run.stopReason} · ${run.detail}\n`);
  console.log(formatTrace(run.trace ?? []));
  process.exit(0);
}

for (const set of sets) {
  console.log(`═══ ${set.label} ═══\n${suiteReport(set.runs)}\n`);
}
if (sets.length === 2) {
  console.log(`═══ сравнение ═══\n${formatComparison(compareRuns(sets[0].runs, sets[1].runs), [sets[0].label, sets[1].label])}`);
}
