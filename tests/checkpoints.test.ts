import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { editFileTool } from '../src/code-tools/edit-file.ts';
import type { ChatResult } from '../src/llm.ts';
import { BudgetExceededError, CostBudget, withCostBudget } from '../src/harness/budget.ts';
import { checkpointed, CheckpointStore } from '../src/harness/checkpoints.ts';
import { harnessCommand } from '../src/harness/commands.ts';
import { createHarness } from '../src/harness/create.ts';
import { recoverCrash, recoveryNote, startedTasks } from '../src/harness/recovery.ts';
import { loadSession, openSession, SessionConversation, SessionJournal, sessionFile } from '../src/harness/session.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const projects: TempProject[] = [];
after(async () => {
  await Promise.all(projects.map((project) => project.remove()));
});

async function shop() {
  const project = await tempProject({ 'package.json': '{}', 'src/cart.ts': 'export const total = 1;\n', 'src/format.ts': 'export const f = 1;\n' });
  projects.push(project);
  return project;
}

const read = (project: TempProject, file: string) => readFile(path.join(project.root, file), 'utf8');
const exists = (project: TempProject, file: string) => stat(path.join(project.root, file)).then(() => true, () => false);
const edit = (file: string, oldStr: string, newStr: string) => ({ name: 'edit_file', args: { path: file, old_str: oldStr, new_str: newStr } });
const PRICE = { inputPerMillion: 1, outputPerMillion: 2 };

function tool(project: TempProject, store: CheckpointStore) {
  return checkpointed(editFileTool(project.root), store);
}

describe('Шаг 1 / Step 1. Снимок перед записью', () => {
  it('первая правка файла в задаче — снимок, вторая — нет', async () => {
    const project = await shop();
    const store = new CheckpointStore(project.root, 's');
    const edit = tool(project, store);
    store.begin();
    await edit.run({ path: 'src/cart.ts', old_str: '1;', new_str: '2;' }, {});
    await edit.run({ path: 'src/cart.ts', old_str: '2;', new_str: '3;' }, {});
    assert.deepEqual(await store.files(1), [{ path: 'src/cart.ts', existed: true, content: 'export const total = 1;\n' }]);
    assert.ok(await exists(project, '.agent/checkpoints/s/1.jsonl'));
  });

  it('новый файл — снимок «не было»; следующая задача — новый номер; задача начинается с шага 1', async () => {
    const project = await shop();
    const store = new CheckpointStore(project.root, 's');
    const edit = tool(project, store);
    store.onEvent({ type: 'step', step: 1 });
    await edit.run({ path: 'src/new.ts', old_str: '', new_str: 'export {};\n' }, {});
    store.onEvent({ type: 'step', step: 2 });
    assert.equal(store.task, 1, 'шаг 2 — та же задача');
    store.onEvent({ type: 'step', step: 1 });
    await edit.run({ path: './src/cart.ts', old_str: '1;', new_str: '2;' }, {});
    assert.deepEqual(await store.files(1), [{ path: 'src/new.ts', existed: false }]);
    assert.deepEqual((await store.files(2)).map((snapshot) => snapshot.path), ['src/cart.ts']);
    assert.deepEqual(await store.tasks(), [1, 2]);
  });

  it('две правки одного файла в одном шаге — в снимке файл до обеих', async () => {
    const project = await shop();
    const store = new CheckpointStore(project.root, 's');
    const edit = tool(project, store);
    store.begin();
    await Promise.all([
      edit.run({ path: 'src/cart.ts', old_str: 'total', new_str: 'sum' }, {}),
      edit.run({ path: 'src/cart.ts', old_str: '1;', new_str: '2;' }, {}),
    ]);
    assert.equal(await read(project, 'src/cart.ts'), 'export const sum = 2;\n');
    assert.deepEqual(await store.files(1), [{ path: 'src/cart.ts', existed: true, content: 'export const total = 1;\n' }]);
  });

  it('после resume нумерация продолжается', () => {
    const store = new CheckpointStore('/p', 's', 3);
    store.begin();
    assert.equal(store.task, 4);
  });
});

