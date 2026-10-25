// Цикл агента: спросить модель → исполнить её вызовы → вернуть результаты → спросить снова.
// Агент заканчивает, когда модель отвечает текстом без tool_calls или когда его останавливает лимит.
import type { ChatResult, Message, ToolCall, Usage } from './llm.ts';
import type { Provider } from './provider.ts';
import type { Toolbox, ToolResult } from './tools.ts';

/**
 * Почему агент остановился.
 * done — модель ответила сама. max_steps — кончились шаги. budget — кончились токены.
 * repeated_call — модель повторяет один и тот же вызов. truncated — ответ модели обрезан по max_tokens.
 * aborted — отменили снаружи. error — провайдер не ответил: сеть, ключ, квота.
 */
export type StopReason = 'done' | 'max_steps' | 'budget' | 'repeated_call' | 'truncated' | 'aborted' | 'error';

/**
 * Что происходит внутри цикла. Порядок за один шаг всегда такой:
 * step → assistant → (tool_call → tool_result) для каждого вызова. В самом конце — stop, ровно один раз.
 * Вызов, который агент не стал исполнять (лимит, отмена), получает только tool_result с isError.
 */
export type AgentEvent =
  | { type: 'step'; step: number }
  | { type: 'assistant'; message: Extract<Message, { role: 'assistant' }>; usage: Usage }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; call: ToolCall; result: ToolResult }
  | { type: 'stop'; reason: StopReason };

export interface AgentLimits {
  /** Сколько раз агент может спросить модель за одну задачу. Последний запрос — без инструментов. По умолчанию 20. */
  maxSteps?: number;
  /** Бюджет токенов на задачу: вход + выход всех запросов. Не путай с ChatOptions.maxTokens — это предел одного ответа. */
  maxTokens?: number;
}

export interface AgentOptions {
  provider: Provider;
  toolbox: Toolbox;
  /** System prompt. В историю не попадает: агент ставит его первым в каждый запрос. */
  system: string;
  limits?: AgentLimits;
  /** Внешняя отмена: Ctrl+C, закрытая вкладка, таймаут всей задачи. */
  signal?: AbortSignal;
  /** Единственный способ смотреть на агента снаружи: терминал, трейс, хуки. */
  onEvent?: (event: AgentEvent) => void;
  temperature?: number;
}

export interface AgentRun {
  /** Последний текст модели. При error — текст ошибки. */
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
/** Столько одинаковых вызовов подряд — и агент решает, что модель ходит по кругу. */
export const MAX_REPEATS = 3;
/** Это сообщение модель получает перед последним шагом, когда инструменты уже недоступны. */
export const FINAL_STEP_NOTE =
  'Шаги закончились, инструменты больше недоступны. Ответь по тому, что уже известно: что сделано и чего сделать не успел.';

// Шаг 3: одинаковые вызовы подряд. Аргументы сравниваем после JSON.parse: пробелы не делают вызов новым.
export class RepeatGuard {
  readonly #limit: number;
  #last = '';
  #count = 0;

  constructor(limit = MAX_REPEATS) {
    this.#limit = limit;
  }

  /** Запомнить вызов. true — точно такой же вызов пришёл limit раз подряд. */
  push(call: ToolCall): boolean {
    throw new Error('TODO: шаг 3 — посчитай одинаковые вызовы подряд');
  }
}

function normalize(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args));
  } catch {
    return args.trim();
  }
}

/** Результат вызова, который агент не стал исполнять. Модель увидит его, если историю продолжат. */
export function skippedResult(reason: string): ToolResult {
  return { content: `Ошибка: вызов не выполнен — ${reason}.`, isError: true };
}

export class Agent {
  readonly #options: AgentOptions;

  constructor(options: AgentOptions) {
    this.#options = options;
  }

  async run(task: string, history: Message[] = []): Promise<AgentRun> {
    const { provider, toolbox, system, limits = {}, signal, temperature } = this.#options;
    const maxSteps = limits.maxSteps ?? DEFAULT_MAX_STEPS;
    const tools = toolbox.specs();

    // Историю вызывающего не трогаем: копия плюс новая задача.
    const messages: Message[] = [...history, { role: 'user', content: task }];
    const usage: Usage = { input: 0, output: 0 };
    let answer = '';
    let steps = 0;

    const stop = (reason: StopReason): AgentRun => {
      this.#emit({ type: 'stop', reason });
      return { answer, stopReason: reason, steps, usage, messages };
    };

    while (true) {
      // Шаг 4: отменили между шагами — новый запрос не отправляем.
      // Шаг 2: бюджет проверяем перед запросом.

      steps++;
      this.#emit({ type: 'step', step: steps });

      // Шаг 1: последний шаг — FINAL_STEP_NOTE в историю и toolChoice: 'none' в запрос.

      // Шаг 4: ошибка провайдера — aborted или error вместо исключения.
      const result: ChatResult = await provider.complete([{ role: 'system', content: system }, ...messages], {
        tools,
        signal,
        temperature,
      });
      usage.input += result.usage.input;
      usage.output += result.usage.output;
      messages.push(result.message);
      answer = result.text;
      this.#emit({ type: 'assistant', message: result.message, usage: result.usage });

      // Шаг 2: обрезанный ответ. Шаг 1: вызов на последнем шаге. Шаг 3: повтор.
      if (result.toolCalls.length === 0) {
        return stop('done');
      }

      for (const call of result.toolCalls) {
        // Шаг 4: после отмены оставшиеся вызовы — через #skip.
        this.#emit({ type: 'tool_call', call });
        const toolResult = await toolbox.execute(call, { signal });
        this.#emit({ type: 'tool_result', call, result: toolResult });
        messages.push({ role: 'tool', tool_call_id: call.id, content: toolResult.content });
      }

      // Предохранитель из темы 4.1. Шаг 1 заменит его последним запросом без инструментов.
      if (steps >= maxSteps) {
        return stop('max_steps');
      }
    }
  }

  // За каждым tool_call в истории идёт его сообщение tool, даже если агент остановился.
  // Иначе следующий run с этой историей получит 400 или выдуманный моделью результат.
  #skip(calls: ToolCall[], messages: Message[], reason: string): void {
    for (const call of calls) {
      const result = skippedResult(reason);
      this.#emit({ type: 'tool_result', call, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
    }
  }

  #emit(event: AgentEvent): void {
    this.#options.onEvent?.(event);
  }
}
