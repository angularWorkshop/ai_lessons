import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { z } from 'zod';
import { Agent, FINAL_STEP_NOTE } from '../src/agent.ts';
import { calculator, currentTime } from '../src/demo-tools.ts';
import { LlmError, type ChatOptions, type Message } from '../src/llm.ts';
import { llmProvider, type Provider } from '../src/provider.ts';
import {
  ANTHROPIC_VERSION,
  anthropicProvider,
  fromAnthropicResponse,
  toAnthropicMessages,
  toAnthropicRequest,
  type AnthropicResponse,
} from '../src/providers/anthropic.ts';
import { Toolbox, type Tool } from '../src/tools.ts';

// Ключа к Anthropic у нас нет, поэтому адаптер проверяем на примерах из документации:
// platform.claude.com/docs — «Handle tool calls», «Stop reasons», «Prompt caching», «Errors».

/** «Handle tool calls»: ответ модели с блоком tool_use. usage в этом примере документация не показывает. */
const DOCS_TOOL_USE: AnthropicResponse = {
  id: 'msg_01Aq9w938a90dw8q',
  role: 'assistant',
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: "I'll check the current weather in San Francisco for you." },
    { type: 'tool_use', id: 'toolu_01A09q90qw90lq917835lq9', name: 'get_weather', input: { location: 'San Francisco, CA', unit: 'celsius' } },
  ],
};

/** «Stop reasons»: обычный ответ текстом. */
const DOCS_END_TURN: AnthropicResponse = {
  id: 'msg_01234',
  role: 'assistant',
  content: [{ type: 'text', text: "Here's the answer to your question..." }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 50 },
};

const weather: Tool<{ location: string; unit?: 'celsius' | 'fahrenheit' }> = {
  name: 'get_weather',
  description: 'Get the current weather in a given location',
  schema: z.object({ location: z.string(), unit: z.enum(['celsius', 'fahrenheit']).optional() }),
  async run() {
    return '15 degrees';
  },
};

// История агента после одного вызова — в нашем формате.
const weatherHistory: Message[] = [
  { role: 'system', content: 'You are a weather assistant.' },
  { role: 'user', content: "What's the weather like in San Francisco?" },
  {
    role: 'assistant',
    content: "I'll check the current weather in San Francisco for you.",
    tool_calls: [
      {
        id: 'toolu_01A09q90qw90lq917835lq9',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"San Francisco, CA","unit":"celsius"}' },
      },
    ],
  },
  { role: 'tool', tool_call_id: 'toolu_01A09q90qw90lq917835lq9', content: '15 degrees' },
];

describe('Шаг 1 / Step 1. История → формат Anthropic', () => {
  it('system уходит в отдельное поле, в messages его нет', () => {
    const { system, messages } = toAnthropicMessages([
      { role: 'system', content: 'Отвечай коротко.' },
      { role: 'user', content: 'Привет' },
    ]);
    assert.equal(system, 'Отвечай коротко.');
    assert.deepEqual(messages, [{ role: 'user', content: 'Привет' }]);
  });

  it('без system поля system нет вовсе', () => {
    const result = toAnthropicMessages([{ role: 'user', content: 'Привет' }]);
    assert.equal('system' in result, false);
  });

  it('вызов и результат — блоки tool_use и tool_result, как в документации', () => {
    const { messages } = toAnthropicMessages(weatherHistory);
    assert.deepEqual(messages, [
      { role: 'user', content: "What's the weather like in San Francisco?" },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: "I'll check the current weather in San Francisco for you." },
          { type: 'tool_use', id: 'toolu_01A09q90qw90lq917835lq9', name: 'get_weather', input: { location: 'San Francisco, CA', unit: 'celsius' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01A09q90qw90lq917835lq9', content: '15 degrees' }] },
    ]);
  });

  it('вызов без текста — только tool_use, пустого text-блока нет', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: '2 + 2' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculate', arguments: '{"expression":"2 + 2"}' } }] },
    ]);
    assert.deepEqual(messages[1].content, [{ type: 'tool_use', id: 'call_1', name: 'calculate', input: { expression: '2 + 2' } }]);
  });

  it('результаты нескольких вызовов — одно сообщение user, по блоку на вызов, в том же порядке', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: 'Время в Москве и Токио' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_a', type: 'function', function: { name: 'get_current_time', arguments: '{"timezone":"Europe/Moscow"}' } },
          { id: 'call_b', type: 'function', function: { name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_a', content: '00:06' },
      { role: 'tool', tool_call_id: 'call_b', content: '06:06' },
    ]);
    assert.equal(messages.length, 3);
    assert.deepEqual(messages[2], {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_a', content: '00:06' },
        { type: 'tool_result', tool_use_id: 'call_b', content: '06:06' },
      ],
    });
  });

  it('текст после результатов (последний шаг агента) — в том же user, после tool_result', () => {
    const { messages } = toAnthropicMessages([...weatherHistory, { role: 'user', content: FINAL_STEP_NOTE }]);
    assert.equal(messages.length, 3);
    assert.deepEqual(messages[2].content, [
      { type: 'tool_result', tool_use_id: 'toolu_01A09q90qw90lq917835lq9', content: '15 degrees' },
      { type: 'text', text: FINAL_STEP_NOTE },
    ]);
  });

  it('кривые аргументы из истории не роняют перевод: input — пустой объект', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: 'Посчитай' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_x', type: 'function', function: { name: 'calculate', arguments: '{"expression": "2 +' } }] },
      { role: 'tool', tool_call_id: 'call_x', content: 'Ошибка: аргументы calculate — не JSON' },
    ]);
    assert.deepEqual(messages[1].content, [{ type: 'tool_use', id: 'call_x', name: 'calculate', input: {} }]);
  });

  it('ответ модели текстом остаётся строкой', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Привет! Чем помочь?' },
      { role: 'user', content: 'Ничем' },
    ]);
    assert.deepEqual(messages, [
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Привет! Чем помочь?' },
      { role: 'user', content: 'Ничем' },
    ]);
  });
});

