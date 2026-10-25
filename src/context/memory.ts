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
    throw new Error('TODO: шаг 1');
  }

  // Шаг 3: в промпт идут только свежие факты.
  async active(): Promise<MemoryItem[]> {
    throw new Error('TODO: шаг 3');
  }

  // Шаги 2–3: запомнить факт. replaces — id устаревшего факта, который этот заменяет.
  async add(text: string, replaces?: string): Promise<MemoryItem> {
    throw new Error('TODO: шаг 2');
  }

  #expired(item: MemoryItem): boolean {
    throw new Error('TODO: шаг 3');
  }

  // Шаг 2: атомарная запись. Пишем во временный файл рядом и переименовываем.
  // rename в пределах одной папки атомарен: читатель видит либо старый файл, либо новый, но не половину.
  async #save(items: MemoryItem[]): Promise<void> {
    throw new Error('TODO: шаг 2');
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
  throw new Error('TODO: шаг 4');
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
      throw new Error('TODO: шаг 4');
    },
  };
}

export const MEMORY_INTRO =
  'Факты из прошлых сессий, в скобках — когда запомнено. Они могли устареть: если факт спорит с тем, что ты видишь сейчас, верь текущему и обнови память через remember с replaces.';

// Шаг 4: раздел system prompt. Пустая память — пустой раздел, buildSystemPrompt его пропустит.
export function memorySection(items: MemoryItem[]): PromptSection {
  throw new Error('TODO: шаг 4');
}
