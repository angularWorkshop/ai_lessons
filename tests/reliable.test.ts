import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { chat, errorFromResponse, LlmError, retryDelay, type LlmConfig, type Message } from '../src/llm.ts';

// Заглушка fetch с очередью ответов: каждый вызов забирает следующий.
// Ответ — либо Response, либо ошибка, которую бросит fetch, либо 'hang' — «сервер молчит», пока запрос не отменят.
type Reply = Response | Error | 'hang';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(...replies: Reply[]): { count: number; signals: (AbortSignal | undefined)[] } {
  const calls = { count: 0, signals: [] as (AbortSignal | undefined)[] };
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    calls.count++;
    const signal = init.signal ?? undefined;
    calls.signals.push(signal);
    // Как настоящий fetch: уже отменённый запрос даже не начинается.
    if (signal?.aborted) {
      throw signal.reason;
    }
    const reply = replies.shift();
    if (!reply) {
      throw new Error(`Тест не ожидал ${calls.count}-го запроса`);
    }
    if (reply === 'hang') {
      if (!signal) {
        throw new Error('chat не передал signal в fetch: такой запрос нельзя ни отменить, ни ограничить по времени');
      }
      // Настоящий запрос держит процесс открытым сокетом, заглушка — таймером.
      // Без него Node 20 решит, что делать больше нечего, и завершит тест раньше таймаута.
      const keepAlive = setInterval(() => {}, 1000);
      return new Promise<Response>((_, reject) =>
        signal.addEventListener('abort', () => {
          clearInterval(keepAlive);
          reject(signal.reason);
        }),
      );
    }
    if (reply instanceof Error) {
      throw reply;
    }
    return reply;
  }) as typeof fetch;
  return calls;
}

// Пауза без ожидания: только запоминает, сколько попросили подождать.
function fakeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function gatewayError(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return json(status, { error: { message, type: 'api_error', code } }, headers);
}

