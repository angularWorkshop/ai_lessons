// Цикл агента: спросить модель → исполнить её вызовы → вернуть результаты → спросить снова.
// Агент заканчивает, когда модель отвечает текстом без tool_calls или когда его останавливает лимит.
import { mapLimit } from './concurrency.ts';
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
 * Что происходит внутри цикла. За один шаг: step → assistant → tool_call и tool_result для каждого вызова.
 * Вызовы одного шага идут параллельно: tool_call — когда вызов начался, tool_result — когда закончился,
 * так что результаты приходят в порядке готовности. Для одного вызова tool_call всегда раньше его tool_result.
 * Вызов, который агент не стал исполнять (лимит, отмена), получает только tool_result с isError.
 * В самом конце — stop, ровно один раз.
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

/** Что агент сообщает prepareMessages: какой это шаг и как узнать об отмене. */
export interface PrepareInfo {
  step: number;
  signal?: AbortSignal;
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
  /**
   * Секция 7: что увидит модель на этом шаге. Получает копию истории без system перед каждым запросом
   * и возвращает сообщения, которые уйдут модели вместо неё. История агента от этого не меняется.
   */
  prepareMessages?: (messages: Message[], info: PrepareInfo) => Message[] | Promise<Message[]>;
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
/** Сколько вызовов одного шага исполняются одновременно. */
export const TOOL_CONCURRENCY = 4;
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
    const key = `${call.name} ${normalize(call.arguments)}`;
    this.#count = key === this.#last ? this.#count + 1 : 1;
    this.#last = key;
    return this.#count >= this.#limit;
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
    const { provider, toolbox, system, limits = {}, signal, temperature, prepareMessages } = this.#options;
    const maxSteps = limits.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxTokens = limits.maxTokens ?? Infinity;
    const tools = toolbox.specs();
    const repeats = new RepeatGuard();

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
      if (signal?.aborted) {
        return stop('aborted');
      }
      // Шаг 2: бюджет проверяем перед запросом. Сколько стоит следующий, заранее не узнать.
      if (usage.input + usage.output >= maxTokens) {
        return stop('budget');
      }

      steps++;
      this.#emit({ type: 'step', step: steps });

      // Шаг 1: последний шаг — без инструментов. Модель подводит итог, а не обрывается на вызове.
      const last = steps >= maxSteps;
      if (last) {
        messages.push({ role: 'user', content: FINAL_STEP_NOTE });
      }

      let result: ChatResult;
      try {
        // Тема 7.1: без prepareMessages модель видит историю как есть. Ошибка внутри — как ошибка провайдера.
        const outgoing = prepareMessages ? await prepareMessages([...messages], { step: steps, signal }) : messages;
        result = await provider.complete([{ role: 'system', content: system }, ...outgoing], {
          // Описания инструментов остаются: в истории есть их вызовы. toolChoice: 'none' запрещает новые.
          tools,
          ...(last && tools.length > 0 ? { toolChoice: 'none' as const } : {}),
          signal,
          temperature,
        });
      } catch (error) {
        // Шаг 4: отмена — решение человека, а не сбой. Всё остальное — ошибка программы.
        if (signal?.aborted) {
          return stop('aborted');
        }
        answer = error instanceof Error ? error.message : String(error);
        return stop('error');
      }

      usage.input += result.usage.input;
      usage.output += result.usage.output;
      messages.push(result.message);
      answer = result.text;
      this.#emit({ type: 'assistant', message: result.message, usage: result.usage });

      const calls = result.toolCalls;

      // Шаг 2: ответ обрезан по max_tokens — аргументы могли оборваться на середине. Не исполняем.
      if (result.truncated) {
        this.#skip(calls, messages, 'ответ модели обрезан по max_tokens');
        return stop('truncated');
      }
      if (calls.length === 0) {
        return stop(last ? 'max_steps' : 'done');
      }
      // Шаг 1: модель всё равно позвала инструмент на последнем шаге — исполнять уже нельзя.
      if (last) {
        this.#skip(calls, messages, 'шаги агента закончились');
        return stop('max_steps');
      }
      // Шаг 3: тот же вызов с теми же аргументами MAX_REPEATS раз подряд — модель ходит по кругу.
      if (calls.some((call) => repeats.push(call))) {
        this.#skip(calls, messages, 'модель повторяет один и тот же вызов');
        return stop('repeated_call');
      }

      // Вызовы шага — параллельно, не больше TOOL_CONCURRENCY сразу. Готовы они в любом порядке,
      // а в историю ложатся в порядке вызовов: results[i] — ответ на calls[i].
      const results = await mapLimit(calls, TOOL_CONCURRENCY, (call) => this.#execute(call));
      calls.forEach((call, i) => {
        messages.push({ role: 'tool', tool_call_id: call.id, content: results[i].content });
      });
    }
  }

  // Один вызов. Не бросает: иначе Promise.all внутри mapLimit потерял бы результаты остальных вызовов.
  async #execute(call: ToolCall): Promise<ToolResult> {
    const { toolbox, signal } = this.#options;
    // Отменили, пока вызов ждал своей очереди, — не запускаем.
    if (signal?.aborted) {
      const result = skippedResult('агент остановлен');
      this.#emit({ type: 'tool_result', call, result });
      return result;
    }

    this.#emit({ type: 'tool_call', call });
    let result: ToolResult;
    try {
      result = await toolbox.execute(call, { signal });
    } catch (error) {
      // Наш Toolbox не бросает, но реестр можно подменить: в секции 11 появятся инструменты из MCP.
      result = { content: `Ошибка: ${call.name} не выполнился: ${error instanceof Error ? error.message : String(error)}`, isError: true };
    }
    this.#emit({ type: 'tool_result', call, result });
    return result;
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
