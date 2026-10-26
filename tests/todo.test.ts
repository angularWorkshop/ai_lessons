import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Agent, type AgentEvent } from '../src/agent.ts';
import type { ToolCall } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { renderTodos, TodoList, todoPrinter, todoWriteTool, type TodoItem } from '../src/todo/todo.ts';
import { Toolbox } from '../src/tools.ts';

const plan = (...items: [string, TodoItem['status']][]): TodoItem[] => items.map(([title, status]) => ({ title, status }));
const call = (todos: unknown): ToolCall => ({ id: 'call_todo', name: 'todo_write', arguments: JSON.stringify({ todos }) });

function setup() {
  const list = new TodoList();
  const toolbox = new Toolbox().register(todoWriteTool(list));
  return { list, toolbox };
}

describe('Шаг 1 / Step 1. План текстом', () => {
  it('каждый статус — своя метка, сверху — сколько готово', () => {
    const text = renderTodos(plan(['Прочитать src', 'done'], ['Написать тесты', 'in_progress'], ['Обновить README', 'pending']));
    assert.equal(text, 'План: 1 из 3 готово\n[x] Прочитать src\n[>] Написать тесты\n[ ] Обновить README');
  });

  it('порядок пунктов сохраняется', () => {
    const text = renderTodos(plan(['Б', 'pending'], ['А', 'pending']));
    assert.equal(text, 'План: 0 из 2 готово\n[ ] Б\n[ ] А');
  });
});

describe('Шаг 2 / Step 2. Схема: весь список и один пункт в работе', () => {
  it('два пункта in_progress — ошибка для модели, план не меняется', async () => {
    const { list, toolbox } = setup();
    const result = await toolbox.execute(call(plan(['А', 'in_progress'], ['Б', 'in_progress'])));
    assert.equal(result.isError, true);
    assert.match(result.content, /только один пункт/);
    assert.deepEqual(list.items, []);
  });

  it('неизвестный статус и пустой список — тоже ошибки', async () => {
    const { toolbox } = setup();
    const badStatus = await toolbox.execute(call([{ title: 'А', status: 'started' }]));
    const empty = await toolbox.execute(call([]));
    assert.match(badStatus.content, /не прошли проверку/);
    assert.match(empty.content, /не прошли проверку/);
  });

  it('модель видит в схеме три статуса', () => {
    const { toolbox } = setup();
    const spec = toolbox.specs()[0].function;
    assert.equal(spec.name, 'todo_write');
    assert.match(JSON.stringify(spec.parameters), /"enum":\["pending","in_progress","done"\]/);
  });
});

describe('Шаг 3 / Step 3. Инструмент todo_write', () => {
  it('сохраняет план и отвечает планом и подсказкой', async () => {
    const { list, toolbox } = setup();
    const result = await toolbox.execute(call(plan(['Тесты', 'in_progress'], ['README', 'pending'])));
    assert.equal(result.isError, false);
    assert.equal(list.items.length, 2);
    assert.ok(result.content.startsWith('План: 0 из 2 готово\n[>] Тесты\n[ ] README'), result.content);
    assert.match(result.content, /Сейчас в работе: «Тесты»/);
  });

  it('каждый вызов заменяет план целиком', async () => {
    const { list, toolbox } = setup();
    await toolbox.execute(call(plan(['А', 'pending'], ['Б', 'pending'], ['В', 'pending'])));
    await toolbox.execute(call(plan(['А', 'done'], ['В', 'in_progress'])));
    assert.deepEqual(list.items, plan(['А', 'done'], ['В', 'in_progress']));
    assert.deepEqual(list.unfinished.map((item) => item.title), ['В']);
  });

  it('подсказка зависит от состояния плана', async () => {
    const { toolbox } = setup();
    const idle = await toolbox.execute(call(plan(['А', 'done'], ['Б', 'pending'])));
    assert.match(idle.content, /Ни один пункт не в работе/);
    const finished = await toolbox.execute(call(plan(['А', 'done'], ['Б', 'done'])));
    assert.match(finished.content, /Все пункты готовы/);
  });

  it('в агенте: модель видит свой план в результате инструмента', async () => {
    const { list, toolbox } = setup();
    const provider = new ScriptedProvider([
      toolReply([{ name: 'todo_write', args: { todos: plan(['Шаг', 'in_progress']) } }]),
      toolReply([{ name: 'todo_write', args: { todos: plan(['Шаг', 'done']) } }]),
      textReply('Готово'),
    ]);
    const run = await new Agent({ provider, toolbox, system: 'Ты — агент.' }).run('Сделай');
    assert.equal(run.stopReason, 'done');
    assert.deepEqual(list.items, plan(['Шаг', 'done']));
    const lastTool = provider.requests[2].messages.at(-1);
    assert.equal(lastTool?.role, 'tool');
    assert.match(lastTool.content as string, /План: 1 из 1 готово\n\[x\] Шаг/);
  });
});

describe('Шаг 4 / Step 4. План в терминале', () => {
  function capture() {
    const lines: string[] = [];
    const passed: AgentEvent['type'][] = [];
    const onEvent = todoPrinter((event) => passed.push(event.type), (text) => lines.push(text));
    return { lines, passed, onEvent };
  }

  it('успешный todo_write печатается планом, а не JSON', async () => {
    const { lines, passed, onEvent } = capture();
    const { toolbox } = setup();
    const provider = new ScriptedProvider([
      toolReply([{ name: 'todo_write', args: { todos: plan(['Тесты', 'in_progress'], ['README', 'pending']) } }]),
      textReply('ok'),
    ]);
    await new Agent({ provider, toolbox, system: 'Ты — агент.', onEvent }).run('Сделай');
    assert.deepEqual(lines, ['План: 0 из 2 готово\n[>] Тесты\n[ ] README']);
    assert.ok(!passed.includes('tool_call') && !passed.includes('tool_result'), 'события todo_write не уходят в обычный вывод');
    assert.deepEqual(passed, ['step', 'assistant', 'step', 'assistant', 'stop']);
  });

  it('ошибка todo_write видна человеку', () => {
    const { lines, onEvent } = capture();
    const bad = call(plan(['А', 'in_progress'], ['Б', 'in_progress']));
    onEvent({ type: 'tool_call', call: bad });
    onEvent({ type: 'tool_result', call: bad, result: { content: 'Ошибка: только один пункт', isError: true } });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^✗ todo_write: Ошибка: только один пункт/);
  });

  it('остальные события уходят в обычный вывод без изменений', () => {
    const { lines, passed, onEvent } = capture();
    const other: ToolCall = { id: 'c1', name: 'read_file', arguments: '{"path":"a"}' };
    onEvent({ type: 'tool_call', call: other });
    onEvent({ type: 'tool_result', call: other, result: { content: 'x', isError: false } });
    assert.deepEqual(passed, ['tool_call', 'tool_result']);
    assert.deepEqual(lines, []);
  });
});
