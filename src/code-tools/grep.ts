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
  const matches: Match[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (regex.test(line)) {
      matches.push({ file, line: i + 1, text: line.trim() });
    }
  });
  return matches;
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
      let regex: RegExp;
      try {
        regex = new RegExp(args.pattern, args.ignoreCase ? 'i' : '');
      } catch (error) {
        throw new Error(`pattern — не регулярное выражение: ${(error as Error).message}`);
      }

      const realRoot = await realpath(root);
      const start = await safePath(root, args.path);
      const files: Entry[] = [];
      if ((await stat(start)).isDirectory()) {
        for await (const entry of walk(realRoot, start)) {
          if (!entry.isDirectory) files.push(entry);
        }
      } else {
        files.push({ relative: path.relative(realRoot, start).split(path.sep).join('/'), absolute: start, isDirectory: false });
      }

      const matches: Match[] = [];
      for (const file of files) {
        if ((await stat(file.absolute)).size > MAX_FILE_BYTES) continue;
        const buffer = await readFile(file.absolute);
        if (buffer.includes(0)) continue; // бинарный
        matches.push(...searchText(file.relative, buffer.toString('utf8'), regex));
      }

      if (matches.length === 0) {
        return `Совпадений с ${args.pattern} нет`;
      }
      const lines = matches.slice(0, MAX_MATCHES).map(({ file, line, text }) => {
        const short = text.length > MAX_MATCH_CHARS ? `${text.slice(0, MAX_MATCH_CHARS)}…` : text;
        return `${file}:${line}: ${short}`;
      });
      if (matches.length > MAX_MATCHES) {
        lines.push(`…и ещё ${matches.length - MAX_MATCHES} совпадений. Уточни pattern или path`);
      }
      return lines.join('\n');
    },
  };
}
