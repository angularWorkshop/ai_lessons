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
  throw new Error('TODO: шаг 1');
}

// Шаг 1: новая временная папка с копией fixture/project. Каждый прогон — в своей папке.
export async function prepareWorkdir(fixture: string): Promise<Workdir> {
  throw new Error('TODO: шаг 1');
}
