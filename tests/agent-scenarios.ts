// Твои тесты агента. Каждый сценарий получает фабрику агента и падает, если агент ведёт себя неправильно.
// tests/agent-scenarios.test.ts запустит каждый сценарий дважды: на настоящем Agent (должен пройти)
// и на сломанных агентах из tests/support/broken-agent.ts (должен упасть).
import assert from 'node:assert/strict';
import type { AgentOptions, AgentRun } from '../src/agent.ts';
import { calculator } from '../src/demo-tools.ts';
import type { Message } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

export type MakeAgent = (options: AgentOptions) => { run(task: string, history?: Message[]): Promise<AgentRun> };

const SYSTEM = 'Ты — агент. Считай только через calculate.';
const toolbox = () => new Toolbox().register(calculator);
const calc = (expression: string) => toolReply([{ name: 'calculate', args: { expression } }]);

// Шаг 3: порядок сообщений. Ловит агента без system, без результатов, с чужим id и с результатами не на месте.
export async function historyOrder(makeAgent: MakeAgent): Promise<void> {
  const call = calc('12 * 3.5');
  const provider = new ScriptedProvider([call, textReply('Получится 42.')]);
  const run = await makeAgent({ provider, toolbox: toolbox(), system: SYSTEM }).run('12 умножь на 3,5');

  assert.equal(run.stopReason, 'done', run.answer);
  assert.equal(run.answer, 'Получится 42.');
  assert.equal(provider.requests.length, 2);
  assert.deepEqual(provider.requests[1].messages, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: '12 умножь на 3,5' },
    call.message,
    { role: 'tool', tool_call_id: call.toolCalls[0].id, content: '42' },
  ]);
}

// Шаг 3: лимит шагов. Ловит агента без лимита и агента, который обрывает работу без итога.
export async function stepLimit(makeAgent: MakeAgent): Promise<void> {
  const provider = new ScriptedProvider([calc('1 + 1'), calc('2 + 2'), textReply('Успел посчитать 1 + 1 и 2 + 2.')]);
  const run = await makeAgent({ provider, toolbox: toolbox(), system: SYSTEM, limits: { maxSteps: 3 } }).run('Считай');

  assert.equal(run.stopReason, 'max_steps', run.answer);
  assert.equal(run.answer, 'Успел посчитать 1 + 1 и 2 + 2.');
  assert.equal(provider.requests.length, 3);
  assert.equal(provider.requests[2].options.toolChoice, 'none');
  assert.equal(provider.remaining, 0);
}

// Шаг 4: зацикливание. Ловит агента без защиты и агента, который путает повтор с работой.
export async function repeatedCall(makeAgent: MakeAgent): Promise<void> {
  const looping = new ScriptedProvider([calc('2 + 2'), calc('2 + 2'), calc('2 + 2'), textReply('4')]);
  const stuck = await makeAgent({ provider: looping, toolbox: toolbox(), system: SYSTEM }).run('Сколько будет 2 + 2?');
  assert.equal(stuck.stopReason, 'repeated_call', stuck.answer);
  assert.equal(looping.requests.length, 3);

  const working = new ScriptedProvider([calc('100000 * 1.12'), calc('112000 * 1.12'), calc('125440 * 1.12'), textReply('140 492,80 ₽')]);
  const done = await makeAgent({ provider: working, toolbox: toolbox(), system: SYSTEM }).run('Вклад на три года');
  assert.equal(done.stopReason, 'done', done.answer);
  assert.equal(working.remaining, 0);
}

// Шаг 4: обрезанный ответ. Ловит агента, который исполняет обрезанный вызов, и агента, который ломает историю.
export async function truncatedReply(makeAgent: MakeAgent): Promise<void> {
  const cut = toolReply([{ name: 'calculate', args: '{"expression": "100000 * 1.1' }], { finishReason: 'length' });
  const provider = new ScriptedProvider([cut, textReply('Этот ответ агент не должен запросить.')]);
  const run = await makeAgent({ provider, toolbox: toolbox(), system: SYSTEM }).run('Считай');

  assert.equal(run.stopReason, 'truncated', run.answer);
  assert.equal(provider.requests.length, 1);
  const last = run.messages.at(-1);
  assert.ok(last?.role === 'tool', 'за обрезанным вызовом в истории должен идти его результат');
  assert.equal(last.tool_call_id, cut.toolCalls[0].id);
}