describe('Шаг 2 / Step 2. Тело запроса', () => {
  const tools = new Toolbox().register(weather).specs();

  it('инструменты: parameters → input_schema, без обёртки function', () => {
    const request = toAnthropicRequest('claude-opus-5-5', weatherHistory, { tools });
    assert.deepEqual(request.tools, [
      { name: 'get_weather', description: 'Get the current weather in a given location', input_schema: tools[0].function.parameters },
    ]);
    assert.equal(request.model, 'claude-opus-5-5');
    assert.equal(request.system, 'You are a weather assistant.');
  });

  it('max_tokens обязателен: по умолчанию 1024, иначе из maxTokens', () => {
    assert.equal(toAnthropicRequest('m', weatherHistory).max_tokens, 1024);
    assert.equal(toAnthropicRequest('m', weatherHistory, { maxTokens: 300 }).max_tokens, 300);
  });

  it('temperature не отправляется: в версии 2026-10-21 его нет', () => {
    const request = toAnthropicRequest('m', weatherHistory, { temperature: 0 });
    assert.equal('temperature' in request, false);
  });

  it('toolChoice: auto → auto, none → none, required → any', () => {
    const choice = (toolChoice: ChatOptions['toolChoice']) => toAnthropicRequest('m', weatherHistory, { tools, toolChoice }).tool_choice;
    assert.deepEqual(choice('auto'), { type: 'auto' });
    assert.deepEqual(choice('none'), { type: 'none' });
    assert.deepEqual(choice('required'), { type: 'any' });
    assert.equal(choice(undefined), undefined);
  });

  it('без инструментов нет ни tools, ни tool_choice', () => {
    const request = toAnthropicRequest('m', [{ role: 'user', content: 'Привет' }], { tools: [], toolChoice: 'none' });
    assert.equal('tools' in request, false);
    assert.equal('tool_choice' in request, false);
  });

  it('json_schema → output_config.format, json_object — понятная ошибка', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const request = toAnthropicRequest('m', weatherHistory, { responseFormat: { type: 'json_schema', json_schema: { name: 'r', schema } } });
    assert.deepEqual(request.output_config, { format: { type: 'json_schema', schema } });
    assert.throws(() => toAnthropicRequest('m', weatherHistory, { responseFormat: { type: 'json_object' } }), /json_schema/);
  });
});

