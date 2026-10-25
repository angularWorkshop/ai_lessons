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
  throw new Error('TODO: шаг 5');
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
        throw new Error('TODO: шаг 5');
      },
    },
  ];
}
