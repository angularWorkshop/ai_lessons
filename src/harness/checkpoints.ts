// Checkpoint: снимок файла перед первой правкой в задаче. /rewind возвращает файлы последней задачи как были.
// .agent/checkpoints/<сессия>/<номер задачи>.jsonl — строка на файл: путь, был ли он и что в нём было.
// Снимки делает обёртка над edit_file. Что поменяла команда через run_command, checkpoint не видит.
import { mkdir, readdir, readFile, rename, rm, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentEvent } from '../agent.ts';
import { safePath } from '../code-tools/safe-path.ts';
import type { Tool } from '../tools.ts';

export const CHECKPOINTS_DIR = '.agent/checkpoints';

export interface Snapshot {
  /** Путь от корня проекта. */
  path: string;
  /** false — файла не было, откат его удалит. */
  existed: boolean;
  content?: string;
}

export interface Rewound {
  task: number;
  files: Snapshot[];
}

export class CheckpointStore {
  readonly root: string;
  readonly dir: string;
  /** Номер текущей задачи. 0 — задач ещё не было. */
  #task: number;
  /** Снимки текущей задачи по файлам. Промис — чтобы вторая правка того же файла дождалась первого снимка. */
  #taken = new Map<string, Promise<void>>();

  /** startedTasks — сколько задач сессия уже начинала: после resume нумерация продолжается. */
  constructor(root: string, sessionId: string, startedTasks = 0) {
    this.root = root;
    this.dir = path.join(root, CHECKPOINTS_DIR, sessionId);
    this.#task = startedTasks;
  }

  get task(): number {
    return this.#task;
  }

  // Шаг 1: новая задача — новый набор снимков. Задача начинается с шага 1: это видно по событиям агента.
  begin(): void {
    throw new Error('TODO: шаг 1');
  }

  readonly onEvent = (event: AgentEvent): void => {
    if (event.type === 'step' && event.step === 1) this.begin();
  };

  // Шаг 1: снимок перед записью. Только первый раз за задачу: откатываем к состоянию до задачи, а не до последней правки.
  snapshot(file: string): Promise<void> {
    throw new Error('TODO: шаг 1');
  }

  async #take(file: string): Promise<void> {
    const full = await safePath(this.root, file);
    const snapshot: Snapshot = await readFile(full, 'utf8').then(
      (content) => ({ path: file, existed: true, content }),
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return { path: file, existed: false };
        throw error;
      },
    );
    await mkdir(this.dir, { recursive: true });
    await appendFile(this.#file(this.#task), `${JSON.stringify(snapshot)}\n`);
  }

  /** Файлы, которые задача успела поменять, — по её снимкам. */
  async files(task: number): Promise<Snapshot[]> {
    const text = await readFile(this.#file(task), 'utf8').catch(() => '');
    // Последняя строка могла оборваться, если процесс упал посреди записи. Без неё — снимков на один меньше.
    return text.split('\n').flatMap((line) => {
      try {
        return line ? [JSON.parse(line) as Snapshot] : [];
      } catch {
        return [];
      }
    });
  }

  /** Задачи со снимками, которые ещё не откатывали, по порядку. */
  async tasks(): Promise<number[]> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return names
      .map((name) => /^(\d+)\.jsonl$/.exec(name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }

  // Шаг 2: откатить последнюю задачу с правками. Файл, которого не было, удаляется. Снимки помечаются как откаченные.
  async rewind(): Promise<Rewound | undefined> {
    throw new Error('TODO: шаг 2');
  }

  #file(task: number): string {
    return path.join(this.dir, `${task}.jsonl`);
  }
}

// Шаг 1: обёртка над инструментом записи. Снимок — до run, так что файл сохраняется до того, как его тронут.
export function checkpointed<A extends { path: string }>(tool: Tool<A>, store: CheckpointStore): Tool<A> {
  throw new Error('TODO: шаг 1');
}
