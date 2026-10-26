import assert from 'node:assert/strict';
import { appendFile, readFile, utimes, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { SUMMARY_PREFIX, SUMMARY_SYSTEM } from '../src/context/compaction.ts';
import { INTERRUPTED_NOTE } from '../src/interrupt.ts';
import type { ChatOptions, ChatResult, Message } from '../src/llm.ts';
import { UsageError } from '../src/headless.ts';
import { parseHarnessArgs } from '../src/harness/run.ts';
import {
  latestSession,
  loadSession,
  newSessionId,
  openSession,
  parseJournal,
  repairHistory,
  restoreSession,
  SessionConversation,
  sessionFile,
  SessionJournal,
  type SessionRecord,
} from '../src/harness/session.ts';
import { calculator } from '../src/demo-tools.ts';
import type { Provider } from '../src/provider.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const projects: TempProject[] = [];
after(async () => {
  await Promise.all(projects.map((project) => project.remove()));
});

async function temp() {
  const created = await tempProject({ 'package.json': '{}' });
  projects.push(created);
  return created;
}

const SYSTEM = 'Ты — агент.';
const options = (provider: Provider) => ({ provider, toolbox: new Toolbox().register(calculator), system: SYSTEM });

async function records(file: string): Promise<SessionRecord[]> {
  return parseJournal(await readFile(file, 'utf8'), file).records;
}

const user = (content: string): Message => ({ role: 'user', content });
const assistant = (content: string): Message => ({ role: 'assistant', content });

describe('Шаг 1 / Step 1. id сессии и журнал', () => {
  it('id — время и случайный хвост, сортируется по времени', () => {
    const a = newSessionId(new Date('2026-10-26T09:05:07Z'));
    const b = newSessionId(new Date('2026-10-26T10:00:00Z'));
    assert.match(a, /^20261026-090507-[0-9a-f]{4}$/);
    assert.ok(a < b);
    assert.notEqual(newSessionId(), newSessionId());
  });

  it('append дописывает по строке JSON на запись и сохраняет порядок', async () => {
    const project = await temp();
    const journal = new SessionJournal(sessionFile(project.root, 's1'));
    // Не ждём между вызовами: порядок всё равно должен сохраниться.
    void journal.append([{ type: 'message', message: user('раз') }]);
    void journal.append([{ type: 'message', message: user('два') }, { type: 'clear' }]);
    await journal.append([{ type: 'message', message: user('три') }]);
    const text = await readFile(journal.file, 'utf8');
    assert.equal(text.split('\n').length, 5, 'четыре строки и перевод строки в конце');
    assert.deepEqual(
      text.trim().split('\n').map((line) => JSON.parse(line).type),
      ['message', 'message', 'clear', 'message'],
    );
    assert.ok(journal.file.endsWith(path.join('.agent', 'sessions', 's1.jsonl')));
  });
});

describe('Шаг 2 / Step 2. Чтение журнала', () => {
  it('целые строки — записи, пустые пропускаются', () => {
    const text = `${JSON.stringify({ type: 'clear' })}\n\n${JSON.stringify({ type: 'message', message: user('a') })}\n`;
    assert.deepEqual(parseJournal(text, 'f'), { records: [{ type: 'clear' }, { type: 'message', message: user('a') }], damaged: false, validBytes: Buffer.byteLength(text) });
  });

  it('оборванная последняя строка не ломает загрузку', () => {
    const text = `${JSON.stringify({ type: 'message', message: user('a') })}\n{"type":"message","mess`;
    const parsed = parseJournal(text, 'f');
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.damaged, true);
    assert.equal(parsed.validBytes, Buffer.byteLength(`${JSON.stringify({ type: 'message', message: user('a') })}\n`));
  });

  it('битая строка в середине — ошибка с номером строки', () => {
    const text = `${JSON.stringify({ type: 'clear' })}\nне json\n${JSON.stringify({ type: 'clear' })}\n`;
    assert.throws(() => parseJournal(text, 'журнал.jsonl'), /журнал\.jsonl: строка 2/);
  });
});

