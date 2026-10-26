// Тема 15.1: каркас агента поддержки — клиент модели, инструменты, цикл.
// Тесты задают контракт из README, а не устройство кода внутри.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { llmProvider, loadConfig } from '../src/llm.ts';
import { createSupportAgent } from '../src/support-agent.ts';
import { freshData } from './support/data.ts';
import { ScriptedProvider, textReply, toolMessage, toolReply } from './support/scripted.ts';

const CONFIG = { baseUrl: 'https://llm.test/v1', apiKey: 'edt_test', model: 'test-model' };
const realFetch = globalThis.fetch;

interface SeenFetch {
  url: string;
  init: RequestInit;
  body: any;
}

// Заглушка fetch: отдаёт ответы по очереди и запоминает, что у неё просили.
function stubFetch(...responses: Response[]): SeenFetch[] {
  const seen: SeenFetch[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    seen.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    const response = responses.shift();
    if (!response) throw new Error('Заглушка fetch: запросов больше, чем ответов');
    return response;
  }) as typeof fetch;
  return seen;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const TOOL_CALL_RESPONSE = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'search_kb', arguments: '{"query":"возврат"}' } }],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: { prompt_tokens: 812, completion_tokens: 21 },
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Шаг 1 / Step 1. Клиент модели: llmProvider', () => {
  it('loadConfig читает LLM_BASE_URL, LLM_API_KEY и LLM_MODEL', () => {
    const config = loadConfig({ LLM_BASE_URL: 'https://llm.test/v1/', LLM_API_KEY: 'edt_1', LLM_MODEL: 'm' });
    assert.deepEqual(config, { baseUrl: 'https://llm.test/v1', apiKey: 'edt_1', model: 'm' });
    assert.throws(() => loadConfig({ LLM_BASE_URL: 'x', LLM_MODEL: 'm' }), /LLM_API_KEY/);
  });

  it('отправляет POST на /chat/completions с ключом, моделью, сообщениями и инструментами', async () => {
    const seen = stubFetch(json(TOOL_CALL_RESPONSE));
    const tools = [{ type: 'function' as const, function: { name: 'search_kb', description: 'поиск', parameters: { type: 'object' } } }];
    await llmProvider(CONFIG).complete([{ role: 'user', content: 'Как вернуть деньги?' }], { tools, toolChoice: 'auto' });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://llm.test/v1/chat/completions');
    assert.equal(seen[0].init.method, 'POST');
    assert.equal(new Headers(seen[0].init.headers).get('authorization'), 'Bearer edt_test');
    assert.equal(seen[0].body.model, 'test-model');
    assert.deepEqual(seen[0].body.messages, [{ role: 'user', content: 'Как вернуть деньги?' }]);
    assert.deepEqual(seen[0].body.tools, tools);
    assert.equal(seen[0].body.tool_choice, 'auto');
  });

  it('разбирает tool_calls и usage в ChatResult', async () => {
    stubFetch(json(TOOL_CALL_RESPONSE));
    const result = await llmProvider(CONFIG).complete([{ role: 'user', content: 'Как вернуть деньги?' }], {});

    assert.equal(result.text, '');
    assert.deepEqual(result.toolCalls, [{ id: 'call_a', name: 'search_kb', arguments: '{"query":"возврат"}' }]);
    assert.deepEqual(result.usage, { input: 812, output: 21 });
    assert.equal(result.message.role, 'assistant');
    assert.equal(result.message.tool_calls?.[0].id, 'call_a');
  });

  it('повторяет запрос после 429 с Retry-After', async () => {
    const seen = stubFetch(
      json({ error: { code: 'rate_limit_exceeded' } }, 429, { 'retry-after': '0' }),
      json({ choices: [{ message: { role: 'assistant', content: 'Готово' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 1 } }),
    );
    const result = await llmProvider(CONFIG).complete([{ role: 'user', content: 'привет' }], {});
    assert.equal(seen.length, 2);
    assert.equal(result.text, 'Готово');
  });

  it('не повторяет, когда дневная квота кончилась (x-should-retry: false)', async () => {
    const seen = stubFetch(json({ error: { code: 'daily_quota_exceeded' } }, 429, { 'x-should-retry': 'false' }));
    await assert.rejects(llmProvider(CONFIG).complete([{ role: 'user', content: 'привет' }], {}), /429/);
    assert.equal(seen.length, 1);
  });
});

