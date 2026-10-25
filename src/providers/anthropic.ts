// Адаптер к Anthropic Messages API. Внутри агента история живёт в нашем формате (он похож на Chat Completions),
// а этот файл переводит её на язык Anthropic и обратно. Agent про перевод не знает: для него это обычный Provider.
import {
  assistantMessage,
  errorFromResponse,
  LlmError,
  toLlmError,
  withRetries,
  type ChatOptions,
  type ChatResult,
  type LlmConfig,
  type Message,
  type ToolCall,
} from '../llm.ts';
import type { Provider } from '../provider.ts';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
/** Версия API идёт заголовком в каждом запросе. В 2026-10-21 убраны temperature, top_p и top_k. */
export const ANTHROPIC_VERSION = '2026-10-21';

// У Anthropic max_tokens обязателен. Берём то же значение, что и chat() в llm.ts.
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

// ---------- Формат Anthropic: только то, что нужно адаптеру ----------

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  /** Аргументы — уже объект, а не строка JSON, как в Chat Completions. */
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

/** Ролей всего две. Результаты инструментов приходят от user, system — отдельным полем запроса. */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicBlock[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' | 'any' | 'none' };
  output_config?: { format: { type: 'json_schema'; schema: Record<string, unknown> } };
}

export interface AnthropicUsage {
  /** Только то, что не прочитано из кеша и не записано в него. Это не весь вход! */
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface AnthropicResponse {
  id: string;
  role: 'assistant';
  /** Кроме text и tool_use бывают thinking и блоки серверных инструментов. Адаптер их пропускает. */
  content: AnthropicBlock[];
  stop_reason: string | null;
  usage?: AnthropicUsage;
}

// ---------- Шаг 1: история → messages и system ----------

export function toAnthropicMessages(history: Message[]): { system?: string; messages: AnthropicMessage[] } {
  throw new Error('TODO: шаг 1');
}

// В нашей истории аргументы — строка, и модель иногда пишет её кривой (тема 3.3).
// Anthropic ждёт объект. Вызов с кривыми аргументами всё равно не исполнился, а модель уже получила ошибку.
function parseInput(args: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(args);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------- Шаг 2: опции → тело запроса ----------

const TOOL_CHOICE = { auto: 'auto', none: 'none', required: 'any' } as const;

export function toAnthropicRequest(model: string, history: Message[], options: ChatOptions = {}): AnthropicRequest {
  throw new Error('TODO: шаг 2');
}

// ---------- Шаг 3: ответ Anthropic → ChatResult ----------

// stop_reason Anthropic → finish_reason, который ждёт агент. Незнакомые значения проходят как есть.
const FINISH_REASON: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool_calls',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  refusal: 'content_filter',
};

export function fromAnthropicResponse(data: AnthropicResponse): ChatResult {
  throw new Error('TODO: шаг 3');
}

// ---------- Шаг 4: Provider ----------

// Запрос — как chatOnce в llm.ts: таймаут, внешняя отмена, withRetries, toLlmError.
// Ошибочный ответ превращай в LlmError через anthropicError ниже.
export function anthropicProvider(config: LlmConfig): Provider {
  throw new Error('TODO: шаг 4');
}

// Ошибка Anthropic: { "type": "error", "error": { "type": "rate_limit_error", "message": "..." } }.
// Статус, повтор и Retry-After разбирает errorFromResponse, код берём из error.type.
async function anthropicError(response: Response): Promise<LlmError> {
  const body = await response.clone().text();
  const error = await errorFromResponse(response);
  let code: string | undefined;
  try {
    const type = JSON.parse(body)?.error?.type;
    code = typeof type === 'string' ? type : undefined;
  } catch {
    code = undefined;
  }
  return new LlmError(error.message, {
    status: error.status,
    code: code ?? error.code,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
  });
}
