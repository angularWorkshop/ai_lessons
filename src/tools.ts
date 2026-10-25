// Инструменты агента: интерфейс Tool и реестр Toolbox.
// Модель видит только specs(): имя, описание и JSON Schema аргументов. Код run она не видит.
import { z } from 'zod';
import type { ToolCall, ToolSpec } from './llm.ts';

export interface ToolContext {
  /** Отмена: человек нажал Ctrl+C посреди работы инструмента. Пригодится в секции 6. */
  signal?: AbortSignal;
}

export interface Tool<A = any> {
  /** Имя, по которому модель вызывает инструмент: латиница, цифры, _ и -. */
  name: string;
  /** Когда и зачем звать инструмент. Это текст для модели, а не комментарий для людей. */
  description: string;
  /** Аргументы. Из схемы получается JSON Schema для модели, ею же проверяем то, что модель прислала. */
  schema: z.ZodType<A>;
  /** Исполнение. Результат — строка: она уйдёт модели сообщением с ролью tool. */
  run(args: A, ctx: ToolContext): Promise<string>;
}

// zod → JSON Schema (тема 3.2).
// io: 'input' — схема того, что присылает модель: поле с .default() для неё необязательно.
// $schema модели не нужен: это лишние токены в каждом запросе.
export function toParameters(name: string, schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...parameters } = z.toJSONSchema(schema, { io: 'input' });
  if (parameters.type !== 'object') {
    throw new Error(`Аргументы инструмента ${name} должны быть объектом: z.object({...})`);
  }
  return parameters;
}

/** Что уйдёт модели сообщением с ролью tool. isError — для нас: логов, интерфейса, счётчика ошибок. */
export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface ToolboxOptions {
  /** Сколько символов результата отдать модели. Всё, что длиннее, обрезается с пометкой. */
  maxResultChars?: number;
}

const DEFAULT_MAX_RESULT_CHARS = 20_000;

// Шаг 4: длинный результат обрезаем и честно говорим модели, сколько она не увидела.
export function truncate(text: string, maxChars: number): string {
  throw new Error('TODO: шаг 4 — обрежь текст до maxChars и допиши пометку');
}

// Такие имена принимает OpenAI API. Остальные провайдеры не мягче.
const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export class Toolbox {
  readonly #tools = new Map<string, { tool: Tool; spec: ToolSpec }>();
  readonly #maxResultChars: number;

  constructor(options: ToolboxOptions = {}) {
    this.#maxResultChars = options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
  }

  register(tool: Tool): this {
    if (!NAME.test(tool.name)) {
      throw new Error(`Имя инструмента «${tool.name}» не подойдёт: только латиница, цифры, _ и -, до 64 символов`);
    }
    if (this.#tools.has(tool.name)) {
      throw new Error(`Инструмент ${tool.name} уже зарегистрирован`);
    }
    // Схему переводим сразу. Если она не переводится в JSON Schema, узнаем при старте, а не посреди задачи.
    const spec: ToolSpec = {
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: toParameters(tool.name, tool.schema) },
    };
    this.#tools.set(tool.name, { tool, spec });
    return this;
  }

  get(name: string): Tool | undefined {
    return this.#tools.get(name)?.tool;
  }

  specs(): ToolSpec[] {
    return [...this.#tools.values()].map(({ spec }) => spec);
  }

  // Шаги 1–4: исполнить вызов модели. Никогда не бросает: любая беда становится текстом для модели.
  async execute(call: ToolCall, ctx: ToolContext = {}): Promise<ToolResult> {
    throw new Error('TODO: шаги 1–3 — исполни вызов и верни ToolResult');
  }
}

function failure(text: string): ToolResult {
  return { content: `Ошибка: ${text}`, isError: true };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