describe('Шаг 2 / Step 2. Откат правок задачи', () => {
  it('rewind возвращает файлы и удаляет созданные; второй rewind — задача раньше', async () => {
    const project = await shop();
    const store = new CheckpointStore(project.root, 's');
    const edit = tool(project, store);
    store.begin();
    await edit.run({ path: 'src/format.ts', old_str: '1;', new_str: '10;' }, {});
    store.begin();
    await edit.run({ path: 'src/cart.ts', old_str: '1;', new_str: '2;' }, {});
    await edit.run({ path: 'src/extra.ts', old_str: '', new_str: 'x\n' }, {});

    const last = await store.rewind();
    assert.equal(last?.task, 2);
    assert.deepEqual(last?.files.map((file) => file.path), ['src/cart.ts', 'src/extra.ts']);
    assert.equal(await read(project, 'src/cart.ts'), 'export const total = 1;\n');
    assert.equal(await exists(project, 'src/extra.ts'), false);
    assert.equal(await read(project, 'src/format.ts'), 'export const f = 10;\n', 'задачу 1 не трогали');

    assert.equal((await store.rewind())?.task, 1);
    assert.equal(await read(project, 'src/format.ts'), 'export const f = 1;\n');
    assert.equal(await store.rewind(), undefined);
    assert.deepEqual((await readdir(path.join(project.root, '.agent/checkpoints/s'))).sort(), ['1.rewound.jsonl', '2.rewound.jsonl']);
  });
});

describe('Шаг 3 / Step 3. Бюджет сессии в деньгах', () => {
  it('CostBudget: считает по цене, кончился — следующего запроса нет', async () => {
    const budget = new CostBudget(0.001, PRICE, 0.0002);
    const provider = withCostBudget(new ScriptedProvider([textReply('a', { usage: { input: 400, output: 200 } }), textReply('b')]), budget);
    await provider.complete([], {});
    assert.ok(Math.abs(budget.spent - 0.001) < 1e-12);
    assert.equal(budget.exhausted, true);
    await assert.rejects(provider.complete([], {}), (error: Error) => error instanceof BudgetExceededError && /\$0\.001000 из \$0\.001000/.test(error.message));
    assert.throws(() => new CostBudget(0, PRICE), RangeError);
    assert.equal(new CostBudget(undefined, PRICE, 100).exhausted, false, 'без лимита только считаем');
  });

  it('stream тоже идёт через бюджет', async () => {
    const budget = new CostBudget(1, PRICE);
    const result: ChatResult = textReply('привет', { usage: { input: 1000, output: 0 } });
    const provider = withCostBudget({ complete: async () => result, stream: async (_m, _o, onDelta) => (onDelta('привет'), result) }, budget);
    const chunks: string[] = [];
    await provider.stream!([], {}, (text) => chunks.push(text));
    assert.deepEqual(chunks, ['привет']);
    assert.equal(budget.spent, 0.001);
  });

  it('harness с бюджетом: агент останавливается, причина — в ответе', async () => {
    const project = await shop();
    const provider = new ScriptedProvider([
      toolReply([{ name: 'read_file', args: { path: 'src/cart.ts' } }], { usage: { input: 1000, output: 100 } }),
      textReply('не дойдёт'),
    ]);
    const harness = await createHarness({ root: project.root, provider, budget: new CostBudget(0.001, PRICE) });
    const run = await new SessionConversation(harness.agent, new SessionJournal(sessionFile(project.root, 'b')), 'b').send('Прочитай cart');
    await harness.close();
    assert.equal(run.stopReason, 'error');
    assert.match(run.answer, /Бюджет сессии исчерпан/);
    assert.equal(provider.requests.length, 1);
  });
});

