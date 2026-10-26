import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { chatStream, LineBuffer, LlmError, sseData, type LlmConfig, type Message } from '../src/llm.ts';

// Заглушка fetch для стрима: тело ответа — ReadableStream из заранее нарезанных кусков байтов.
// Куски режем в неудобных местах: посреди строки, посреди буквы. Настоящая сеть делает так же.
interface StreamReply {
  status?: number;
  body: Uint8Array[] | string;
  /** Не закрывать поток после последнего куска: сервер замолчал. */
  hang?: boolean;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(...replies: StreamReply[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), body: JSON.parse(String(init.body ?? '{}')) });
    const signal = init.signal ?? undefined;
    if (signal?.aborted) {
      throw signal.reason;
    }
    const reply = replies.shift();
    if (!reply) {
      throw new Error(`Тест не ожидал ${calls.length}-го запроса`);
    }
    if (typeof reply.body === 'string') {
      return new Response(reply.body, { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
    }
    const pieces = [...reply.body];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Как у настоящего fetch: отмена запроса обрывает и чтение тела.
        signal?.addEventListener('abort', () => controller.error(signal.reason));
      },
      pull(controller) {
        const piece = pieces.shift();
        if (piece) {
          controller.enqueue(piece);
        } else if (!reply.hang) {
          controller.close();
        }
        // hang: ничего не делаем — поток молчит, пока его не отменят.
      },
    });
    return new Response(body, { status: reply.status ?? 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof fetch;
  return calls;
}

// Настоящие чанки модели курса на «Скажи привет одним словом» (служебные поля сокращены).
const base = '"id":"gen-1792959390-oRkdReHHLVF5J5fDLeJw","object":"chat.completion.chunk","model":"qwen/qwen3.7-flash","provider":"Alibaba"';
const delta = (content: string, finish: string | null = null) =>
  `data: {${base},"choices":[{"index":0,"delta":{"content":${JSON.stringify(content)},"role":"assistant"},"finish_reason":${JSON.stringify(finish)}}]}\n\n`;
// Так последний чанк выглядит по спецификации OpenAI: choices пустой, есть только usage.
const usageOnly = (input: number, output: number) =>
  `data: {${base},"choices":[],"usage":{"prompt_tokens":${input},"completion_tokens":${output},"total_tokens":${input + output}}}\n\n`;
const DONE = 'data: [DONE]\n\n';

const hello = delta('Пр') + delta('ив') + delta('ет') + delta('', 'stop') + usageOnly(18, 3) + DONE;

const encoder = new TextEncoder();
// Весь текст одним куском.
const whole = (text: string) => [encoder.encode(text)];
// Режем байты каждые n штук — разрезы попадут и посреди строк, и посреди букв.
function cutEvery(text: string, n: number): Uint8Array[] {
  const bytes = encoder.encode(text);
  const pieces: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += n) {
    pieces.push(bytes.slice(i, i + n));
  }
  return pieces;
}

function fakeSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}

function collect() {
  const deltas: string[] = [];
  return { deltas, onDelta: (text: string) => void deltas.push(text) };
}

