import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { Agent } from '../src/agent.ts';
import { describeCall, parseAnswer, TerminalConfirm } from '../src/code-tools/confirm.ts';
import { codeTools } from '../src/code-tools/index.ts';
import {
  codePolicy,
  GuardedToolbox,
  staysInside,
  type Answer,
  type Confirm,
  type PermissionRequest,
  type Policy,
  type Verdict,
} from '../src/code-tools/permissions.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import type { Tool } from '../src/tools.ts';
import { SHOP, tempProject, type TempProject } from './support/temp-project.ts';

const decide = (policy: Policy, tool: string, args: Record<string, unknown> = {}) => policy({ tool, args }).decision;
const edit = (file: string) => ({ path: file, old_str: 'a', new_str: 'b' });

describe('Шаг 1 / Step 1. Политика', () => {
  it('staysInside: только по строке пути', () => {
    assert.equal(staysInside('src/cart.ts'), true);
    assert.equal(staysInside('src/../README.md'), true);
    assert.equal(staysInside('../src/agent.ts'), false);
    assert.equal(staysInside('src/../../x'), false);
    assert.equal(staysInside('..'), false);
    assert.equal(staysInside('/etc/hosts'), false);
    assert.equal(staysInside('..notes.md'), true);
  });

  it('ask: чтение — allow, правка и команда — ask, запись наружу и в .env — deny', () => {
    const policy = codePolicy('ask');
    for (const tool of ['list_files', 'read_file', 'grep']) assert.equal(decide(policy, tool, { path: '.' }), 'allow');
    assert.equal(decide(policy, 'edit_file', edit('src/cart.ts')), 'ask');
    assert.equal(decide(policy, 'run_command', { command: 'npm', args: ['test'] }), 'ask');
    assert.equal(decide(policy, 'edit_file', edit('../src/agent.ts')), 'deny');
    assert.equal(decide(policy, 'edit_file', edit('/tmp/x.ts')), 'deny');
    assert.equal(decide(policy, 'edit_file', edit('config/.env.local')), 'deny');
    assert.match(policy({ tool: 'edit_file', args: edit('../src/agent.ts') }).reason, /вне проекта/);
  });

  it('read-only: всё, кроме чтения, — deny', () => {
    const policy = codePolicy('read-only');
    assert.equal(decide(policy, 'read_file', { path: 'a' }), 'allow');
    assert.equal(decide(policy, 'edit_file', edit('src/cart.ts')), 'deny');
    assert.equal(decide(policy, 'run_command', { command: 'ls', args: [] }), 'deny');
    assert.equal(decide(policy, 'deploy'), 'deny');
    assert.match(policy({ tool: 'edit_file', args: edit('src/cart.ts') }).reason, /read-only/);
  });

  it('auto: без вопросов, но deny остаётся deny; незнакомый инструмент — ask', () => {
    const policy = codePolicy('auto');
    assert.equal(decide(policy, 'edit_file', edit('src/cart.ts')), 'allow');
    assert.equal(decide(policy, 'run_command', { command: 'npm', args: ['test'] }), 'allow');
    assert.equal(decide(policy, 'edit_file', edit('../x')), 'deny');
    assert.equal(decide(policy, 'deploy'), 'ask');
    assert.equal(decide(codePolicy('ask'), 'deploy'), 'ask');
  });
});

// Инструмент-шпион: запоминает, сколько раз его действительно запустили.
function spyTool(name = 'edit_file') {
  const runs: unknown[] = [];
  const tool: Tool<{ path: string }> = {
    name,
    description: 'шпион',
    schema: z.object({ path: z.string() }),
    async run(args) {
      runs.push(args);
      return `выполнен ${args.path}`;
    },
  };
  return { tool, runs };
}

// Подтверждение из теста: отвечает по списку и запоминает вопросы.
function scriptedConfirm(answers: Answer[]) {
  const asked: { request: PermissionRequest; verdict: Verdict }[] = [];
  const confirm: Confirm = async (request, verdict) => {
    asked.push({ request, verdict });
    return answers.shift() ?? 'no';
  };
  return { confirm, asked };
}

const callOf = (name: string, args: unknown, id = 'call_1') => ({ id, name, arguments: JSON.stringify(args) });

