// Файлы задачи в памяти и три инструмента к ним: list_files, read_file, write_file.
// Настоящие инструменты для кода — в секции 5. Здесь нужна только площадка для длинных задач:
// что читать, куда писать и что потом проверить. Всё в памяти, поэтому тесты и демо не трогают диск.
import { z } from 'zod';
import type { Tool } from '../tools.ts';

export class Workspace {
  readonly #files = new Map<string, string>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) {
      this.#files.set(path, content);
    }
  }

  list(): string[] {
    return [...this.#files.keys()].sort();
  }

  read(path: string): string | undefined {
    return this.#files.get(path);
  }

  write(path: string, content: string): void {
    this.#files.set(path, content);
  }

  /** Все файлы как объект: удобно сравнить в тесте или напечатать в конце демо. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.#files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

const PathArgs = z.object({
  path: z.string().min(1).describe('Путь от корня проекта, например src/math.ts'),
});

const WriteArgs = z.object({
  path: z.string().min(1).describe('Путь от корня проекта, например tests/math.test.ts'),
  content: z.string().describe('Новое содержимое файла целиком. Старое содержимое заменяется'),
});

export interface WorkspaceToolsOptions {
  /** Только list_files и read_file: для ролей, которым писать нельзя. */
  readOnly?: boolean;
}

export function workspaceTools(workspace: Workspace, options: WorkspaceToolsOptions = {}): Tool[] {
  const listFiles: Tool<Record<string, never>> = {
    name: 'list_files',
    description: 'Список всех файлов проекта с размерами в символах.',
    schema: z.object({}),
    async run() {
      const paths = workspace.list();
      if (paths.length === 0) {
        return 'Проект пуст.';
      }
      return paths.map((path) => `${path} (${workspace.read(path)!.length})`).join('\n');
    },
  };

  const readFile: Tool<z.infer<typeof PathArgs>> = {
    name: 'read_file',
    description: 'Содержимое файла целиком. Первая строка ответа — путь к файлу, это не часть содержимого.',
    schema: PathArgs,
    async run({ path }) {
      const content = workspace.read(path);
      if (content === undefined) {
        throw new Error(`файла ${path} нет. Есть: ${workspace.list().join(', ')}`);
      }
      // Путь — в первой строке. Модель читает несколько файлов за шаг, и без пути путает, где чей текст.
      return `Файл ${path}:\n${content}`;
    },
  };

  const writeFile: Tool<z.infer<typeof WriteArgs>> = {
    name: 'write_file',
    description: 'Создаёт файл или заменяет его содержимое целиком. Чтобы дописать, сначала прочитай файл.',
    schema: WriteArgs,
    async run({ path, content }) {
      workspace.write(path, content);
      return `Записано ${content.length} символов в ${path}.`;
    },
  };

  return options.readOnly ? [listFiles, readFile] : [listFiles, readFile, writeFile];
}