function isLlmError(check: (error: LlmError) => void) {
  return (error: unknown) => {
    assert.ok(error instanceof LlmError, `ожидали LlmError, получили ${(error as Error)?.name}: ${(error as Error)?.message}`);
    check(error);
    return true;
  };
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages: Message[] = [{ role: 'user', content: 'Скажи привет одним словом' }];

describe('Шаг 1 / Step 1. LineBuffer: целые строки из кусочков', () => {
  it('отдаёт строки, которые закончились \\n', () => {
    assert.deepEqual(new LineBuffer().push('data: 1\ndata: 2\n'), ['data: 1', 'data: 2']);
  });

  it('незаконченная строка ждёт продолжения', () => {
    const buffer = new LineBuffer();
    assert.deepEqual(buffer.push('data: {"content":"Пр'), []);
    assert.deepEqual(buffer.push('ив"}\nda'), ['data: {"content":"Прив"}']);
    assert.deepEqual(buffer.push('ta: [DONE]\n'), ['data: [DONE]']);
  });

  it('пустые строки — тоже строки: они разделяют события', () => {
    assert.deepEqual(new LineBuffer().push('data: 1\n\ndata: 2\n\n'), ['data: 1', '', 'data: 2', '']);
  });

  it('\\r\\n понимает так же, как \\n', () => {
    assert.deepEqual(new LineBuffer().push('data: 1\r\n\r\n'), ['data: 1', '']);
  });
});

describe('Шаг 2 / Step 2. sseData: что лежит в строке', () => {
  it('строка data: — возвращает то, что после двоеточия и пробела', () => {
    assert.equal(sseData('data: {"choices":[]}'), '{"choices":[]}');
    assert.equal(sseData('data: [DONE]'), '[DONE]');
  });

  it('пробел после двоеточия необязателен', () => {
    assert.equal(sseData('data:[DONE]'), '[DONE]');
  });

  it('пустая строка, комментарий и другие поля — undefined', () => {
    assert.equal(sseData(''), undefined);
    assert.equal(sseData(': OPENROUTER PROCESSING'), undefined);
    assert.equal(sseData('event: message'), undefined);
  });
});

describe('Шаг 3 / Step 3. chatStream собирает ответ', () => {
  it('просит стрим и usage в нём', async () => {
    const calls = stubFetch({ body: whole(hello) });
    await chatStream(config, messages, {}, () => {});
    assert.equal(calls[0].url, 'https://llm.test/v1/chat/completions');
    assert.equal(calls[0].body.stream, true);
    assert.deepEqual(calls[0].body.stream_options, { include_usage: true });
    assert.equal(calls[0].body.model, 'test-model');
    assert.equal(calls[0].body.max_tokens, 1024);
  });

  it('отдаёт кусочки в onDelta и возвращает полный ответ', async () => {
    stubFetch({ body: whole(hello) });
    const { deltas, onDelta } = collect();
    const result = await chatStream(config, messages, {}, onDelta);
    assert.deepEqual(deltas, ['Пр', 'ив', 'ет']);
    assert.deepEqual(result, { text: 'Привет', finishReason: 'stop', truncated: false, usage: { input: 18, output: 3 } });
  });

  it('последний чанк с choices: [] и usage не роняет разбор', async () => {
    stubFetch({ body: whole(delta('Привет', 'stop') + usageOnly(18, 3) + DONE) });
    const result = await chatStream(config, messages, {}, () => {});
    assert.equal(result.text, 'Привет');
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.usage, { input: 18, output: 3 });
  });

  it('строки, разрезанные между кусками сети, склеиваются', async () => {
    for (const size of [7, 50, 113]) {
      stubFetch({ body: cutEvery(hello, size) });
      const result = await chatStream(config, messages, {}, () => {});
      assert.equal(result.text, 'Привет', `куски по ${size} байт`);
      assert.deepEqual(result.usage, { input: 18, output: 3 }, `куски по ${size} байт`);
    }
  });

  it('буква, разрезанная пополам, не превращается в «�»', async () => {
    const bytes = encoder.encode(hello);
    // Первый байт буквы «П» — 0xD0, второй — 0x9F. Режем ровно между ними.
    const cut = bytes.indexOf(0xd0) + 1;
    stubFetch({ body: [bytes.slice(0, cut), bytes.slice(cut)] });
    const { deltas, onDelta } = collect();
    const result = await chatStream(config, messages, {}, onDelta);
    assert.equal(result.text, 'Привет');
    assert.ok(!deltas.join('').includes('�'), `в тексте появился «�»: ${JSON.stringify(deltas)}`);
  });

  it('по байту за раз — тоже работает', async () => {
    stubFetch({ body: cutEvery(hello, 1) });
    const result = await chatStream(config, messages, {}, () => {});
    assert.equal(result.text, 'Привет');
  });

  it('комментарии «: OPENROUTER PROCESSING» пропускает', async () => {
    stubFetch({ body: whole(': OPENROUTER PROCESSING\n\n' + delta('Привет') + ': OPENROUTER PROCESSING\n\n' + delta('', 'stop') + usageOnly(18, 3) + DONE) });
    const result = await chatStream(config, messages, {}, () => {});
    assert.equal(result.text, 'Привет');
  });

  it('finish_reason "length" — ответ обрезан', async () => {
    stubFetch({ body: whole(delta('Event loop — это') + delta(' механизм', 'length') + usageOnly(19, 8) + DONE) });
    const result = await chatStream(config, messages, { maxTokens: 8 }, () => {});
    assert.equal(result.truncated, true);
    assert.equal(result.finishReason, 'length');
  });

  it('нет чанка с usage — нули', async () => {
    stubFetch({ body: whole(delta('Привет', 'stop') + DONE) });
    const result = await chatStream(config, messages, {}, () => {});
    assert.deepEqual(result.usage, { input: 0, output: 0 });
  });
});

