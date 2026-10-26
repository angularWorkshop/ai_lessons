import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Agent, type AgentEvent } from '../src/agent.ts';
import { calculator, currentTime } from '../src/demo-tools.ts';
import { assistantMessage, chatStream, type ChatOptions, type ChatResult, type LlmConfig, type Message, type ToolSpec } from '../src/llm.ts';
import { llmProvider, type Provider } from '../src/provider.ts';
import { textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { ToolCallBuffer } from '../src/tool-call-deltas.ts';
import { Toolbox } from '../src/tools.ts';

// Заглушка fetch: каждый ответ — SSE-поток из кусков байтов, как в tests/stream.test.ts.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(...bodies: Uint8Array[][]) {
  const calls: { body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ body: JSON.parse(String(init.body ?? '{}')) });
    const pieces = bodies.shift();
    if (!pieces) {
      throw new Error(`Тест не ожидал ${calls.length}-го запроса`);
    }
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const piece = pieces.shift();
        if (piece) {
          controller.enqueue(piece);
        } else {
          controller.close();
        }
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof fetch;
  return calls;
}

// Настоящие чанки шлюза на «Который час в Москве и в Токио?» (служебные поля убраны).
const head = '"object":"chat.completion.chunk","model":"qwen/qwen3.7-flash","provider":"Alibaba"';
const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
  `data: {${head},"choices":[{"index":0,"delta":${JSON.stringify({ role: 'assistant', ...delta })},"finish_reason":${JSON.stringify(finish)}}]}\n\n`;
const text = (content: string, finish: string | null = null) => chunk({ content }, finish);
const callStart = (index: number, id: string, name: string) =>
  chunk({ content: null, tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });
const args = (index: number, piece: string) => chunk({ content: null, tool_calls: [{ index, function: { arguments: piece } }] });
const usage = (input: number, output: number, finish: string) =>
  `data: {${head},"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"${finish}"}],"usage":{"prompt_tokens":${input},"completion_tokens":${output},"total_tokens":${input + output}}}\n\n`;
const DONE = 'data: [DONE]\n\n';

const MOSCOW = 'call_fe38f0e4a9bb49b59eb35bfe';
const TOKYO = 'call_7c3f7b32e6844a0fb000cec8';
const twoCalls =
  callStart(0, MOSCOW, 'get_current_time') +
  args(0, '') +
  args(0, '') +
  args(0, '{"timezone": ') +
  args(0, '"Europe/Mos') +
  args(0, 'cow') +
  args(0, '"') +
  args(0, '}') +
  callStart(1, TOKYO, 'get_current_time') +
  args(1, '') +
  args(1, '{"timezone": ') +
  args(1, '"Asia/Tokyo') +
  args(1, '"') +
  args(1, '}') +
  text('', 'tool_calls') +
  usage(507, 59, 'tool_calls') +
  DONE;

// Текст и вызов в одном ответе: «Сначала одной фразой скажи, что будешь делать, а потом посчитай 1234 * 5678».
const CALC = 'call_954acd63398f4cb2b3b3f34b';
const textThenCall =
  text('Сейчас вычислю') +
  text(' произведение 1234 и 5678.\n\n') +
  callStart(0, CALC, 'calculate') +
  args(0, '{"expression": ') +
  args(0, '"1') +
  args(0, '234 *') +
  args(0, ' 567') +
  args(0, '8') +
  args(0, '"') +
  args(0, '}') +
  text('', 'tool_calls') +
  usage(526, 60, 'tool_calls') +
  DONE;

const answer = text('В Москве 00:37,') + text(' а в Токио 06:37.') + text('', 'stop') + usage(640, 15, 'stop') + DONE;

const encoder = new TextEncoder();
const whole = (sse: string) => [encoder.encode(sse)];
function cutEvery(sse: string, n: number): Uint8Array[] {
  const bytes = encoder.encode(sse);
  const pieces: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += n) {
    pieces.push(bytes.slice(i, i + n));
  }
  return pieces;
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages: Message[] = [{ role: 'user', content: 'Который час в Москве и в Токио?' }];
const toolbox = () => new Toolbox().register(currentTime).register(calculator);
const tools: ToolSpec[] = toolbox().specs();
const moscow = { id: MOSCOW, name: 'get_current_time', arguments: '{"timezone": "Europe/Moscow"}' };
const tokyo = { id: TOKYO, name: 'get_current_time', arguments: '{"timezone": "Asia/Tokyo"}' };