describe('Шаг 2 / Step 2. Первый запрос и инструменты: ошибки — это данные', () => {
  it('первый запрос: system, потом вопрос клиента, и три инструмента со схемами', async () => {
    const provider = new ScriptedProvider([textReply('Ответ')]);
    await createSupportAgent({ provider, dataDir: freshData() }).run('Как вернуть деньги?');

    const [first] = provider.requests;
    assert.equal(first.messages[0].role, 'system');
    assert.ok(String(first.messages[0].content).length > 50, 'system prompt пустой или слишком короткий');
    assert.deepEqual(first.messages[1], { role: 'user', content: 'Как вернуть деньги?' });

    const tools = new Map(first.options.tools?.map((tool) => [tool.function.name, tool.function]));
    assert.deepEqual([...tools.keys()].sort(), ['create_ticket', 'read_article', 'search_kb']);
    for (const tool of tools.values()) {
      assert.equal(tool.parameters.type, 'object', `${tool.name}: параметры — объект`);
      assert.ok(tool.description.length > 10, `${tool.name}: у инструмента нет описания для модели`);
    }
    assert.deepEqual(tools.get('search_kb')!.parameters.required, ['query']);
    assert.deepEqual(tools.get('read_article')!.parameters.required, ['path']);
    assert.deepEqual([...tools.get('create_ticket')!.parameters.required].sort(), ['priority', 'summary']);
    assert.deepEqual([...tools.get('create_ticket')!.parameters.properties.priority.enum].sort(), ['normal', 'urgent']);
  });

  it('неизвестный инструмент — ошибка для модели со списком инструментов, цикл продолжается', async () => {
    const call = toolReply([{ name: 'delete_account', args: { email: 'a@b.ru' } }]);
    const provider = new ScriptedProvider([call, textReply('Не могу удалить аккаунт.')]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Удали мой аккаунт');

    const content = toolMessage(provider.requests[1], call.toolCalls[0].id);
    assert.match(content, /^Ошибка/);
    assert.match(content, /search_kb/);
    assert.equal(provider.requests.length, 2);
    assert.equal(result.stopReason, 'done');
  });

  it('сломанный JSON и неверные аргументы — тоже ошибка для модели, а не исключение', async () => {
    const broken = toolReply([{ name: 'search_kb', args: '{"query": "возврат' }]);
    const invalid = toolReply([{ name: 'create_ticket', args: { summary: 'Нужен человек', priority: 'asap' } }]);
    const provider = new ScriptedProvider([broken, invalid, textReply('Не получилось.')]);
    const dataDir = freshData();
    await createSupportAgent({ provider, dataDir }).run('Позовите человека');

    assert.match(toolMessage(provider.requests[1], broken.toolCalls[0].id), /^Ошибка.*JSON/s);
    assert.match(toolMessage(provider.requests[2], invalid.toolCalls[0].id), /^Ошибка.*priority/s);
  });
});

describe('Шаг 3 / Step 3. Цикл', () => {
  it('несколько вызовов за шаг: на каждый — свой результат, в порядке вызовов', async () => {
    const step = toolReply([
      { name: 'unknown_a', args: {} },
      { name: 'search_kb', args: '{oops' },
      { name: 'unknown_b', args: {} },
    ]);
    const provider = new ScriptedProvider([step, textReply('Готово')]);
    await createSupportAgent({ provider, dataDir: freshData() }).run('Вопрос');

    const second = provider.requests[1].messages;
    const assistantIndex = second.findIndex((message) => message.role === 'assistant');
    assert.deepEqual(second[assistantIndex].tool_calls?.map((call) => call.id), step.toolCalls.map((call) => call.id));
    const tools = second.slice(assistantIndex + 1);
    assert.deepEqual(
      tools.map((message) => [message.role, message.tool_call_id]),
      step.toolCalls.map((call) => ['tool', call.id]),
    );
  });

  it('цикл заканчивается на ответе текстом: шаги и usage сложены', async () => {
    const provider = new ScriptedProvider([
      toolReply([{ name: 'nope', args: {} }], { input: 300, output: 10 }),
      toolReply([{ name: 'nope', args: { again: true } }], { input: 450, output: 12 }),
      textReply('Готово', { input: 600, output: 40 }),
    ]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Вопрос');

    assert.equal(provider.remaining, 0);
    assert.equal(provider.requests.length, 3);
    assert.equal(result.stopReason, 'done');
    assert.equal(result.steps, 3);
    assert.deepEqual(result.usage, { input: 1350, output: 62 });
    assert.equal(typeof result.answer, 'string');
    assert.ok(Array.isArray(result.sources));
  });

  it('провайдер упал — run не бросает, stopReason: error', async () => {
    const provider = new ScriptedProvider([new Error('LLM API ответил 502: upstream error')]);
    const result = await createSupportAgent({ provider, dataDir: freshData() }).run('Вопрос');
    assert.equal(result.stopReason, 'error');
    assert.match(result.answer, /502/);
    assert.deepEqual(result.sources, []);
    assert.equal(result.ticket, undefined);
  });
});
