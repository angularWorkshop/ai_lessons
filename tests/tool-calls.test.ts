import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { chat, type LlmConfig, type Message, type ToolSpec } from '../src/llm.ts';

// Сеть не нужна: fetch подменяем заглушкой. Она отвечает по очереди заготовленными ответами
// и запоминает тело каждого запроса. Ответы ниже сняты с модели курса, лишние поля сокращены.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(...replies: unknown[]): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    bodies.push(JSON.parse(String(init.body ?? '{}')));
    const reply = replies.shift();
    if (!reply) {
      throw new Error('Заглушка: запросов больше, чем заготовленных ответов');
    }
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return bodies;
}

interface RawCall {
  id: string;
  name: string;
  arguments: string;
}

// Ответ шлюза с tool_calls: content — null, у каждого вызова есть index.
function toolCallsReply(...calls: RawCall[]) {
  return {
    id: 'gen-1792960743-Ja0NISbCceqh1AXvlEVj',
    object: 'chat.completion',
    model: 'qwen/qwen3.7-flash',
    provider: 'Alibaba',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        native_finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          refusal: null,
          reasoning: null,
          tool_calls: calls.map((call, index) => ({
            type: 'function',
            index,
            id: call.id,
            function: { name: call.name, arguments: call.arguments },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 315, completion_tokens: 29, total_tokens: 344 },
  };
}

function textReply(content: string) {
  return {
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, refusal: null, reasoning: null } }],
    usage: { prompt_tokens: 385, completion_tokens: 26, total_tokens: 411 },
  };
}

const config: LlmConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'test-key', model: 'test-model' };
const question: Message = { role: 'user', content: 'Который час в Токио?' };

const timeTool: ToolSpec = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description: 'Текущие дата и время в указанном часовом поясе.',
    parameters: {
      type: 'object',
      properties: { timezone: { type: 'string', description: 'Часовой пояс IANA, например Europe/Moscow или Asia/Tokyo' } },
      required: ['timezone'],
    },
  },
};

const tokyo: RawCall = { id: 'call_85fb4573dc444f6eaf2f7faf', name: 'get_current_time', arguments: '{"timezone": "Asia/Tokyo"}' };
const moscow: RawCall = { id: 'call_93ec7892b92349d98266b14e', name: 'get_current_time', arguments: '{"timezone": "Europe/Moscow"}' };
const newYork: RawCall = { id: 'call_225c6899d3784de49e265820', name: 'get_current_time', arguments: '{"timezone": "America/New_York"}' };

describe('Шаг 1 / Step 1. Инструменты в запросе', () => {
  it('tools уходят в тело запроса как есть', async () => {
    const bodies = stubFetch(toolCallsReply(tokyo));
    await chat(config, [question], { tools: [timeTool] });
    assert.deepEqual(bodies[0].tools, [timeTool]);
  });

  it('toolChoice уходит полем tool_choice', async () => {
    const bodies = stubFetch(toolCallsReply(tokyo), textReply('Привет!'));
    await chat(config, [question], { tools: [timeTool], toolChoice: 'required' });
    await chat(config, [question], { tools: [timeTool], toolChoice: 'none' });
    assert.equal(bodies[0].tool_choice, 'required');
    assert.equal(bodies[1].tool_choice, 'none');
  });

  it('пустой список инструментов не отправляется, остальное тело — как раньше', async () => {
    const bodies = stubFetch(toolCallsReply(tokyo), textReply('Привет!'));
    await chat(config, [question], { tools: [timeTool] });
    await chat(config, [question], { tools: [] });
    assert.ok('tools' in bodies[0], 'с инструментами поле tools должно быть');
    assert.deepEqual(bodies[1], { model: 'test-model', messages: [question], temperature: 0, max_tokens: 1024 });
  });
});

describe('Шаг 2 / Step 2. toolCalls из ответа', () => {
  it('один вызов: id, имя и arguments строкой; текста нет', async () => {
    stubFetch(toolCallsReply(tokyo));
    const result = await chat(config, [question], { tools: [timeTool] });
    assert.deepEqual(result.toolCalls, [tokyo]);
    assert.equal(typeof result.toolCalls[0].arguments, 'string');
    assert.equal(result.text, '');
    assert.equal(result.finishReason, 'tool_calls');
    assert.equal(result.truncated, false);
  });

  it('несколько вызовов за раз — все и в том же порядке', async () => {
    stubFetch(toolCallsReply(moscow, newYork));
    const result = await chat(config, [{ role: 'user', content: 'Сколько сейчас времени в Москве и в Нью-Йорке?' }], { tools: [timeTool] });
    assert.deepEqual(result.toolCalls, [moscow, newYork]);
  });

  it('обрезанные arguments не роняют chat: строка отдаётся как пришла', async () => {
    // Настоящий ответ при max_tokens: 18. finish_reason при этом — tool_calls, а не length.
    const broken: RawCall = { ...tokyo, arguments: '{"timezone": "Asia/Tok' };
    stubFetch(toolCallsReply(broken));
    const result = await chat(config, [question], { tools: [timeTool], maxTokens: 18 });
    assert.deepEqual(result.toolCalls, [broken]);
  });
});

describe('Шаг 3 / Step 3. message для истории', () => {
  it('ответ с вызовами: content null и tool_calls без index', async () => {
    stubFetch(toolCallsReply(tokyo));
    const result = await chat(config, [question], { tools: [timeTool] });
    assert.deepEqual(result.message, {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: tokyo.id, type: 'function', function: { name: tokyo.name, arguments: tokyo.arguments } }],
    });
  });

  it('полный круг: второй запрос несёт вопрос, ответ с вызовом и результат с тем же id', async () => {
    const bodies = stubFetch(toolCallsReply(tokyo), textReply('В Токио сейчас 05:39 утра, понедельник, 26 октября 2026 года.'));
    const messages: Message[] = [question];

    const first = await chat(config, messages, { tools: [timeTool] });
    messages.push(first.message);
    for (const call of first.toolCalls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: 'понедельник, 26 октября 2026 г. в 05:39' });
    }
    const second = await chat(config, messages, { tools: [timeTool] });

    assert.deepEqual(bodies[1].messages, [
      question,
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: tokyo.id, type: 'function', function: { name: tokyo.name, arguments: tokyo.arguments } }],
      },
      { role: 'tool', tool_call_id: tokyo.id, content: 'понедельник, 26 октября 2026 г. в 05:39' },
    ]);
    assert.equal(second.text, 'В Токио сейчас 05:39 утра, понедельник, 26 октября 2026 года.');
    assert.deepEqual(second.toolCalls, []);
  });

  it('два вызова — у каждого свой результат', async () => {
    const bodies = stubFetch(toolCallsReply(moscow, newYork), textReply('В Москве 23:39, в Нью-Йорке 16:39.'));
    const messages: Message[] = [{ role: 'user', content: 'Сколько сейчас времени в Москве и в Нью-Йорке?' }];

    const first = await chat(config, messages, { tools: [timeTool] });
    messages.push(first.message, ...first.toolCalls.map((call): Message => ({ role: 'tool', tool_call_id: call.id, content: `время для ${call.id}` })));
    await chat(config, messages, { tools: [timeTool] });

    const sent = bodies[1].messages as Message[];
    const assistant = sent[1] as Extract<Message, { role: 'assistant' }>;
    assert.deepEqual(assistant.tool_calls?.map((call) => call.id), [moscow.id, newYork.id]);
    assert.deepEqual(sent.slice(2).map((message) => (message as { tool_call_id: string }).tool_call_id), [moscow.id, newYork.id]);
  });
});