describe('Шаг 3 / Step 3. Восстановление истории', () => {
  it('сообщения по порядку, расход — сумма задач, /clear начинает заново', () => {
    const restored = restoreSession([
      { type: 'message', message: user('старое') },
      { type: 'task', stopReason: 'done', usage: { input: 100, output: 10 } },
      { type: 'clear' },
      { type: 'message', message: user('новое') },
      { type: 'message', message: assistant('ответ') },
      { type: 'task', stopReason: 'done', usage: { input: 50, output: 5 } },
    ]);
    assert.deepEqual(restored.messages, [user('новое'), assistant('ответ')]);
    assert.deepEqual(restored.usage, { input: 150, output: 15 });
    assert.equal(restored.compact, undefined);
  });

  it('сводка compaction встаёт первой вместо сжатых сообщений, полная история остаётся в full', () => {
    const history = [user('1'), assistant('2'), user('3'), assistant('4'), user('5')];
    const restored = restoreSession([
      ...history.slice(0, 4).map((message): SessionRecord => ({ type: 'message', message })),
      { type: 'compact', summary: '## Цель\nсчитать', covered: 3 },
      { type: 'message', message: history[4] },
    ]);
    assert.equal(restored.messages[0].role, 'user');
    assert.ok(String(restored.messages[0].content).startsWith(SUMMARY_PREFIX));
    assert.ok(String(restored.messages[0].content).includes('## Цель\nсчитать'));
    assert.deepEqual(restored.messages.slice(1), [assistant('4'), user('5')]);
    assert.deepEqual(restored.full, history);
    assert.deepEqual(restored.compact, { summary: '## Цель\nсчитать', covered: 3 });
  });

  it('вызов без результата получает результат-ошибку: история снова валидна', () => {
    const call = (id: string) => ({ id, type: 'function' as const, function: { name: 'calculate', arguments: '{}' } });
    const messages: Message[] = [
      user('посчитай'),
      { role: 'assistant', content: null, tool_calls: [call('a'), call('b')] },
      { role: 'tool', tool_call_id: 'a', content: '4' },
    ];
    const repaired = repairHistory(messages);
    assert.equal(repaired.length, 4);
    assert.deepEqual(repaired.slice(0, 3), messages);
    assert.equal((repaired[3] as Extract<Message, { role: 'tool' }>).tool_call_id, 'b');
    assert.match(String(repaired[3].content), /сессия оборвалась/);
    assert.deepEqual(repairHistory([user('a'), assistant('b')]), [user('a'), assistant('b')]);
  });
});

describe('Шаг 4 / Step 4. Conversation с журналом', () => {
  it('история пишется по ходу задачи: перед каждым запросом к модели уже на диске', async () => {
    const project = await temp();
    const journal = new SessionJournal(sessionFile(project.root, 's'));
    let onDiskAtStep2: SessionRecord[] = [];
    const provider = new ScriptedProvider([
      toolReply([{ name: 'calculate', args: { expression: '2+2' } }]),
      async () => {
        onDiskAtStep2 = await records(journal.file);
        return textReply('4');
      },
    ]);
    const conversation = new SessionConversation(options(provider), journal, 's');
    const run = await conversation.send('Сколько 2+2?');
    await conversation.flush();

    assert.deepEqual(onDiskAtStep2.map((record) => record.type === 'message' && record.message.role), ['user', 'assistant', 'tool']);
    const all = await records(journal.file);
    assert.deepEqual(all.map((record) => record.type), ['message', 'message', 'message', 'message', 'task']);
    assert.deepEqual(all.filter((record) => record.type === 'message').map((record) => (record as { message: Message }).message), run.messages);
  });

  it('после отмены записана и пометка для модели, а /clear — отдельной записью', async () => {
    const project = await temp();
    const journal = new SessionJournal(sessionFile(project.root, 's'));
    const controller = new AbortController();
    const provider = new ScriptedProvider([
      () => {
        controller.abort();
        throw new Error('отменено');
      },
    ]);
    const conversation = new SessionConversation(options(provider), journal, 's');
    const run = await conversation.send('Долгая задача', controller.signal);
    assert.equal(run.stopReason, 'aborted');
    conversation.clear();
    await conversation.flush();
    const all = await records(journal.file);
    assert.deepEqual(all.map((record) => record.type), ['message', 'message', 'task', 'clear']);
    assert.deepEqual((all[1] as { message: Message }).message, user(INTERRUPTED_NOTE));
  });

  it('сжатие истории попадает в журнал записью compact', async () => {
    const project = await temp();
    const journal = new SessionJournal(sessionFile(project.root, 's'));
    // Compactor в миниатюре: всё, кроме двух последних, — в сводку.
    const prepareMessages = (messages: Message[]) =>
      messages.length > 4 ? [{ role: 'user' as const, content: `${SUMMARY_PREFIX}\n\nсводка ${messages.length - 2}` }, ...messages.slice(-2)] : messages;
    const provider = new ScriptedProvider([textReply('a'), textReply('b'), textReply('c')]);
    const conversation = new SessionConversation({ ...options(provider), prepareMessages }, journal, 's');
    for (const task of ['раз', 'два', 'три']) await conversation.send(task);
    await conversation.flush();
    const compacts = (await records(journal.file)).filter((record) => record.type === 'compact');
    assert.deepEqual(compacts, [{ type: 'compact', summary: 'сводка 3', covered: 3 }]);
  });
});

