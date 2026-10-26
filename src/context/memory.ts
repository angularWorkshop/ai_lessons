// Память между сессиями: файл с фактами, инструмент remember и раздел system prompt.
// История живёт одну сессию. Память — то, что агент сам решил унести в следующую.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { PromptSection } from '../prompt.ts';
import type { Tool } from '../tools.ts';

/** Путь от корня проекта. Память личная, в git её не кладут: .agent/ — в .gitignore. */
export const MEMORY_FILE = '.agent/memory.json';
/** Через столько дней факт перестаёт попадать в промпт и удаляется при следующей записи. */
export const DEFAULT_TTL_DAYS = 90;
/** Больше фактов не держим: при переполнении уходят самые старые. */
export const DEFAULT_MAX_ITEMS = 50;
export const MAX_FACT_CHARS = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

const MemoryItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** Когда факт запомнили или подтвердили в последний раз. ISO 8601. */
  createdAt: z.string(),
});

const MemoryFileSchema = z.object({
  version: z.literal(1),
  items: z.array(MemoryItemSchema),
});

export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export interface MemoryStoreOptions {
  /** Часы. Тесты подставляют свои, чтобы проверить устаревание без ожидания. */
  now?: () => Date;
  ttlDays?: number;
  maxItems?: number;
}

// Одинаковые факты, записанные по-разному: регистр и лишние пробелы не делают факт новым.
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export class MemoryStore {
  readonly file: string;
  readonly #now: () => Date;
  readonly #ttlDays: number;
  readonly #maxItems: number;

  constructor(file: string, options: MemoryStoreOptions = {}) {
    this.file = file;
    this.#now = options.now ?? (() => new Date());
    this.#ttlDays = options.ttlDays ?? DEFAULT_TTL_DAYS;
    this.#maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  }

  // Шаг 1: нет файла — память пустая. Битый файл — ошибка: молча начать с нуля значит потерять его при первой записи.
  async load(): Promise<MemoryItem[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Файл памяти ${this.file} повреждён: ${(error as Error).message}`);
    }
    const parsed = MemoryFileSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Файл памяти ${this.file} повреждён: ${z.prettifyError(parsed.error)}`);
    }
    return parsed.data.items;
  }

  // Шаг 3: в промпт идут только свежие факты.
  async active(): Promise<MemoryItem[]> {
    const items = await this.load();
    return items.filter((item) => !this.#expired(item));
  }

  // Шаги 2–3: запомнить факт. replaces — id устаревшего факта, который этот заменяет.
  async add(text: string, replaces?: string): Promise<MemoryItem> {
    const fact = text.trim();
    if (!fact) {
      throw new Error('Пустой факт не запоминаем');
    }
    const loaded = await this.load();
    let items = loaded;
    if (replaces !== undefined) {
      if (!items.some((item) => item.id === replaces)) {
        throw new Error(`В памяти нет записи ${replaces}`);
      }
      items = items.filter((item) => item.id !== replaces);
    }

    const createdAt = this.#now().toISOString();
    // Тот же факт ещё раз — не дубль, а подтверждение: обновляем дату, id остаётся.
    const same = items.find((item) => normalize(item.text) === normalize(fact));
    const item: MemoryItem = same ? { ...same, createdAt } : { id: nextId(loaded), text: fact, createdAt };

    const rest = items.filter((existing) => existing !== same && !this.#expired(existing));
    // Самые старые — первыми за дверь. Новый факт всегда остаётся.
    const kept = [...rest, item].slice(-this.#maxItems);
    await this.#save(kept);
    return item;
  }

  #expired(item: MemoryItem): boolean {
    return this.#now().getTime() - Date.parse(item.createdAt) > this.#ttlDays * DAY_MS;
  }

  // Шаг 2: атомарная запись. Пишем во временный файл рядом и переименовываем.
  // rename в пределах одной папки атомарен: читатель видит либо старый файл, либо новый, но не половину.
  async #save(items: MemoryItem[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    const data: z.infer<typeof MemoryFileSchema> = { version: 1, items };
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
    await rename(tmp, this.file);
  }
}

// m1, m2, … — коротко, чтобы модель могла сослаться на запись в replaces. Считаем по всем записям,
// включая заменённую: id удалённого факта не должен достаться новому.
function nextId(items: MemoryItem[]): string {
  const max = Math.max(0, ...items.map((item) => Number(item.id.slice(1)) || 0));
  return `m${max + 1}`;
}

// Шаг 4: то, что в память попадать не должно ни при каких условиях.
const SECRET = /(api[_-]?key|token|password|пароль|secret|секрет)\s*[:=—-]|\b(sk|edt|ghp|xox[bp])[-_][A-Za-z0-9_-]{8,}|-----BEGIN /i;

export function looksSecret(text: string): boolean {
  return SECRET.test(text);
}

const RememberArgs = z.object({
  fact: z.string().max(MAX_FACT_CHARS).describe('Один факт одной фразой, понятной без этого разговора'),
  replaces: z.string().optional().describe('id устаревшей записи из раздела «Память», которую этот факт заменяет, например m3'),
});

// Шаг 4
export function rememberTool(store: MemoryStore): Tool<z.infer<typeof RememberArgs>> {
  return {
    name: 'remember',
    description: `Сохраняет факт в долговременную память. Она загрузится в следующих сессиях, в этой ничего не меняет.
Запоминай то, что пригодится потом и чего не видно из кода: предпочтения пользователя, договорённости, принятые решения и их причины.
Не запоминай секреты и ключи, содержимое файлов, шаги текущей задачи и то, что легко узнать заново.
Факт устарел — запиши новый и передай replaces с id старого.`,
    schema: RememberArgs,
    async run({ fact, replaces }) {
      if (looksSecret(fact)) {
        throw new Error('похоже на секрет. Ключи, токены и пароли в память не записываются');
      }
      const item = await store.add(fact, replaces);
      return `Запомнил как ${item.id}.${replaces ? ` Запись ${replaces} удалена.` : ''}`;
    },
  };
}

export const MEMORY_INTRO =
  'Факты из прошлых сессий, в скобках — когда запомнено. Они могли устареть: если факт спорит с тем, что ты видишь сейчас, верь текущему и обнови память через remember с replaces.';

// Шаг 4: раздел system prompt. Пустая память — пустой раздел, buildSystemPrompt его пропустит.
export function memorySection(items: MemoryItem[]): PromptSection {
  if (items.length === 0) {
    return { title: 'Память', body: '' };
  }
  const lines = items.map((item) => `- [${item.id}] ${item.text} (${item.createdAt.slice(0, 10)})`);
  return { title: 'Память', body: [MEMORY_INTRO, ...lines].join('\n') };
}
