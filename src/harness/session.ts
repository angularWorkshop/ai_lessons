// Сессия на диске: журнал .agent/sessions/<id>.jsonl. Одна строка — одна запись, файл только дописывается.
// По журналу разговор восстанавливается после выхода, перезапуска и падения: npm run harness -- --resume <id> или --continue.
import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, stat, truncate } from 'node:fs/promises';
import path from 'node:path';
import type { AgentOptions, AgentRun, StopReason } from '../agent.ts';
import { skippedResult } from '../agent.ts';
import { SUMMARY_PREFIX, summaryMessage } from '../context/compaction.ts';
import { Conversation } from '../conversation.ts';
import type { Message, Usage } from '../llm.ts';

export const SESSIONS_DIR = '.agent/sessions';

export type SessionRecord =
  | { type: 'session'; id: string; createdAt: string; root: string }
  /** Сообщение истории — ровно то, что лежит в Conversation.messages. */
  | { type: 'message'; message: Message }
  /** Сводка compaction: она заменяет первые covered сообщений полной истории. */
  | { type: 'compact'; summary: string; covered: number }
  /** Задача закончилась: причина и расход. */
  | { type: 'task'; stopReason: StopReason; usage: Usage }
  /** /clear: история с этого места начинается заново. */
  | { type: 'clear' };

// Шаг 1: id сессии — время и немного случайности. Сортируется по времени, не сталкивается в соседних вкладках.
export function newSessionId(now: Date = new Date()): string {
  throw new Error('TODO: шаг 1');
}

export function sessionFile(root: string, id: string): string {
  return path.join(root, SESSIONS_DIR, `${id}.jsonl`);
}

// Шаг 1: журнал. Записи уходят на диск строго по очереди: следующая append ждёт предыдущую.
export class SessionJournal {
  readonly file: string;
  #tail: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  /** Дописать записи в конец файла — по строке на запись, одним вызовом appendFile. */
  append(records: SessionRecord[]): Promise<void> {
    throw new Error('TODO: шаг 1');
  }

  /** Дождаться всех записей. */
  flush(): Promise<void> {
    return this.#tail;
  }
}

export interface ParsedJournal {
  records: SessionRecord[];
  /** Последняя строка оборвана — процесс упал посреди записи. Её пропустили. */
  damaged: boolean;
  /** Сколько байт от начала файла — целые строки. Дальше — оборванный хвост. */
  validBytes: number;
}

// Шаг 2: разобрать журнал. Оборванная последняя строка — обычное дело после падения, её пропускаем.
// Битая строка в середине — уже не обрыв, а порча файла: об этом надо сказать, а не молча терять историю.
export function parseJournal(text: string, file: string): ParsedJournal {
  throw new Error('TODO: шаг 2');
}

// За каждым tool_call — его результат (agent-api). Журнал мог оборваться между вызовом и результатом:
// недостающие результаты дописываем ошибкой, как Agent делает с вызовами, которые не исполнил.
export function repairHistory(messages: Message[]): Message[] {
  throw new Error('TODO: шаг 3');
}

export interface RestoredSession {
  /** История для Conversation: сводка вместо сжатой части, дальше — как было. */
  messages: Message[];
  /** Полная история из журнала, без сжатия. */
  full: Message[];
  compact?: { summary: string; covered: number };
  usage: Usage;
}

// Шаг 3: собрать состояние из записей по порядку.
export function restoreSession(records: SessionRecord[]): RestoredSession {
  throw new Error('TODO: шаг 3');
}

export interface LoadedSession extends RestoredSession {
  id: string;
  file: string;
  damaged: boolean;
  validBytes: number;
}

// Шаг 5: найти и прочитать сессию.
export async function loadSession(root: string, id: string): Promise<LoadedSession> {
  throw new Error('TODO: шаг 5');
}

// Шаг 5: последняя сессия — та, в которую писали последней. Не по имени: старую сессию могли продолжить вчера.
export async function latestSession(root: string): Promise<string | undefined> {
  throw new Error('TODO: шаг 5');
}

// Шаг 4: что писать в журнал. Сравнивает историю Conversation с тем, что уже записано, и дописывает разницу.
export class SessionRecorder {
  readonly journal: SessionJournal;
  /** Сколько сообщений истории Conversation уже в журнале. */
  #written: number;
  /** Номер сообщения в полной истории журнала = номер в Conversation + offset. После resume со сводкой он не 0. */
  #offset: number;
  /** Последняя записанная сводка: новая сводка — новая запись compact. */
  #summary: string;

  constructor(journal: SessionJournal, restored?: RestoredSession) {
    this.journal = journal;
    this.#written = restored?.messages.length ?? 0;
    // Восстановленная история — [сводка, ...full.slice(covered)]: сводка занимает место covered сообщений.
    this.#offset = restored?.compact ? restored.compact.covered - 1 : 0;
    this.#summary = restored?.compact?.summary ?? '';
  }

  /** Дописать сообщения, которых ещё нет в журнале. */
  sync(messages: readonly Message[]): Promise<void> {
    throw new Error('TODO: шаг 4');
  }

  /** Посмотреть, что ушло модели. Первым идёт новая сводка — значит, Compactor только что сжал историю. */
  view(messages: readonly Message[], view: readonly Message[]): Promise<void> {
    throw new Error('TODO: шаг 4');
  }

  task(run: AgentRun): Promise<void> {
    return this.journal.append([{ type: 'task', stopReason: run.stopReason, usage: { input: run.usage.input, output: run.usage.output } }]);
  }

  clear(): Promise<void> {
    this.#written = 0;
    this.#offset = 0;
    this.#summary = '';
    return this.journal.append([{ type: 'clear' }]);
  }
}

// Шаг 4: Conversation, которая пишет журнал. История уходит на диск перед каждым запросом к модели
// (через prepareMessages) и в конце задачи. Упадёт процесс — потеряется только последний шаг.
export class SessionConversation extends Conversation {
  readonly id: string;
  readonly recorder: SessionRecorder;

  constructor(options: Omit<AgentOptions, 'signal'>, journal: SessionJournal, id: string, restored?: RestoredSession) {
    const recorder = new SessionRecorder(journal, restored);
    const inner = options.prepareMessages;
    super(
      {
        ...options,
        prepareMessages: async (messages, info) => {
          await recorder.sync(messages);
          const view = inner ? await inner(messages, info) : messages;
          await recorder.view(messages, view);
          return view;
        },
      },
      restored ?? {},
    );
    this.id = id;
    this.recorder = recorder;
  }

  override async send(task: string, signal?: AbortSignal): Promise<AgentRun> {
    throw new Error('TODO: шаг 4');
  }

  override clear(): void {
    super.clear();
    void this.recorder.clear();
  }

  flush(): Promise<void> {
    return this.recorder.journal.flush();
  }
}

export interface OpenSessionOptions {
  root: string;
  /** Продолжить эту сессию. */
  resume?: string;
  /** Продолжить последнюю. Сессий нет — начать новую. */
  continue?: boolean;
  now?: Date;
}

export interface OpenedSession {
  id: string;
  journal: SessionJournal;
  /** Есть, если сессию продолжили. */
  restored?: LoadedSession;
}

// Шаг 5: новая сессия или продолжение старой. У новой первая запись — заголовок.
export async function openSession({ root, resume, continue: last, now = new Date() }: OpenSessionOptions): Promise<OpenedSession> {
  throw new Error('TODO: шаг 5');
}
