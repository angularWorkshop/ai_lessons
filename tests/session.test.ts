import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { type LlmConfig, type Message } from '../src/llm.ts';
import { ChatSession } from '../src/session.ts';

// Как и в tests/llm.test.ts, сеть не нужна: fetch подменяем заглушкой.
// Заглушка отвечает по очереди заготовленными ответами и запоминает,
// какие messages пришли в каждом запросе.
interface Reply {
  status?: number;
  payload: unknown;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(...replies: Reply[]): Message[][] {
  const sent: Message[][] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body ?? '{}'));
    sent.push(body.messages);
    const reply = replies.shift();
    if (!reply) {
      throw new Error('Заглушка: запросов больше, чем заготовленных ответов');
    }
    const text = typeof reply.payload === 'string' ? reply.payload : JSON.stringify(reply.payload);
    return new Response(text, { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return sent;
}

function answer(content: string, input = 39, output = 30): Reply {
  return {
    payload: {
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
    },
  };
}

const rateLimited: Reply = { status: 429, payload: { error: { message: 'Rate limit exceeded', code: 429 } } };

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const SYSTEM = 'Ты помощник программиста. Отвечай кратко.';
const system: Message = { role: 'system', content: SYSTEM };

describe('Шаг 1 / Step 1. Конструктор и messages', () => {
  it('system — первое сообщение истории', () => {
    const session = new ChatSession(config, { system: SYSTEM });
    assert.deepEqual(session.messages, [system]);
  });

  it('без system история пустая', () => {
    const session = new ChatSession(config);
    assert.deepEqual(session.messages, []);
  });

  it('messages нельзя изменить снаружи', () => {
    const session = new ChatSession(config, { system: SYSTEM });
    const outside = session.messages as Message[];
    outside.push({ role: 'user', content: 'подброшено снаружи' });
    outside.length = 0;
    assert.deepEqual(session.messages, [system]);
  });
});

describe('Шаг 2 / Step 2. send отправляет всю историю', () => {
  it('первый запрос: system, затем вопрос', async () => {
    const sent = stubFetch(answer('Замыкание — функция, которая помнит переменные места создания.'));
    const session = new ChatSession(config, { system: SYSTEM });
    const result = await session.send('Что такое замыкание?');
    assert.equal(result.text, 'Замыкание — функция, которая помнит переменные места создания.');
    assert.deepEqual(sent[0], [system, { role: 'user', content: 'Что такое замыкание?' }]);
  });

  it('ответ модели попадает в историю с ролью assistant', async () => {
    stubFetch(answer('Замыкание — функция, которая помнит переменные места создания.'));
    const session = new ChatSession(config, { system: SYSTEM });
    await session.send('Что такое замыкание?');
    assert.deepEqual(session.messages, [
      system,
      { role: 'user', content: 'Что такое замыкание?' },
      { role: 'assistant', content: 'Замыкание — функция, которая помнит переменные места создания.' },
    ]);
  });

  it('каждый следующий запрос несёт всю историю', async () => {
    const sent = stubFetch(answer('Ответ 1'), answer('Ответ 2'), answer('Ответ 3'));
    const session = new ChatSession(config, { system: SYSTEM });
    await session.send('Вопрос 1');
    await session.send('Вопрос 2');
    await session.send('Вопрос 3');
    assert.equal(sent.length, 3);
    assert.deepEqual(sent[2], [
      system,
      { role: 'user', content: 'Вопрос 1' },
      { role: 'assistant', content: 'Ответ 1' },
      { role: 'user', content: 'Вопрос 2' },
      { role: 'assistant', content: 'Ответ 2' },
      { role: 'user', content: 'Вопрос 3' },
    ]);
  });

  it('без system первым идёт вопрос', async () => {
    const sent = stubFetch(answer('Привет'));
    const session = new ChatSession(config);
    await session.send('Скажи привет');
    assert.deepEqual(sent[0], [{ role: 'user', content: 'Скажи привет' }]);
  });

  it('temperature и maxTokens из options уходят в запрос', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(answer('Ок').payload), { status: 200 });
    }) as typeof fetch;
    const session = new ChatSession(config, { temperature: 0.7, maxTokens: 64 });
    await session.send('Вопрос');
    assert.equal(body.temperature, 0.7);
    assert.equal(body.max_tokens, 64);
  });
});