describe('Шаг 2 / Step 2. GuardedToolbox: allow и deny', () => {
  it('allow — инструмент выполнен, человека не спрашивают', async () => {
    const { tool, runs } = spyTool('read_file');
    const { confirm, asked } = scriptedConfirm([]);
    const toolbox = new GuardedToolbox({ policy: codePolicy('ask'), confirm }).register(tool);
    const result = await toolbox.execute(callOf('read_file', { path: 'src/a.ts' }));
    assert.deepEqual(result, { content: 'выполнен src/a.ts', isError: false });
    assert.equal(runs.length, 1);
    assert.equal(asked.length, 0);
  });

  it('deny — ToolResult с isError и причиной, инструмент не запускался', async () => {
    const { tool, runs } = spyTool();
    const { confirm, asked } = scriptedConfirm(['yes']);
    const toolbox = new GuardedToolbox({ policy: codePolicy('ask'), confirm }).register(tool);
    const result = await toolbox.execute(callOf('edit_file', { path: '../src/agent.ts' }));
    assert.equal(result.isError, true);
    assert.match(result.content, /^Отказано: запись вне проекта: \.\.\/src\/agent\.ts\. Не повторяй/);
    assert.equal(runs.length, 0);
    assert.equal(asked.length, 0, 'deny не спрашивает человека');
  });

  it('политика получает аргументы после схемы; сломанные аргументы объясняет Toolbox', async () => {
    const { tool, runs } = spyTool();
    const seen: PermissionRequest[] = [];
    const policy: Policy = (request) => {
      seen.push(request);
      return { decision: 'allow', reason: 'тест' };
    };
    const toolbox = new GuardedToolbox({ policy, confirm: scriptedConfirm([]).confirm }).register(tool);
    await toolbox.execute(callOf('edit_file', { path: 'a.ts' }));
    assert.deepEqual(seen, [{ tool: 'edit_file', args: { path: 'a.ts' } }]);
    const broken = await toolbox.execute({ id: 'call_2', name: 'edit_file', arguments: '{"path": ' });
    assert.match(broken.content, /не JSON/);
    const missing = await toolbox.execute(callOf('rm_rf', {}));
    assert.match(missing.content, /инструмента rm_rf нет/);
    assert.equal(seen.length, 1);
    assert.equal(runs.length, 1);
  });

  it('модель видит отказ в истории и отвечает без правки', async () => {
    const project = await tempProject(SHOP);
    try {
      const toolbox = new GuardedToolbox({ policy: codePolicy('read-only'), confirm: scriptedConfirm([]).confirm });
      for (const tool of codeTools(project.root)) toolbox.register(tool);
      const provider = new ScriptedProvider([
        toolReply([{ name: 'edit_file', args: { path: 'src/discount.ts', old_str: '>', new_str: '>=' }, id: 'call_e' }]),
        textReply('Править нельзя: режим read-only. Замени > на >= в src/discount.ts:3.'),
      ]);
      const run = await new Agent({ provider, toolbox, system: 'Ты — агент.' }).run('Почини скидку');
      assert.equal(run.stopReason, 'done');
      const toolMessage = provider.requests[1].messages.at(-1);
      assert.equal(toolMessage?.role, 'tool');
      assert.match(toolMessage!.content, /^Отказано: режим read-only/);
      assert.equal(await readFile(path.join(project.root, 'src/discount.ts'), 'utf8'), SHOP['src/discount.ts']);
    } finally {
      await project.remove();
    }
  });
});

