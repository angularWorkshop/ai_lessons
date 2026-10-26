import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Agent } from '../src/agent.ts';
import { calculator } from '../src/demo-tools.ts';
import { chat, chatStream, estimateCost, type LlmConfig, type Price } from '../src/llm.ts';
import { anthropicProvider, fromAnthropicResponse, toAnthropicRequest, type AnthropicResponse } from '../src/providers/anthropic.ts';
import { cacheSavings, projectUsage, type RunShape } from '../src/providers/caching.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(status: number, payload: unknown, contentType = 'application/json'): Record<string, any>[] {
  const bodies: Record<string, any>[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    bodies.push(JSON.parse(String(init.body)));
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Response(text, { status, headers: { 'Content-Type': contentType } });
  }) as typeof fetch;
  return bodies;
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'qwen/qwen3.7-flash' };

// Настоящий usage шлюза: второй запрос с тем же длинным system. cost посчитал сам шлюз.
const GATEWAY_USAGE = {
  prompt_tokens: 4983,
  completion_tokens: 3,
  total_tokens: 4986,
  cost: 0.000036216,
  is_byok: false,
  prompt_tokens_details: { cached_tokens: 4736, cache_write_tokens: 0, audio_tokens: 0, video_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 0, image_tokens: 0, audio_tokens: 0 },
};

function completion(usage: unknown) {
  return {
    id: 'gen-1',
    object: 'chat.completion',
    model: 'qwen/qwen3.7-flash',
    provider: 'Alibaba',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '4' } }],
    usage,
  };
}

const PRICE: Price = { inputPerMillion: 0.03, outputPerMillion: 0.13 };
const PRICE_WITH_CACHE: Price = { ...PRICE, cachedInputPerMillion: 0.006 };

