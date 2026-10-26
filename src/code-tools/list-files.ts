// list_files: какие файлы есть в проекте. С него модель начинает знакомство с кодом.
import { realpath, stat } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { safePath } from './safe-path.ts';
import { walk } from './walk.ts';

/** Больше записей модели не нужно: дальше она сузит path. */
export const MAX_ENTRIES = 200;

const ListFilesArgs = z.object({
  path: z.string().default('.').describe('Папка от корня проекта. По умолчанию — весь проект'),
});

// Шаг 3
export function listFilesTool(root: string): Tool<z.infer<typeof ListFilesArgs>> {
  return {
    name: 'list_files',
    description:
      'Список файлов и папок проекта рекурсивно, по одному пути на строку, папки — с / на конце. ' +
      'node_modules, .git и .env не показываются. Начинай знакомство с проектом отсюда.',
    schema: ListFilesArgs,
    async run(args) {
      const dir = await safePath(root, args.path);
      if (!(await stat(dir)).isDirectory()) {
        throw new Error(`${args.path} — файл, а не папка. Открой его через read_file`);
      }
      const lines: string[] = [];
      let total = 0;
      for await (const entry of walk(await realpath(root), dir)) {
        total++;
        if (lines.length < MAX_ENTRIES) {
          lines.push(entry.isDirectory ? `${entry.relative}/` : entry.relative);
        }
      }
      if (total === 0) {
        return '(папка пустая)';
      }
      if (total > lines.length) {
        lines.push(`…и ещё ${total - lines.length}. Укажи папку в path, чтобы увидеть её целиком`);
      }
      return lines.join('\n');
    },
  };
}