describe('Шаг 3 / Step 3. Ответ Anthropic → ChatResult', () => {
  it('tool_use из документации: текст, вызов со строкой arguments, finishReason tool_calls', () => {
    const result = fromAnthropicResponse(DOCS_TOOL_USE);
    assert.equal(result.text, "I'll check the current weather in San Francisco for you.");
    assert.equal(result.finishReason, 'tool_calls');
    assert.equal(result.truncated, false);
    assert.deepEqual(result.toolCalls, [
      { id: 'toolu_01A09q90qw90lq917835lq9', name: 'get_weather', arguments: '{"location":"San Francisco, CA","unit":"celsius"}' },
    ]);
    assert.deepEqual(result.usage, { input: 0, output: 0 });
  });

  it('message готов лечь в нашу историю: content и tool_calls', () => {
    assert.deepEqual(fromAnthropicResponse(DOCS_TOOL_USE).message, weatherHistory[2]);
  });

  it('end_turn → stop, usage → input/output', () => {
    const result = fromAnthropicResponse(DOCS_END_TURN);
    assert.equal(result.text, "Here's the answer to your question...");
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.toolCalls, []);
    assert.deepEqual(result.message, { role: 'assistant', content: "Here's the answer to your question..." });
    assert.deepEqual(result.usage, { input: 100, output: 50 });
  });

  it('max_tokens и model_context_window_exceeded — обрезанный ответ', () => {
    for (const stop_reason of ['max_tokens', 'model_context_window_exceeded']) {
      const result = fromAnthropicResponse({ ...DOCS_END_TURN, stop_reason });
      assert.equal(result.finishReason, 'length', stop_reason);
      assert.equal(result.truncated, true, stop_reason);
    }
  });

  it('refusal → content_filter, незнакомая причина проходит как есть', () => {
    assert.equal(fromAnthropicResponse({ ...DOCS_END_TURN, stop_reason: 'refusal' }).finishReason, 'content_filter');
    assert.equal(fromAnthropicResponse({ ...DOCS_END_TURN, stop_reason: 'pause_turn' }).finishReason, 'pause_turn');
  });

  it('input — весь вход: input_tokens + запись в кеш + чтение из кеша («Prompt caching»)', () => {
    const result = fromAnthropicResponse({
      ...DOCS_END_TURN,
      usage: { input_tokens: 2048, cache_read_input_tokens: 1800, cache_creation_input_tokens: 248, output_tokens: 503 },
    });
    assert.equal(result.usage.input, 4096);
    assert.equal(result.usage.output, 503);
  });

  it('блоки, которых адаптер не знает (thinking), пропускаются', () => {
    const data = {
      ...DOCS_END_TURN,
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }, ...DOCS_END_TURN.content],
    } as unknown as AnthropicResponse;
    assert.equal(fromAnthropicResponse(data).text, "Here's the answer to your question...");
  });
});

// ---------- Провайдер и агент поверх него ----------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, any>;
}

function stubFetch(...replies: { status: number; body: unknown; headers?: Record<string, string> }[]): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    const reply = replies.shift();
    if (!reply) {
      throw new Error('Заглушка fetch: запросов больше, чем заготовлено ответов');
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json', ...reply.headers } });
  }) as typeof fetch;
  return calls;
}

const config = { baseUrl: 'https://api.anthropic.test/v1', apiKey: 'sk-ant-test', model: 'claude-opus-5-5' };
const noSleep = { sleep: async () => {} };