describe('Шаг 3 / Step 3. Ошибка не портит историю', () => {
  it('ошибка API доходит до вызывающего кода', async () => {
    stubFetch(rateLimited);
    const session = new ChatSession(config, { system: SYSTEM });
    await assert.rejects(session.send('Вопрос'), /429/);
  });

  it('после ошибки в истории нет повисшего вопроса', async () => {
    const sent = stubFetch(answer('Ответ 1'), rateLimited);
    const session = new ChatSession(config, { system: SYSTEM });
    await session.send('Вопрос 1');
    const before = session.messages;
    await assert.rejects(session.send('Потерянный вопрос'), /429/);
    assert.equal(sent.length, 2, 'запрос должен был уйти в API');
    assert.deepEqual(session.messages, before);
  });

  it('следующий запрос после ошибки уходит без потерянного вопроса', async () => {
    const sent = stubFetch(rateLimited, answer('Ответ'));
    const session = new ChatSession(config, { system: SYSTEM });
    await assert.rejects(session.send('Потерянный вопрос'), /429/);
    await session.send('Новый вопрос');
    assert.deepEqual(sent[1], [system, { role: 'user', content: 'Новый вопрос' }]);
  });
});

describe('Шаг 4 / Step 4. usage и cost копятся за сессию', () => {
  const price = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

  it('новая сессия: ноль токенов и ноль долларов', () => {
    const session = new ChatSession(config, { price });
    assert.deepEqual(session.usage, { input: 0, output: 0 });
    assert.equal(session.cost, 0);
  });

  it('usage складывается по всем запросам', async () => {
    stubFetch(answer('Ответ 1', 39, 30), answer('Ответ 2', 84, 57));
    const session = new ChatSession(config, { system: SYSTEM, price });
    await session.send('Вопрос 1');
    await session.send('Вопрос 2');
    assert.deepEqual(session.usage, { input: 123, output: 87 });
  });

  it('cost считается по накопленному usage', async () => {
    stubFetch(answer('Ответ 1', 39, 30), answer('Ответ 2', 84, 57));
    const session = new ChatSession(config, { price });
    await session.send('Вопрос 1');
    await session.send('Вопрос 2');
    const expected = (123 * 0.03 + 87 * 0.13) / 1_000_000;
    assert.ok(Math.abs((session.cost ?? NaN) - expected) < 1e-12, `ожидали ${expected}, получили ${session.cost}`);
  });

  it('без price cost равен undefined', async () => {
    stubFetch(answer('Ответ'));
    const session = new ChatSession(config);
    await session.send('Вопрос');
    assert.deepEqual(session.usage, { input: 39, output: 30 });
    assert.equal(session.cost, undefined);
  });

  it('упавший запрос не добавляет токенов', async () => {
    stubFetch(answer('Ответ', 39, 30), rateLimited);
    const session = new ChatSession(config, { price });
    await session.send('Вопрос');
    await assert.rejects(session.send('Ещё вопрос'), /429/);
    assert.deepEqual(session.usage, { input: 39, output: 30 });
  });
});

describe('Шаг 5 / Step 5. reset', () => {
  it('после reset в истории остаётся только system', async () => {
    stubFetch(answer('Ответ 1'), answer('Ответ 2'));
    const session = new ChatSession(config, { system: SYSTEM });
    await session.send('Вопрос 1');
    await session.send('Вопрос 2');
    session.reset();
    assert.deepEqual(session.messages, [system]);
  });

  it('без system reset очищает историю полностью', async () => {
    stubFetch(answer('Ответ'));
    const session = new ChatSession(config);
    await session.send('Вопрос');
    session.reset();
    assert.deepEqual(session.messages, []);
  });

  it('следующий запрос после reset не несёт старую историю', async () => {
    const sent = stubFetch(answer('Ответ 1'), answer('Ответ 2'));
    const session = new ChatSession(config, { system: SYSTEM });
    await session.send('Вопрос 1');
    session.reset();
    await session.send('Вопрос 2');
    assert.deepEqual(sent[1], [system, { role: 'user', content: 'Вопрос 2' }]);
  });

  it('reset не обнуляет потраченное: usage остаётся', async () => {
    stubFetch(answer('Ответ', 39, 30));
    const session = new ChatSession(config, { system: SYSTEM });
    await session.send('Вопрос');
    session.reset();
    assert.deepEqual(session.usage, { input: 39, output: 30 });
  });
});
