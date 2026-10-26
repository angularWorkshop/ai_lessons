import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { z } from 'zod';
import { Agent, type AgentEvent, type AgentOptions } from '../src/agent.ts';
import { calculator, currentTime } from '../src/demo-tools.ts';
import { assistantMessage, type ChatOptions, type ChatResult, type Message, type ToolCall } from '../src/llm.ts';
import { llmProvider, type Provider } from '../src/provider.ts';
import { Toolbox } from '../src/tools.ts';

// Провайдер-заглушка: отвечает заготовленными ответами по очереди и запоминает, что у него спросили.
// Сеть не нужна. В теме 4.3 такая заглушка станет частью проекта.
function fakeProvider(...replies: ChatResult[]) {
  const requests: { messages: Message[]; options: ChatOptions }[] = [];
  const provider: Provider = {
    async complete(messages, options) {
      requests.push({ messages: structuredClone(messages), options });
      const reply = replies.shift();
      if (!reply) {
        throw new Error('Заглушка: агент спросил модель больше раз, чем заготовлено ответов');
      }
      return reply;
    },
  };
  return { provider, requests };
}

function textReply(text: string, usage = { input: 100, output: 10 }): ChatResult {
  return { text, finishReason: 'stop', truncated: false, usage, toolCalls: [], message: assistantMessage(text, []) };
}

function toolReply(calls: ToolCall[], usage = { input: 100, output: 10 }): ChatResult {
  return { text: '', finishReason: 'tool_calls', truncated: false, usage, toolCalls: calls, message: assistantMessage(null, calls) };
}

const toolbox = () => new Toolbox().register(currentTime).register(calculator);
const SYSTEM = 'Ты — агент. Считай только через calculate.';
const agent = (provider: Provider, extra: Partial<AgentOptions> = {}) =>
  new Agent({ provider, toolbox: toolbox(), system: SYSTEM, ...extra });

const calc = (id: string, expression: string): ToolCall => ({ id, name: 'calculate', arguments: JSON.stringify({ expression }) });

describe('Шаг 1 / Step 1. llmProvider', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('complete() — это chat(): тот же запрос, тот же ChatResult', async () => {
    let body: Record<string, any> = {};
    globalThis.fetch = (async (_url: string | URL | Request, init: RequestInit = {}) => {
      body = JSON.parse(String(init.body));
      const reply = {
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '42' } }],
        usage: { prompt_tokens: 385, completion_tokens: 2 },
      };
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as typeof fetch;

    const provider = llmProvider({ baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' });
    const messages: Message[] = [{ role: 'user', content: '6 * 7' }];
    const result = await provider.complete(messages, { tools: toolbox().specs(), temperature: 0 });

    assert.equal(result.text, '42');
    assert.deepEqual(result.usage, { input: 385, output: 2 });
    assert.equal(body.model, 'test-model');
    assert.deepEqual(body.messages, messages);
    assert.equal(body.tools.length, 2);
  });
});

describe('Шаг 2 / Step 2. Ответ без инструментов', () => {
  it('один запрос: system первым, потом задача, в запросе — инструменты', async () => {
    const { provider, requests } = fakeProvider(textReply('Привет!'));
    const run = await agent(provider).run('Привет');

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].messages, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'Привет' },
    ]);
    assert.deepEqual(
      requests[0].options.tools?.map((tool) => tool.function.name),
      ['get_current_time', 'calculate'],
    );
    assert.equal(run.answer, 'Привет!');
    assert.equal(run.stopReason, 'done');
    assert.equal(run.steps, 1);
  });

  it('messages — история без system: задача и ответ', async () => {
    const { provider } = fakeProvider(textReply('Привет!'));
    const run = await agent(provider).run('Привет');
    assert.deepEqual(run.messages, [
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Привет!' },
    ]);
  });

  it('прошлая история идёт перед задачей, а массив вызывающего не меняется', async () => {
    const history: Message[] = [
      { role: 'user', content: 'Меня зовут Аня' },
      { role: 'assistant', content: 'Привет, Аня!' },
    ];
    const { provider, requests } = fakeProvider(textReply('Аня'));
    const run = await agent(provider).run('Как меня зовут?', history);

    assert.deepEqual(requests[0].messages.slice(1), [...history, { role: 'user', content: 'Как меня зовут?' }]);
    assert.equal(history.length, 2, 'история вызывающего не должна вырасти');
    assert.equal(run.messages.length, 4);
  });

  it('temperature доходит до провайдера', async () => {
    const { provider, requests } = fakeProvider(textReply('ok'));
    await agent(provider, { temperature: 0.7 }).run('ok?');
    assert.equal(requests[0].options.temperature, 0.7);
  });
});

