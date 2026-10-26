// Обход папки для list_files и grep. Чужое и опасное пропускаем сразу:
// node_modules и .git — тысячи файлов, которые модели не нужны; .env — секреты; по ссылкам не ходим.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { isSecret } from './safe-path.ts';

export const SKIP_DIRS = new Set(['node_modules', '.git']);

export interface Entry {
  /** Путь от корня проекта через /, как его видит модель. */
  relative: string;
  absolute: string;
  isDirectory: boolean;
}

/** Все файлы и папки внутри dir, по алфавиту, папка раньше своего содержимого. */
export async function* walk(root: string, dir: string): AsyncGenerator<Entry> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isSymbolicLink() || isSecret(entry.name) || (entry.isDirectory() && SKIP_DIRS.has(entry.name))) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isDirectory()) {
      yield { relative, absolute, isDirectory: true };
      yield* walk(root, absolute);
    } else if (entry.isFile()) {
      yield { relative, absolute, isDirectory: false };
    }
  }
}