describe('Шаг 1 / Step 1. ToolCallBuffer: вызовы из кусочков', () => {
  it('склеивает arguments, а id и имя берёт из первого кусочка', () => {
    const buffer = new ToolCallBuffer();
    buffer.push([{ index: 0, id: MOSCOW, type: 'function', function: { name: 'get_current_time', arguments: '' } }]);
    for (const piece of ['', '{"timezone": ', '"Europe/Mos', 'cow', '"', '}']) {
      buffer.push([{ index: 0, function: { arguments: piece } }]);
    }
    assert.deepEqual(buffer.calls(), [moscow]);
  });

  it('разные index — разные вызовы, по порядку index', () => {
    const buffer = new ToolCallBuffer();
    buffer.push([{ index: 1, id: TOKYO, function: { name: 'get_current_time', arguments: '{"timezone": "Asia/Tokyo"}' } }]);
    buffer.push([{ index: 0, id: MOSCOW, function: { name: 'get_current_time', arguments: '{"timezone": ' } }]);
    buffer.push([{ index: 0, function: { arguments: '"Europe/Moscow"}' } }]);
    assert.deepEqual(buffer.calls(), [moscow, tokyo]);
  });

  it('кусочки двух вызовов вперемешку, несколько в одном чанке', () => {
    const buffer = new ToolCallBuffer();
    buffer.push([
      { index: 0, id: 'call_a', function: { name: 'calculate', arguments: '{"expr' } },
      { index: 1, id: 'call_b', function: { name: 'calculate', arguments: '{"expr' } },
    ]);
    buffer.push([{ index: 1, function: { arguments: 'ession": "2 * 2"}' } }]);
    buffer.push([{ index: 0, function: { arguments: 'ession": "1 + 1"}' } }]);
    assert.deepEqual(buffer.calls(), [
      { id: 'call_a', name: 'calculate', arguments: '{"expression": "1 + 1"}' },
      { id: 'call_b', name: 'calculate', arguments: '{"expression": "2 * 2"}' },
    ]);
  });

  it('повтор id и имени в следующих кусочках не задваивает их', () => {
    const buffer = new ToolCallBuffer();
    buffer.push([{ index: 0, id: 'call_a', function: { name: 'calculate', arguments: '{"expression":' } }]);
    buffer.push([{ index: 0, id: 'call_a', function: { name: 'calculate', arguments: ' "1"}' } }]);
    assert.deepEqual(buffer.calls(), [{ id: 'call_a', name: 'calculate', arguments: '{"expression": "1"}' }]);
  });

  it('пустой буфер — пустой список', () => {
    assert.deepEqual(new ToolCallBuffer().calls(), []);
  });
});

