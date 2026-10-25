// Безопасный путь: всё, что модель передаёт как путь, проходит через safePath.
// Модель не знает, где на диске лежит проект, и не должна выходить за его корень.
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Путь, который инструмент отказался открывать. Текст ошибки уйдёт модели. */
export class PathError extends Error {
  override name = 'PathError';
}

/** .env, .env.local, .env.production — файлы с ключами. Их не читаем, не показываем и не правим. */
export function isSecret(name: string): boolean {
  return name === '.env' || name.startsWith('.env.');
}

/** child внутри parent или совпадает с ним. Оба пути — абсолютные. */
export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Шаг 1
/**
 * Путь от модели → настоящий абсолютный путь внутри root.
 * Файла может ещё не быть (edit_file создаёт новые), тогда проверяем ближайшую существующую папку.
 */
export async function safePath(root: string, input: string): Promise<string> {
  throw new Error('TODO: шаг 1 — проверь путь модели и верни настоящий абсолютный путь внутри root');
}

// Поднимаемся вверх, пока не найдём существующую папку, и приклеиваем к её настоящему пути остаток.
async function realpathOfExisting(full: string): Promise<string> {
  const rest: string[] = [];
  let current = full;
  while (true) {
    try {
      return path.join(await realpath(current), ...rest);
    } catch (error) {
      const parent = path.dirname(current);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === current) {
        throw error;
      }
      // Битая ссылка: realpath её не знает, а writeFile создаст файл там, куда она ведёт.
      if (await lstat(current).then(() => true, () => false)) {
        throw new PathError(`«${path.basename(current)}» — ссылка на несуществующий путь`);
      }
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}
