import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { Agent, FINAL_STEP_NOTE, MAX_REPEATS, RepeatGuard, type AgentEvent, type AgentOptions } from '../src/agent.ts';
import { calculator } from '../src/demo-tools.ts';
import { assistantMessage, LlmError, type ChatOptions, type ChatResult, type Message, type ToolCall } from '../src/llm.ts';
import type { Provider } from '../src/provider.ts';
import { Toolbox, type Tool } from '../src/tools.ts';

// Та же заглушка, что в тестах темы 4.1. Ответ может быть функцией: так тест вмешивается посреди шага.
type Reply = ChatResult | Error | ((options: ChatOptions) => ChatResult);

function fakeProvider(...replies: Reply[]) {
  const requests: { messages: Message[]; options: ChatOptions }[] = [];
  const provider: Provider = {
    async complete(messages, options) {
      requests.push({ messages: structuredClone(messages), options });
      const reply = replies.shift();
      if (!reply) {
        throw new Error('Заглушка: агент спросил модель больше раз, чем заготовлено ответов');
      }
      if (reply instanceof Error) {
        throw reply;
      }
      return typeof reply === 'function' ? reply(options) : reply;
    },
  };
  return { provider, requests };
}

function textReply(text: string, extra: Partial<ChatResult> = {}): ChatResult {
  return { text, finishReason: 'stop', truncated: false, usage: { input: 100, output: 10 }, toolCalls: [], message: assistantMessage(text, []), ...extra };
}

function toolReply(calls: ToolCall[], extra: Partial<ChatResult> = {}): ChatResult {
  return { text: '', finishReason: 'tool_calls', truncated: false, usage: { input: 100, output: 10 }, toolCalls: calls, message: assistantMessage(null, calls), ...extra };
}

let nextId = 0;
const calc = (expression: string): ToolCall => ({ id: `call_${++nextId}`, name: 'calculate', arguments: JSON.stringify({ expression }) });

// Калькулятор, который считает, сколько раз его действительно запустили.
function countingCalculator() {
  const runs: string[] = [];
  const tool: Tool = {
    ...calculator,
    async run(args, ctx) {
      runs.push(args.expression);
      return calculator.run(args, ctx);
    },
  };
  return { toolbox: new Toolbox().register(tool), runs };
}

const SYSTEM = 'Ты — агент. Считай только через calculate.';
function agent(provider: Provider, extra: Partial<AgentOptions> = {}) {
  return new Agent({ provider, toolbox: new Toolbox().register(calculator), system: SYSTEM, ...extra });
}

// После любой остановки история должна быть целой: за каждым tool_call — его сообщение tool.
function assertHistoryComplete(messages: Message[]) {
  const pending = new Set<string>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      assert.equal(pending.size, 0, `нет результатов для ${[...pending].join(', ')}`);
      message.tool_calls?.forEach((call) => pending.add(call.id));
    }
    if (message.role === 'tool') {
      assert.ok(pending.delete(message.tool_call_id), `лишний результат ${message.tool_call_id}`);
    }
  }
  assert.equal(pending.size, 0, `нет результатов для ${[...pending].join(', ')}`);
}

