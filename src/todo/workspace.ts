// Файлы задачи в памяти и три инструмента к ним: list_files, read_file, write_file.
// Настоящие инструменты для кода — в секции 5. Здесь нужна только площадка для длинных задач:
// что читать, куда писать и что потом проверить. Всё в памяти, поэтому тесты и демо не трогают диск.
import { z } from 'zod';
import type { Tool } from '../tools.ts';

export class Workspace {
  readonly #files = new Map<string, string>();
  /** Номер версии каждого файла: растёт с каждой записью. По нему видно, что файл поменял кто-то другой. */
  readonly #versions = new Map<string, number>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) {
      this.write(path, content);
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
    this.#versions.set(path, this.version(path) + 1);
  }

  // Тема 10.4, шаг 4. 0 — файла нет.
  version(path: string): number {
    return this.#versions.get(path) ?? 0;
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
  /**
   * Не давать перезаписать файл, который изменился после того, как этот агент его прочитал, или который он не читал вовсе.
   * Нужно, когда несколько агентов пишут в одну папку одновременно. Каждому агенту — свой набор инструментов.
   */
  checkStale?: boolean;
}

export function workspaceTools(workspace: Workspace, options: WorkspaceToolsOptions = {}): Tool[] {
  // Какую версию каждого файла видел владелец этих инструментов. Один набор инструментов — один агент.
  const seen = new Map<string, number>();

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
      seen.set(path, workspace.version(path));
      // Путь — в первой строке. Модель читает несколько файлов за шаг, и без пути путает, где чей текст.
      return `Файл ${path}:\n${content}`;
    },
  };

  const writeFile: Tool<z.infer<typeof WriteArgs>> = {
    name: 'write_file',
    description: 'Создаёт файл или заменяет его содержимое целиком. Чтобы дописать, сначала прочитай файл.',
    schema: WriteArgs,
    async run({ path, content }) {
      // Проверка и запись — без await между ними: JavaScript однопоточный, никто не вклинится.
      if (options.checkStale) {
        checkFresh(workspace, seen, path);
      }
      workspace.write(path, content);
      seen.set(path, workspace.version(path));
      return `Записано ${content.length} символов в ${path}.`;
    },
  };

  return options.readOnly ? [listFiles, readFile] : [listFiles, readFile, writeFile];
}

// Тема 10.4, шаг 4: новый файл писать можно; существующий — только ту версию, которую агент прочитал.
function checkFresh(workspace: Workspace, seen: Map<string, number>, path: string): void {
  throw new Error('TODO: шаг 4');
}
