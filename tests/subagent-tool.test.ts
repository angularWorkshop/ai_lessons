import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { Agent, type AgentEvent, type AgentRun } from '../src/agent.ts';
import type { Message } from '../src/llm.ts';
import { childPrinter } from '../src/subagents/print-child.ts';
import { subagentResult, TaskArgs, taskTool, type SubagentOptions } from '../src/subagents/task-tool.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Workspace, workspaceTools } from '../src/todo/workspace.ts';
import { Toolbox, type Tool } from '../src/tools.ts';

const PARENT = 'Ты — ведущий агент.';
const CHILD = 'Ты — субагент.';

function childToolbox() {
  const toolbox = new Toolbox();
  workspaceTools(new Workspace({ 'src/math.ts': 'export function sum() {}' }), { readOnly: true }).forEach((tool) => toolbox.register(tool));
  return toolbox;
}

// Родитель и ребёнок — два отдельных сценария: у каждого свой ScriptedProvider.
function setup(childScript: ConstructorParameters<typeof ScriptedProvider>[0], extra: Partial<SubagentOptions> = {}) {
  const child = new ScriptedProvider(childScript);
  const tool = taskTool({ provider: child, toolbox: childToolbox(), system: CHILD, ...extra });
  return { child, tool, toolbox: new Toolbox().register(tool) };
}

const task = (description: string, prompt: string, id?: string) => ({ name: 'task', args: { description, prompt }, id });
const toolMessages = (messages: Message[]) => messages.filter((m): m is Extract<Message, { role: 'tool' }> => m.role === 'tool');

describe('Шаг 1 / Step 1. Аргументы task', () => {
  it('description и prompt обязательны', () => {
    assert.equal(TaskArgs.safeParse({ description: 'Ревью', prompt: 'Прочитай файл' }).success, true);
    assert.equal(TaskArgs.safeParse({ prompt: 'Прочитай файл' }).success, false);
    assert.equal(TaskArgs.safeParse({ description: 'Ревью', prompt: '' }).success, false);
  });

  it('модель видит инструмент task с описаниями обоих полей', () => {
    const { toolbox } = setup([]);
    const spec = toolbox.specs()[0].function;
    assert.equal(spec.name, 'task');
    const properties = (spec.parameters as { properties: Record<string, { description?: string }> }).properties;
    assert.ok(properties.description.description, 'у description нет .describe()');
    assert.ok(properties.prompt.description, 'у prompt нет .describe()');
  });
});

describe('Шаг 2 / Step 2. Чистый контекст и только итоговый ответ', () => {
  it('ребёнок видит только свой system и prompt — ни задачи, ни истории родителя', async () => {
    const { child, toolbox } = setup([textReply('В math.ts одна функция: sum.')]);
    const parent = new ScriptedProvider([toolReply([task('Обзор math', 'Перечисли функции src/math.ts')]), textReply('Готово')]);
    const history: Message[] = [{ role: 'user', content: 'старый разговор' }, { role: 'assistant', content: 'старый ответ' }];
    await new Agent({ provider: parent, toolbox, system: PARENT }).run('Задача пользователя', history);

    assert.deepEqual(child.requests[0].messages, [
      { role: 'system', content: CHILD },
      { role: 'user', content: 'Перечисли функции src/math.ts' },
    ]);
  });

  it('у ребёнка свои инструменты, а родителю возвращается только ответ', async () => {
    const { child, toolbox } = setup([
      toolReply([{ name: 'read_file', args: { path: 'src/math.ts' } }]),
      textReply('Одна функция: sum.'),
    ]);
    const parent = new ScriptedProvider([toolReply([task('Обзор math', 'Перечисли функции', 'call_task')]), textReply('Готово')]);
    const run = await new Agent({ provider: parent, toolbox, system: PARENT }).run('Задача');

    assert.equal(run.stopReason, 'done');
    assert.deepEqual(child.requests[0].options.tools?.map((spec) => spec.function.name), ['list_files', 'read_file']);
    assert.deepEqual(toolMessages(parent.requests[1].messages), [
      { role: 'tool', tool_call_id: 'call_task', content: 'Одна функция: sum.' },
    ]);
    // Чтение файла осталось в истории ребёнка: родитель о нём не знает.
    assert.ok(!JSON.stringify(parent.requests[1].messages).includes('export function sum'));
    assert.equal(child.remaining, 0);
  });

  it('каждый вызов task — новый ребёнок с пустой историей', async () => {
    const { child, toolbox } = setup([textReply('первый'), textReply('второй')]);
    const parent = new ScriptedProvider([
      toolReply([task('Раз', 'Задание 1')]),
      toolReply([task('Два', 'Задание 2')]),
      textReply('Готово'),
    ]);
    await new Agent({ provider: parent, toolbox, system: PARENT }).run('Задача');
    assert.equal(child.requests[1].messages.length, 2);
    assert.equal(child.requests[1].messages[1].content, 'Задание 2');
  });
});

