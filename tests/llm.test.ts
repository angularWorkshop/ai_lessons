import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { chat, estimateCost, loadConfig, type LlmConfig, type Message } from '../src/llm.ts';

// Тесты не ходят в сеть: вместо настоящего fetch подставляем заглушку,
// которая запоминает запрос и возвращает заранее заготовленный ответ.
interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(status: number, payload: unknown): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init, body: JSON.parse(String(init.body ?? '{}')) });
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

function completion(content: string | null, finishReason = 'stop', usage = { prompt_tokens: 18, completion_tokens: 3 }) {
  return {
    id: 'gen-1',
    object: 'chat.completion',
    model: 'qwen/qwen3.7-flash',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
  };
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages: Message[] = [
  { role: 'system', content: 'Отвечай одним предложением.' },
  { role: 'user', content: 'Что такое event loop?' },
];

describe('Шаг 1 / Step 1. loadConfig', () => {
  it('читает три переменные окружения', () => {
    const result = loadConfig({ LLM_BASE_URL: 'https://api.edutec.it.com/llm/v1', LLM_API_KEY: 'edt_test', LLM_MODEL: 'qwen/qwen3.7-flash' });
    assert.deepEqual(result, { baseUrl: 'https://api.edutec.it.com/llm/v1', apiKey: 'edt_test', model: 'qwen/qwen3.7-flash' });
  });

  it('убирает слеш в конце адреса', () => {
    const result = loadConfig({ LLM_BASE_URL: 'https://api.example.com/v1/', LLM_API_KEY: 'k', LLM_MODEL: 'm' });
    assert.equal(result.baseUrl, 'https://api.example.com/v1');
  });

  it('падает с понятной ошибкой и называет пропущенную переменную', () => {
    assert.throws(() => loadConfig({ LLM_BASE_URL: 'https://api.example.com/v1', LLM_MODEL: 'm' }), /LLM_API_KEY/);
    assert.throws(() => loadConfig({ LLM_API_KEY: 'k', LLM_MODEL: 'm' }), /LLM_BASE_URL/);
  });

  it('пустая строка или пробелы — тоже пропуск', () => {
    assert.throws(() => loadConfig({ LLM_BASE_URL: 'https://api.example.com/v1', LLM_API_KEY: 'k', LLM_MODEL: '   ' }), /LLM_MODEL/);
  });
});

describe('Шаг 2 / Step 2. chat отправляет правильный запрос', () => {
  it('POST на <baseUrl>/chat/completions', async () => {
    const calls = stubFetch(200, completion('Привет'));
    await chat(config, messages);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://llm.test/v1/chat/completions');
    assert.equal(calls[0].init.method, 'POST');
  });

  it('передаёт ключ и тип содержимого в заголовках', async () => {
    const calls = stubFetch(200, completion('Привет'));
    await chat(config, messages);
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-key');
    assert.equal(headers.get('Content-Type'), 'application/json');
  });

  it('тело: model, messages, temperature 0 и max_tokens 1024 по умолчанию', async () => {
    const calls = stubFetch(200, completion('Привет'));
    await chat(config, messages);
    assert.deepEqual(calls[0].body, { model: 'test-model', messages, temperature: 0, max_tokens: 1024 });
  });

  it('опции перекрывают значения по умолчанию', async () => {
    const calls = stubFetch(200, completion('Привет'));
    await chat(config, messages, { temperature: 1.3, maxTokens: 8 });
    assert.equal(calls[0].body.temperature, 1.3);
    assert.equal(calls[0].body.max_tokens, 8);
  });
});

describe('Шаг 3 / Step 3. chat разбирает ответ', () => {
  it('возвращает текст, finish_reason и usage', async () => {
    stubFetch(200, completion('Привет', 'stop', { prompt_tokens: 18, completion_tokens: 3 }));
    const result = await chat(config, messages);
    // С темы 3.1 в результате есть ещё toolCalls и message — ответ, готовый лечь в историю.
    assert.deepEqual(result, {
      text: 'Привет',
      finishReason: 'stop',
      truncated: false,
      usage: { input: 18, output: 3 },
      toolCalls: [],
      message: { role: 'assistant', content: 'Привет' },
    });
  });

  it('finish_reason "length" — ответ обрезан', async () => {
    stubFetch(200, completion('Event loop — это механизм, который позволяет', 'length', { prompt_tokens: 32, completion_tokens: 8 }));
    const result = await chat(config, messages, { maxTokens: 8 });
    assert.equal(result.truncated, true);
    assert.equal(result.finishReason, 'length');
    assert.equal(result.usage.output, 8);
  });

  it('content: null превращается в пустую строку, а не в "null"', async () => {
    stubFetch(200, completion(null, 'length', { prompt_tokens: 30, completion_tokens: 8 }));
    const result = await chat(config, messages, { maxTokens: 8 });
    assert.equal(result.text, '');
    assert.equal(result.truncated, true);
  });
});

describe('Шаг 4 / Step 4. chat не прячет ошибки API', () => {
  it('401: бросает ошибку со статусом и текстом от провайдера', async () => {
    stubFetch(401, { error: { message: 'Missing Authentication header', code: 401 } });
    await assert.rejects(chat(config, messages), (error: Error) => {
      assert.match(error.message, /401/);
      assert.match(error.message, /Missing Authentication header/);
      return true;
    });
  });

  it('400 с неверной моделью: текст провайдера попадает в ошибку', async () => {
    stubFetch(400, { error: { message: 'no-such/model is not a valid model ID', code: 400 } });
    await assert.rejects(chat(config, messages), /400.*no-such\/model is not a valid model ID/s);
  });

  it('502 с телом не в JSON: всё равно понятная ошибка, а не SyntaxError', async () => {
    stubFetch(502, '<html>Bad Gateway</html>');
    // С темы 1.3 chat повторяет 502. Здесь важен только текст ошибки, поэтому одна попытка.
    await assert.rejects(chat(config, messages, { retries: 0 }), (error: Error) => {
      assert.ok(!(error instanceof SyntaxError), 'ошибка разбора JSON вместо ошибки API');
      assert.match(error.message, /502/);
      return true;
    });
  });
});

describe('Шаг 5 / Step 5. estimateCost', () => {
  const price = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

  it('считает вход и выход по разным ценам', () => {
    assert.equal(estimateCost({ input: 1_000_000, output: 0 }, price), 0.03);
    assert.equal(estimateCost({ input: 0, output: 1_000_000 }, price), 0.13);
  });

  it('складывает обе части', () => {
    const cost = estimateCost({ input: 32, output: 38 }, price);
    assert.ok(Math.abs(cost - 0.00000590) < 1e-12, `ожидали 0.0000059, получили ${cost}`);
  });

  it('для бесплатной модели — ноль', () => {
    assert.equal(estimateCost({ input: 5000, output: 500 }, { inputPerMillion: 0, outputPerMillion: 0 }), 0);
  });
});
