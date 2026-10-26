// Трейс: всё, что агент делал, по времени — в .agent/traces/<сессия>.jsonl.
// Источник — onEvent (agent-api: единственный способ смотреть на агента снаружи), сжатие истории и задачи.
// Журнал сессии (12.3) отвечает на вопрос «что сказано», трейс — «когда, сколько стоило и сколько длилось».
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AgentEvent, PrepareInfo, StopReason } from '../agent.ts';
import type { CompactEvent } from '../context/compaction.ts';
import { estimateCost, type Message, type Price, type ToolCall, type Usage } from '../llm.ts';
import type { ToolResult } from '../tools.ts';

export const TRACES_DIR = '.agent/traces';

/** Что случилось. */
export type TraceEntry =
  | { type: 'task'; task: string; history: number }
  | { type: 'step'; step: number }
  | { type: 'assistant'; message: Extract<Message, { role: 'assistant' }>; usage: Usage; cost: number }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; call: ToolCall; result: ToolResult }
  | { type: 'compact'; summary: string; summarized: number; usage: Usage; cost: number }
  | { type: 'stop'; reason: StopReason };

/** Запись трейса: когда случилось и чей это агент. agent нет — главный, есть — имя подзадачи субагента. */
export type TraceRecord = TraceEntry & { time: string; agent?: string };

export function traceFile(root: string, sessionId: string): string {
  return path.join(root, TRACES_DIR, `${sessionId}.jsonl`);
}

type Prepare = (messages: Message[], info: PrepareInfo) => Message[] | Promise<Message[]>;

export interface TracerOptions {
  price: Price;
  /** Часы. Тесты подставляют свои. */
  now?: () => Date;
}

// Шаг 1: трейсер. Пишет строку на событие, по порядку. text_delta не пишет: это тот же текст, что придёт в assistant.
export class Tracer {
  readonly file: string;
  readonly #price: Price;
  readonly #now: () => Date;
  #tail: Promise<void> = Promise.resolve();

  constructor(file: string, options: TracerOptions) {
    this.file = file;
    this.#price = options.price;
    this.#now = options.now ?? (() => new Date());
  }

  // Стрелки — чтобы отдавать методы как колбэки без потери this.
  readonly onEvent = (event: AgentEvent, agent?: string): void => {
    throw new Error('TODO: шаг 1');
  };

  readonly onSubagentEvent = (event: AgentEvent, description: string): void => this.onEvent(event, description);

  readonly onCompact = (event: CompactEvent): void => {
    throw new Error('TODO: шаг 1');
  };

  // Шаг 1: задачу в событиях не видно. На первом шаге она — последнее сообщение истории, которое пришло в prepareMessages.
  wrapPrepare(inner?: Prepare): Prepare {
    throw new Error('TODO: шаг 1');
  }

  flush(): Promise<void> {
    return this.#tail;
  }

  #write(entry: TraceEntry, agent?: string): void {
    const line = `${JSON.stringify({ time: this.#now().toISOString(), ...(agent === undefined ? {} : { agent }), ...entry })}\n`;
    this.#tail = this.#tail.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      await appendFile(this.file, line);
    });
  }
}

// Шаг 2: прочитать трейс. Оборванную последнюю строку пропускаем, как в журнале сессии.
export function parseTrace(text: string): TraceRecord[] {
  throw new Error('TODO: шаг 2');
}

export interface TraceTotals {
  tasks: number;
  requests: number;
  usage: Usage;
  cost: number;
  ms: number;
}

// Шаг 2: итоги — все запросы к модели: агент, субагенты и сводки.
export function traceTotals(records: TraceRecord[]): TraceTotals {
  throw new Error('TODO: шаг 2');
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}с`;
const money = (usd: number) => `$${usd.toFixed(6)}`;

// Шаг 3: трейс для человека. Время от начала, длительность каждого запроса и вызова, токены и цена шага.
export function formatTrace(records: TraceRecord[]): string {
  throw new Error('TODO: шаг 2');
}