describe('Шаг 4 / Step 4. Команды harness: /rewind и /cost', () => {
  it('/rewind откатывает файлы и предупреждает модель в следующей задаче', async () => {
    const project = await shop();
    const checkpoints = new CheckpointStore(project.root, 's');
    const budget = new CostBudget(undefined, PRICE);
    const provider = new ScriptedProvider([
      toolReply([edit('src/cart.ts', '1;', '2;')], { usage: { input: 100, output: 10 } }),
      textReply('Поменял.'),
      textReply('Понял, откатили.'),
    ]);
    const harness = await createHarness({ root: project.root, provider, mode: 'auto', checkpoints, budget });
    const conversation = new SessionConversation(harness.agent, new SessionJournal(sessionFile(project.root, 's')), 's');
    const command = harnessCommand({ conversation, checkpoints, budget });

    await conversation.send('Поменяй total на 2');
    assert.equal(await read(project, 'src/cart.ts'), 'export const total = 2;\n');
    const rewind = await command('/rewind');
    assert.match(rewind?.output ?? '', /Откатил задачу 1: src\/cart\.ts/);
    assert.equal(await read(project, 'src/cart.ts'), 'export const total = 1;\n');

    await conversation.send('Что с файлом?');
    const lastTask = String(provider.requests[2].messages.at(-1)?.content);
    assert.match(lastTask, /^\[Человек откатил правки задачи 1: src\/cart\.ts/);
    assert.match(lastTask, /Что с файлом\?$/);
    assert.match((await command('/rewind'))?.output ?? '', /Откатывать нечего/);
    await harness.close();
  });

  it('/cost — деньги через бюджет, /help — все команды, остальное — команды из 6.3', async () => {
    const project = await shop();
    const conversation = new SessionConversation(
      { provider: new ScriptedProvider([]), toolbox: (await createHarness({ root: project.root, provider: new ScriptedProvider([]) })).toolbox, system: 'S' },
      new SessionJournal(sessionFile(project.root, 'c')),
      'c',
    );
    const budget = new CostBudget(0.5, PRICE, 0.25);
    const command = harnessCommand({ conversation, checkpoints: new CheckpointStore(project.root, 'c'), budget });
    assert.match((await command('/cost'))?.output ?? '', /\$0\.250000 из \$0\.500000/);
    const help = (await command('/help'))?.output ?? '';
    for (const name of ['/rewind', '/cost', '/session', '/clear', '/exit']) assert.ok(help.includes(name), name);
    assert.match((await command('/session'))?.output ?? '', /--resume c/);
    assert.equal((await command('/exit'))?.exit, true);
    assert.match((await command('/nope'))?.output ?? '', /Нет команды \/nope/);
    assert.equal(await command('просто задача'), undefined);
  });
});

describe('Шаг 5 / Step 5. Падение процесса: журнал + checkpoint', () => {
  it('после падения: история восстановлена, правки задачи известны, модель предупреждена', async () => {
    const project = await shop();
    const session = await openSession({ root: project.root });
    const checkpoints = new CheckpointStore(project.root, session.id, startedTasks(session));
    let crashed!: () => void;
    const atCrash = new Promise<void>((resolve) => (crashed = resolve));
    const provider = new ScriptedProvider([
      toolReply([edit('src/cart.ts', '1;', '2;')]),
      () => {
        // «Процесс упал» на втором запросе: ответа не будет никогда.
        crashed();
        return new Promise<ChatResult>(() => {});
      },
    ]);
    const harness = await createHarness({ root: project.root, provider, mode: 'auto', checkpoints });
    void new SessionConversation(harness.agent, session.journal, session.id).send('Поменяй total на 2');
    await atCrash;
    await session.journal.flush();
    await harness.close();

    // Новый процесс: всё — с диска.
    const again = await openSession({ root: project.root, continue: true });
    assert.equal(again.restored?.unfinished, 'Поменяй total на 2');
    assert.equal(startedTasks(again), 1);
    const store = new CheckpointStore(project.root, again.id, startedTasks(again));
    const recovery = await recoverCrash(again, store);
    assert.deepEqual(recovery, { task: 'Поменяй total на 2', files: ['src/cart.ts'] });
    assert.match(recoveryNote(recovery!), /процесс агента упал.*src\/cart\.ts/);
    assert.equal((await loadSession(project.root, again.id)).unfinished, undefined, 'оборванная задача закрыта записью task');
    assert.equal(startedTasks(await openSession({ root: project.root, continue: true })), 1);

    // История валидна: за вызовом edit_file — его результат.
    const roles = again.restored!.messages.map((message) => message.role);
    assert.deepEqual(roles, ['user', 'assistant', 'tool']);

    // /rewind в новом процессе откатывает правку оборванной задачи.
    assert.equal((await store.rewind())?.task, 1);
    assert.equal(await read(project, 'src/cart.ts'), 'export const total = 1;\n');
  });

  it('обычная сессия — восстанавливать нечего', async () => {
    const project = await shop();
    const session = await openSession({ root: project.root });
    const conversation = new SessionConversation(
      (await createHarness({ root: project.root, provider: new ScriptedProvider([textReply('ок')]) })).agent,
      session.journal,
      session.id,
    );
    await conversation.send('Привет');
    await conversation.flush();
    const again = await openSession({ root: project.root, resume: session.id });
    assert.equal(startedTasks(again), 1);
    assert.equal(await recoverCrash(again, new CheckpointStore(project.root, again.id, 1)), undefined);
  });
});
