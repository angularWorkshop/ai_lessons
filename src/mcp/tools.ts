// Инструменты нашего MCP-сервера: посмотреть файлы проекта и оставить заметку.
// Корень проекта задаётся при запуске. Выйти за него нельзя ни через «..», ни через симлинк.
import { appendFile, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import type { McpTool } from './server.ts';

const MAX_CHARS = 20_000;

const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

// Шаг 5: путь от модели → абсолютный путь внутри проекта, или ошибка, которую модель прочитает.
export async function safePath(root: string, path: string): Promise<string> {
  const full = resolve(root, path);
  if (!inside(root, full)) {
    throw new Error(`Путь ${path} ведёт за пределы проекта. Используй путь относительно корня проекта.`);
  }
  if (basename(full) === '.env') {
    throw new Error('Файл .env закрыт: в нём ключи.');
  }
  const real = await realpath(full).catch(() => {
    throw new Error(`Нет такого файла или папки: ${path}`);
  });
  // Симлинк внутри проекта может указывать куда угодно. Сравниваем настоящие пути.
  if (!inside(await realpath(root), real)) {
    throw new Error(`Путь ${path} ведёт за пределы проекта.`);
  }
  return real;
}

export function projectTools(root: string): McpTool[] {
  return [
    {
      name: 'list_files',
      description: 'Список файлов и папок в каталоге проекта (без рекурсии). Папки помечены «/» на конце.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Каталог относительно корня проекта. По умолчанию — корень.' } },
        additionalProperties: false,
      },
      async run(args) {
        const dir = await safePath(root, String(args.path ?? '.'));
        const entries = await readdir(dir, { withFileTypes: true });
        const names = entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name)).sort();
        return names.join('\n') || '(пусто)';
      },
    },
    {
      name: 'read_file',
      description: `Прочитать текстовый файл проекта. Длинные файлы обрезаются до ${MAX_CHARS} символов.`,
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Путь относительно корня проекта, например src/llm.ts' } },
        required: ['path'],
        additionalProperties: false,
      },
      async run(args) {
        const text = await readFile(await safePath(root, String(args.path)), 'utf8');
        return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n… обрезано, всего ${text.length} символов` : text;
      },
    },
    {
      name: 'add_note',
      description: 'Добавить заметку в NOTES.md в корне проекта: решение, договорённость, что сделать потом.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Текст заметки, одна строка' } },
        required: ['text'],
        additionalProperties: false,
      },
      async run(args) {
        const text = String(args.text).replace(/\s+/g, ' ').trim();
        if (!text) {
          throw new Error('Пустая заметка. Передай текст в text.');
        }
        const file = resolve(root, 'NOTES.md');
        await appendFile(file, `- ${text}\n`, 'utf8');
        const count = (await readFile(file, 'utf8')).split('\n').filter((line) => line.startsWith('- ')).length;
        return `Заметка добавлена в NOTES.md. Всего заметок: ${count}`;
      },
    },
  ];
}
