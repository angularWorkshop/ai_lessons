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
    switch (event.type) {
      case 'text_delta':
        return;
      case 'assistant':
        this.#write({ type: 'assistant', message: event.message, usage: event.usage, cost: estimateCost(event.usage, this.#price) }, agent);
        return;
      default:
        this.#write(event, agent);
    }
  };

  readonly onSubagentEvent = (event: AgentEvent, description: string): void => this.onEvent(event, description);

  readonly onCompact = (event: CompactEvent): void => {
    this.#write({ type: 'compact', summary: event.summary, summarized: event.summarized, usage: event.usage, cost: estimateCost(event.usage, this.#price) });
  };

  // Шаг 1: задачу в событиях не видно. На первом шаге она — последнее сообщение истории, которое пришло в prepareMessages.
  wrapPrepare(inner?: Prepare): Prepare {
    return (messages, info) => {
      const last = messages.at(-1);
      if (info.step === 1 && last?.role === 'user') {
        this.#write({ type: 'task', task: last.content, history: messages.length - 1 });
      }
      return inner ? inner(messages, info) : messages;
    };
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
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  return lines.flatMap((line, index) => {
    try {
      return [JSON.parse(line) as TraceRecord];
    } catch (error) {
      if (index === lines.length - 1) return [];
      throw new Error(`трейс повреждён в строке ${index + 1}: ${(error as Error).message}`);
    }
  });
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
  const usage: Usage = { input: 0, output: 0 };
  let cost = 0;
  let requests = 0;
  for (const record of records) {
    if (record.type === 'assistant' || record.type === 'compact') {
      usage.input += record.usage.input;
      usage.output += record.usage.output;
      cost += record.cost;
      requests++;
    }
  }
  const ms = records.length > 1 ? Date.parse(records.at(-1)!.time) - Date.parse(records[0].time) : 0;
  return { tasks: records.filter((record) => record.type === 'task').length, requests, usage, cost, ms };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}с`;
const money = (usd: number) => `$${usd.toFixed(6)}`;

// Шаг 3: трейс для человека. Время от начала, длительность каждого запроса и вызова, токены и цена шага.
export function formatTrace(records: TraceRecord[]): string {
  if (records.length === 0) return 'Трейс пуст.';
  const start = Date.parse(records[0].time);
  const at = (record: TraceRecord) => `+${seconds(Date.parse(record.time) - start)}`.padStart(8);
  const lines: string[] = [];
  const stepStart = new Map<string, number>();
  const callStart = new Map<string, number>();
  const tools = new Map<string, { count: number; ms: number; errors: number }>();

  for (const record of records) {
    const who = record.agent ? `  [${record.agent}]` : '';
    const time = Date.parse(record.time);
    switch (record.type) {
      case 'task':
        lines.push(`\nзадача> ${record.task}${record.history ? `  (история: ${record.history} сообщ.)` : ''}`);
        break;
      case 'step':
        stepStart.set(record.agent ?? '', time);
        break;
      case 'assistant': {
        const ms = time - (stepStart.get(record.agent ?? '') ?? time);
        const calls = record.message.tool_calls?.length ? ` · вызовов: ${record.message.tool_calls.length}` : ' · ответ текстом';
        lines.push(`${at(record)}${who}  модель ${seconds(ms)}  ${record.usage.input} → ${record.usage.output}  ${money(record.cost)}${calls}`);
        break;
      }
      case 'tool_call':
        callStart.set(record.call.id, time);
        break;
      case 'tool_result': {
        const ms = time - (callStart.get(record.call.id) ?? time);
        const stats = tools.get(record.call.name) ?? { count: 0, ms: 0, errors: 0 };
        tools.set(record.call.name, { count: stats.count + 1, ms: stats.ms + ms, errors: stats.errors + (record.result.isError ? 1 : 0) });
        const args = record.call.arguments.replace(/\s+/g, ' ');
        lines.push(`${at(record)}${who}    ${record.result.isError ? '✗' : '✓'} ${record.call.name} ${args.length > 70 ? `${args.slice(0, 70)}…` : args}  ${seconds(ms)}`);
        break;
      }
      case 'compact':
        lines.push(`${at(record)}  ⇣ сжатие: ${record.summarized} сообщ. → сводка  ${record.usage.input} → ${record.usage.output}  ${money(record.cost)}`);
        break;
      case 'stop':
        if (!record.agent) lines.push(`${at(record)}  ■ ${record.reason}`);
        break;
    }
  }

  const totals = traceTotals(records);
  const byTool = [...tools.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([name, stats]) => `${name} ×${stats.count}${stats.errors ? ` (ошибок ${stats.errors})` : ''} ${seconds(stats.ms)}`);
  return [
    `задач: ${totals.tasks} · запросов к модели: ${totals.requests} · ${totals.usage.input} → ${totals.usage.output} токенов · ${money(totals.cost)} · ${seconds(totals.ms)}`,
    ...lines,
    '',
    `инструменты: ${byTool.join(' · ') || 'нет'}`,
  ].join('\n');
}