describe('Шаг 1 / Step 1. Лимит шагов и последний запрос без инструментов', () => {
  it('на последнем шаге — toolChoice none, инструменты в запросе остаются', async () => {
    const { provider, requests } = fakeProvider(
      toolReply([calc('100000 * 1.12')]),
      toolReply([calc('112000 * 1.12')]),
      textReply('Успел посчитать два года из шести.'),
    );
    const run = await agent(provider, { limits: { maxSteps: 3 } }).run('Посчитай вклад на шесть лет');

    assert.equal(requests.length, 3);
    assert.equal(requests[0].options.toolChoice, undefined, 'до последнего шага инструменты можно звать');
    assert.equal(requests[2].options.toolChoice, 'none');
    assert.equal(requests[2].options.tools?.length, 1, 'в истории есть вызовы — описания инструментов нужны модели');
    assert.equal(run.stopReason, 'max_steps');
    assert.equal(run.steps, 3);
    assert.equal(run.answer, 'Успел посчитать два года из шести.');
  });

  it('перед последним запросом модель получает FINAL_STEP_NOTE', async () => {
    const { provider, requests } = fakeProvider(toolReply([calc('1 + 1')]), textReply('Итог: 2'));
    const run = await agent(provider, { limits: { maxSteps: 2 } }).run('Считай');

    assert.deepEqual(requests[1].messages.at(-1), { role: 'user', content: FINAL_STEP_NOTE });
    assert.equal(requests[0].messages.some((m) => m.content === FINAL_STEP_NOTE), false);
    assert.deepEqual(run.messages.at(-2), { role: 'user', content: FINAL_STEP_NOTE });
  });

  it('позвала инструмент на последнем шаге — вызов не исполняется, но история целая', async () => {
    const { toolbox, runs } = countingCalculator();
    const { provider } = fakeProvider(toolReply([calc('1 + 1')]), toolReply([calc('2 + 2')]));
    const run = await new Agent({ provider, toolbox, system: SYSTEM, limits: { maxSteps: 2 } }).run('Считай');

    assert.equal(run.stopReason, 'max_steps');
    assert.deepEqual(runs, ['1 + 1']);
    assertHistoryComplete(run.messages);
    const last = run.messages.at(-1);
    assert.equal(last?.role, 'tool');
    assert.match(last?.content ?? '', /^Ошибка/);
  });

  it('уложилась в лимит — done и без toolChoice', async () => {
    const { provider, requests } = fakeProvider(toolReply([calc('1 + 1')]), textReply('2'));
    const run = await agent(provider, { limits: { maxSteps: 5 } }).run('1 + 1');
    assert.equal(run.stopReason, 'done');
    assert.ok(requests.every((request) => request.options.toolChoice === undefined));
  });
});

describe('Шаг 2 / Step 2. Бюджет токенов и обрезанный ответ', () => {
  it('бюджет кончился — следующий запрос не уходит', async () => {
    const usage = { input: 600, output: 50 };
    const { provider, requests } = fakeProvider(
      toolReply([calc('1 + 1')], { usage }),
      toolReply([calc('2 + 2')], { usage }),
      textReply('4', { usage }),
    );
    const run = await agent(provider, { limits: { maxTokens: 1000 } }).run('Считай');

    assert.equal(run.stopReason, 'budget');
    assert.equal(requests.length, 2, '650 < 1000 — второй запрос можно, 1300 ≥ 1000 — третий нельзя');
    assert.deepEqual(run.usage, { input: 1200, output: 100 });
    assertHistoryComplete(run.messages);
  });

  it('обрезанный вызов не исполняется', async () => {
    const { toolbox, runs } = countingCalculator();
    const cut: ToolCall = { id: 'call_cut', name: 'calculate', arguments: '{"expression": "100000 * 1.1' };
    const { provider, requests } = fakeProvider(toolReply([cut], { finishReason: 'length', truncated: true }));
    const run = await new Agent({ provider, toolbox, system: SYSTEM }).run('Считай');

    assert.equal(run.stopReason, 'truncated');
    assert.equal(requests.length, 1);
    assert.deepEqual(runs, []);
    assertHistoryComplete(run.messages);
  });

  it('обрезанный текст — truncated, а не done, и ответ — то, что успело прийти', async () => {
    const { provider } = fakeProvider(textReply('Сумма на конец первого года: 112 0', { finishReason: 'length', truncated: true }));
    const run = await agent(provider).run('Считай');
    assert.equal(run.stopReason, 'truncated');
    assert.equal(run.answer, 'Сумма на конец первого года: 112 0');
  });
});

