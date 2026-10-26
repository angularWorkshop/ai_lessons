// read_file: содержимое файла с номерами строк, кусками.
import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { safePath } from './safe-path.ts';

/** Файл больше этого не читаем: это не исходник, а лог, бандл или база. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** Строку длиннее обрезаем: в минифицированном файле одна строка — весь файл. */
export const MAX_LINE_CHARS = 500;
export const DEFAULT_LINE_LIMIT = 200;

const ReadFileArgs = z.object({
  path: z.string().describe('Путь от корня проекта, например src/cart.ts'),
  offset: z.number().int().min(1).default(1).describe('С какой строки читать, считая с 1'),
  limit: z.number().int().min(1).max(2000).default(DEFAULT_LINE_LIMIT).describe('Сколько строк прочитать'),
});

// Шаг 2: «  7\tтекст». Ширина номера одна на весь кусок, чтобы текст шёл ровной колонкой.
export function numberLines(lines: string[], first: number): string {
  const width = String(first + lines.length - 1).length;
  return lines
    .map((line, i) => {
      const text = line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…[строка обрезана]` : line;
      return `${String(first + i).padStart(width)}\t${text}`;
    })
    .join('\n');
}

// Шаг 2
export function readFileTool(root: string): Tool<z.infer<typeof ReadFileArgs>> {
  return {
    name: 'read_file',
    description:
      'Читает текстовый файл проекта. Каждая строка начинается с номера и табуляции — номер не часть файла. ' +
      `По умолчанию первые ${DEFAULT_LINE_LIMIT} строк; дальше читай с offset.`,
    schema: ReadFileArgs,
    async run({ path, offset, limit }) {
      const file = await safePath(root, path);
      const info = await stat(file);
      if (info.isDirectory()) {
        throw new Error(`${path} — папка. Список файлов покажет list_files`);
      }
      if (info.size > MAX_FILE_BYTES) {
        throw new Error(`${path} весит ${Math.round(info.size / 1024)} КБ, лимит read_file — ${MAX_FILE_BYTES / 1024} КБ. Найди нужное место через grep`);
      }
      const buffer = await readFile(file);
      if (buffer.includes(0)) {
        throw new Error(`${path} — бинарный файл, его не прочитать как текст`);
      }

      const text = buffer.toString('utf8');
      if (text === '') {
        return '(файл пустой)';
      }
      // Перевод строки в конце файла не делает ещё одну пустую строку.
      const lines = text.replace(/\r?\n$/, '').split(/\r?\n/);
      if (offset > lines.length) {
        throw new Error(`в ${path} всего ${lines.length} строк, а offset = ${offset}`);
      }
      const chunk = lines.slice(offset - 1, offset - 1 + limit);
      const last = offset + chunk.length - 1;
      let result = numberLines(chunk, offset);
      if (last < lines.length) {
        result += `\n…показаны строки ${offset}–${last} из ${lines.length}. Дальше — offset=${last + 1}`;
      }
      return result;
    },
  };
}