describe('Шаг 5 / Step 5. resume и continue', () => {
  it('openSession: новая сессия начинается с заголовка', async () => {
    const project = await temp();
    const session = await openSession({ root: project.root, now: new Date('2026-10-26T09:00:00Z') });
    assert.match(session.id, /^20261026-090000-/);
    assert.equal(session.restored, undefined);
    const [first] = await records(session.journal.file);
    assert.equal(first.type, 'session');
  });

  it('разговор продолжается после перезапуска: модель видит прошлую историю, /cost — прошлый расход', async () => {
    const project = await temp();
    const first = await openSession({ root: project.root });
    const a = new SessionConversation(options(new ScriptedProvider([textReply('Запомнил: 7.', { usage: { input: 30, output: 5 } })])), first.journal, first.id);
    await a.send('Запомни число 7.');
    await a.flush();

    // «Новый процесс»: всё — заново из файла.
    const again = await openSession({ root: project.root, resume: first.id });
    const provider = new ScriptedProvider([textReply('7')]);
    const b = new SessionConversation(options(provider), again.journal, again.id, again.restored);
    assert.deepEqual(b.usage, { input: 30, output: 5 });
    await b.send('Какое число?');
    assert.deepEqual(
      provider.requests[0].messages.map((message) => message.content),
      [SYSTEM, 'Запомни число 7.', 'Запомнил: 7.', 'Какое число?'],
    );
    await b.flush();
    const reloaded = await loadSession(project.root, first.id);
    assert.equal(reloaded.messages.length, 4);
  });

  it('после resume со сводкой новое сжатие записывается в номерах полной истории', async () => {
    const project = await temp();
    const session = await openSession({ root: project.root });
    // Сжимаем, когда сообщений больше 4: сводка + два последних.
    const summarizing: Provider = {
      async complete(messages: Message[], _options: ChatOptions): Promise<ChatResult> {
        return textReply(messages[0].content === SUMMARY_SYSTEM ? 'S' : 'ok');
      },
    };
    let n = 0;
    const prepareMessages = (messages: Message[]) =>
      messages.length > 4 ? [{ role: 'user' as const, content: `${SUMMARY_PREFIX}\n\nсводка ${++n}` }, ...messages.slice(-2)] : messages;
    const a = new SessionConversation({ ...options(summarizing), prepareMessages }, session.journal, session.id);
    for (const task of ['1', '2', '3']) await a.send(task);
    await a.flush();
    const restored = (await loadSession(project.root, session.id));
    assert.deepEqual(restored.compact, { summary: 'сводка 1', covered: 3 });
    assert.equal(restored.messages.length, 1 + 3);

    const b = new SessionConversation({ ...options(summarizing), prepareMessages }, session.journal, session.id, restored);
    await b.send('4');
    await b.flush();
    const final = await loadSession(project.root, session.id);
    // Полная история: 8 сообщений. Вторая сводка закрыла всё, кроме последних двух на момент запроса.
    assert.equal(final.full.length, 8);
    assert.deepEqual(final.compact, { summary: 'сводка 2', covered: 5 });
    assert.deepEqual(final.messages.slice(1), final.full.slice(5));
  });

  it('continue берёт сессию, в которую писали последней; битая последняя строка — damaged', async () => {
    const project = await temp();
    assert.equal(await latestSession(project.root), undefined);
    const dir = path.join(project.root, '.agent/sessions');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, '20260101-000000-aaaa.jsonl'), `${JSON.stringify({ type: 'message', message: user('старая') })}\n`);
    await writeFile(path.join(dir, '20261026-000000-bbbb.jsonl'), `${JSON.stringify({ type: 'message', message: user('новая') })}\n`);
    // Старую продолжили позже — она и последняя.
    const later = new Date(Date.now() + 60_000);
    await utimes(path.join(dir, '20260101-000000-aaaa.jsonl'), later, later);
    await appendFile(path.join(dir, '20260101-000000-aaaa.jsonl'), '{"type":"mess');
    const session = await openSession({ root: project.root, continue: true });
    assert.equal(session.id, '20260101-000000-aaaa');
    assert.equal(session.restored?.damaged, true);
    assert.deepEqual(session.restored?.messages, [user('старая')]);
    // Обрывок отрезан: следующая запись ложится целой строкой, и журнал снова читается без потерь.
    await session.journal.append([{ type: 'message', message: user('дальше') }]);
    const reloaded = await loadSession(project.root, session.id);
    assert.equal(reloaded.damaged, false);
    assert.deepEqual(reloaded.messages, [user('старая'), user('дальше')]);
  });

  it('нет такой сессии — понятная ошибка; флаги --resume и --continue', async () => {
    const project = await temp();
    await assert.rejects(loadSession(project.root, 'nope'), /Сессии nope нет/);
    assert.deepEqual(parseHarnessArgs(['--resume', 'abc', '-p', 'дальше']), {
      cli: { mode: 'headless', task: 'дальше', json: false },
      cwd: 'playground',
      resume: 'abc',
    });
    assert.equal(parseHarnessArgs(['--continue']).continue, true);
    assert.throws(() => parseHarnessArgs(['--resume', 'a', '--continue']), UsageError);
  });
});
