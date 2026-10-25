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
  const system: string[] = [];
  const messages: AnthropicMessage[] = [];

  // Сообщение user с блоками, к которому можно дописать: результаты инструментов, а за ними текст.
  const openUserBlocks = (): AnthropicBlock[] | undefined => {
    const last = messages.at(-1);
    return last?.role === 'user' && Array.isArray(last.content) ? last.content : undefined;
  };

  for (const message of history) {
    switch (message.role) {
      case 'system':
        system.push(message.content);
        break;

      case 'user': {
        // Сразу после результатов инструментов текст ложится в то же сообщение, после всех tool_result.
        // Так бывает на последнем шаге агента: FINAL_STEP_NOTE идёт следом за сообщениями tool.
        const blocks = openUserBlocks();
        if (blocks) {
          blocks.push({ type: 'text', text: message.content });
        } else {
          messages.push({ role: 'user', content: message.content });
        }
        break;
      }

      case 'assistant': {
        const calls = message.tool_calls ?? [];
        if (calls.length === 0) {
          messages.push({ role: 'assistant', content: message.content ?? '' });
          break;
        }
        const blocks: AnthropicBlock[] = [];
        // Пустой текстовый блок Anthropic не примет: кладём текст, только если он есть.
        if (message.content) {
          blocks.push({ type: 'text', text: message.content });
        }
        for (const call of calls) {
          blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseInput(call.function.arguments) });
        }
        messages.push({ role: 'assistant', content: blocks });
        break;
      }

      case 'tool': {
        // Все результаты одного шага — одно сообщение user, по блоку на вызов.
        const block: AnthropicToolResultBlock = { type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content };
        const blocks = openUserBlocks();
        if (blocks) {
          blocks.push(block);
        } else {
          messages.push({ role: 'user', content: [block] });
        }
        break;
      }
    }
  }

  return { ...(system.length > 0 ? { system: system.join('\n\n') } : {}), messages };
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
  const { system, messages } = toAnthropicMessages(history);
  const tools = options.tools ?? [];

  const request: AnthropicRequest = {
    model,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(system !== undefined ? { system } : {}),
    messages,
  };
  // temperature не отправляем: в версии 2026-10-21 запрос с ним получает 400.

  if (tools.length > 0) {
    request.tools = tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
    if (options.toolChoice) {
      request.tool_choice = { type: TOOL_CHOICE[options.toolChoice] };
    }
  }

  const format = options.responseFormat;
  if (format?.type === 'json_schema') {
    request.output_config = { format: { type: 'json_schema', schema: format.json_schema.schema } };
  } else if (format?.type === 'json_object') {
    throw new Error('У Anthropic нет режима «любой JSON»: передай responseFormat с json_schema');
  }
  return request;
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
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of data.content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input) });
    }
  }

  const stopReason = data.stop_reason ?? '';
  const finishReason = FINISH_REASON[stopReason] ?? stopReason;
  const usage = data.usage;

  return {
    text,
    finishReason,
    truncated: finishReason === 'length',
    usage: {
      // Наш input — весь вход, как prompt_tokens у OpenAI. У Anthropic он разложен на три поля.
      input: (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
      output: usage?.output_tokens ?? 0,
    },
    toolCalls,
    message: assistantMessage(text || null, toolCalls),
  };
}

// ---------- Шаг 4: Provider ----------

export function anthropicProvider(config: LlmConfig): Provider {
  return {
    complete: (messages, options) => withRetries(options, () => completeOnce(config, messages, options)),
  };
}

async function completeOnce(config: LlmConfig, messages: Message[], options: ChatOptions): Promise<ChatResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  try {
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toAnthropicRequest(config.model, messages, options)),
      signal,
    });
    if (!response.ok) {
      throw await anthropicError(response);
    }
    return fromAnthropicResponse((await response.json()) as AnthropicResponse);
  } catch (error) {
    throw toLlmError(error, options.signal, timeout, timeoutMs);
  }
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
