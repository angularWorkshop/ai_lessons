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
  throw new Error('TODO: шаг 5');
}

// Шаг 5: оборванную задачу закрываем записью task с причиной error — следующий resume не примет её за свежую.
export async function recoverCrash(session: OpenedSession, checkpoints: CheckpointStore): Promise<Recovery | undefined> {
  throw new Error('TODO: шаг 5');
}

// Шаг 5: что сказать модели. Она не знает, что процесс падал: история просто обрывается.
export function recoveryNote({ files }: Recovery): string {
  throw new Error('TODO: шаг 5');
}
