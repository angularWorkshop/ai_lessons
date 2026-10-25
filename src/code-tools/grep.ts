// grep: где в проекте встречается строка или регулярное выражение.
// Утилиты grep в WebContainer нет, да и не нужна: обход папок у нас уже есть, а RegExp — в самом JavaScript.
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { MAX_FILE_BYTES } from './read-file.ts';
import { safePath } from './safe-path.ts';
import { walk, type Entry } from './walk.ts';

export const MAX_MATCHES = 100;
const MAX_MATCH_CHARS = 200;

const GrepArgs = z.object({
  pattern: z.string().min(1).describe('Регулярное выражение JavaScript, например applyPromo|threshold'),
  path: z.string().default('.').describe('Папка или файл от корня проекта. По умолчанию — весь проект'),
  ignoreCase: z.boolean().default(false).describe('Не различать регистр букв'),
});

export interface Match {
  file: string;
  line: number;
  text: string;
}

// Шаг 4: совпадения в одном тексте. Без флага g: у RegExp с g метод test помнит lastIndex между строками.
export function searchText(file: string, text: string, regex: RegExp): Match[] {
  throw new Error('TODO: шаг 4 — найди строки, подходящие под regex');
}

// Шаг 4
export function grepTool(root: string): Tool<z.infer<typeof GrepArgs>> {
  return {
    name: 'grep',
    description:
      'Ищет регулярное выражение по файлам проекта. Ответ — строки вида путь:номер: текст. ' +
      'Так быстрее, чем читать файлы подряд: найди место, потом прочитай его через read_file с offset.',
    schema: GrepArgs,
    async run(args) {
      throw new Error('TODO: шаг 4 — пройди по файлам проекта и собери совпадения');
    },
  };
}