describe('Шаг 3 / Step 3. Цикл с инструментами', () => {
  it('assistant с tool_calls → tool с тем же id → снова запрос', async () => {
    const call = calc('call_1', '12 * 3.5');
    const { provider, requests } = fakeProvider(toolReply([call]), textReply('Получится 42.'));
    const run = await agent(provider).run('12 умножь на 3,5');

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].messages, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: '12 умножь на 3,5' },
      assistantMessage(null, [call]),
      { role: 'tool', tool_call_id: 'call_1', content: '42' },
    ]);
    assert.equal(run.answer, 'Получится 42.');
    assert.equal(run.stopReason, 'done');
    assert.equal(run.steps, 2);
    assert.equal(run.messages.length, 4);
  });

  it('несколько шагов подряд, usage складывается', async () => {
    const { provider, requests } = fakeProvider(
      toolReply([{ id: 'call_1', name: 'get_current_time', arguments: '{"timezone": "Asia/Tokyo"}' }], { input: 517, output: 29 }),
      toolReply([calc('call_2', '24 * 60 - (6 * 60 + 5)')], { input: 587, output: 40 }),
      textReply('До полуночи 1075 минут.', { input: 653, output: 25 }),
    );
    const run = await agent(provider).run('Сколько минут до полуночи в Токио?');

    assert.equal(requests.length, 3);
    assert.equal(run.steps, 3);
    assert.deepEqual(run.usage, { input: 517 + 587 + 653, output: 29 + 40 + 25 });
    assert.deepEqual(
      run.messages.map((message) => message.role),
      ['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant'],
    );
    assert.deepEqual(run.messages[4], { role: 'tool', tool_call_id: 'call_2', content: '1075' });
  });

  it('ошибка инструмента не останавливает агента: модель получает её текстом', async () => {
    const { provider, requests } = fakeProvider(toolReply([calc('call_1', 'sqrt(144)')]), textReply('Корень — 12.'));
    const run = await agent(provider).run('Корень из 144');

    const tool = requests[1].messages[3];
    assert.equal(tool.role, 'tool');
    assert.match(tool.content ?? '', /^Ошибка/);
    assert.equal(run.stopReason, 'done');
  });

  it('signal из опций доходит до инструмента', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const box = new Toolbox().register({
      name: 'probe',
      description: 'Проверка',
      schema: z.object({}),
      async run(_args, ctx) {
        seen = ctx.signal;
        return 'ok';
      },
    });
    const { provider } = fakeProvider(toolReply([{ id: 'call_1', name: 'probe', arguments: '{}' }]), textReply('ok'));
    await new Agent({ provider, toolbox: box, system: SYSTEM, signal: controller.signal }).run('probe');
    assert.equal(seen, controller.signal);
  });
});

describe('Шаг 4 / Step 4. События и предохранитель', () => {
  it('события по порядку: step → assistant → tool_call → tool_result … → stop', async () => {
    const call = calc('call_1', '2 + 2');
    const events: AgentEvent[] = [];
    const { provider } = fakeProvider(toolReply([call]), textReply('4'));
    await agent(provider, { onEvent: (event) => events.push(event) }).run('2 + 2');

    assert.deepEqual(events, [
      { type: 'step', step: 1 },
      { type: 'assistant', message: assistantMessage(null, [call]), usage: { input: 100, output: 10 } },
      { type: 'tool_call', call },
      { type: 'tool_result', call, result: { content: '4', isError: false } },
      { type: 'step', step: 2 },
      { type: 'assistant', message: { role: 'assistant', content: '4' }, usage: { input: 100, output: 10 } },
      { type: 'stop', reason: 'done' },
    ]);
  });

  it('stop приходит ровно один раз и последним', async () => {
    const types: string[] = [];
    const { provider } = fakeProvider(textReply('ok'));
    await agent(provider, { onEvent: (event) => types.push(event.type) }).run('ok?');
    assert.deepEqual(types, ['step', 'assistant', 'stop']);
  });

  it('модель зовёт инструменты без конца — агент останавливается на maxSteps', async () => {
    const replies = Array.from({ length: 10 }, (_, i) => toolReply([calc(`call_${i}`, `${i} + 1`)]));
    const { provider, requests } = fakeProvider(...replies);
    const run = await agent(provider, { limits: { maxSteps: 3 } }).run('Считай до бесконечности');

    assert.equal(run.stopReason, 'max_steps');
    assert.equal(run.steps, 3);
    assert.equal(requests.length, 3);
  });
});