const ok = () =>
  json(200, {
    choices: [{ index: 0, message: { role: 'assistant', content: 'Привет' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 18, completion_tokens: 3 },
  });
const invalidKey = () => gatewayError(401, 'invalid_api_key', 'Токен EduTec LLM не передан, неверен или истёк. Перезапустите упражнение на платформе.');
const rateLimited = (headers: Record<string, string> = {}) =>
  gatewayError(429, 'rate_limit_exceeded', 'Слишком много запросов. Подождите немного и повторите.', headers);
const dailyQuota = () =>
  gatewayError(429, 'daily_quota_exceeded', 'Дневной лимит токенов исчерпан. Лимит обновится в 00:00 UTC.', { 'x-should-retry': 'false' });
const upstream = () => gatewayError(502, 'upstream_error', 'Провайдер модели не ответил. Повторите запрос позже.');

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages: Message[] = [{ role: 'user', content: 'Скажи привет одним словом' }];

function isLlmError(check: (error: LlmError) => void) {
  return (error: unknown) => {
    assert.ok(error instanceof LlmError, `ожидали LlmError, получили ${(error as Error)?.name}: ${(error as Error)?.message}`);
    check(error);
    return true;
  };
}

describe('Шаг 1 / Step 1. errorFromResponse: что за ошибка и стоит ли повторять', () => {
  it('401 invalid_api_key: статус, код, текст сервера, не повторяем', async () => {
    const error = await errorFromResponse(invalidKey());
    assert.ok(error instanceof LlmError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'invalid_api_key');
    assert.equal(error.retryable, false);
    assert.match(error.message, /401.*Перезапустите упражнение/s);
  });

  it('400 и 403 не повторяем: тот же запрос получит тот же ответ', async () => {
    const badRequest = await errorFromResponse(gatewayError(400, 'invalid_request', 'Некорректный запрос'));
    const denied = await errorFromResponse(gatewayError(403, 'course_access_denied', 'Модель доступна только тем, кому открыт курс'));
    assert.equal(badRequest.retryable, false);
    assert.equal(denied.retryable, false);
    assert.equal(denied.code, 'course_access_denied');
  });

  it('429 rate_limit_exceeded и 502 — повторяем', async () => {
    const limited = await errorFromResponse(rateLimited());
    const failed = await errorFromResponse(upstream());
    assert.equal(limited.retryable, true);
    assert.equal(limited.code, 'rate_limit_exceeded');
    assert.equal(failed.retryable, true);
    assert.equal(failed.status, 502);
  });

  it('429 daily_quota_exceeded — не повторяем: лимит кончился до завтра', async () => {
    const error = await errorFromResponse(dailyQuota());
    assert.equal(error.status, 429);
    assert.equal(error.code, 'daily_quota_exceeded');
    assert.equal(error.retryable, false);
  });

  it('заголовок x-should-retry: false запрещает повтор, даже если код незнакомый', async () => {
    const error = await errorFromResponse(gatewayError(429, 'some_other_limit', 'Лимит', { 'x-should-retry': 'false' }));
    assert.equal(error.retryable, false);
  });

  it('503 с HTML вместо JSON: повторяем, код пустой, текст сохранён', async () => {
    const error = await errorFromResponse(new Response('<html>Service Unavailable</html>', { status: 503 }));
    assert.equal(error.retryable, true);
    assert.equal(error.code, undefined);
    assert.match(error.message, /503.*Service Unavailable/s);
  });

  it('Retry-After в секундах превращается в retryAfterMs', async () => {
    const error = await errorFromResponse(rateLimited({ 'Retry-After': '7' }));
    assert.equal(error.retryAfterMs, 7000);
  });

  it('без Retry-After — retryAfterMs нет', async () => {
    const error = await errorFromResponse(upstream());
    assert.equal(error.retryAfterMs, undefined);
  });
});

describe('Шаг 2 / Step 2. Таймаут, отмена и сеть внутри одной попытки', () => {
  it('chat бросает LlmError и при ошибке статуса', async () => {
    stubFetch(invalidKey());
    await assert.rejects(chat(config, messages, { retries: 0 }), isLlmError((error) => assert.equal(error.status, 401)));
  });

  it('сервер молчит дольше timeoutMs — LlmError timeout, его можно повторить', async () => {
    stubFetch('hang');
    await assert.rejects(
      chat(config, messages, { timeoutMs: 20, retries: 0 }),
      isLlmError((error) => {
        assert.equal(error.code, 'timeout');
        assert.equal(error.retryable, true);
        assert.equal(error.status, undefined);
        assert.match(error.message, /20/);
      }),
    );
  });

  it('внешний signal отменяет запрос — LlmError aborted, не повторяем', async () => {
    stubFetch('hang');
    const controller = new AbortController();
    const pending = chat(config, messages, { signal: controller.signal, retries: 0 });
    controller.abort();
    await assert.rejects(
      pending,
      isLlmError((error) => {
        assert.equal(error.code, 'aborted');
        assert.equal(error.retryable, false);
      }),
    );
  });

  it('нет сети (TypeError: fetch failed) — LlmError network_error с причиной', async () => {
    stubFetch(new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.edutec.it.com'), { code: 'ENOTFOUND' }) }));
    await assert.rejects(
      chat(config, messages, { retries: 0 }),
      isLlmError((error) => {
        assert.equal(error.code, 'network_error');
        assert.equal(error.retryable, true);
        assert.match(error.message, /ENOTFOUND/);
      }),
    );
  });

  it('успешный ответ по-прежнему разбирается', async () => {
    const calls = stubFetch(ok());
    const result = await chat(config, messages, { retries: 0 });
    assert.equal(result.text, 'Привет');
    assert.ok(calls.signals[0] instanceof AbortSignal, 'fetch должен получить signal');
  });
});

describe('Шаг 3 / Step 3. retryDelay: сколько ждать перед повтором', () => {
  it('экспонента: 1 с, 2 с, 4 с', () => {
    assert.deepEqual([0, 1, 2].map((attempt) => retryDelay(attempt)), [1000, 2000, 4000]);
  });

  it('не больше 30 секунд', () => {
    assert.equal(retryDelay(10), 30_000);
  });

  it('если сервер прислал Retry-After — ждём столько, сколько он сказал', () => {
    assert.equal(retryDelay(0, 7000), 7000);
    assert.equal(retryDelay(2, 0), 0);
  });
});

describe('Шаг 4 / Step 4. Повторы в chat', () => {
  it('502, 502, 200: три попытки, паузы 1 и 2 секунды, ответ получен', async () => {
    const calls = stubFetch(upstream(), upstream(), ok());
    const { sleep, delays } = fakeSleep();
    const result = await chat(config, messages, { sleep });
    assert.equal(result.text, 'Привет');
    assert.equal(calls.count, 3);
    assert.deepEqual(delays, [1000, 2000]);
  });

  it('429 с Retry-After: 3 — ждём 3 секунды', async () => {
    stubFetch(rateLimited({ 'Retry-After': '3' }), ok());
    const { sleep, delays } = fakeSleep();
    await chat(config, messages, { sleep });
    assert.deepEqual(delays, [3000]);
  });

  it('таймаут и обрыв сети тоже повторяются', async () => {
    const calls = stubFetch('hang', new TypeError('fetch failed'), ok());
    const { sleep } = fakeSleep();
    const result = await chat(config, messages, { sleep, timeoutMs: 20 });
    assert.equal(result.text, 'Привет');
    assert.equal(calls.count, 3);
  });

  it('попытки кончились — наружу последняя ошибка', async () => {
    const calls = stubFetch(upstream(), upstream(), upstream());
    const { sleep, delays } = fakeSleep();
    await assert.rejects(chat(config, messages, { sleep }), isLlmError((error) => assert.equal(error.status, 502)));
    assert.equal(calls.count, 3);
    assert.deepEqual(delays, [1000, 2000]);
  });

  it('retries: 0 — ровно одна попытка', async () => {
    const calls = stubFetch(upstream());
    const { sleep, delays } = fakeSleep();
    await assert.rejects(chat(config, messages, { sleep, retries: 0 }), isLlmError((error) => assert.equal(error.status, 502)));
    assert.equal(calls.count, 1);
    assert.deepEqual(delays, []);
  });

  it('401 и daily_quota_exceeded — одна попытка, без пауз', async () => {
    for (const reply of [invalidKey(), dailyQuota()]) {
      const calls = stubFetch(reply);
      const { sleep, delays } = fakeSleep();
      await assert.rejects(chat(config, messages, { sleep }), isLlmError((error) => assert.equal(error.retryable, false)));
      assert.equal(calls.count, 1);
      assert.deepEqual(delays, []);
    }
  });

  it('отмена посреди запроса не повторяется', async () => {
    const calls = stubFetch('hang', ok());
    const { sleep, delays } = fakeSleep();
    const controller = new AbortController();
    const pending = chat(config, messages, { sleep, signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, isLlmError((error) => assert.equal(error.code, 'aborted')));
    assert.equal(calls.count, 1);
    assert.deepEqual(delays, []);
  });

  it('отмена во время паузы: следующая попытка не начинается', async () => {
    const calls = stubFetch(upstream(), ok());
    const controller = new AbortController();
    const sleep = async () => controller.abort();
    await assert.rejects(
      chat(config, messages, { sleep, signal: controller.signal }),
      isLlmError((error) => assert.equal(error.code, 'aborted')),
    );
    assert.ok(calls.count <= 2);
  });
});
