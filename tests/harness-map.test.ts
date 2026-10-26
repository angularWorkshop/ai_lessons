import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, describe, it } from 'node:test';
import { SUMMARY_SYSTEM } from '../src/context/compaction.ts';
import { Conversation } from '../src/conversation.ts';
import type { Message } from '../src/llm.ts';
import { UsageError } from '../src/headless.ts';
import { keyConfirm } from '../src/harness/confirm.ts';
import {
  createHarness,
  EXPLORER_SYSTEM,
  HARNESS_ROLE,
  harnessPolicy,
  harnessSystem,
  harnessToolbox,
  loadSkills,
  SUBAGENT_RULE,
  type ToolboxParts,
} from '../src/harness/create.ts';
import { GuardedToolbox } from '../src/code-tools/permissions.ts';
import { MemoryStore } from '../src/context/memory.ts';
import { TodoList } from '../src/todo/todo.ts';
import { parseHarnessArgs, runOnce } from '../src/harness/run.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const projects: TempProject[] = [];
after(async () => {
  await Promise.all(projects.map((project) => project.remove()));
});

const SKILL = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\nТело скилла ${name}.\n`;

async function project(extra: Record<string, string> = {}) {
  const created = await tempProject({
    'package.json': '{ "name": "shop" }\n',
    'AGENTS.md': '# Правила\n\nТесты не меняй.\n',
    'src/cart.ts': 'export const total = (sum: number) => sum;\n',
    ...extra,
  });
  projects.push(created);
  return created;
}

const sink = () => {
  const chunks: string[] = [];
  return { write: (text: string | Uint8Array) => chunks.push(String(text)) > 0, text: () => chunks.join('') };
};

describe('Шаг 1 / Step 1. Политика harness', () => {
  it('служебные инструменты разрешены даже в read-only', () => {
    const policy = harnessPolicy('read-only');
    for (const tool of ['todo_write', 'task', 'remember', 'load_skill', 'read_skill_file']) {
      assert.equal(policy({ tool, args: {} }).decision, 'allow', tool);
    }
  });

  it('для кода решает codePolicy из темы 5.4', () => {
    assert.equal(harnessPolicy('read-only')({ tool: 'edit_file', args: { path: 'src/a.ts' } }).decision, 'deny');
    assert.equal(harnessPolicy('ask')({ tool: 'edit_file', args: { path: 'src/a.ts' } }).decision, 'ask');
    assert.equal(harnessPolicy('auto')({ tool: 'edit_file', args: { path: '.env' } }).decision, 'deny');
    assert.equal(harnessPolicy('ask')({ tool: 'read_file', args: { path: 'src/a.ts' } }).decision, 'allow');
  });

  it('инструмент MCP-сервера — незнакомый: в режиме ask про него спрашивают', () => {
    assert.equal(harnessPolicy('ask')({ tool: 'project__add_note', args: {} }).decision, 'ask');
    assert.equal(harnessPolicy('read-only')({ tool: 'project__add_note', args: {} }).decision, 'deny');
  });
});

describe('Шаг 2 / Step 2. Скиллы и system prompt', () => {
  it('loadSkills собирает скиллы из нескольких папок, при одинаковом имени побеждает папка позже', async () => {
    const shop = await project({
      'user-skills/api-review/SKILL.md': SKILL('api-review', 'Старое описание.'),
      'user-skills/notes/SKILL.md': SKILL('notes', 'Заметки.'),
      '.agent/skills/api-review/SKILL.md': SKILL('api-review', 'Описание проекта.'),
    });
    const { skills, warnings } = await loadSkills(shop.root, ['user-skills', '.agent/skills', 'nope']);
    assert.deepEqual(skills.map((skill) => skill.name), ['api-review', 'notes']);
    assert.equal(skills[0].description, 'Описание проекта.');
    assert.deepEqual(warnings, []);
  });

  it('битый скилл — предупреждение, а не падение', async () => {
    const { skills, warnings } = await loadSkills(process.cwd(), ['tests/fixtures/skills']);
    assert.ok(skills.length > 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /broken-skill/);
  });

  it('в system — роль, память, скиллы, план и AGENTS.md проекта', async () => {
    const shop = await project({ 'skills/notes/SKILL.md': SKILL('notes', 'Заметки по проекту.') });
    const { skills } = await loadSkills(shop.root, ['skills']);
    const { system, agentsFiles } = await harnessSystem({
      root: shop.root,
      skills,
      memory: { title: 'Память', body: '- [m1] Пользователя зовут Аня' },
      subagents: true,
    });
    assert.ok(system.startsWith(HARNESS_ROLE));
    for (const part of ['## Память', 'Аня', '## Скиллы', 'notes — Заметки по проекту.', '## План', 'todo_write', 'Тесты не меняй.', SUBAGENT_RULE]) {
      assert.ok(system.includes(part), `в system нет «${part}»`);
    }
    assert.ok(system.indexOf('## План') < system.indexOf('Тесты не меняй.'), 'AGENTS.md — последним слоем');
    assert.deepEqual(agentsFiles, ['AGENTS.md']);
  });

  it('без субагентов в system нет правила про task, без скиллов — раздела скиллов', async () => {
    const shop = await project();
    const { system } = await harnessSystem({ root: shop.root, skills: [], memory: { title: 'Память', body: '' }, subagents: false });
    assert.ok(!system.includes(SUBAGENT_RULE));
    assert.ok(!system.includes('## Скиллы'));
    assert.ok(!system.includes('## Память'));
  });
});

describe('Шаг 3 / Step 3. Инструменты harness', () => {
  const parts = async (extra: Partial<ToolboxParts> = {}): Promise<ToolboxParts> => {
    const shop = await project();
    return {
      root: shop.root,
      provider: new ScriptedProvider([]),
      mode: 'ask',
      todos: new TodoList(),
      memory: new MemoryStore(path.join(shop.root, '.agent/memory.json')),
      skills: [],
      subagents: true,
      ...extra,
    };
  };

  it('инструменты для кода, план, память и субагент — в постоянном порядке', async () => {
    const toolbox = harnessToolbox(await parts());
    assert.ok(toolbox instanceof GuardedToolbox, 'инструменты должны идти через права из 5.4');
    assert.deepEqual(toolbox.specs().map((spec) => spec.function.name), ['list_files', 'read_file', 'grep', 'edit_file', 'run_command', 'todo_write', 'remember', 'task']);
  });

  it('скиллы добавляют load_skill и read_skill_file, subagents: false убирает task', async () => {
    const shop = await project({ 'skills/notes/SKILL.md': SKILL('notes', 'Заметки.') });
    const { skills } = await loadSkills(shop.root, ['skills']);
    const toolbox = harnessToolbox(await parts({ root: shop.root, skills, subagents: false }));
    assert.deepEqual(toolbox.specs().map((spec) => spec.function.name).slice(-3), ['remember', 'load_skill', 'read_skill_file']);
  });

  it('todo_write пишет в переданный TodoList, а без confirm правка получает отказ', async () => {
    const p = await parts();
    const toolbox = harnessToolbox(p);
    const plan = await toolbox.execute({ id: '1', name: 'todo_write', arguments: JSON.stringify({ todos: [{ title: 'Шаг', status: 'pending' }] }) });
    assert.equal(plan.isError, false);
    assert.equal(p.todos.items.length, 1);
    const edit = await toolbox.execute({ id: '2', name: 'edit_file', arguments: JSON.stringify({ path: 'src/cart.ts', old_str: 'sum;', new_str: '0;' }) });
    assert.equal(edit.isError, true);
    assert.match(edit.content, /Отказано/);
  });

  it('субагент получает только чтение и свой system', async () => {
    const provider = new ScriptedProvider([textReply('total — в src/cart.ts:1')]);
    const toolbox = harnessToolbox(await parts({ provider }));
    const result = await toolbox.execute({ id: '3', name: 'task', arguments: JSON.stringify({ description: 'Где total', prompt: 'Найди total' }) });
    assert.equal(result.content, 'total — в src/cart.ts:1');
    assert.equal(provider.requests[0].messages[0].content, EXPLORER_SYSTEM);
    assert.deepEqual(provider.requests[0].options.tools?.map((tool) => tool.function.name), ['list_files', 'read_file', 'grep']);
  });
});

describe('Шаг 4 / Step 4. createHarness: всё вместе', () => {
  it('опции агента собраны из частей harness', async () => {
    const shop = await project();
    const harness = await createHarness({ root: shop.root, provider: new ScriptedProvider([]) });
    assert.deepEqual(harness.info.tools, ['list_files', 'read_file', 'grep', 'edit_file', 'run_command', 'todo_write', 'remember', 'task']);
    assert.equal(harness.agent.system, harness.system);
    assert.equal(harness.agent.toolbox, harness.toolbox);
    assert.equal(harness.agent.prepareMessages, harness.compactor.prepare);
    assert.equal(harness.agent.stream, true);
    assert.deepEqual(harness.info.agentsFiles, ['AGENTS.md']);
    await harness.close();
  });

  it('MCP-сервер, который не поднялся, — предупреждение, остальное работает', async () => {
    const shop = await project();
    const harness = await createHarness({
      root: shop.root,
      provider: new ScriptedProvider([]),
      mcp: { mcpServers: { broken: { command: 'node', args: ['-e', 'process.exit(1)'] } } },
      mcpConnect: { timeoutMs: 3000, graceMs: 100 },
    });
    assert.equal(harness.info.warnings.length, 1);
    assert.match(harness.info.warnings[0], /broken/);
    assert.ok(harness.info.tools.includes('edit_file'));
    await harness.close();
  });

  it('план, правка, субагент и ответ — через один Agent', async () => {
    const shop = await project();
    const provider = new ScriptedProvider([
      toolReply([{ name: 'todo_write', args: { todos: [{ title: 'Найти total', status: 'in_progress' }, { title: 'Поправить', status: 'pending' }] } }]),
      toolReply([{ name: 'task', args: { description: 'Где total', prompt: 'Найди функцию total' } }]),
      // Это запрос субагента: тот же провайдер, свой system.
      textReply('total — в src/cart.ts:1'),
      toolReply([{ name: 'edit_file', args: { path: 'src/cart.ts', old_str: '=> sum;', new_str: '=> Math.round(sum * 100) / 100;' } }]),
      textReply('Готово.'),
    ]);
    const events: string[] = [];
    const harness = await createHarness({
      root: shop.root,
      provider,
      mode: 'auto',
      onEvent: (event) => events.push(event.type),
      onSubagentEvent: (event, description) => events.push(`${description}:${event.type}`),
    });
    const run = await new Conversation(harness.agent).send('Округли total до копеек');
    await harness.close();

    assert.equal(run.stopReason, 'done');
    assert.equal(run.answer, 'Готово.');
    assert.equal(await readFile(path.join(shop.root, 'src/cart.ts'), 'utf8'), 'export const total = (sum: number) => Math.round(sum * 100) / 100;\n');
    assert.deepEqual(harness.todos.items.map((item) => item.title), ['Найти total', 'Поправить']);
    assert.equal(provider.requests[2].messages[0].content, EXPLORER_SYSTEM);
    assert.equal(provider.requests[0].messages[0].content, harness.system);
    assert.ok(events.includes('Где total:stop'), 'события субагента не дошли до onSubagentEvent');
  });

  it('в режиме ask без confirm правка не проходит: спросить некого', async () => {
    const shop = await project();
    const provider = new ScriptedProvider([
      toolReply([{ name: 'edit_file', args: { path: 'src/cart.ts', old_str: 'sum;', new_str: '0;' } }]),
      textReply('Не дали.'),
    ]);
    const harness = await createHarness({ root: shop.root, provider });
    const run = await new Conversation(harness.agent).send('Сломай total');
    const tool = run.messages.find((message) => message.role === 'tool');
    assert.match(String(tool?.content), /Отказано/);
    assert.equal(await readFile(path.join(shop.root, 'src/cart.ts'), 'utf8'), 'export const total = (sum: number) => sum;\n');
    await harness.close();
  });

  it('длинная история сжимается: compactor из 7.2 подключён через prepareMessages', async () => {
    const big = `// ${'x'.repeat(3000)}\n`;
    const shop = await project({ 'src/a.ts': big, 'src/b.ts': big, 'src/c.ts': big, 'src/d.ts': big });
    const replies = [
      ...['a', 'b', 'c', 'd'].map((name) => toolReply([{ name: 'read_file', args: { path: `src/${name}.ts` } }])),
      textReply('Прочитал.'),
    ];
    // Сводку просит Compactor, ответы — агент. Кто спрашивает, видно по system.
    const summaries: string[] = [];
    const provider = {
      async complete(messages: Message[]) {
        if (messages[0].content === SUMMARY_SYSTEM) {
          summaries.push(String(messages[1].content));
          return textReply('## Цель\nПрочитать файлы');
        }
        return replies.shift()!;
      },
    };
    let compacted = 0;
    const harness = await createHarness({ root: shop.root, provider, compactThreshold: 500, onCompact: () => compacted++ });
    const run = await new Conversation(harness.agent).send('Прочитай файлы');
    assert.equal(run.stopReason, 'done');
    assert.ok(compacted >= 1, 'сжатие не случилось');
    assert.equal(compacted, summaries.length);
    assert.equal(run.messages.length, 10, 'история агента остаётся полной');
    await harness.close();
  });
});

