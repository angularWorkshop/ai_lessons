import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Agent, type AgentEvent, type PrepareInfo } from '../src/agent.ts';
import { contextBreakdown, estimateTokens, StepLedger } from '../src/context/budget.ts';
import { compactToolResults, toolResultStub } from '../src/context/tool-results.ts';
import { calculator } from '../src/demo-tools.ts';
import type { Message } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

const SYSTEM = 'Ты — агент. Считай только через calculate.';
const toolbox = () => new Toolbox().register(calculator);
const calc = (expression: string) => toolReply([{ name: 'calculate', args: { expression } }]);

// История агента, который прочитал четыре файла: длинные результаты и короткий в конце.
function readHistory(): Message[] {
  const call = (id: string, path: string) => ({
    id,
    type: 'function' as const,
    function: { name: 'read_file', arguments: JSON.stringify({ path }) },
  });
  return [
    { role: 'user', content: 'Найди константы' },
    { role: 'assistant', content: null, tool_calls: [call('c1', 'a.ts')] },
    { role: 'tool', tool_call_id: 'c1', content: 'a'.repeat(1200) },
    // Два вызова за один шаг: у каждого свой результат.
    { role: 'assistant', content: 'Из a.ts всё ясно.', tool_calls: [call('c2', 'b.ts'), call('c3', 'c.ts')] },
    { role: 'tool', tool_call_id: 'c2', content: 'b'.repeat(800) },
    { role: 'tool', tool_call_id: 'c3', content: 'c'.repeat(900) },
    { role: 'assistant', content: null, tool_calls: [call('c4', 'd.ts')] },
    { role: 'tool', tool_call_id: 'c4', content: 'd'.repeat(700) },
  ];
}

describe('Шаг 1 / Step 1. Оценка токенов и состав запроса', () => {
  it('estimateTokens: символы делим на 3,5 и округляем вверх', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('x'.repeat(35)), 10);
    assert.equal(estimateTokens('abcd'), 2);
    assert.equal(estimateTokens('я'.repeat(700)), 200);
  });

  it('contextBreakdown раскладывает запрос на system, инструменты, историю и результаты', () => {
    const tools = toolbox().specs();
    const messages: Message[] = [
      { role: 'user', content: 'u'.repeat(70) },
      { role: 'assistant', content: 'Считаю.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'calculate', arguments: '{"expression":"2+2"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 't'.repeat(350) },
      { role: 'assistant', content: 'a'.repeat(35) },
    ];
    const parts = contextBreakdown({ system: 's'.repeat(35), tools, messages });

    const assistantWithCall = messages[1] as Extract<Message, { role: 'assistant' }>;
    const expectedHistory =
      estimateTokens('u'.repeat(70)) +
      estimateTokens('Считаю.' + JSON.stringify(assistantWithCall.tool_calls)) +
      estimateTokens('a'.repeat(35));
    assert.deepEqual(parts, {
      system: 10,
      tools: estimateTokens(JSON.stringify(tools)),
      history: expectedHistory,
      toolResults: 100,
      total: 10 + estimateTokens(JSON.stringify(tools)) + expectedHistory + 100,
    });
  });

  it('без инструментов и истории остаётся только system', () => {
    assert.deepEqual(contextBreakdown({ system: 'Ты — агент.', tools: [], messages: [] }), {
      system: estimateTokens('Ты — агент.'),
      tools: 0,
      history: 0,
      toolResults: 0,
      total: estimateTokens('Ты — агент.'),
    });
  });

  it('вызов без текста считается по JSON вызовов', () => {
    const toolCalls = [{ id: 'c9', type: 'function' as const, function: { name: 'calculate', arguments: '{"expression":"1+1"}' } }];
    const parts = contextBreakdown({ system: 'S', tools: [], messages: [{ role: 'assistant', content: null, tool_calls: toolCalls }] });
    assert.equal(parts.history, estimateTokens(JSON.stringify(toolCalls)));
  });
});

