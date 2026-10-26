// Клиент к LLM в формате Chat Completions.
// С этого файла начинается наш агент: дальше по курсу он будет только расти.
import { setTimeout as delay } from 'node:timers/promises';
import { ToolCallBuffer, type ToolCallDelta } from './tool-call-deltas.ts';

// Сообщение истории. С темы 3.1 их четыре вида: у ответа модели может не быть текста,
// зато быть вызовы инструментов, а результат инструмента приходит с ролью tool.
export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AssistantToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type Role = Message['role'];

/** Вызов инструмента в том виде, в каком он лежит в сообщении assistant. */
export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Описание инструмента для модели: имя, зачем он нужен и JSON Schema аргументов. */
export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Вызов, который программе нужно исполнить. arguments — сырая строка JSON, её ещё надо разобрать. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
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
  /** Инструменты, которые модель может вызвать. С ними и chatStream возвращает ChatResult с toolCalls. */
  tools?: ToolSpec[];
  /** auto — модель решает сама, none — только текст, required — обязательно вызвать инструмент. */
  toolChoice?: 'auto' | 'none' | 'required';
  /** Формат ответа: обычный текст, любой JSON или JSON по схеме. Не задан — поле не отправляется. */
  responseFormat?: ResponseFormat;
  /** Тема 7.5: рассуждения перед ответом. Не задано — поле не отправляется, модель отвечает как раньше. */
  reasoning?: ReasoningOptions;
}

// Объект reasoning в формате OpenRouter. Шлюз передаёт его модели как есть.
export interface ReasoningOptions {
  /** true — рассуждать с усилием по умолчанию. */
  enabled?: boolean;
  /** Сколько думать. Модель сама решает, сколько токенов это значит. */
  effort?: 'minimal' | 'low' | 'medium' | 'high';
  /** Предел токенов на рассуждения. Понимают не все модели. */
  max_tokens?: number;
  /** true — рассуждать, но текст рассуждений не присылать. Токены всё равно оплачиваются. */
  exclude?: boolean;
}

// Поле response_format из Chat Completions.
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean; description?: string };
    };

export interface Usage {
  input: number;
  output: number;
  /** Тема 7.5: сколько из output ушло на рассуждения. Есть, только если модель рассуждала. */
  reasoning?: number;
}

// Ответ текстом. Столько возвращает chatStream без tools — как в теме 1.4.
export interface TextResult {
  text: string;
  finishReason: string;
  truncated: boolean;
  usage: Usage;
}

export interface ChatResult extends TextResult {
  /** Тема 7.5: текст рассуждений, если модель их прислала. В историю он не попадает. */
  reasoning?: string;
  /** Что модель попросила вызвать. Пустой массив — инструменты не нужны, ответ в text. */
  toolCalls: ToolCall[];
  /** Ответ модели, готовый лечь в историю как есть: вместе с tool_calls, если они были. */
  message: Extract<Message, { role: 'assistant' }>;
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
    // В каждом tool_call шлюз присылает ещё и index. Нам он не нужен, и в историю мы его не кладём.
    message: { role: 'assistant'; content: string | null; tool_calls?: AssistantToolCall[]; reasoning?: string | null };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

// Один кусочек стрима (chat.completion.chunk). Последний, с usage, может прийти с пустым choices.
interface ChatCompletionChunk {
  choices: {
    // С темы 6.1: вызовы инструментов тоже приходят по кусочкам.
    delta: { content?: string | null; tool_calls?: ToolCallDelta[] };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  } | null;
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

// Одна попытка — с таймаутом и внешней отменой.
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
        // Шаг 1: без инструментов тело запроса такое же, как раньше.
        ...(options.tools?.length ? { tools: options.tools } : {}),
        ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
        // undefined JSON.stringify пропустит: старые запросы не меняются.
        response_format: options.responseFormat,
        reasoning: options.reasoning,
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
  const text = choice.message.content ?? '';
  // Шаг 2: вызовы — в удобный программе вид. arguments не разбираем: это строка, и она бывает кривой.
  const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }));

  // Тема 7.5: рассуждения — часть output, но знать их долю нужно отдельно. Нет рассуждений — нет и полей.
  const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const reasoning = choice.message.reasoning;

  return {
    text,
    finishReason: choice.finish_reason,
    truncated: choice.finish_reason === 'length',
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
      ...(reasoningTokens > 0 ? { reasoning: reasoningTokens } : {}),
    },
    toolCalls,
    message: assistantMessage(choice.message.content, toolCalls),
    ...(reasoning ? { reasoning } : {}),
  };
}

// Шаг 3: сообщение для истории. Текст без вызовов — как раньше, content строкой.
// С вызовами content остаётся null, а tool_calls собираем заново: только id, type и function.
export function assistantMessage(content: string | null, toolCalls: ToolCall[]): ChatResult['message'] {
  if (toolCalls.length === 0) {
    return { role: 'assistant', content: content ?? '' };
  }
  return {
    role: 'assistant',
    content,
    tool_calls: toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    })),
  };
}

