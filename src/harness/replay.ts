// Replay: прогнать записанную сессию ещё раз без сети. Модель отвечает из трейса через ScriptedProvider (тема 4.3),
// инструменты — тоже из трейса. Всё остальное — настоящее: цикл, лимиты, сжатие истории, вывод.
// Так воспроизводят баг из чужой сессии и проверяют, что поменяется, если поменять harness.
import type { AgentOptions, AgentRun } from '../agent.ts';
import { SUMMARY_SYSTEM } from '../context/compaction.ts';
import { Conversation } from '../conversation.ts';
import type { ChatResult, ToolCall } from '../llm.ts';
import { ScriptedProvider, textReply, type ScriptStep } from '../testing/scripted-provider.ts';
import { Toolbox, type ToolContext, type ToolResult } from '../tools.ts';
import type { TraceRecord } from './trace.ts';

/** Запрос в replay не совпал с записью: harness ведёт себя не так, как в записанной сессии. */
export class ReplayDivergence extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayDivergence';
  }
}

// Только главный агент: ответы субагентов уже лежат в результатах инструмента task.
const main = (records: TraceRecord[]) => records.filter((record) => record.agent === undefined);

// Шаг 4: запись assistant → ChatResult, который вернул бы провайдер.
export function toChatResult(record: Extract<TraceRecord, { type: 'assistant' }>, truncated = false): ChatResult {
  const toolCalls: ToolCall[] = (record.message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }));
  return {
    text: record.message.content ?? '',
    finishReason: truncated ? 'length' : toolCalls.length > 0 ? 'tool_calls' : 'stop',
    truncated,
    usage: record.usage,
    toolCalls,
    message: record.message,
  };
}

// Шаг 4: сценарий для ScriptedProvider — ответы модели и сводки в том порядке, в каком их получал агент.
// Каждый шаг проверяет, тот ли это запрос: сводку просят с SUMMARY_SYSTEM, агент — со своим system.
export function replaySteps(records: TraceRecord[]): ScriptStep[] {
  const own = main(records);
  const steps: ScriptStep[] = [];
  own.forEach((record, index) => {
    if (record.type === 'assistant') {
      // Ответ, обрезанный по max_tokens, видно только по причине остановки сразу после него.
      const next = own.slice(index + 1).find((later) => later.type === 'assistant' || later.type === 'stop');
      const result = toChatResult(record, next?.type === 'stop' && next.reason === 'truncated');
      steps.push(expect('ответ агента', false, result));
    } else if (record.type === 'compact') {
      steps.push(expect('сводка', true, textReply(record.summary, { usage: record.usage })));
    }
  });
  return steps;
}

function expect(what: string, summary: boolean, result: ChatResult): ScriptStep {
  return ({ messages }) => {
    const isSummary = messages[0]?.content === SUMMARY_SYSTEM;
    if (isSummary !== summary) {
      throw new ReplayDivergence(`replay разошёлся с записью: harness просит ${isSummary ? 'сводку' : 'ответ агента'}, а в записи — ${what}`);
    }
    return result;
  };
}

// Шаг 4: инструменты отвечают из записи. Описания — от настоящих инструментов: запрос к модели тот же.
export class RecordedToolbox extends Toolbox {
  readonly #specsFrom: Toolbox;
  readonly #results: Map<string, ToolResult>;

  constructor(records: TraceRecord[], specsFrom: Toolbox) {
    super();
    this.#specsFrom = specsFrom;
    this.#results = new Map(
      main(records).flatMap((record) => (record.type === 'tool_result' ? [[record.call.id, record.result] as const] : [])),
    );
  }

  override specs() {
    return this.#specsFrom.specs();
  }

  override async execute(call: ToolCall, _ctx: ToolContext = {}): Promise<ToolResult> {
    const result = this.#results.get(call.id);
    return result ?? { content: `Ошибка: в записи нет результата вызова ${call.id} (${call.name})`, isError: true };
  }
}

export interface ReplayTask {
  task: string;
  /** Сколько сообщений было в истории перед задачей. 0 — разговор начался заново (/clear или новая сессия). */
  history: number;
}

export function replayTasks(records: TraceRecord[]): ReplayTask[] {
  return main(records).flatMap((record) => (record.type === 'task' ? [{ task: record.task, history: record.history }] : []));
}

// Шаг 4: провайдер из записи. Его же получает createHarness: сводки просит Compactor, и ему тоже нужна запись.
export function replayProvider(records: TraceRecord[]): ScriptedProvider {
  return new ScriptedProvider(replaySteps(records));
}

export interface ReplayResult {
  runs: AgentRun[];
  /** Как остановилась каждая задача в записи. */
  recorded: string[];
}

// Шаг 5: прогнать все задачи по порядку через Conversation, как в REPL. /clear в записи — новая история.
// agent — опции настоящего harness, собранного с replayProvider. Инструменты подменяются записанными.
export async function replay(records: TraceRecord[], agent: Omit<AgentOptions, 'signal'>): Promise<ReplayResult> {
  const options = { ...agent, toolbox: new RecordedToolbox(records, agent.toolbox) };
  let conversation = new Conversation(options);
  const runs: AgentRun[] = [];
  for (const { task, history } of replayTasks(records)) {
    if (history === 0 && conversation.messages.length > 0) conversation = new Conversation(options);
    runs.push(await conversation.send(task));
  }
  const recorded = main(records).flatMap((record) => (record.type === 'stop' ? [record.reason] : []));
  return { runs, recorded };
}
