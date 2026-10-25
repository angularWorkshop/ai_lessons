// Цикл агента: спросить модель → исполнить её вызовы → вернуть результаты → спросить снова.
// Агент заканчивает, когда модель отвечает текстом без tool_calls.
import type { Message, ToolCall, Usage } from './llm.ts';
import type { Provider } from './provider.ts';
import type { Toolbox, ToolResult } from './tools.ts';

/** Почему агент остановился. done — модель ответила сама, остальное — разберём в теме 4.2. */
export type StopReason = 'done' | 'max_steps' | 'budget' | 'repeated_call' | 'truncated' | 'aborted' | 'error';

/**
 * Что происходит внутри цикла. Порядок за один шаг всегда такой:
 * step → assistant → (tool_call → tool_result) для каждого вызова. В самом конце — stop, ровно один раз.
 */
export type AgentEvent =
  | { type: 'step'; step: number }
  | { type: 'assistant'; message: Extract<Message, { role: 'assistant' }>; usage: Usage }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; call: ToolCall; result: ToolResult }
  | { type: 'stop'; reason: StopReason };

export interface AgentLimits {
  /** Сколько раз агент может спросить модель за одну задачу. По умолчанию 20. */
  maxSteps?: number;
  /** Бюджет токенов на задачу (вход + выход всех запросов). Тема 4.2. */
  maxTokens?: number;
}

export interface AgentOptions {
  provider: Provider;
  toolbox: Toolbox;
  /** System prompt. В историю не попадает: агент ставит его первым в каждый запрос. */
  system: string;
  limits?: AgentLimits;
  /** Внешняя отмена. Тема 4.2. */
  signal?: AbortSignal;
  /** Единственный способ смотреть на агента снаружи: терминал, трейс, хуки. */
  onEvent?: (event: AgentEvent) => void;
  temperature?: number;
}

export interface AgentRun {
  /** Последний текст модели. При done это и есть ответ на задачу. */
  answer: string;
  stopReason: StopReason;
  /** Сколько раз агент спросил модель. */
  steps: number;
  /** Сумма usage всех запросов. */
  usage: Usage;
  /** История без system: прошлая история, задача и всё, что случилось за run. Её можно передать в следующий run. */
  messages: Message[];
}

export const DEFAULT_MAX_STEPS = 20;

export class Agent {
  readonly #options: AgentOptions;

  constructor(options: AgentOptions) {
    this.#options = options;
  }

  // Шаги 2–4
  async run(task: string, history: Message[] = []): Promise<AgentRun> {
    throw new Error('TODO: шаги 2–4 — цикл агента');
  }

  #emit(event: AgentEvent): void {
    this.#options.onEvent?.(event);
  }
}