describe('Шаг 5 / Step 5. Командная строка и вопрос человеку', () => {
  it('parseHarnessArgs: свои флаги забирает, остальное отдаёт parseCli', () => {
    assert.deepEqual(parseHarnessArgs(['--mode', 'auto', '-p', 'Почини тест']), {
      cli: { mode: 'headless', task: 'Почини тест', json: false },
      cwd: 'playground',
      mode: 'auto',
    });
    assert.deepEqual(parseHarnessArgs(['--cwd=demo', 'Привет']), { cli: { mode: 'repl', task: 'Привет' }, cwd: 'demo' });
    assert.throws(() => parseHarnessArgs(['--mode', 'yolo']), UsageError);
    assert.throws(() => parseHarnessArgs(['--cwd']), UsageError);
    assert.throws(() => parseHarnessArgs(['--json']), UsageError);
  });

  it('keyConfirm: одна клавиша — y, a или «нет» на всё остальное', async () => {
    const input = new PassThrough();
    const output = sink();
    const confirm = keyConfirm(input, output);
    const request = { tool: 'edit_file', args: { path: 'src/a.ts', old_str: 'a', new_str: 'b' } };
    const verdict = { decision: 'ask' as const, reason: 'правка файла' };

    const answers: string[] = [];
    for (const key of ['y', 'a', '\r', 'n']) {
      const pending = confirm(request, verdict);
      input.write(key);
      answers.push(await pending);
    }
    assert.deepEqual(answers, ['yes', 'always', 'no', 'no']);
    assert.match(output.text(), /правка файла — разрешить\?/);
    assert.match(output.text(), /-a\n\s*\+b/);
    assert.equal(input.listenerCount('data'), 0, 'после ответа слушатель должен сниматься');
  });

  it('keyConfirm: агента остановили, пока ждали ответ, — «нет»', async () => {
    const input = new PassThrough();
    const controller = new AbortController();
    const pending = keyConfirm(input, sink())({ tool: 'run_command', args: { command: 'npm', args: ['test'] } }, { decision: 'ask', reason: 'запуск команды' }, controller.signal);
    controller.abort();
    assert.equal(await pending, 'no');
    assert.equal(input.listenerCount('data'), 0);
  });

  it('runOnce: ответ в stdout и код выхода, с --json — результат JSON', async () => {
    const shop = await project();
    const harness = await createHarness({ root: shop.root, provider: new ScriptedProvider([textReply('42', { usage: { input: 10, output: 2 } })]) });
    const stdout = sink();
    const stderr = sink();
    const code = await runOnce({ conversation: new Conversation(harness.agent), task: 'Сколько?', json: true, stdout, stderr });
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(stdout.text()), { answer: '42', stopReason: 'done', usage: { input: 10, output: 2 }, steps: 1 });
    await harness.close();
  });
});
