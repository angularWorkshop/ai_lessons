// Рабочая копия задачи: агент правит не фикстуру, а её копию во временной папке.
// Фикстура остаётся нетронутой, и следующий прогон начинается с того же состояния.
import { copyFile, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface Workdir {
  /** Настоящий путь к копии проекта, без ссылок: на macOS /tmp ведёт в /private/tmp. */
  dir: string;
  remove(): Promise<void>;
}

// Шаг 1: всё содержимое from — в to, с подпапками. Файл, который уже есть в to, заменяется.
export async function copyDir(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(source, target);
    } else if (entry.isFile()) {
      await copyFile(source, target);
    }
  }
}

// Шаг 1: новая временная папка с копией fixture/project. Каждый прогон — в своей папке.
export async function prepareWorkdir(fixture: string): Promise<Workdir> {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'edutec-eval-')));
  try {
    await copyDir(path.join(fixture, 'project'), dir);
  } catch (error) {
    // Фикстуры нет или она битая — папку за собой убираем, ошибку отдаём наверх.
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}
