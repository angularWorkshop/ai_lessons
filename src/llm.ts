// Клиент к LLM в формате Chat Completions.
// С этого файла начинается наш агент: дальше по курсу он будет только расти.
import { setTimeout as delay } from 'node:timers/promises';

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Сколько ждать одну попытку, мс. По умолчанию 60 000. */
  timeoutMs?: number;
  /** Внешняя отмена: человек нажал Ctrl+C, закрыл окно, передумал. */
  signal?: AbortSignal;
  /** Сколько раз повторить после первой неудачи. По умолчанию 2, то есть до трёх попыток. */
  retries?: number;
  /** Пауза между попытками. Тесты подставляют свою, чтобы не ждать по-настоящему. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface Usage {
  input: number;
  output: number;
}

export interface ChatResult {
  text: string;
  finishReason: string;
  truncated: boolean;
  usage: Usage;
}

export interface Price {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Ошибка, по которой программа может принять решение: повторить, показать человеку, остановиться.
export class LlmError extends Error {
  /** HTTP-статус. undefined — ответа не было вовсе: сеть, таймаут, отмена. */
  readonly status: number | undefined;
  /** Код из тела ответа (invalid_api_key, rate_limit_exceeded…) или наш: timeout, aborted, network_error. */
  readonly code: string | undefined;
  /** Есть ли смысл отправить тот же запрос ещё раз. */
  readonly retryable: boolean;
  /** Сколько ждать перед повтором, если сервер сказал это сам (заголовок Retry-After). */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, details: { status?: number; code?: string; retryable: boolean; retryAfterMs?: number }) {
    super(message);
    this.name = 'LlmError';
    this.status = details.status;
    this.code = details.code;
    this.retryable = details.retryable;
    this.retryAfterMs = details.retryAfterMs;
  }
}

// Та часть ответа API, которая нам нужна. Остальные поля просто не описываем.
interface ChatCompletionResponse {
  choices: {
    message: { role: 'assistant'; content: string | null };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const read = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`Не задана переменная окружения ${name}`);
    }
    return value;
  };

  return {
    baseUrl: read('LLM_BASE_URL').replace(/\/+$/, ''),
    apiKey: read('LLM_API_KEY'),
    model: read('LLM_MODEL'),
  };
}

// Шаг 1
export async function errorFromResponse(response: Response): Promise<LlmError> {
  const body = await response.text();
  const code = readErrorCode(body);
  const doNotRetry = response.headers.get('x-should-retry') === 'false' || code === 'daily_quota_exceeded';

  return new LlmError(`LLM API ответил ${response.status}: ${body}`, {
    status: response.status,
    code,
    retryable: !doNotRetry && (response.status === 429 || response.status >= 500),
    retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
  });
}

// Ошибка в формате OpenAI: { "error": { "message": "...", "code": "..." } }. Тело может быть и не JSON.
function readErrorCode(body: string): string | undefined {
  try {
    const code = JSON.parse(body)?.error?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

// Retry-After приходит числом секунд («7») или датой («Sun, 25 Oct 2026 20:16:00 GMT»).
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// Шаг 2: одна попытка — с таймаутом и внешней отменой.
async function chatOnce(config: LlmConfig, messages: Message[], options: ChatOptions): Promise<ChatResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let data: ChatCompletionResponse;
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal,
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    data = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    throw toLlmError(error, options.signal, timeout, timeoutMs);
  }

  const choice = data.choices[0];
  return {
    text: choice.message.content ?? '',
    finishReason: choice.finish_reason,
    truncated: choice.finish_reason === 'length',
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
  };
}

// Что бы ни бросил fetch, наружу выходит LlmError. Порядок проверок важен:
// сначала — не отменил ли человек, потом — не вышло ли время, и только потом — сеть.
function toLlmError(error: unknown, external: AbortSignal | undefined, timeout: AbortSignal, timeoutMs: number): unknown {
  if (error instanceof LlmError) {
    return error;
  }
  if (external?.aborted) {
    return new LlmError('Запрос отменён', { code: 'aborted', retryable: false });
  }
  if (timeout.aborted) {
    return new LlmError(`Модель не ответила за ${timeoutMs} мс`, { code: 'timeout', retryable: true });
  }
  if (error instanceof TypeError) {
    // fetch пишет просто «fetch failed», а настоящая причина (ENOTFOUND, ECONNRESET) лежит в cause.
    const cause = (error.cause as { code?: string } | undefined)?.code;
    return new LlmError(`Сетевая ошибка: ${cause ?? error.message}`, { code: 'network_error', retryable: true });
  }
  return error;
}

// Шаг 3
export function retryDelay(attempt: number, retryAfterMs?: number): number {
  return Math.min(retryAfterMs ?? BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

// Шаг 4: повторяем только то, что имеет смысл повторить.
async function withRetries<T>(options: ChatOptions, run: () => Promise<T>): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const sleep = options.sleep ?? ((ms: number, signal?: AbortSignal) => delay(ms, undefined, { signal }));

  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof LlmError) || !error.retryable || attempt >= retries) {
        throw error;
      }
      try {
        await sleep(retryDelay(attempt, error.retryAfterMs), options.signal);
      } catch {
        // Ctrl+C во время паузы: не ждём до конца.
        throw new LlmError('Запрос отменён', { code: 'aborted', retryable: false });
      }
    }
  }
}

export async function chat(config: LlmConfig, messages: Message[], options: ChatOptions = {}): Promise<ChatResult> {
  return withRetries(options, () => chatOnce(config, messages, options));
}

export function estimateCost(usage: Usage, price: Price): number {
  return (usage.input * price.inputPerMillion + usage.output * price.outputPerMillion) / 1_000_000;
}