describe('Шаг 2 / Step 2. chatStream с инструментами', () => {
  it('отправляет tools и tool_choice, как chat', async () => {
    const calls = stubFetch(whole(twoCalls));
    await chatStream(config, messages, { tools, toolChoice: 'auto' }, () => {});
    assert.deepEqual(calls[0].body.tools, tools);
    assert.equal(calls[0].body.tool_choice, 'auto');
    assert.equal(calls[0].body.stream, true);
  });

  it('без tools тело запроса и результат — как в теме 1.4', async () => {
    const calls = stubFetch(whole(answer));
    const result = await chatStream(config, messages, {}, () => {});
    assert.ok(!('tools' in calls[0].body) && !('tool_choice' in calls[0].body));
    assert.deepEqual(result, { text: 'В Москве 00:37, а в Токио 06:37.', finishReason: 'stop', truncated: false, usage: { input: 640, output: 15 } });
  });

  it('собирает два вызова из настоящих чанков шлюза', async () => {
    stubFetch(whole(twoCalls));
    const deltas: string[] = [];
    const result = await chatStream(config, messages, { tools }, (piece) => deltas.push(piece));
    assert.deepEqual(result.toolCalls, [moscow, tokyo]);
    assert.equal(result.finishReason, 'tool_calls');
    assert.deepEqual(result.usage, { input: 507, output: 59 });
    assert.deepEqual(deltas, [], 'в чанках с вызовами content: null — печатать нечего');
  });

  it('message готов лечь в историю: content null и tool_calls, как у chat', async () => {
    stubFetch(whole(twoCalls));
    const result = await chatStream(config, messages, { tools }, () => {});
    assert.deepEqual(result.message, assistantMessage(null, [moscow, tokyo]));
  });

  it('текст перед вызовом уходит в onDelta и остаётся в message.content', async () => {
    stubFetch(whole(textThenCall));
    const deltas: string[] = [];
    const result = await chatStream(config, messages, { tools }, (piece) => deltas.push(piece));
    const calc = { id: CALC, name: 'calculate', arguments: '{"expression": "1234 * 5678"}' };
    assert.deepEqual(deltas, ['Сейчас вычислю', ' произведение 1234 и 5678.\n\n']);
    assert.deepEqual(result.toolCalls, [calc]);
    assert.deepEqual(result.message, assistantMessage('Сейчас вычислю произведение 1234 и 5678.\n\n', [calc]));
  });

  it('сеть режет кусочки вызовов где попало — результат тот же', async () => {
    for (const size of [5, 64, 333]) {
      stubFetch(cutEvery(twoCalls, size));
      const result = await chatStream(config, messages, { tools }, () => {});
      assert.deepEqual(result.toolCalls, [moscow, tokyo], `куски по ${size} байт`);
    }
  });

  it('с tools, но ответ текстом — toolCalls пустой, message как у chat', async () => {
    stubFetch(whole(answer));
    const result = await chatStream(config, messages, { tools }, () => {});
    assert.deepEqual(result.toolCalls, []);
    assert.deepEqual(result.message, { role: 'assistant', content: 'В Москве 00:37, а в Токио 06:37.' });
  });
});

describe('Шаг 3 / Step 3. llmProvider.stream', () => {
  it('просит стрим с инструментами и отдаёт текст в onDelta', async () => {
    const calls = stubFetch(whole(answer));
    const provider = llmProvider(config);
    assert.equal(typeof provider.stream, 'function', 'у llmProvider должен появиться метод stream');
    const deltas: string[] = [];
    const result = await provider.stream!(messages, { tools }, (piece) => deltas.push(piece));
    assert.equal(calls[0].body.stream, true);
    assert.deepEqual(calls[0].body.tools, tools);
    assert.deepEqual(deltas, ['В Москве 00:37,', ' а в Токио 06:37.']);
    assert.deepEqual(result.toolCalls, []);
    assert.deepEqual(result.message, { role: 'assistant', content: 'В Москве 00:37, а в Токио 06:37.' });
  });

  it('без tools в опциях — всё равно полный ChatResult', async () => {
    stubFetch(whole(answer));
    const result = await llmProvider(config).stream!(messages, {}, () => {});
    assert.deepEqual(result.toolCalls, []);
    assert.equal(result.message.content, 'В Москве 00:37, а в Токио 06:37.');
  });
});

// Провайдер с обоими методами: считает, какой из них агент позвал.
function bothWays(...replies: ChatResult[]) {
  const used: string[] = [];
  const requests: { messages: Message[]; options: ChatOptions }[] = [];
  const next = (messages: Message[], options: ChatOptions) => {
    requests.push({ messages: structuredClone(messages), options });
    const reply = replies.shift();
    if (!reply) {
      throw new Error('Лишний запрос');
    }
    return reply;
  };
  const provider: Provider = {
    async complete(messages, options) {
      used.push('complete');
      return next(messages, options);
    },
    async stream(messages, options, onDelta) {
      used.push('stream');
      const reply = next(messages, options);
      // Текст — двумя кусочками, как в настоящем стриме.
      const half = Math.ceil(reply.text.length / 2);
      for (const piece of [reply.text.slice(0, half), reply.text.slice(half)]) {
        if (piece) {
          onDelta(piece);
        }
      }
      return reply;
    },
  };
  return { provider, used, requests };
}