// Что бы ни бросил fetch, наружу выходит LlmError. Порядок проверок важен:
// сначала — не отменил ли человек, потом — не вышло ли время, и только потом — сеть.
export function toLlmError(error: unknown, external: AbortSignal | undefined, timeout: AbortSignal, timeoutMs: number): unknown {
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
export async function withRetries<T>(options: ChatOptions, run: () => Promise<T>): Promise<T> {
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

// ---------- Стриминг ----------

// Шаг 1: сеть режет поток где попало, а нам нужны целые строки.
export class LineBuffer {
  private rest = '';

  push(text: string): string[] {
    const lines = (this.rest + text).split('\n');
    // Последний кусок — начало строки, у которой ещё нет \n. Ждём продолжения.
    this.rest = lines.pop() ?? '';
    return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  }
}

// Шаг 2: из строки SSE достаём то, что после «data:». Остальное — не наше.
export function sseData(line: string): string | undefined {
  // Пустая строка разделяет события, «: OPENROUTER PROCESSING» — комментарий, event:/id: нам не нужны.
  if (!line.startsWith('data:')) {
    return undefined;
  }
  const value = line.slice('data:'.length);
  return value.startsWith(' ') ? value.slice(1) : value;
}

// Таймер тишины: отменяет запрос, если сеть молчит дольше ms. refresh() — «байты пришли, считай заново».
function idleTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, refresh: () => timer.refresh(), clear: () => clearTimeout(timer) };
}

// Открыть стрим: запрос с stream: true и проверка статуса, как в chatOnce.
async function openStream(config: LlmConfig, messages: Message[], options: ChatOptions, timeoutMs: number) {
  const idle = idleTimeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, idle.signal]) : idle.signal;

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
        // Шаг 2 (6.1): инструменты — как в chatOnce. Без них тело запроса прежнее.
        ...(options.tools?.length ? { tools: options.tools } : {}),
        ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
        // undefined JSON.stringify пропустит: старые запросы не меняются.
        response_format: options.responseFormat,
        reasoning: options.reasoning,
        stream: true,
        // Без этого OpenAI не пришлёт usage в стриме. Наш шлюз добавляет его сам, но мы не полагаемся.
        stream_options: { include_usage: true },
      }),
      signal,
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    if (!response.body) {
      throw new LlmError('Сервер ответил 200 без тела', { status: 200, retryable: true });
    }
    return { body: response.body, idle };
  } catch (error) {
    idle.clear();
    throw toLlmError(error, options.signal, idle.signal, timeoutMs);
  }
}

// Шаги 3–4. С tools в опциях возвращает ChatResult, как chat; без них — прежний TextResult.
export function chatStream(
  config: LlmConfig,
  messages: Message[],
  options: ChatOptions & { tools: ToolSpec[] },
  onDelta: (text: string) => void,
): Promise<ChatResult>;
export function chatStream(config: LlmConfig, messages: Message[], options: ChatOptions, onDelta: (text: string) => void): Promise<TextResult>;
export async function chatStream(
  config: LlmConfig,
  messages: Message[],
  options: ChatOptions,
  onDelta: (text: string) => void,
): Promise<TextResult | ChatResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Повторяем только открытие: после первого кусочка повтор напечатал бы текст второй раз.
  const { body, idle } = await withRetries(options, () => openStream(config, messages, options, timeoutMs));

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const lines = new LineBuffer();
  let text = '';
  let finishReason = '';
  let usage: Usage = { input: 0, output: 0 };
  let done = false;
  const calls = new ToolCallBuffer();

  try {
    while (!done) {
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await reader.read();
      } catch (error) {
        throw toLlmError(error, options.signal, idle.signal, timeoutMs);
      }
      if (read.done) {
        break;
      }
      idle.refresh();

      // stream: true — буква, разрезанная между кусочками, подождёт свою вторую половину.
      for (const line of lines.push(decoder.decode(read.value, { stream: true }))) {
        const data = sseData(line);
        if (data === undefined) {
          continue;
        }
        if (data === '[DONE]') {
          done = true;
          break;
        }

        const chunk = JSON.parse(data) as ChatCompletionChunk;
        // В чанке с usage choices бывает пустым: тогда choices[0] — undefined, хотя тип об этом молчит.
        const choice: ChatCompletionChunk['choices'][number] | undefined = chunk.choices[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        // Шаг 2 (6.1): кусочки вызовов — в буфер. В чанках с вызовами content приходит null.
        if (choice?.delta?.tool_calls) {
          calls.push(choice.delta.tool_calls);
        }
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
        if (chunk.usage) {
          usage = { input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens };
        }
      }
    }
  } finally {
    idle.clear();
    reader.cancel().catch(() => {});
  }

  if (!done) {
    // Шлюз закрывает соединение, если провайдер упал посреди ответа. Без [DONE] ответ неполный.
    throw new LlmError('Стрим оборвался до data: [DONE]', { code: 'stream_interrupted', retryable: true });
  }
  const result: TextResult = { text, finishReason, truncated: finishReason === 'length', usage };
  if (!options.tools) {
    return result;
  }
  // Шаг 2 (6.1): тот же ChatResult, что у chat. Текста перед вызовами нет — content: null, как в ответе без стрима.
  const toolCalls = calls.calls();
  return { ...result, toolCalls, message: assistantMessage(toolCalls.length > 0 && text === '' ? null : text, toolCalls) };
}
