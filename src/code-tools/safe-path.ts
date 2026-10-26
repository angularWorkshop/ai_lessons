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
  if (input.trim() === '') {
    throw new PathError('путь пустой. Пиши путь от корня проекта, например src/cart.ts');
  }
  if (path.isAbsolute(input)) {
    throw new PathError(`«${input}» — абсолютный путь. Пиши путь от корня проекта, например src/cart.ts`);
  }

  // Корень тоже может быть ссылкой (на macOS /tmp → /private/tmp), поэтому сравниваем настоящие пути.
  const realRoot = await realpath(root);
  const full = path.resolve(realRoot, input);
  if (!isInside(realRoot, full)) {
    throw new PathError(`«${input}» выходит за корень проекта`);
  }

  // Символическая ссылка внутри проекта может вести куда угодно. realpath покажет, куда на самом деле.
  const real = await realpathOfExisting(full);
  if (!isInside(realRoot, real)) {
    throw new PathError(`«${input}» — ссылка за пределы проекта`);
  }

  // Секрет проверяем и по пути, который прислала модель, и по настоящему: ссылка notes.txt → .env тоже секрет.
  const parts = [...path.relative(realRoot, full).split(path.sep), ...path.relative(realRoot, real).split(path.sep)];
  if (parts.some(isSecret)) {
    throw new PathError(`«${input}» — файл с секретами, его агенту читать и менять нельзя`);
  }
  return real;
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