describe('Шаг 1 / Step 1. cached_tokens из ответа шлюза', () => {
  it('chat: prompt_tokens_details.cached_tokens → usage.cached', async () => {
    stubFetch(200, completion(GATEWAY_USAGE));
    const result = await chat(config, [{ role: 'user', content: '2 + 2' }]);
    assert.deepEqual(result.usage, { input: 4983, output: 3, cached: 4736 });
  });

  it('cached_tokens: 0 — поля cached нет, usage как раньше', async () => {
    const usage = { ...GATEWAY_USAGE, prompt_tokens_details: { ...GATEWAY_USAGE.prompt_tokens_details, cached_tokens: 0 } };
    stubFetch(200, completion(usage));
    const result = await chat(config, [{ role: 'user', content: '2 + 2' }]);
    assert.deepEqual(result.usage, { input: 4983, output: 3 });
  });

  it('нет prompt_tokens_details — тоже без cached', async () => {
    stubFetch(200, completion({ prompt_tokens: 18, completion_tokens: 3 }));
    const result = await chat(config, [{ role: 'user', content: '2 + 2' }]);
    assert.deepEqual(result.usage, { input: 18, output: 3 });
  });

  it('chatStream: cached из последнего чанка с usage', async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: '4' }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: GATEWAY_USAGE })}`,
      'data: [DONE]',
      '',
    ].join('\n\n');
    stubFetch(200, sse, 'text/event-stream');
    const result = await chatStream(config, [{ role: 'user', content: '2 + 2' }], {}, () => {});
    assert.deepEqual(result.usage, { input: 4983, output: 3, cached: 4736 });
  });
});

describe('Шаг 2 / Step 2. Цена со скидкой и сумма в агенте', () => {
  it('без cachedInputPerMillion цена прежняя — так шлюз посчитал первый запрос', () => {
    assert.equal(estimateCost({ input: 4983, output: 3 }, PRICE), (4983 * 0.03 + 3 * 0.13) / 1_000_000);
    assert.ok(Math.abs(estimateCost({ input: 4983, output: 3 }, PRICE) - 0.00014988) < 1e-12);
    // cached есть, а цены кеша нет — считаем весь вход по обычной цене.
    assert.equal(estimateCost({ input: 4983, output: 3, cached: 4736 }, PRICE), estimateCost({ input: 4983, output: 3 }, PRICE));
  });

  it('с ценой кеша получается ровно то, что насчитал шлюз: $0.000036216', () => {
    const cost = estimateCost({ input: 4983, output: 3, cached: 4736 }, PRICE_WITH_CACHE);
    assert.ok(Math.abs(cost - GATEWAY_USAGE.cost) < 1e-12, `получилось ${cost}`);
  });

  it('cached не может быть больше input', () => {
    const cost = estimateCost({ input: 100, output: 0, cached: 500 }, PRICE_WITH_CACHE);
    assert.ok(Math.abs(cost - (100 * 0.006) / 1_000_000) < 1e-15);
  });

  it('Agent складывает cached всех шагов', async () => {
    const provider = new ScriptedProvider([
      toolReply([{ name: 'calculate', args: { expression: '2 + 2' } }], { usage: { input: 600, output: 30 } }),
      toolReply([{ name: 'calculate', args: { expression: '4 * 4' } }], { usage: { input: 700, output: 20, cached: 512 } }),
      textReply('16', { usage: { input: 800, output: 10, cached: 640 } }),
    ]);
    const run = await new Agent({ provider, toolbox: new Toolbox().register(calculator), system: 'Считай через calculate.' }).run('(2+2)^2');
    assert.deepEqual(run.usage, { input: 2100, output: 60, cached: 1152 });
  });

  it('без кеша usage агента прежний: { input, output }', async () => {
    const provider = new ScriptedProvider([textReply('Привет!', { usage: { input: 100, output: 5 } })]);
    const run = await new Agent({ provider, toolbox: new Toolbox(), system: 'Ты — агент.' }).run('Привет');
    assert.deepEqual(run.usage, { input: 100, output: 5 });
  });
});

describe('Шаг 3 / Step 3. Кеш у Anthropic', () => {
  const base: AnthropicResponse = {
    id: 'msg_01234',
    role: 'assistant',
    content: [{ type: 'text', text: "Here's the answer to your question..." }],
    stop_reason: 'end_turn',
  };

  it('cache_read_input_tokens → cached; input — сумма трёх полей («Prompt caching», 1-hour cache)', () => {
    const result = fromAnthropicResponse({
      ...base,
      usage: { input_tokens: 2048, cache_read_input_tokens: 1800, cache_creation_input_tokens: 248, output_tokens: 503 },
    });
    assert.deepEqual(result.usage, { input: 4096, output: 503, cached: 1800 });
  });

  it('только запись в кеш — не cached («Pre-warming the cache»)', () => {
    const result = fromAnthropicResponse({
      ...base,
      content: [],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 8, cache_creation_input_tokens: 5120, cache_read_input_tokens: 0, output_tokens: 0 },
    });
    assert.deepEqual(result.usage, { input: 5128, output: 0 });
  });

  it('promptCache: true — cache_control на верхнем уровне запроса', () => {
    const history = [{ role: 'user' as const, content: 'Привет' }];
    assert.deepEqual(toAnthropicRequest('m', history, {}, { promptCache: true }).cache_control, { type: 'ephemeral' });
    assert.equal('cache_control' in toAnthropicRequest('m', history), false);
  });

  it('anthropicProvider передаёт promptCache в тело запроса', async () => {
    const bodies = stubFetch(200, { ...base, usage: { input_tokens: 10, output_tokens: 5 } });
    await anthropicProvider({ baseUrl: 'https://api.anthropic.test/v1', apiKey: 'k', model: 'claude-opus-5-5' }, { promptCache: true }).complete(
      [{ role: 'user', content: 'Привет' }],
      {},
    );
    assert.deepEqual(bodies[0].cache_control, { type: 'ephemeral' });
  });
});

describe('Шаг 4 / Step 4. Во сколько раз дешевле', () => {
  // Агент для кода: system с правилами и инструменты — 5000 токенов, каждый шаг добавляет 1000, 30 шагов.
  const coding: RunShape = { prefix: 5000, perStep: 1000, outputPerStep: 100, steps: 30 };

  it('без кеша: вход — сумма всех запросов', () => {
    assert.deepEqual(projectUsage(coding, false), { input: 585_000, output: 3000 });
  });

  it('с кешем: каждый шаг читает из кеша весь прошлый запрос', () => {
    assert.deepEqual(projectUsage(coding, true), { input: 585_000, output: 3000, cached: 551_000 });
    assert.deepEqual(projectUsage({ prefix: 1000, perStep: 100, outputPerStep: 10, steps: 3 }, true), {
      input: 3300,
      output: 30,
      cached: 2100,
    });
  });

  it('один шаг — читать нечего, поля cached нет', () => {
    assert.deepEqual(projectUsage({ ...coding, steps: 1 }, true), { input: 5000, output: 100 });
  });

  it('модель курса: в 3,8 раза дешевле', () => {
    const { withoutCache, withCache, ratio } = cacheSavings(coding, PRICE_WITH_CACHE);
    assert.ok(Math.abs(withoutCache - 0.01794) < 1e-12, `без кеша ${withoutCache}`);
    assert.ok(Math.abs(withCache - 0.004716) < 1e-12, `с кешем ${withCache}`);
    assert.equal(ratio.toFixed(2), '3.80');
  });

  it('Claude Sonnet 5.5: запись в кеш дороже входа, и всё равно в 7 раз дешевле', () => {
    const sonnet: Price = { inputPerMillion: 2, outputPerMillion: 10 };
    const sonnetCached: Price = { inputPerMillion: 2.5, outputPerMillion: 10, cachedInputPerMillion: 0.1 };
    const { withoutCache, withCache, ratio } = cacheSavings(coding, sonnet, sonnetCached);
    assert.ok(Math.abs(withoutCache - 1.2) < 1e-9, `без кеша ${withoutCache}`);
    assert.ok(Math.abs(withCache - 0.1701) < 1e-9, `с кешем ${withCache}`);
    assert.equal(ratio.toFixed(2), '7.05');
  });
});
