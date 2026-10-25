// Провайдер для тестов: вместо модели — заранее записанный сценарий ответов.
// Сеть не нужна, результат один и тот же при каждом запуске, и видно, что агент отправил на каждом шаге.
import { assistantMessage, LlmError, type ChatOptions, type ChatResult, type Message, type Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';

/** Что агент отправил провайдеру: копия сообщений на момент запроса и опции. */
export interface ScriptedRequest {
  messages: Message[];
  options: ChatOptions;
}

/**
 * Один шаг сценария:
 * ChatResult — вернуть как есть; Error — бросить (429, обрыв сети);
 * функция — посмотреть на запрос и решить, что вернуть (или отменить агента посреди шага).
 */
export type ScriptStep = ChatResult | Error | ((request: ScriptedRequest) => ChatResult | Promise<ChatResult>);

/** Вызов инструмента в сценарии. args — объект (станет JSON) или сырая строка: так пишут сломанный JSON. */
export interface ScriptCall {
  name: string;
  args?: unknown;
  id?: string;
}

export interface ReplyExtra {
  usage?: Usage;
  /** По умолчанию stop для текста и tool_calls для вызовов. length — ответ обрезан. */
  finishReason?: string;
}

let nextId = 0;

// Шаг 1: ответ текстом.
export function textReply(text: string, extra: ReplyExtra = {}): ChatResult {
  throw new Error('TODO: шаг 1 — собери ChatResult с текстом');
}

// Шаг 1: ответ с вызовами. id, если не задан, — call_1, call_2… уникальный на весь прогон тестов.
export function toolReply(calls: ScriptCall[], extra: ReplyExtra & { text?: string } = {}): ChatResult {
  throw new Error('TODO: шаг 1 — собери ChatResult с вызовами');
}

// Шаг 2
export class ScriptedProvider implements Provider {
  /** Все запросы агента по порядку. requests[1].messages — что модель увидела на втором шаге. */
  readonly requests: ScriptedRequest[] = [];
  readonly #script: ScriptStep[];

  constructor(script: ScriptStep[]) {
    this.#script = [...script];
  }

  /** Сколько ответов осталось. После удачного теста обычно 0: агент прошёл весь сценарий. */
  get remaining(): number {
    return this.#script.length;
  }

  async complete(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    throw new Error('TODO: шаг 2 — запиши запрос и верни следующий ответ сценария');
  }
}