describe('Шаг 4 / Step 4. chatStream и ошибки', () => {
  it('401 до начала стрима: LlmError, без повторов, onDelta не вызывался', async () => {
    const calls = stubFetch({ status: 401, body: '{"error":{"message":"Токен EduTec LLM не передан, неверен или истёк.","type":"authentication_error","code":"invalid_api_key"}}' });
    const { deltas, onDelta } = collect();
    const { sleep } = fakeSleep();
    await assert.rejects(
      chatStream(config, messages, { sleep }, onDelta),
      isLlmError((error) => {
        assert.equal(error.status, 401);
        assert.equal(error.code, 'invalid_api_key');
      }),
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(deltas, []);
  });

  it('502 до начала стрима повторяется, как в chat', async () => {
    const calls = stubFetch(
      { status: 502, body: '{"error":{"message":"Провайдер модели не ответил.","type":"api_error","code":"upstream_error"}}' },
      { body: whole(hello) },
    );
    const { sleep, delays } = fakeSleep();
    const result = await chatStream(config, messages, { sleep }, () => {});
    assert.equal(result.text, 'Привет');
    assert.equal(calls.length, 2);
    assert.deepEqual(delays, [1000]);
  });

  it('поток закрылся без [DONE] — LlmError stream_interrupted, а не обрезанный ответ как полный', async () => {
    const calls = stubFetch({ body: whole(delta('Пр') + delta('ив')) });
    const { deltas, onDelta } = collect();
    await assert.rejects(chatStream(config, messages, {}, onDelta), isLlmError((error) => assert.equal(error.code, 'stream_interrupted')));
    assert.deepEqual(deltas, ['Пр', 'ив']);
    assert.equal(calls.length, 1, 'после начала стрима не повторяем: текст напечатался бы дважды');
  });

  it('сервер замолчал посреди ответа — LlmError timeout, без повтора', async () => {
    const calls = stubFetch({ body: whole(delta('Пр')), hang: true });
    const { deltas, onDelta } = collect();
    await assert.rejects(chatStream(config, messages, { timeoutMs: 30 }, onDelta), isLlmError((error) => assert.equal(error.code, 'timeout')));
    assert.deepEqual(deltas, ['Пр']);
    assert.equal(calls.length, 1);
  });

  it('таймаут — это тишина, а не длина ответа: медленный, но живой стрим доходит до конца', async () => {
    const pieces = cutEvery(hello, 200);
    const slow = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const piece = pieces.shift();
        if (piece) {
          controller.enqueue(piece);
        } else {
          controller.close();
        }
      },
    });
    globalThis.fetch = (async () => new Response(slow, { status: 200 })) as typeof fetch;
    // Весь ответ идёт дольше 30 мс, но пауза между кусками — всего 10.
    const result = await chatStream(config, messages, { timeoutMs: 30 }, () => {});
    assert.equal(result.text, 'Привет');
  });

  it('Ctrl+C посреди ответа — LlmError aborted', async () => {
    stubFetch({ body: whole(delta('Пр')), hang: true });
    const controller = new AbortController();
    await assert.rejects(
      chatStream(config, messages, { signal: controller.signal }, () => controller.abort()),
      isLlmError((error) => assert.equal(error.code, 'aborted')),
    );
  });
});
