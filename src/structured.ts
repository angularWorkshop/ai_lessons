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

const MAX_ATTEMPTS = 2;

// Шаг 2: схема zod → response_format. Поле $schema шлюзу не нужно.
export function jsonSchemaFormat(schema: z.ZodType, name = 'answer'): ResponseFormat {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema);
  return { type: 'json_schema', json_schema: { name, strict: true, schema: jsonSchema } };
}

// Шаг 3: текст ответа → данные или понятное описание ошибки.
export function parseJson<S extends z.ZodType>(text: string, schema: S): ParseResult<z.output<S>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, problem: `Ответ не JSON: ${(error as Error).message}` };
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, problem: z.prettifyError(result.error) };
  }
  return { ok: true, data: result.data };
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
  const { name, onRepair, ...chatOptions } = options;
  const responseFormat = jsonSchemaFormat(schema, name);
  let request = messages;
  let usage: Usage = { input: 0, output: 0 };

  for (let attempt = 1; ; attempt++) {
    const result = await chat(config, request, { ...chatOptions, responseFormat });
    usage = { input: usage.input + result.usage.input, output: usage.output + result.usage.output };

    if (result.truncated) {
      // Обрезанный JSON не починить просьбой: модель упрётся в тот же лимит.
      throw new StructuredOutputError(`Ответ обрезан на ${result.usage.output} токенах: увеличь maxTokens`, {
        raw: result.text,
        problem: 'finish_reason: length',
        attempts: attempt,
      });
    }

    const parsed = parseJson(result.text, schema);
    if (parsed.ok) {
      return { data: parsed.data, attempts: attempt, usage };
    }
    if (attempt >= MAX_ATTEMPTS) {
      throw new StructuredOutputError(`Ответ модели не прошёл схему после ${attempt} попыток:\n${parsed.problem}`, {
        raw: result.text,
        problem: parsed.problem,
        attempts: attempt,
      });
    }

    onRepair?.(parsed.problem, result.text);
    request = [
      ...request,
      { role: 'assistant', content: result.text },
      { role: 'user', content: repairMessage(parsed.problem) },
    ];
  }
}
