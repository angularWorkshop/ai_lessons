// Прогоны на диске: по строке JSON на прогон, вместе с трейсом. Набор прогнали один раз —
// разбирать и сравнивать можно сколько угодно, не тратя токены.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TaskRun } from './runner.ts';

export const RUNS_DIR = '.agent/evals';

/** Файл прогонов по метке: base → .agent/evals/base.jsonl. Метка может быть и путём к файлу. */
export function runsFile(label: string): string {
  return label.endsWith('.jsonl') ? label : path.join(RUNS_DIR, `${label}.jsonl`);
}

// Шаг 3: JSONL — по прогону на строку. Файл можно дописывать и читать по частям, одна битая строка не портит остальные.
export async function saveRuns(file: string, runs: TaskRun[]): Promise<void> {
  throw new Error('TODO: шаг 3');
}

export async function loadRuns(file: string): Promise<TaskRun[]> {
  throw new Error('TODO: шаг 3');
}