describe('Шаг 2 / Step 2. prepareMessages в Agent', () => {
  it('модель получает system и то, что вернул prepareMessages, а история агента остаётся полной', async () => {
    const provider = new ScriptedProvider([calc('2 + 2'), textReply('4')]);
    const agent = new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      prepareMessages: (messages) => messages.map((m) => (m.role === 'user' ? { ...m, content: `[сжато] ${m.content}` } : m)),
    });
    const run = await agent.run('Сколько будет 2 + 2?');

    assert.equal(run.stopReason, 'done', run.answer);
    assert.deepEqual(provider.requests[0].messages, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: '[сжато] Сколько будет 2 + 2?' },
    ]);
    assert.equal(provider.requests[1].messages[1].content, '[сжато] Сколько будет 2 + 2?');
    assert.equal(run.messages[0].content, 'Сколько будет 2 + 2?');
    assert.deepEqual(run.messages.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant']);
  });

  it('вызывается перед каждым запросом, знает номер шага и сигнал отмены', async () => {
    const seen: { length: number; info: PrepareInfo }[] = [];
    const controller = new AbortController();
    const provider = new ScriptedProvider([calc('1 + 1'), calc('2 + 2'), textReply('Готово')]);
    await new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      signal: controller.signal,
      prepareMessages: (messages, info) => {
        seen.push({ length: messages.length, info });
        return messages;
      },
    }).run('Считай');

    assert.deepEqual(seen.map((s) => [s.length, s.info.step]), [[1, 1], [3, 2], [5, 3]]);
    assert.equal(seen[0].info.signal, controller.signal);
  });

  it('получает копию: push в массив не попадает в историю', async () => {
    const provider = new ScriptedProvider([textReply('Привет')]);
    const run = await new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      prepareMessages: (messages) => {
        messages.push({ role: 'user', content: 'лишнее' });
        return messages;
      },
    }).run('Привет');

    assert.equal(provider.requests[0].messages.length, 3);
    assert.deepEqual(run.messages, [
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Привет' },
    ]);
  });

  it('асинхронный prepareMessages тоже работает', async () => {
    const provider = new ScriptedProvider([textReply('ок')]);
    await new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      prepareMessages: async (messages) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [{ role: 'user', content: 'сводка' }, ...messages];
      },
    }).run('Задача');

    assert.deepEqual(provider.requests[0].messages.slice(1), [
      { role: 'user', content: 'сводка' },
      { role: 'user', content: 'Задача' },
    ]);
  });

  it('ошибка в prepareMessages — stopReason error, run не бросает', async () => {
    const provider = new ScriptedProvider([textReply('не дойдёт')]);
    const events: AgentEvent[] = [];
    const run = await new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      onEvent: (event) => events.push(event),
      prepareMessages: () => {
        throw new Error('сжатие не удалось');
      },
    }).run('Задача');

    assert.equal(run.stopReason, 'error');
    assert.match(run.answer, /сжатие не удалось/);
    assert.equal(provider.requests.length, 0);
    assert.deepEqual(events.at(-1), { type: 'stop', reason: 'error' });
  });

  it('отмена во время prepareMessages — aborted, а не error', async () => {
    const controller = new AbortController();
    const provider = new ScriptedProvider([textReply('не дойдёт')]);
    const run = await new Agent({
      provider,
      toolbox: toolbox(),
      system: SYSTEM,
      signal: controller.signal,
      prepareMessages: () => {
        controller.abort();
        throw new Error('Запрос отменён');
      },
    }).run('Задача');

    assert.equal(run.stopReason, 'aborted');
    assert.equal(provider.requests.length, 0);
  });
});

