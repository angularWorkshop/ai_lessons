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
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${randomBytes(2).toString('hex')}`;
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
    if (records.length === 0) return this.#tail;
    const text = records.map((record) => `${JSON.stringify(record)}\n`).join('');
    this.#tail = this.#tail.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      await appendFile(this.file, text);
    });
    return this.#tail;
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
  const lines = text.split('\n');
  const records: SessionRecord[] = [];
  let damaged = false;
  let validBytes = Buffer.byteLength(text);
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      records.push(JSON.parse(line) as SessionRecord);
    } catch {
      const last = lines.slice(index + 1).every((rest) => rest.trim() === '');
      if (!last) throw new Error(`${file}: строка ${index + 1} повреждена — это не JSON`);
      damaged = true;
      validBytes = Buffer.byteLength(lines.slice(0, index).map((kept) => `${kept}\n`).join(''));
    }
  });
  return { records, damaged, validBytes };
}

// За каждым tool_call — его результат (agent-api). Журнал мог оборваться между вызовом и результатом:
// недостающие результаты дописываем ошибкой, как Agent делает с вызовами, которые не исполнил.
export function repairHistory(messages: Message[]): Message[] {
  const repaired: Message[] = [];
  let waiting: string[] = [];
  const closeWaiting = () => {
    for (const id of waiting) repaired.push({ role: 'tool', tool_call_id: id, content: skippedResult('сессия оборвалась').content });
    waiting = [];
  };
  for (const message of messages) {
    if (message.role === 'tool') {
      waiting = waiting.filter((id) => id !== message.tool_call_id);
    } else {
      closeWaiting();
      if (message.role === 'assistant') waiting = (message.tool_calls ?? []).map((call) => call.id);
    }
    repaired.push(message);
  }
  closeWaiting();
  return repaired;
}

export interface RestoredSession {
  /** История для Conversation: сводка вместо сжатой части, дальше — как было. */
  messages: Message[];
  /** Полная история из журнала, без сжатия. */
  full: Message[];
  compact?: { summary: string; covered: number };
  usage: Usage;
  /** Тема 12.6: сколько задач закончилось — записью task. */
  tasks: number;
  /** Тема 12.6: задача, которая началась, но не закончилась: процесс упал. Её текст. */
  unfinished?: string;
}

// Шаг 3: собрать состояние из записей по порядку.
export function restoreSession(records: SessionRecord[]): RestoredSession {
  let full: Message[] = [];
  let compact: RestoredSession['compact'];
  const usage: Usage = { input: 0, output: 0 };
  let tasks = 0;
  // Тема 12.6: первое сообщение после конца задачи — начало следующей. Не дошли до её записи task — она оборвалась.
  let open: string | undefined;
  for (const record of records) {
    switch (record.type) {
      case 'message':
        if (open === undefined) open = String(record.message.content);
        full.push(record.message);
        break;
      case 'compact':
        compact = { summary: record.summary, covered: record.covered };
        break;
      case 'clear':
        full = [];
        compact = undefined;
        break;
      case 'task':
        usage.input += record.usage.input;
        usage.output += record.usage.output;
        tasks++;
        open = undefined;
        break;
    }
  }
  full = repairHistory(full);
  const messages = compact ? [summaryMessage(compact.summary), ...full.slice(compact.covered)] : [...full];
  return { messages, full, ...(compact ? { compact } : {}), usage, tasks, ...(open === undefined ? {} : { unfinished: open }) };
}

export interface LoadedSession extends RestoredSession {
  id: string;
  file: string;
  damaged: boolean;
  validBytes: number;
}

// Шаг 5: найти и прочитать сессию.
export async function loadSession(root: string, id: string): Promise<LoadedSession> {
  const file = sessionFile(root, id);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Сессии ${id} нет: файла ${path.relative(root, file)} не существует`);
    throw error;
  }
  const { records, damaged, validBytes } = parseJournal(text, file);
  return { id, file, damaged, validBytes, ...restoreSession(records) };
}

// Шаг 5: последняя сессия — та, в которую писали последней. Не по имени: старую сессию могли продолжить вчера.
export async function latestSession(root: string): Promise<string | undefined> {
  const dir = path.join(root, SESSIONS_DIR);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.jsonl'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  let best: { id: string; time: number } | undefined;
  for (const name of names) {
    const time = (await stat(path.join(dir, name))).mtimeMs;
    if (!best || time > best.time) best = { id: name.slice(0, -'.jsonl'.length), time };
  }
  return best?.id;
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
    const fresh = messages.slice(this.#written);
    this.#written = messages.length;
    return this.journal.append(fresh.map((message) => ({ type: 'message', message })));
  }

  /** Посмотреть, что ушло модели. Первым идёт новая сводка — значит, Compactor только что сжал историю. */
  view(messages: readonly Message[], view: readonly Message[]): Promise<void> {
    const first = view[0];
    if (view === messages || first?.role !== 'user' || !first.content.startsWith(SUMMARY_PREFIX)) return this.journal.flush();
    const summary = first.content.slice(SUMMARY_PREFIX.length).trim();
    if (summary === this.#summary) return this.journal.flush();
    this.#summary = summary;
    // Сводка заменила всё, кроме хвоста: хвост — это view без сводки.
    const covered = messages.length - (view.length - 1);
    return this.journal.append([{ type: 'compact', summary, covered: covered + this.#offset }]);
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
  /** Тема 12.6: что сказать модели перед следующей задачей: откат, падение процесса. */
  #notes: string[] = [];

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

  /** Тема 12.6: пометка для модели. Уйдёт в начале следующей задачи. */
  addNote(note: string): void {
    this.#notes.push(note);
  }

  override async send(task: string, signal?: AbortSignal): Promise<AgentRun> {
    const notes = this.#notes.splice(0);
    const run = await super.send(notes.length > 0 ? `${notes.join('\n')}\n\n${task}` : task, signal);
    // После run в истории есть последний ответ модели, а после отмены — пометка INTERRUPTED_NOTE.
    await this.recorder.sync(this.messages);
    await this.recorder.task(run);
    return run;
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
  const id = resume ?? (last ? await latestSession(root) : undefined);
  if (id) {
    const restored = await loadSession(root, id);
    // Оборванную строку отрезаем, прежде чем писать дальше: иначе новая запись приклеится к обрывку
    // и битая строка окажется в середине журнала. Единственный раз, когда файл не только дописывается.
    if (restored.damaged) await truncate(restored.file, restored.validBytes);
    return { id, journal: new SessionJournal(restored.file), restored };
  }
  const fresh = newSessionId(now);
  const journal = new SessionJournal(sessionFile(root, fresh));
  await journal.append([{ type: 'session', id: fresh, createdAt: now.toISOString(), root }]);
  return { id: fresh, journal };
}
