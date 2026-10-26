// Клиент к модели в формате Chat Completions — компактная версия llm.ts из курса.
// Только то, что нужно агенту поддержки: инструменты, таймаут, повторы на 429 и 5xx. Без стриминга.
import { setTimeout as delay } from 'node:timers/promises';

export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AssistantToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Вызов, который нужно исполнить. arguments — сырая строка JSON от модели. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
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
  toolCalls: ToolCall[];
  /** Ответ модели, готовый лечь в историю. */
  message: Extract<Message, { role: 'assistant' }>;
}

/** То, у чего агент просит следующий ответ: настоящая модель или сценарий в тестах. */
export interface Provider {
  complete(messages: Message[], options: ChatOptions): Promise<ChatResult>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Price {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Цены qwen/qwen3.7-flash, доллары за миллион токенов. */
export const PRICE: Price = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

const TIMEOUT_MS = 60_000;
const RETRIES = 3;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const read = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`Не задана переменная окружения ${name}`);
    }
    return value;
  };
  return { baseUrl: read('LLM_BASE_URL').replace(/\/+$/, ''), apiKey: read('LLM_API_KEY'), model: read('LLM_MODEL') };
}

export function assistantMessage(content: string | null, toolCalls: ToolCall[]): ChatResult['message'] {
  if (toolCalls.length === 0) {
    return { role: 'assistant', content: content ?? '' };
  }
  return {
    role: 'assistant',
    content,
    tool_calls: toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
  };
}

interface CompletionResponse {
  choices: { message: { content: string | null; tool_calls?: AssistantToolCall[] }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

async function chatOnce(config: LlmConfig, messages: Message[], options: ChatOptions): Promise<ChatResult> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.tools?.length ? { tools: options.tools } : {}),
        ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
      }),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new LlmError('Запрос отменён', undefined, false);
    if (timeout.aborted) throw new LlmError(`Модель не ответила за ${TIMEOUT_MS} мс`, undefined, true);
    throw new LlmError(`Сетевая ошибка: ${(error as Error).message}`, undefined, true);
  }

  if (!response.ok) {
    const body = await response.text();
    // daily_quota_exceeded приходит с x-should-retry: false — повтор не поможет до завтра.
    const retryable = response.headers.get('x-should-retry') !== 'false' && (response.status === 429 || response.status >= 500);
    const seconds = Number(response.headers.get('retry-after'));
    const retryAfterMs = response.headers.has('retry-after') && Number.isFinite(seconds) ? seconds * 1000 : undefined;
    throw new LlmError(`LLM API ответил ${response.status}: ${body}`, response.status, retryable, retryAfterMs);
  }

  const data = (await response.json()) as CompletionResponse;
  const choice = data.choices[0];
  const toolCalls = (choice.message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }));
  return {
    text: choice.message.content ?? '',
    finishReason: choice.finish_reason,
    truncated: choice.finish_reason === 'length',
    usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
    toolCalls,
    message: assistantMessage(choice.message.content, toolCalls),
  };
}

export async function chat(config: LlmConfig, messages: Message[], options: ChatOptions = {}): Promise<ChatResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatOnce(config, messages, options);
    } catch (error) {
      if (!(error instanceof LlmError) || !error.retryable || attempt >= RETRIES) {
        throw error;
      }
      // Сервер сказал, сколько ждать, — ждём столько. Нет — 1, 2, 4 секунды.
      await delay(Math.min(error.retryAfterMs ?? 1000 * 2 ** attempt, 30_000), undefined, { signal: options.signal });
    }
  }
}

export function llmProvider(config: LlmConfig): Provider {
  return { complete: (messages, options) => chat(config, messages, options) };
}

export function estimateCost(usage: Usage, price: Price = PRICE): number {
  return (usage.input * price.inputPerMillion + usage.output * price.outputPerMillion) / 1_000_000;
}