const SYSTEM = 'Ты — агент.';

describe('Шаг 4 / Step 4. Agent со stream', () => {
  it('stream: true — текст приходит событиями text_delta между step и assistant', async () => {
    stubFetch(whole(twoCalls), whole(answer));
    const events: AgentEvent[] = [];
    const agent = new Agent({ provider: llmProvider(config), toolbox: toolbox(), system: SYSTEM, stream: true, onEvent: (e) => events.push(e) });
    const run = await agent.run('Который час в Москве и в Токио?');

    assert.equal(run.stopReason, 'done');
    assert.equal(run.answer, 'В Москве 00:37, а в Токио 06:37.');
    assert.deepEqual(
      events.map((e) => (e.type === 'text_delta' ? `text_delta ${e.text}` : e.type)),
      ['step', 'assistant', 'tool_call', 'tool_call', 'tool_result', 'tool_result', 'step', 'text_delta В Москве 00:37,', 'text_delta  а в Токио 06:37.', 'assistant', 'stop'],
    );
    assert.deepEqual(run.usage, { input: 507 + 640, output: 59 + 15 });
  });

  it('вызовы, собранные из кусочков, исполняются и ложатся в историю как без стрима', async () => {
    const calls = stubFetch(whole(twoCalls), whole(answer));
    const run = await new Agent({ provider: llmProvider(config), toolbox: toolbox(), system: SYSTEM, stream: true }).run('Который час?');

    assert.deepEqual(
      run.messages.map((m) => m.role),
      ['user', 'assistant', 'tool', 'tool', 'assistant'],
    );
    assert.deepEqual(run.messages[1], assistantMessage(null, [moscow, tokyo]));
    assert.deepEqual(
      run.messages.slice(2, 4).map((m) => (m.role === 'tool' ? m.tool_call_id : '')),
      [MOSCOW, TOKYO],
    );
    // Второй запрос несёт ту же историю, что ушла бы без стрима.
    assert.deepEqual(
      (calls[1].body.messages as Message[]).map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'tool'],
    );
  });

  it('склеенные text_delta — это content из события assistant', async () => {
    const { provider } = bothWays(textReply('Готово, всё посчитано.'));
    const deltas: string[] = [];
    let content: string | null = null;
    await new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      stream: true,
      onEvent: (e) => {
        if (e.type === 'text_delta') deltas.push(e.text);
        if (e.type === 'assistant') content = e.message.content;
      },
    }).run('Посчитай');
    assert.ok(deltas.length > 1);
    assert.equal(deltas.join(''), content);
  });

  it('без stream агент зовёт complete, даже если stream у провайдера есть, и text_delta нет', async () => {
    const { provider, used } = bothWays(toolReply([{ name: 'calculate', args: { expression: '2 + 2' } }]), textReply('4'));
    const events: string[] = [];
    await new Agent({ provider, toolbox: toolbox(), system: SYSTEM, onEvent: (e) => events.push(e.type) }).run('2 + 2');
    assert.deepEqual(used, ['complete', 'complete']);
    assert.ok(!events.includes('text_delta'));
  });

  it('stream: true, а у провайдера нет stream — работает через complete', async () => {
    const { provider, used } = bothWays(textReply('ok'));
    const plain: Provider = { complete: provider.complete };
    const run = await new Agent({ provider: plain, toolbox: toolbox(), system: SYSTEM, stream: true }).run('ok?');
    assert.equal(run.stopReason, 'done');
    assert.deepEqual(used, ['complete']);
  });

  it('stream и complete получают одни и те же сообщения и опции', async () => {
    const script = () => [toolReply([{ id: 'call_1', name: 'calculate', args: { expression: '2 + 2' } }]), textReply('4')];
    const plain = bothWays(...script());
    const streamed = bothWays(...script());
    await new Agent({ provider: plain.provider, toolbox: toolbox(), system: SYSTEM }).run('2 + 2');
    await new Agent({ provider: streamed.provider, toolbox: toolbox(), system: SYSTEM, stream: true }).run('2 + 2');
    assert.deepEqual(streamed.used, ['stream', 'stream']);
    assert.deepEqual(streamed.requests, plain.requests);
  });
});
