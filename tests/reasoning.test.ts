import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Agent } from '../src/agent.ts';
import { answerWithEscalation, REASONING_MAX_TOKENS, withReasoning } from '../src/context/reasoning.ts';
import { calculator } from '../src/demo-tools.ts';
import { chat, chatStream, type LlmConfig, type Message } from '../src/llm.ts';
import { ScriptedProvider, textReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Заглушка fetch: запоминает тела запросов и отвечает заготовкой — JSON или SSE.
function stubFetch(reply: unknown, sse = false): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    bodies.push(JSON.parse(String(init.body ?? '{}')));
    const text = sse
      ? `data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`
      : JSON.stringify(reply);
    return new Response(text, { status: 200, headers: { 'Content-Type': sse ? 'text/event-stream' : 'application/json' } });
  }) as typeof fetch;
  return bodies;
}

// Ответ шлюза в том виде, в каком его присылает OpenRouter: с reasoning в сообщении и деталями usage.
function completion(content: string | null, extra: { reasoning?: string | null; reasoningTokens?: number; finish?: string; output?: number } = {}) {
  return {
    choices: [
      {
        message: { role: 'assistant', content, refusal: null, ...(extra.reasoning !== undefined ? { reasoning: extra.reasoning } : {}) },
        finish_reason: extra.finish ?? 'stop',
      },
    ],
    usage: {
      prompt_tokens: 28,
      completion_tokens: extra.output ?? 323,
      ...(extra.reasoningTokens !== undefined
        ? { completion_tokens_details: { reasoning_tokens: extra.reasoningTokens, image_tokens: 0 } }
        : {}),
    },
  };
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages: Message[] = [{ role: 'user', content: 'Сколько будет 17 * 23?' }];

describe('Шаг 1 / Step 1. reasoning в запросе', () => {
  it('chat отправляет объект reasoning как есть, а без опции поля нет', async () => {
    const bodies = stubFetch(completion('391'));
    await chat(config, messages, { reasoning: { enabled: true } });
    await chat(config, messages, { reasoning: { effort: 'high', exclude: true } });
    await chat(config, messages, { maxTokens: 50 });
    assert.deepEqual(bodies[0].reasoning, { enabled: true });
    assert.deepEqual(bodies[1].reasoning, { effort: 'high', exclude: true });
    // Без опции тело запроса такое же, как до этой темы.
    assert.deepEqual(Object.keys(bodies[2]), ['model', 'messages', 'temperature', 'max_tokens']);
  });

  it('chatStream тоже передаёт reasoning', async () => {
    const bodies = stubFetch({ choices: [{ delta: { content: '391' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }, true);
    await chatStream(config, messages, { reasoning: { effort: 'low' } }, () => {});
    assert.deepEqual(bodies[0].reasoning, { effort: 'low' });
  });
});

describe('Шаг 2 / Step 2. Рассуждения в ответе', () => {
  it('токены рассуждений — в usage.reasoning, текст — в result.reasoning, но не в историю', async () => {
    stubFetch(completion('391', { reasoning: 'Считаю: 17 * 20 = 340, 17 * 3 = 51…', reasoningTokens: 317 }));
    const result = await chat(config, messages, { reasoning: { enabled: true } });
    assert.equal(result.text, '391');
    assert.deepEqual(result.usage, { input: 28, output: 323, reasoning: 317 });
    assert.equal(result.reasoning, 'Считаю: 17 * 20 = 340, 17 * 3 = 51…');
    assert.deepEqual(result.message, { role: 'assistant', content: '391' });
  });

  it('рассуждений не было — ни usage.reasoning, ни result.reasoning', async () => {
    stubFetch(completion('17', { reasoning: 'немного', reasoningTokens: 5, output: 6 }));
    assert.equal((await chat(config, messages)).usage.reasoning, 5);

    stubFetch(completion('391', { reasoning: null, reasoningTokens: 0, output: 3 }));
    const result = await chat(config, messages);
    assert.deepEqual(result.usage, { input: 28, output: 3 });
    assert.ok(!('reasoning' in result));
  });

  it('мысли съели max_tokens: content null — текст пустой, ответ обрезан', async () => {
    stubFetch(completion(null, { reasoning: 'Нужно аккуратно…', reasoningTokens: 200, output: 200, finish: 'length' }));
    const result = await chat(config, messages, { reasoning: { enabled: true }, maxTokens: 200 });
    assert.equal(result.text, '');
    assert.equal(result.truncated, true);
    assert.equal(result.usage.reasoning, 200);
    assert.deepEqual(result.message, { role: 'assistant', content: '' });
  });
});

describe('Шаг 3 / Step 3. withReasoning', () => {
  it('добавляет reasoning и поднимает maxTokens, остальные опции не трогает', async () => {
    const inner = new ScriptedProvider([textReply('ок')]);
    const controller = new AbortController();
    await withReasoning(inner, { effort: 'low' }).complete(messages, { temperature: 0.2, signal: controller.signal });
    const options = inner.requests[0].options;
    assert.deepEqual(options.reasoning, { effort: 'low' });
    assert.equal(options.maxTokens, REASONING_MAX_TOKENS);
    assert.equal(options.temperature, 0.2);
    assert.equal(options.signal, controller.signal);
  });

  it('то, что вызывающий задал сам, важнее', async () => {
    const inner = new ScriptedProvider([textReply('ок')]);
    await withReasoning(inner, { effort: 'low' }).complete(messages, { reasoning: { effort: 'high' }, maxTokens: 300 });
    assert.deepEqual(inner.requests[0].options.reasoning, { effort: 'high' });
    assert.equal(inner.requests[0].options.maxTokens, 300);
  });

  it('агент с withReasoning: каждый шаг идёт с рассуждениями, сам Agent не менялся', async () => {
    const inner = new ScriptedProvider([textReply('391')]);
    const run = await new Agent({
      provider: withReasoning(inner, { enabled: true }),
      toolbox: new Toolbox().register(calculator),
      system: 'Ты — агент.',
    }).run('17 * 23');
    assert.equal(run.answer, '391');
    assert.deepEqual(inner.requests[0].options.reasoning, { enabled: true });
    assert.equal(inner.requests[0].options.tools?.length, 1);
  });
});

describe('Шаг 4 / Step 4. Рассуждения — только когда нужны', () => {
  const isNumber = (expected: string) => (result: { text: string }) => result.text.trim() === expected;

  it('ответ прошёл проверку — второго запроса нет', async () => {
    const provider = new ScriptedProvider([textReply('391', { usage: { input: 30, output: 3 } })]);
    const answer = await answerWithEscalation(provider, messages, { check: isNumber('391') });
    assert.equal(answer.escalated, false);
    assert.equal(answer.result.text, '391');
    assert.deepEqual(answer.usage, { input: 30, output: 3 });
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0].options.reasoning, undefined);
  });

  it('не прошёл — повтор с рассуждениями, usage — сумма двух запросов', async () => {
    const provider = new ScriptedProvider([
      textReply('381', { usage: { input: 30, output: 3 } }),
      textReply('391', { usage: { input: 30, output: 300, reasoning: 290 } }),
    ]);
    const answer = await answerWithEscalation(provider, messages, { check: isNumber('391'), options: { temperature: 0 } });
    assert.equal(answer.escalated, true);
    assert.equal(answer.result.text, '391');
    assert.deepEqual(answer.usage, { input: 60, output: 303, reasoning: 290 });
    assert.deepEqual(provider.requests[1].options.reasoning, { effort: 'medium' });
    assert.equal(provider.requests[1].options.temperature, 0);
    assert.equal(provider.requests[1].options.maxTokens, REASONING_MAX_TOKENS);
  });

  it('обрезанный ответ тоже повод повторить, даже если проверка прошла бы', async () => {
    const provider = new ScriptedProvider([textReply('391', { finishReason: 'length' }), textReply('391')]);
    const answer = await answerWithEscalation(provider, messages, { check: () => true, reasoning: { effort: 'low' } });
    assert.equal(answer.escalated, true);
    assert.deepEqual(provider.requests[1].options.reasoning, { effort: 'low' });
  });
});