describe('Шаг 3 / Step 3. Одинаковый вызов подряд', () => {
  const call = (name: string, args: string): ToolCall => ({ id: `call_${++nextId}`, name, arguments: args });

  it('RepeatGuard: true на MAX_REPEATS-м одинаковом вызове подряд', () => {
    assert.equal(MAX_REPEATS, 3);
    const guard = new RepeatGuard();
    assert.equal(guard.push(call('calculate', '{"expression": "1 + 1"}')), false);
    assert.equal(guard.push(call('calculate', '{"expression": "1 + 1"}')), false);
    assert.equal(guard.push(call('calculate', '{"expression": "1 + 1"}')), true);
  });

  it('RepeatGuard: другие аргументы или другой инструмент сбрасывают счёт', () => {
    const guard = new RepeatGuard(2);
    assert.equal(guard.push(call('calculate', '{"expression": "1 + 1"}')), false);
    assert.equal(guard.push(call('calculate', '{"expression": "2 + 2"}')), false);
    assert.equal(guard.push(call('get_current_time', '{"expression": "2 + 2"}')), false);
    assert.equal(guard.push(call('calculate', '{"expression": "2 + 2"}')), false);
  });

  it('RepeatGuard: пробелы в JSON не делают вызов новым', () => {
    const guard = new RepeatGuard(2);
    assert.equal(guard.push(call('calculate', '{"expression": "1 + 1"}')), false);
    assert.equal(guard.push(call('calculate', '{ "expression":"1 + 1" }')), true);
  });

  it('агент: третий одинаковый вызов не исполняется, причина — repeated_call', async () => {
    const { toolbox, runs } = countingCalculator();
    const { provider, requests } = fakeProvider(
      toolReply([calc('2 + 2')]),
      toolReply([calc('2 + 2')]),
      toolReply([calc('2 + 2')]),
      textReply('4'),
    );
    const run = await new Agent({ provider, toolbox, system: SYSTEM }).run('Считай');

    assert.equal(run.stopReason, 'repeated_call');
    assert.equal(requests.length, 3);
    assert.deepEqual(runs, ['2 + 2', '2 + 2']);
    assertHistoryComplete(run.messages);
  });

  it('агент: один инструмент с разными аргументами — это работа, а не зацикливание', async () => {
    const { provider } = fakeProvider(
      toolReply([calc('100000 * 1.12')]),
      toolReply([calc('112000 * 1.12')]),
      toolReply([calc('125440 * 1.12')]),
      textReply('140 492,80 ₽'),
    );
    const run = await agent(provider).run('Вклад на три года');
    assert.equal(run.stopReason, 'done');
  });
});

describe('Шаг 4 / Step 4. Отмена и ошибки провайдера', () => {
  it('отменили до старта — ни одного запроса', async () => {
    const controller = new AbortController();
    controller.abort();
    const events: AgentEvent[] = [];
    const { provider, requests } = fakeProvider(textReply('ok'));
    const run = await agent(provider, { signal: controller.signal, onEvent: (e) => events.push(e) }).run('ok?');

    assert.equal(run.stopReason, 'aborted');
    assert.equal(requests.length, 0);
    assert.deepEqual(events, [{ type: 'stop', reason: 'aborted' }]);
  });

  it('отмена во время инструментов: оставшиеся не запускаются, следующего запроса нет', async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const toolbox = new Toolbox().register({
      name: 'step',
      description: 'Шаг работы',
      schema: z.object({ n: z.number() }),
      async run({ n }) {
        started.push(String(n));
        if (n === 1) {
          controller.abort(); // человек нажал Ctrl+C, пока работал первый инструмент
        }
        return `шаг ${n} готов`;
      },
    });
    const calls: ToolCall[] = [1, 2, 3].map((n) => ({ id: `call_step_${n}`, name: 'step', arguments: JSON.stringify({ n }) }));
    const { provider, requests } = fakeProvider(toolReply(calls), textReply('готово'));
    const run = await new Agent({ provider, toolbox, system: SYSTEM, signal: controller.signal }).run('Работай');

    assert.equal(run.stopReason, 'aborted');
    assert.deepEqual(started, ['1']);
    assert.equal(requests.length, 1);
    assertHistoryComplete(run.messages);
  });

  it('отмена посреди запроса к модели — aborted, а не error', async () => {
    const controller = new AbortController();
    const { provider } = fakeProvider(() => {
      controller.abort();
      throw new LlmError('Запрос отменён', { code: 'aborted', retryable: false });
    });
    const run = await agent(provider, { signal: controller.signal }).run('ok?');
    assert.equal(run.stopReason, 'aborted');
  });

  it('провайдер упал — error, текст ошибки в answer, история и события на месте', async () => {
    const events: string[] = [];
    const { provider } = fakeProvider(
      toolReply([calc('1 + 1')]),
      new LlmError('LLM API ответил 429: daily_quota_exceeded', { status: 429, code: 'daily_quota_exceeded', retryable: false }),
    );
    const run = await agent(provider, { onEvent: (e) => events.push(e.type) }).run('Считай');

    assert.equal(run.stopReason, 'error');
    assert.match(run.answer, /daily_quota_exceeded/);
    assert.equal(run.steps, 2);
    assert.equal(run.messages.length, 3, 'задача, вызов и его результат остались в истории');
    assert.deepEqual(events.slice(-2), ['step', 'stop']);
  });
});
