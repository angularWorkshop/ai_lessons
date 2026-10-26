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
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, runs.map((run) => `${JSON.stringify(run)}\n`).join(''));
}

export async function loadRuns(file: string): Promise<TaskRun[]> {
  const text = await readFile(file, 'utf8');
  const runs: TaskRun[] = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      runs.push(JSON.parse(line) as TaskRun);
    } catch {
      throw new Error(`${file}:${index + 1}: строка — не JSON`);
    }
  });
  return runs;
}