describe('Шаг 3 / Step 3. ask: спросить человека', () => {
  it('yes — выполнить, no — отказ; в вопросе запрос и причина', async () => {
    const { tool, runs } = spyTool();
    const { confirm, asked } = scriptedConfirm(['no', 'yes']);
    const toolbox = new GuardedToolbox({ policy: codePolicy('ask'), confirm }).register(tool);
    const refused = await toolbox.execute(callOf('edit_file', { path: 'src/a.ts' }));
    assert.equal(refused.isError, true);
    assert.match(refused.content, /^Отказано: человек не разрешил этот вызов \(правка файла\)/);
    assert.equal(runs.length, 0);
    const allowed = await toolbox.execute(callOf('edit_file', { path: 'src/a.ts' }));
    assert.equal(allowed.content, 'выполнен src/a.ts');
    assert.deepEqual(asked[0], {
      request: { tool: 'edit_file', args: { path: 'src/a.ts' } },
      verdict: { decision: 'ask', reason: 'правка файла' },
    });
  });

  it('always — больше не спрашивать про этот инструмент, про другие спрашивать', async () => {
    const edit = spyTool('edit_file');
    const command = spyTool('run_command');
    const { confirm, asked } = scriptedConfirm(['always', 'yes']);
    const toolbox = new GuardedToolbox({ policy: codePolicy('ask'), confirm }).register(edit.tool).register(command.tool);
    await toolbox.execute(callOf('edit_file', { path: 'a.ts' }));
    await toolbox.execute(callOf('edit_file', { path: 'b.ts' }));
    await toolbox.execute(callOf('run_command', { path: 'x' }));
    assert.deepEqual(asked.map((q) => q.request.tool), ['edit_file', 'run_command']);
    assert.equal(edit.runs.length, 2);
  });

  it('вопросы по одному, даже когда вызовы шага идут параллельно', async () => {
    const { tool, runs } = spyTool();
    let active = 0;
    let maxActive = 0;
    const answers: Answer[] = ['always', 'yes', 'yes'];
    let asked = 0;
    const confirm: Confirm = async () => {
      asked++;
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(10);
      active--;
      return answers.shift()!;
    };
    const toolbox = new GuardedToolbox({ policy: codePolicy('ask'), confirm }).register(tool);
    await Promise.all(['a', 'b', 'c'].map((name, i) => toolbox.execute(callOf('edit_file', { path: `${name}.ts` }, `call_${i}`))));
    assert.equal(maxActive, 1);
    assert.equal(asked, 1, 'после «всегда» на первый вызов остальные уже не спрашивают');
    assert.equal(runs.length, 3);
  });

  it('signal из контекста доходит до confirm', async () => {
    const { tool } = spyTool();
    let seen: AbortSignal | undefined;
    const confirm: Confirm = async (_request, _verdict, signal) => {
      seen = signal;
      return 'no';
    };
    const controller = new AbortController();
    const toolbox = new GuardedToolbox({ policy: codePolicy('ask'), confirm }).register(tool);
    await toolbox.execute(callOf('edit_file', { path: 'a.ts' }), { signal: controller.signal });
    assert.equal(seen, controller.signal);
  });
});

describe('Шаг 4 / Step 4. Вопрос в терминале', () => {
  let input: PassThrough;
  let output: PassThrough;
  let printed: string;
  let terminal: TerminalConfirm;
  const request: PermissionRequest = { tool: 'run_command', args: { command: 'npm', args: ['test'] } };
  const verdict: Verdict = { decision: 'ask', reason: 'запуск команды' };

  before(() => {
    input = new PassThrough();
    output = new PassThrough();
    printed = '';
    output.on('data', (chunk) => (printed += chunk));
    terminal = new TerminalConfirm({ input, output });
  });
  after(() => terminal.close());

  it('describeCall: правка — путь и строки -/+, команда — как в терминале', () => {
    assert.equal(
      describeCall({ tool: 'edit_file', args: { path: 'src/discount.ts', old_str: '  if (sum > 1000) {', new_str: '  if (sum >= 1000) {' } }),
      'edit_file src/discount.ts\n-  if (sum > 1000) {\n+  if (sum >= 1000) {',
    );
    assert.equal(describeCall({ tool: 'edit_file', args: { path: 'a.ts', old_str: '', new_str: 'x\ny' } }), 'edit_file a.ts: новый файл\n+x\n+y');
    assert.equal(describeCall(request), '$ npm test');
  });

  it('parseAnswer: да — только явное, Enter и ерунда — нет', () => {
    for (const line of ['y', 'Y', 'yes', 'д', 'да', ' y ']) assert.equal(parseAnswer(line), 'yes');
    for (const line of ['a', 'always', 'в', 'всегда']) assert.equal(parseAnswer(line), 'always');
    for (const line of ['n', 'нет', '', 'ok', null]) assert.equal(parseAnswer(line), 'no');
  });

  it('вопрос в output, ответ из input', async () => {
    const answer = terminal.ask(request, verdict);
    await delay(5);
    assert.match(printed, /\? запуск команды — разрешить\?\n  \$ npm test\n  \[y\] да · \[a\] да, и больше не спрашивать про run_command · \[n\] нет > $/);
    input.write('y\n');
    assert.equal(await answer, 'yes');
  });

  it('ответы, пришедшие заранее, не теряются', async () => {
    input.write('n\na\n');
    await delay(5);
    assert.equal(await terminal.ask(request, verdict), 'no');
    assert.equal(await terminal.ask(request, verdict), 'always');
  });

  it('отмена агента и конец ввода — это «нет»', async () => {
    const controller = new AbortController();
    const pending = terminal.ask(request, verdict, controller.signal);
    controller.abort();
    assert.equal(await pending, 'no');
    input.end();
    assert.equal(await terminal.ask(request, verdict), 'no');
  });
});