describe('Шаг 4 / Step 4. anthropicProvider', () => {
  it('POST <baseUrl>/messages с x-api-key и anthropic-version', async () => {
    const calls = stubFetch({ status: 200, body: DOCS_END_TURN });
    const result = await anthropicProvider(config).complete([{ role: 'user', content: 'Привет' }], {});

    assert.equal(calls[0].url, 'https://api.anthropic.test/v1/messages');
    assert.equal(calls[0].headers.get('x-api-key'), 'sk-ant-test');
    assert.equal(calls[0].headers.get('anthropic-version'), ANTHROPIC_VERSION);
    assert.equal(calls[0].headers.get('Authorization'), null);
    assert.deepEqual(calls[0].body, { model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user', content: 'Привет' }] });
    assert.equal(result.text, "Here's the answer to your question...");
  });

  it('529 overloaded_error — повторяемая ошибка: второй запрос проходит', async () => {
    const overloaded = { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' }, request_id: 'req_011CSHoEeqs5C35K2UUqR7Fy' };
    const calls = stubFetch({ status: 529, body: overloaded }, { status: 200, body: DOCS_END_TURN });
    const result = await anthropicProvider(config).complete([{ role: 'user', content: 'Привет' }], noSleep);
    assert.equal(calls.length, 2);
    assert.equal(result.finishReason, 'stop');
  });

  it('400 не повторяется, код — invalid_request_error', async () => {
    const invalid = { type: 'error', error: { type: 'invalid_request_error', message: 'temperature: Extra inputs are not permitted' } };
    const calls = stubFetch({ status: 400, body: invalid });
    await assert.rejects(anthropicProvider(config).complete([{ role: 'user', content: 'Привет' }], noSleep), (error: unknown) => {
      assert.ok(error instanceof LlmError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'invalid_request_error');
      assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(calls.length, 1);
  });
});

describe('Шаг 4 / Step 4. Тот же Agent поверх любого Provider', () => {
  // Второй ответ модели в документации не показан — его текст наш.
  const FINAL = 'It is 15 degrees Celsius in San Francisco right now.';
  const task = "What's the weather like in San Francisco?";
  const makeAgent = (provider: Provider) =>
    new Agent({ provider, toolbox: new Toolbox().register(weather), system: 'You are a weather assistant.' });

  it('агент проходит цикл tool_use → tool_result → end_turn, второй запрос — как в документации', async () => {
    const calls = stubFetch(
      { status: 200, body: { ...DOCS_TOOL_USE, usage: { input_tokens: 400, output_tokens: 60 } } },
      { status: 200, body: { ...DOCS_END_TURN, content: [{ type: 'text', text: FINAL }], usage: { input_tokens: 480, output_tokens: 15 } } },
    );
    const run = await makeAgent(anthropicProvider(config)).run(task);

    assert.equal(run.stopReason, 'done');
    assert.equal(run.answer, FINAL);
    assert.deepEqual(run.usage, { input: 880, output: 75 });
    assert.equal(calls[1].body.system, 'You are a weather assistant.');
    assert.deepEqual(calls[1].body.messages, [
      { role: 'user', content: task },
      { role: 'assistant', content: DOCS_TOOL_USE.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01A09q90qw90lq917835lq9', content: '15 degrees' }] },
    ]);
    assert.deepEqual(calls[1].body.tool_choice, undefined);
    assert.equal(calls[1].body.tools[0].name, 'get_weather');
  });

  it('та же задача через llmProvider (Chat Completions) даёт ту же историю', async () => {
    // Anthropic
    stubFetch({ status: 200, body: DOCS_TOOL_USE }, { status: 200, body: { ...DOCS_END_TURN, content: [{ type: 'text', text: FINAL }] } });
    const viaAnthropic = await makeAgent(anthropicProvider(config)).run(task);

    // Chat Completions: те же ответы модели в формате OpenAI.
    stubFetch(
      {
        status: 200,
        body: {
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: "I'll check the current weather in San Francisco for you.",
                tool_calls: [
                  {
                    index: 0,
                    id: 'toolu_01A09q90qw90lq917835lq9',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '{"location":"San Francisco, CA","unit":"celsius"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0 },
        },
      },
      {
        status: 200,
        body: { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: FINAL } }], usage: { prompt_tokens: 0, completion_tokens: 0 } },
      },
    );
    const viaOpenAi = await makeAgent(llmProvider({ baseUrl: 'https://llm.test/v1', apiKey: 'k', model: 'm' })).run(task);

    assert.deepEqual(viaAnthropic.messages, viaOpenAi.messages);
    assert.equal(viaAnthropic.stopReason, viaOpenAi.stopReason);
  });

  it('последний шаг агента: tool_choice none и FINAL_STEP_NOTE после результатов', async () => {
    const calc = (id: string): AnthropicResponse => ({
      id: `msg_${id}`,
      role: 'assistant',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id, name: 'calculate', input: { expression: '2 + 2' } }],
    });
    const calls = stubFetch({ status: 200, body: calc('toolu_1') }, { status: 200, body: { ...DOCS_END_TURN, content: [{ type: 'text', text: '4' }] } });
    const agent = new Agent({
      provider: anthropicProvider(config),
      toolbox: new Toolbox().register(currentTime).register(calculator),
      system: 'Считай через calculate.',
      limits: { maxSteps: 2 },
    });
    const run = await agent.run('2 + 2');

    assert.equal(run.stopReason, 'max_steps');
    assert.deepEqual(calls[1].body.tool_choice, { type: 'none' });
    assert.deepEqual(calls[1].body.messages.at(-1), {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: '4' },
        { type: 'text', text: FINAL_STEP_NOTE },
      ],
    });
  });
});
