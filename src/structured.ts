// Ответ модели как типизированные данные: схема zod → response_format → проверка → одна попытка починки.
import { z } from 'zod';
import { chat, type ChatOptions, type LlmConfig, type Message, type ResponseFormat, type Usage } from './llm.ts';

export interface AskJsonOptions extends Omit<ChatOptions, 'responseFormat'> {
  /** Имя схемы в response_format. По умолчанию 'answer'. */
  name?: string;
  /** Вызывается перед повторной попыткой: что не так и что модель прислала. Удобно для логов. */
  onRepair?: (problem: string, raw: string) => void;
}

export interface JsonResult<T> {
  data: T;
  /** Сколько запросов понадобилось: 1 или 2. */
  attempts: number;
  /** Токены всех попыток вместе. */
  usage: Usage;
}

// Модель так и не прислала данные, которые проходят схему.
export class StructuredOutputError extends Error {
  /** Последний ответ модели как есть. */
  readonly raw: string;
  /** Что с ним не так: ошибка JSON.parse или список ошибок zod. */
  readonly problem: string;
  readonly attempts: number;

  constructor(message: string, details: { raw: string; problem: string; attempts: number }) {
    super(message);
    this.name = 'StructuredOutputError';
    this.raw = details.raw;
    this.problem = details.problem;
    this.attempts = details.attempts;
  }
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; problem: string };

// Сколько всего запросов: первый и одна попытка починки.
const MAX_ATTEMPTS = 2;

// Шаг 2: схема zod → response_format. Поле $schema шлюзу не нужно.
export function jsonSchemaFormat(schema: z.ZodType, name = 'answer'): ResponseFormat {
  throw new Error('TODO: шаг 2');
}

// Шаг 3: текст ответа → данные или понятное описание ошибки.
export function parseJson<S extends z.ZodType>(text: string, schema: S): ParseResult<z.output<S>> {
  throw new Error('TODO: шаг 3');
}

// Что сказать модели, если ответ не прошёл проверку. Пригодится в шаге 5.
export function repairMessage(problem: string): string {
  return `Ответ не прошёл проверку:\n${problem}\n\nПришли исправленный JSON целиком, без пояснений.`;
}

// Шаги 4–5
export async function askJson<S extends z.ZodType>(
  config: LlmConfig,
  messages: Message[],
  schema: S,
  options: AskJsonOptions = {},
): Promise<JsonResult<z.output<S>>> {
  throw new Error('TODO: шаг 4');
}
