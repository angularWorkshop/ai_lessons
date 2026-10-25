// Инструменты агента: интерфейс Tool и реестр Toolbox.
// Модель видит только specs(): имя, описание и JSON Schema аргументов. Код run она не видит.
import { z } from 'zod';
import type { ToolSpec } from './llm.ts';

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

// Шаг 1: zod → JSON Schema.
// io: 'input' — схема того, что присылает модель: поле с .default() для неё необязательно.
// $schema модели не нужен: это лишние токены в каждом запросе.
export function toParameters(name: string, schema: z.ZodType): Record<string, unknown> {
  throw new Error('TODO: шаг 1 — переведи схему zod в JSON Schema');
}

// Такие имена принимает OpenAI API. Остальные провайдеры не мягче.
const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export class Toolbox {
  readonly #tools = new Map<string, { tool: Tool; spec: ToolSpec }>();

  // Шаг 2
  register(tool: Tool): this {
    throw new Error('TODO: шаг 2 — проверь имя, переведи схему и сохрани инструмент');
  }

  // Шаг 2
  get(name: string): Tool | undefined {
    throw new Error('TODO: шаг 2 — найди инструмент по имени');
  }

  // Шаг 2
  specs(): ToolSpec[] {
    throw new Error('TODO: шаг 2 — верни описания всех инструментов');
  }
}
