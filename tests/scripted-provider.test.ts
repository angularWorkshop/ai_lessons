import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LlmError, type Message } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';

const ask: Message[] = [
  { role: 'system', content: 'Ты — агент.' },
  { role: 'user', content: '12 умножь на 3,5' },
];

describe('Шаг 1 / Step 1. Ответы для сценария', () => {
  it('textReply — ответ без вызовов, готовый лечь в историю', () => {
    assert.deepEqual(textReply('Получится 42.'), {
      text: 'Получится 42.',
      finishReason: 'stop',
      truncated: false,
      usage: { input: 0, output: 0 },
      toolCalls: [],
      message: { role: 'assistant', content: 'Получится 42.' },
    });
  });

  it('textReply: usage и обрезка по length', () => {
    const reply = textReply('Сумма на конец первого года: 112 0', { finishReason: 'length', usage: { input: 533, output: 20 } });
    assert.equal(reply.truncated, true);
    assert.equal(reply.finishReason, 'length');
    assert.deepEqual(reply.usage, { input: 533, output: 20 });
  });

  it('toolReply: аргументы-объект становятся JSON-строкой, message — с tool_calls', () => {
    const reply = toolReply([{ name: 'calculate', args: { expression: '12 * 3.5' }, id: 'call_1' }]);
    assert.deepEqual(reply.toolCalls, [{ id: 'call_1', name: 'calculate', arguments: '{"expression":"12 * 3.5"}' }]);
    assert.equal(reply.finishReason, 'tool_calls');
    assert.equal(reply.truncated, false);
    assert.equal(reply.text, '');
    assert.deepEqual(reply.message, {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculate', arguments: '{"expression":"12 * 3.5"}' } }],
    });
  });

  it('toolReply: строка аргументов остаётся как есть — так пишут сломанный JSON', () => {
    const reply = toolReply([{ name: 'get_current_time', args: '{"timezone": "Asia/Tok' }], { finishReason: 'length' });
    assert.equal(reply.toolCalls[0].arguments, '{"timezone": "Asia/Tok');
    assert.equal(reply.truncated, true);
  });

  it('toolReply: без args — {}; без id — уникальные id', () => {
    const first = toolReply([{ name: 'ping' }, { name: 'ping' }]);
    const second = toolReply([{ name: 'ping' }]);
    assert.equal(first.toolCalls[0].arguments, '{}');
    const ids = [...first.toolCalls, ...second.toolCalls].map((call) => call.id);
    assert.equal(new Set(ids).size, 3, `id должны различаться: ${ids.join(', ')}`);
    assert.ok(ids.every((id) => id.length > 0));
  });

  it('toolReply: текст рядом с вызовами', () => {
    const reply = toolReply([{ name: 'calculate', args: { expression: '100000 * 1.12' } }], { text: '**Год 1:**' });
    assert.equal(reply.text, '**Год 1:**');
    assert.equal(reply.message.content, '**Год 1:**');
  });
});

describe('Шаг 2 / Step 2. ScriptedProvider', () => {
  it('отвечает по порядку', async () => {
    const call = toolReply([{ name: 'calculate', args: { expression: '12 * 3.5' } }]);
    const provider = new ScriptedProvider([call, textReply('42')]);
    assert.equal(provider.remaining, 2);
    assert.equal(await provider.complete(ask, {}), call);
    assert.equal((await provider.complete(ask, {})).text, '42');
    assert.equal(provider.remaining, 0);
  });

  it('запоминает каждый запрос: снимок сообщений и опции', async () => {
    const provider = new ScriptedProvider([textReply('a'), textReply('b')]);
    const messages = [...ask];
    await provider.complete(messages, { toolChoice: 'none', temperature: 0 });
    messages.push({ role: 'assistant', content: 'a' }, { role: 'user', content: 'ещё' });
    await provider.complete(messages, {});

    assert.equal(provider.requests.length, 2);
    assert.deepEqual(provider.requests[0].messages, ask, 'снимок не должен меняться, когда агент дописывает свой массив');
    assert.equal(provider.requests[1].messages.length, 4);
    assert.equal(provider.requests[0].options.toolChoice, 'none');
  });

  it('ответы кончились — понятная ошибка, а не undefined', async () => {
    const provider = new ScriptedProvider([textReply('a')]);
    await provider.complete(ask, {});
    await assert.rejects(provider.complete(ask, {}), (error: Error) => {
      assert.match(error.message, /ScriptedProvider/);
      assert.match(error.message, /2/, 'скажи, какой по счёту запрос оказался лишним');
      return true;
    });
    assert.equal(provider.requests.length, 2, 'лишний запрос тоже записан — по нему видно, что отправил агент');
  });

  it('Error в сценарии бросается', async () => {
    const quota = new LlmError('LLM API ответил 429: daily_quota_exceeded', { status: 429, code: 'daily_quota_exceeded', retryable: false });
    const provider = new ScriptedProvider([quota]);
    await assert.rejects(provider.complete(ask, {}), quota);
  });

  it('функция в сценарии видит запрос и решает, что вернуть', async () => {
    const provider = new ScriptedProvider([(request) => textReply(`сообщений: ${request.messages.length}`)]);
    const reply = await provider.complete(ask, {});
    assert.equal(reply.text, 'сообщений: 2');
  });

  it('асинхронная функция тоже работает', async () => {
    const provider = new ScriptedProvider([async () => textReply('позже')]);
    assert.equal((await provider.complete(ask, {})).text, 'позже');
  });

  it('отменённый signal — LlmError aborted, ответ из сценария не тратится', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new ScriptedProvider([textReply('a')]);
    await assert.rejects(provider.complete(ask, { signal: controller.signal }), (error: LlmError) => error.code === 'aborted');
    assert.equal(provider.remaining, 1);
  });

  it('сценарий передали массивом — провайдер его не портит', async () => {
    const script = [textReply('a')];
    const provider = new ScriptedProvider(script);
    await provider.complete(ask, {});
    assert.equal(script.length, 1);
  });
});
