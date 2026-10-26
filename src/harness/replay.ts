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
  throw new Error('TODO: шаг 4');
}

// Шаг 4: сценарий для ScriptedProvider — ответы модели и сводки в том порядке, в каком их получал агент.
// Каждый шаг проверяет, тот ли это запрос: сводку просят с SUMMARY_SYSTEM, агент — со своим system.
export function replaySteps(records: TraceRecord[]): ScriptStep[] {
  throw new Error('TODO: шаг 4');
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
    throw new Error('TODO: шаг 4');
  }
}

export interface ReplayTask {
  task: string;
  /** Сколько сообщений было в истории перед задачей. 0 — разговор начался заново (/clear или новая сессия). */
  history: number;
}

export function replayTasks(records: TraceRecord[]): ReplayTask[] {
  throw new Error('TODO: шаг 4');
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
  throw new Error('TODO: шаг 5');
}