describe('Шаг 3 / Step 3. Лимиты ребёнка и как он остановился', () => {
  const run = (stopReason: AgentRun['stopReason'], answer: string): AgentRun => ({
    answer,
    stopReason,
    steps: 1,
    usage: { input: 0, output: 0 },
    messages: [],
  });

  it('done — ответ как есть; лимит — ответ с пометкой', () => {
    assert.equal(subagentResult(run('done', 'Нашёл два бага')), 'Нашёл два бага');
    const limited = subagentResult(run('max_steps', 'Успел прочитать один файл'));
    assert.match(limited, /max_steps/);
    assert.match(limited, /Успел прочитать один файл/);
  });

  it('error — исключение с текстом ошибки', () => {
    assert.throws(() => subagentResult(run('error', 'LLM API ответил 429')), /429/);
  });

  it('у ребёнка свои лимиты: maxSteps 2 — второй запрос уже без инструментов', async () => {
    const { child, toolbox } = setup(
      [toolReply([{ name: 'list_files' }]), textReply('Не успел, вот что знаю')],
      { limits: { maxSteps: 2 } },
    );
    const parent = new ScriptedProvider([toolReply([task('Обзор', 'Изучи всё', 'call_task')]), textReply('Готово')]);
    await new Agent({ provider: parent, toolbox, system: PARENT }).run('Задача');

    assert.equal(child.requests.length, 2);
    assert.equal(child.requests[1].options.toolChoice, 'none');
    const result = toolMessages(parent.requests[1].messages)[0].content;
    assert.match(result, /max_steps/);
    assert.match(result, /Не успел, вот что знаю/);
  });

  it('ребёнок упал — у родителя результат-ошибка, и родитель продолжает', async () => {
    const { toolbox } = setup([new Error('LLM API ответил 502')]);
    const parent = new ScriptedProvider([toolReply([task('Обзор', 'Изучи')]), textReply('Попробую иначе')]);
    const events: AgentEvent[] = [];
    const run = await new Agent({ provider: parent, toolbox, system: PARENT, onEvent: (e) => events.push(e) }).run('Задача');

    assert.equal(run.stopReason, 'done');
    const result = events.find((e) => e.type === 'tool_result');
    assert.ok(result && result.type === 'tool_result');
    assert.equal(result.result.isError, true);
    assert.match(result.result.content, /502/);
  });

  it('onRun получает итог ребёнка: токены и причину остановки', async () => {
    const runs: [string, AgentRun][] = [];
    const { toolbox } = setup([textReply('ok', { usage: { input: 120, output: 30 } })], {
      onRun: (run, description) => runs.push([description, run]),
    });
    const parent = new ScriptedProvider([toolReply([task('Обзор', 'Изучи')]), textReply('Готово')]);
    await new Agent({ provider: parent, toolbox, system: PARENT }).run('Задача');
    assert.equal(runs.length, 1);
    assert.equal(runs[0][0], 'Обзор');
    assert.deepEqual(runs[0][1].usage, { input: 120, output: 30 });
    assert.equal(runs[0][1].stopReason, 'done');
  });
});

describe('Шаг 4 / Step 4. События с префиксом и отмена', () => {
  it('onEvent ребёнка получает имя подзадачи', async () => {
    const seen: string[] = [];
    const { toolbox } = setup([toolReply([{ name: 'list_files' }]), textReply('ok')], {
      onEvent: (event, description) => seen.push(`${description}: ${event.type}`),
    });
    const parent = new ScriptedProvider([toolReply([task('Обзор math', 'Изучи')]), textReply('Готово')]);
    await new Agent({ provider: parent, toolbox, system: PARENT }).run('Задача');
    assert.deepEqual(seen, [
      'Обзор math: step',
      'Обзор math: assistant',
      'Обзор math: tool_call',
      'Обзор math: tool_result',
      'Обзор math: step',
      'Обзор math: assistant',
      'Обзор math: stop',
    ]);
  });

  it('childPrinter: каждая строка — с именем подзадачи', () => {
    const lines: string[] = [];
    const print = childPrinter((line) => lines.push(line));
    const call = { id: 'c1', name: 'read_file', arguments: '{"path":"src/math.ts"}' };
    print({ type: 'step', step: 1 }, 'Ревью math');
    print({ type: 'tool_call', call }, 'Ревью math');
    print({ type: 'tool_result', call, result: { content: 'export function sum', isError: false } }, 'Ревью math');
    print({ type: 'assistant', message: { role: 'assistant', content: 'Багов нет' }, usage: { input: 1, output: 1 } }, 'Ревью math');
    print({ type: 'stop', reason: 'done' }, 'Ревью math');

    assert.equal(lines.length, 4, 'step не печатается');
    assert.ok(lines.every((line) => line.includes('[Ревью math]')), lines.join('\n'));
    assert.match(lines[0], /→ read_file/);
    assert.match(lines[1], /✓ read_file/);
    assert.match(lines[2], /Багов нет/);
    assert.match(lines[3], /■ done/);
  });

  it('отмена родителя останавливает ребёнка посреди его инструмента', async () => {
    const controller = new AbortController();
    const slow: Tool<Record<string, never>> = {
      name: 'slow',
      description: 'Долго думает',
      schema: z.object({}),
      async run(_args, ctx) {
        await delay(5000, undefined, { signal: ctx.signal });
        return 'готово';
      },
    };
    const child = new ScriptedProvider([toolReply([{ name: 'slow' }]), textReply('не дойдём')]);
    const tool = taskTool({ provider: child, toolbox: new Toolbox().register(slow), system: CHILD });
    const parent = new ScriptedProvider([toolReply([task('Долго', 'Подумай')])]);
    const agent = new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT, signal: controller.signal });

    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    const run = await agent.run('Задача');

    assert.ok(Date.now() - started < 1000, 'ребёнок не получил сигнал родителя');
    assert.equal(run.stopReason, 'aborted');
    assert.equal(child.requests.length, 1, 'ребёнок не должен делать второй запрос');
    const result = toolMessages(run.messages)[0];
    assert.match(result.content, /Ошибка/);
  });
});
