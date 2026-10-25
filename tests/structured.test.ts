import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { z } from 'zod';
import { CommitSchema } from '../src/commit.ts';
import { chat, chatStream, LlmError, type LlmConfig, type Message, type ResponseFormat } from '../src/llm.ts';
import { askJson, jsonSchemaFormat, parseJson, StructuredOutputError } from '../src/structured.ts';

// Сеть не нужна: заглушка fetch отвечает по очереди заготовленными ответами
// и запоминает тело каждого запроса.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Body = Record<string, unknown> & { messages: Message[] };

function stubFetch(...replies: Response[]): Body[] {
  const sent: Body[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    sent.push(JSON.parse(String(init.body ?? '{}')));
    const reply = replies.shift();
    if (!reply) {
      throw new Error(`Заглушка: тест не ожидал ${sent.length}-го запроса`);
    }
    return reply;
  }) as typeof fetch;
  return sent;
}

function completion(content: string, finishReason = 'stop', input = 260, output = 30): Response {
  const body = {
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages: Message[] = [
  { role: 'system', content: 'Ты пишешь сообщения коммитов.' },
  { role: 'user', content: 'diff --git a/src/llm.ts b/src/llm.ts' },
];

const Review = z.object({
  verdict: z.enum(['approve', 'request_changes']),
  comments: z.array(z.string()),
});

const good = '{"type":"fix","scope":"llm","subject":"accept zero in Retry-After"}';
const tooLong = '{"type":"fix","scope":"llm","subject":"validate retry after seconds with Number.isFinite"}';
const fenced = '```json\n{"type":"fix","scope":"llm","subject":"accept zero in Retry-After"}\n```';

describe('Шаг 1 / Step 1. response_format в запросе', () => {
  const format: ResponseFormat = {
    type: 'json_schema',
    json_schema: { name: 'review', strict: true, schema: { type: 'object' } },
  };

  it('chat отправляет responseFormat как response_format, а без него поля нет', async () => {
    const sent = stubFetch(completion('{}'), completion('Привет'));
    await chat(config, messages, { responseFormat: format });
    await chat(config, messages);
    assert.deepEqual(sent[0].response_format, format);
    assert.equal('response_format' in sent[1], false, 'старые запросы не должны меняться');
  });

  it('chatStream тоже отправляет response_format', async () => {
    const sent = stubFetch(
      new Response('data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    await chatStream(config, messages, { responseFormat: { type: 'json_object' } }, () => {});
    assert.deepEqual(sent[0].response_format, { type: 'json_object' });
  });
});

describe('Шаг 2 / Step 2. jsonSchemaFormat: схема zod → response_format', () => {
  it('json_schema со strict и именем answer по умолчанию', () => {
    const format = jsonSchemaFormat(Review);
    assert.equal(format.type, 'json_schema');
    if (format.type !== 'json_schema') return;
    assert.equal(format.json_schema.name, 'answer');
    assert.equal(format.json_schema.strict, true);
  });

  it('имя можно передать', () => {
    const format = jsonSchemaFormat(Review, 'review');
    assert.equal(format.type === 'json_schema' && format.json_schema.name, 'review');
  });

  it('внутри — JSON Schema из zod, без поля $schema', () => {
    const format = jsonSchemaFormat(Review);
    assert.ok(format.type === 'json_schema');
    const schema = format.json_schema.schema;
    assert.equal('$schema' in schema, false);
    assert.equal(schema.type, 'object');
    assert.deepEqual(schema.required, ['verdict', 'comments']);
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual((schema.properties as Record<string, { enum?: string[] }>).verdict.enum, ['approve', 'request_changes']);
  });
});

describe('Шаг 3 / Step 3. parseJson: данные или понятная ошибка', () => {
  it('JSON по схеме → ok и данные', () => {
    assert.deepEqual(parseJson('{"verdict":"approve","comments":[]}', Review), {
      ok: true,
      data: { verdict: 'approve', comments: [] },
    });
  });

  it('JSON в ```-блоке — это не JSON', () => {
    const result = parseJson(fenced, CommitSchema);
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.problem, /^Ответ не JSON: /);
  });

  it('JSON не той формы → ошибка с путём к полю', () => {
    const result = parseJson('{"verdict":"maybe","comments":"нет"}', Review);
    assert.equal(result.ok, false);
    const problem = result.ok ? '' : result.problem;
    assert.match(problem, /verdict/);
    assert.match(problem, /comments/);
  });

  it('правила из refine тоже попадают в ошибку', () => {
    const result = parseJson(tooLong, CommitSchema);
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.problem, /длиннее 50 символов на 9/);
  });
});

describe('Шаг 4 / Step 4. askJson', () => {
  it('возвращает данные, попытки и usage', async () => {
    stubFetch(completion(good, 'stop', 262, 32));
    const result = await askJson(config, messages, CommitSchema);
    assert.deepEqual(result, {
      data: { type: 'fix', scope: 'llm', subject: 'accept zero in Retry-After' },
      attempts: 1,
      usage: { input: 262, output: 32 },
    });
  });

  it('отправляет response_format из схемы и опции chat', async () => {
    const sent = stubFetch(completion(good));
    await askJson(config, messages, CommitSchema, { name: 'commit', maxTokens: 200 });
    assert.deepEqual(sent[0].response_format, jsonSchemaFormat(CommitSchema, 'commit'));
    assert.equal(sent[0].max_tokens, 200);
    assert.deepEqual(sent[0].messages, messages);
  });

  it('ошибки API проходят насквозь как LlmError', async () => {
    stubFetch(new Response('{"error":{"code":"invalid_api_key"}}', { status: 401 }));
    await assert.rejects(askJson(config, messages, CommitSchema), (error: unknown) => error instanceof LlmError && error.status === 401);
  });
});

describe('Шаг 5 / Step 5. Одна попытка починки', () => {
  it('второй запрос несёт ответ модели и текст ошибки', async () => {
    const sent = stubFetch(completion(tooLong, 'stop', 262, 33), completion(good, 'stop', 330, 30));
    const result = await askJson(config, messages, CommitSchema);
    assert.equal(result.attempts, 2);
    assert.equal(result.data.subject, 'accept zero in Retry-After');
    assert.deepEqual(result.usage, { input: 592, output: 63 });

    assert.equal(sent.length, 2);
    const second = sent[1].messages;
    assert.deepEqual(second.slice(0, 2), messages);
    assert.deepEqual(second[2], { role: 'assistant', content: tooLong });
    assert.equal(second[3].role, 'user');
    assert.match(second[3].content, /длиннее 50 символов на 9/);
    assert.equal(second.length, 4);
  });

  it('исходный массив messages не меняется', async () => {
    const original = structuredClone(messages);
    stubFetch(completion(fenced), completion(good));
    await askJson(config, messages, CommitSchema);
    assert.deepEqual(messages, original);
  });

  it('onRepair получает ошибку и ответ модели', async () => {
    stubFetch(completion(fenced), completion(good));
    const calls: [string, string][] = [];
    await askJson(config, messages, CommitSchema, { onRepair: (problem, raw) => calls.push([problem, raw]) });
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /не JSON/);
    assert.equal(calls[0][1], fenced);
  });

  it('две неудачи → StructuredOutputError, третьего запроса нет', async () => {
    const sent = stubFetch(completion(fenced), completion(tooLong));
    await assert.rejects(askJson(config, messages, CommitSchema), (error: unknown) => {
      assert.ok(error instanceof StructuredOutputError, 'ожидали StructuredOutputError');
      assert.equal(error.attempts, 2);
      assert.equal(error.raw, tooLong);
      assert.match(error.problem, /длиннее 50 символов/);
      assert.match(error.message, /длиннее 50 символов/);
      return true;
    });
    assert.equal(sent.length, 2);
  });

  it('обрезанный ответ не чинят: сразу ошибка про maxTokens', async () => {
    const sent = stubFetch(completion('{"type":"fix","scope":"ll', 'length', 262, 10));
    await assert.rejects(askJson(config, messages, CommitSchema, { maxTokens: 10 }), (error: unknown) => {
      assert.ok(error instanceof StructuredOutputError, 'ожидали StructuredOutputError');
      assert.equal(error.attempts, 1);
      assert.match(error.message, /maxTokens/);
      return true;
    });
    assert.equal(sent.length, 1);
  });
});