describe('Шаг 3 / Step 3. Сжатие старых результатов инструментов', () => {
  it('последние keep результатов целиком, старые — заглушка с именем инструмента и размером', () => {
    const history = readHistory();
    const compacted = compactToolResults(history, { keep: 2 });

    assert.equal(compacted.length, history.length);
    assert.deepEqual(compacted[2], { role: 'tool', tool_call_id: 'c1', content: toolResultStub('read_file', 'a'.repeat(1200)) });
    assert.deepEqual(compacted[4], { role: 'tool', tool_call_id: 'c2', content: toolResultStub('read_file', 'b'.repeat(800)) });
    assert.equal(compacted[5], history[5]);
    assert.equal(compacted[7], history[7]);
    assert.match(toolResultStub('read_file', 'x'.repeat(1234)), /read_file.*1234/);
  });

  it('сообщения user и assistant не меняются, порядок и id те же', () => {
    const history = readHistory();
    const compacted = compactToolResults(history, { keep: 1 });

    assert.deepEqual(compacted.map((m) => m.role), history.map((m) => m.role));
    history.forEach((message, i) => {
      if (message.role !== 'tool') {
        assert.equal(compacted[i], message);
      } else {
        assert.equal((compacted[i] as typeof message).tool_call_id, message.tool_call_id);
      }
    });
  });

  it('исходный массив и его объекты не меняются', () => {
    const history = readHistory();
    const before = structuredClone(history);
    compactToolResults(history, { keep: 0 });
    assert.deepEqual(history, before);
  });

  it('по умолчанию keep = 3; короткие результаты не трогаем', () => {
    const history = readHistory();
    const compacted = compactToolResults(history);
    assert.equal((compacted[2] as { content: string }).content, toolResultStub('read_file', 'a'.repeat(1200)));
    assert.equal(compacted[4], history[4]);

    const short: Message[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'calculate', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'k1', content: '42' },
    ];
    assert.equal(compactToolResults(short, { keep: 0 })[1], short[1]);
    assert.equal(
      (compactToolResults(history, { keep: 0, minChars: 1000 })[4] as { content: string }).content,
      'b'.repeat(800),
    );
  });

  it('keep больше числа результатов — история как есть', () => {
    const history = readHistory();
    assert.deepEqual(compactToolResults(history, { keep: 10 }), history);
  });

  it('в агенте: на третьем шаге модель видит заглушку вместо первого результата', async () => {
    const big = (n: number) => `${n} + ${'0 + '.repeat(200)}0`;
    const first = calc(big(1));
    const provider = new ScriptedProvider([first, calc(big(2)), textReply('Готово')]);
    const run = await new Agent({
      provider,
      toolbox: new Toolbox().register({
        ...calculator,
        // Длинный результат, как у read_file.
        run: async (args: { expression: string }) => `${await calculator.run(args, {})}\n${'.'.repeat(600)}`,
      }),
      system: SYSTEM,
      prepareMessages: (messages) => compactToolResults(messages, { keep: 1 }),
    }).run('Считай');

    const third = provider.requests[2].messages;
    const tools = third.filter((m) => m.role === 'tool');
    assert.equal(tools.length, 2);
    assert.match(tools[0].content, /^\[.*calculate/);
    assert.match(tools[1].content, /^2\n/);
    assert.equal(run.messages.filter((m) => m.role === 'tool' && m.content.startsWith('1\n')).length, 1);
    assert.equal(first.toolCalls[0].id, (tools[0] as { tool_call_id: string }).tool_call_id);
  });
});

describe('Шаг 4 / Step 4. Цена каждого шага', () => {
  const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

  it('журнал считает каждый шаг и сумму с начала задачи', async () => {
    const ledger = new StepLedger(PRICE);
    const provider = new ScriptedProvider([
      toolReply([{ name: 'calculate', args: { expression: '1 + 1' } }], { usage: { input: 1000, output: 100 } }),
      toolReply([{ name: 'calculate', args: { expression: '2 + 2' } }], { usage: { input: 5000, output: 40 } }),
      textReply('Готово', { usage: { input: 9000, output: 200 } }),
    ]);
    await new Agent({ provider, toolbox: toolbox(), system: SYSTEM, onEvent: ledger.onEvent }).run('Считай');

    const cost = (input: number, output: number) => (input * 0.03 + output * 0.13) / 1_000_000;
    assert.deepEqual(
      ledger.steps.map((s) => [s.step, s.input, s.output]),
      [
        [1, 1000, 100],
        [2, 5000, 40],
        [3, 9000, 200],
      ],
    );
    assert.ok(Math.abs(ledger.steps[1].cost - cost(5000, 40)) < 1e-12);
    assert.ok(Math.abs(ledger.steps[2].total - (cost(1000, 100) + cost(5000, 40) + cost(9000, 200))) < 1e-12);
    assert.equal(ledger.inputTokens, 15000);
  });

  it('события кроме assistant журнал пропускает', () => {
    const ledger = new StepLedger(PRICE);
    ledger.onEvent({ type: 'step', step: 1 });
    ledger.onEvent({ type: 'stop', reason: 'done' });
    assert.deepEqual(ledger.steps, []);
    assert.equal(ledger.inputTokens, 0);
  });
});
