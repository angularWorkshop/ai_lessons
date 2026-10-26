// Восстановление после падения процесса: журнал знает, какая задача не закончилась, checkpoint — что она успела поменять.
import type { CheckpointStore } from './checkpoints.ts';
import type { OpenedSession } from './session.ts';

export interface Recovery {
  /** Текст задачи, на которой упал процесс. */
  task: string;
  /** Файлы, которые она успела поменять через edit_file. */
  files: string[];
}

/** Сколько задач сессия начинала: законченные плюс оборванная. С этого места продолжается нумерация checkpoint. */
export function startedTasks(session: OpenedSession): number {
  const restored = session.restored;
  return restored ? restored.tasks + (restored.unfinished === undefined ? 0 : 1) : 0;
}

// Шаг 5: оборванную задачу закрываем записью task с причиной error — следующий resume не примет её за свежую.
export async function recoverCrash(session: OpenedSession, checkpoints: CheckpointStore): Promise<Recovery | undefined> {
  const restored = session.restored;
  if (restored?.unfinished === undefined) return undefined;
  const files = (await checkpoints.files(restored.tasks + 1)).map((snapshot) => snapshot.path);
  await session.journal.append([{ type: 'task', stopReason: 'error', usage: { input: 0, output: 0 } }]);
  return { task: restored.unfinished, files };
}

// Шаг 5: что сказать модели. Она не знает, что процесс падал: история просто обрывается.
export function recoveryNote({ files }: Recovery): string {
  const changed = files.length > 0 ? `Она успела поменять: ${files.join(', ')}.` : 'Файлы она не меняла.';
  return `[Прошлая задача оборвалась: процесс агента упал. ${changed} Прежде чем продолжать, проверь состояние файлов и тестов.]`;
}
