import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Agent } from '../src/agent.ts';
import {
  Compactor,
  findSplit,
  renderTranscript,
  summarize,
  summaryMessage,
  SUMMARY_PREFIX,
  SUMMARY_SYSTEM,
  type CompactEvent,
} from '../src/context/compaction.ts';
import { calculator } from '../src/demo-tools.ts';
import type { Message } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

const SYSTEM = 'Ты — агент. Считай только через calculate.';

const call = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
});

// user → вызов → результат → два вызова сразу → два результата → ответ.
function history(): Message[] {
  return [
    { role: 'user', content: 'Найди DEFAULT_ константы' },
    { role: 'assistant', content: null, tool_calls: [call('c1', 'read_file', { path: 'src/llm.ts' })] },
    { role: 'tool', tool_call_id: 'c1', content: 'const DEFAULT_MAX_TOKENS = 1024;' },
    { role: 'assistant', content: 'В llm.ts нашёл одну.', tool_calls: [call('c2', 'read_file', { path: 'a.ts' }), call('c3', 'read_file', { path: 'b.ts' })] },
    { role: 'tool', tool_call_id: 'c2', content: 'A' },
    { role: 'tool', tool_call_id: 'c3', content: 'B' },
    { role: 'assistant', content: 'Готово: DEFAULT_MAX_TOKENS = 1024' },
  ];
}

// Длинная история: n шагов калькулятора, у каждого результата 400 символов.
function longHistory(steps: number): Message[] {
  const messages: Message[] = [{ role: 'user', content: 'Задача: посчитай всё и ответь одной строкой' }];
  for (let i = 1; i <= steps; i++) {
    messages.push({ role: 'assistant', content: null, tool_calls: [call(`k${i}`, 'calculate', { expression: `${i} + ${i}` })] });
    messages.push({ role: 'tool', tool_call_id: `k${i}`, content: `${2 * i} ${'.'.repeat(400)}` });
  }
  return messages;
}

describe('Шаг 1 / Step 1. Где резать историю', () => {
  it('оставляет keepLast последних сообщений', () => {
    assert.equal(findSplit(history(), 1), 6);
    assert.equal(findSplit(history(), 4), 3);
  });

  it('не отрывает результаты от вызова: хвост не начинается с tool', () => {
    // 7 - 2 = 5 — это результат c3. Отступаем до assistant с обоими вызовами.
    assert.equal(findSplit(history(), 2), 3);
    // 7 - 5 = 2 — результат c1. Отступаем до его вызова.
    assert.equal(findSplit(history(), 5), 1);
  });

  it('keepLast 0 — сжать всё, keepLast больше истории — нечего сжимать', () => {
    assert.equal(findSplit(history(), 0), 7);
    assert.equal(findSplit(history(), 50), 0);
    assert.equal(findSplit([], 3), 0);
  });
});

describe('Шаг 2 / Step 2. История текстом', () => {
  it('каждое сообщение — абзац с ролью, вызовы — с именем инструмента', () => {
    assert.equal(
      renderTranscript(history().slice(0, 6)),
      [
        '[user] Найди DEFAULT_ константы',
        '[assistant → read_file] {"path":"src/llm.ts"}',
        '[read_file] const DEFAULT_MAX_TOKENS = 1024;',
        '[assistant] В llm.ts нашёл одну.',
        '[assistant → read_file] {"path":"a.ts"}',
        '[assistant → read_file] {"path":"b.ts"}',
        '[read_file] A',
        '[read_file] B',
      ].join('\n\n'),
    );
  });

  it('длинный результат обрезается с пометкой, сколько не показано', () => {
    const messages: Message[] = [
      { role: 'assistant', content: null, tool_calls: [call('c1', 'read_file', { path: 'big.ts' })] },
      { role: 'tool', tool_call_id: 'c1', content: 'x'.repeat(25_000) },
    ];
    const text = renderTranscript(messages, 100);
    assert.match(text, /\[read_file\] x{100}\n…\[обрезано: показано 100 из 25000 символов\]$/);
    // По умолчанию — столько же, сколько видел агент: 20 000 символов.
    assert.ok(renderTranscript(messages).includes('x'.repeat(20_000)));
    assert.ok(!renderTranscript(messages).includes('x'.repeat(20_001)));
  });

  it('результат без известного вызова подписан просто tool', () => {
    assert.equal(renderTranscript([{ role: 'tool', tool_call_id: 'zz', content: '42' }]), '[tool] 42');
  });
});

describe('Шаг 3 / Step 3. Сводка от модели', () => {
  it('один запрос: SUMMARY_SYSTEM и история текстом, без инструментов', async () => {
    const provider = new ScriptedProvider([textReply('  ## Цель\nНайти константы\n', { usage: { input: 300, output: 40 } })]);
    const controller = new AbortController();
    const summary = await summarize(provider, history(), { signal: controller.signal });

    assert.deepEqual(summary, { text: '## Цель\nНайти константы', usage: { input: 300, output: 40 } });
    assert.equal(provider.requests.length, 1);
    const [system, user] = provider.requests[0].messages;
    assert.deepEqual(system, { role: 'system', content: SUMMARY_SYSTEM });
    assert.equal(user.role, 'user');
    assert.ok(user.content?.includes(renderTranscript(history())));
    assert.ok(!user.content?.includes('Предыдущая сводка'));
    assert.equal(provider.requests[0].options.tools, undefined);
    assert.equal(provider.requests[0].options.signal, controller.signal);
  });

  it('прошлая сводка идёт в запрос перед новой частью истории', async () => {
    const provider = new ScriptedProvider([textReply('## Цель\nновая')]);
    await summarize(provider, history(), { previous: '## Цель\nстарая' });
    const text = provider.requests[0].messages[1].content ?? '';
    assert.ok(text.includes('## Цель\nстарая'));
    assert.ok(text.indexOf('старая') < text.indexOf('[user] Найди'));
  });

  it('пустая или обрезанная сводка — ошибка', async () => {
    await assert.rejects(summarize(new ScriptedProvider([textReply('   ')]), history()), /пуст/);
    await assert.rejects(
      summarize(new ScriptedProvider([textReply('## Цель\nНайти', { finishReason: 'length' })]), history()),
      /обрезан/,
    );
  });
});

describe('Шаг 4 / Step 4. Compactor', () => {
  const info = { step: 1 };

  it('ниже порога — история как есть, модель не спрашиваем', async () => {
    const provider = new ScriptedProvider([]);
    const compactor = new Compactor({ provider, threshold: 100_000 });
    const messages = longHistory(3);
    assert.deepEqual(await compactor.prepare(messages, info), messages);
    assert.equal(provider.requests.length, 0);
  });

  it('выше порога — сводка вместо старой части, последние сообщения как есть', async () => {
    const provider = new ScriptedProvider([textReply('## Цель\nПосчитать всё', { usage: { input: 900, output: 30 } })]);
    const events: CompactEvent[] = [];
    const compactor = new Compactor({ provider, threshold: 500, keepLast: 3, onCompact: (e) => events.push(e) });
    const messages = longHistory(5);
    const view = await compactor.prepare(messages, { step: 4 });

    // 11 сообщений, keepLast 3 → резать на 8, но там tool. Отступаем до 7: assistant с вызовом k4.
    assert.deepEqual(view, [summaryMessage('## Цель\nПосчитать всё'), ...messages.slice(7)]);
    assert.ok(view[0].content?.startsWith(SUMMARY_PREFIX));
    assert.equal(view[1].role, 'assistant');
    assert.ok(provider.requests[0].messages[1].content?.includes(renderTranscript(messages.slice(0, 7))));
    assert.equal(compactor.summary, '## Цель\nПосчитать всё');
    assert.equal(events.length, 1);
    assert.equal(events[0].step, 4);
    assert.equal(events[0].summarized, 7);
    assert.ok(events[0].after < events[0].before);
    assert.deepEqual(events[0].usage, { input: 900, output: 30 });
  });

  it('пока под порогом, сводка переиспользуется; перерос — новая сводка из старой и новых сообщений', async () => {
    const provider = new ScriptedProvider([textReply('сводка 1'), textReply('сводка 2')]);
    const compactor = new Compactor({ provider, threshold: 700, keepLast: 2 });
    const messages = longHistory(4);

    await compactor.prepare(messages, info);
    assert.equal(provider.requests.length, 1);

    // Агент дописывает историю в тот же массив: шаг 5.
    messages.push({ role: 'assistant', content: null, tool_calls: [call('k5', 'calculate', { expression: '5 + 5' })] });
    messages.push({ role: 'tool', tool_call_id: 'k5', content: '10' });
    const small = await compactor.prepare([...messages], info);
    assert.equal(provider.requests.length, 1);
    assert.equal(small[0].content, summaryMessage('сводка 1').content);

    for (let i = 6; i <= 8; i++) {
      messages.push({ role: 'assistant', content: null, tool_calls: [call(`k${i}`, 'calculate', { expression: `${i} + ${i}` })] });
      messages.push({ role: 'tool', tool_call_id: `k${i}`, content: `${2 * i} ${'.'.repeat(400)}` });
    }
    const view = await compactor.prepare([...messages], info);
    assert.equal(provider.requests.length, 2);
    const second = provider.requests[1].messages[1].content ?? '';
    assert.ok(second.includes('сводка 1'));
    assert.ok(!second.includes('[user] Задача'), 'старая часть уже в сводке, второй раз её не шлём');
    assert.equal(view[0].content, summaryMessage('сводка 2').content);
    assert.deepEqual(view.slice(1), messages.slice(-2));
  });

  it('другая история — сводка прошлой не подмешивается', async () => {
    const provider = new ScriptedProvider([textReply('сводка A'), textReply('сводка B')]);
    const compactor = new Compactor({ provider, threshold: 500, keepLast: 2 });
    await compactor.prepare(longHistory(4), info);
    const other = longHistory(4);
    const view = await compactor.prepare(other, info);
    assert.equal(provider.requests.length, 2);
    assert.equal(view[0].content, summaryMessage('сводка B').content);
  });

  it('с агентом: модель видит сводку и хвост, run.messages — вся история', async () => {
    const big = (n: number) => `${n} + ${'0 + '.repeat(150)}0`;
    const agentProvider = new ScriptedProvider([
      toolReply([{ name: 'calculate', args: { expression: big(1) } }]),
      toolReply([{ name: 'calculate', args: { expression: big(2) } }]),
      toolReply([{ name: 'calculate', args: { expression: big(3) } }]),
      textReply('6'),
    ]);
    const summaries = new ScriptedProvider([textReply('## Цель\nПосчитать три выражения')]);
    const compactor = new Compactor({ provider: summaries, threshold: 600, keepLast: 2 });
    const run = await new Agent({
      provider: agentProvider,
      toolbox: new Toolbox().register(calculator),
      system: SYSTEM,
      prepareMessages: compactor.prepare,
    }).run('Посчитай три выражения');

    assert.equal(run.stopReason, 'done', run.answer);
    assert.equal(run.messages.length, 8);
    assert.equal(summaries.requests.length, 1);
    const last = agentProvider.requests[3].messages;
    assert.equal(last[0].role, 'system');
    assert.equal(last[1].content, summaryMessage('## Цель\nПосчитать три выражения').content);
    assert.deepEqual(last.slice(2), run.messages.slice(5, 7));
    assert.equal(last[2].role, 'assistant');
  });

  it('ошибка сводки останавливает агента с error', async () => {
    const agentProvider = new ScriptedProvider([textReply('не дойдёт')]);
    const compactor = new Compactor({ provider: new ScriptedProvider([textReply('')]), threshold: 1, keepLast: 0 });
    const run = await new Agent({
      provider: agentProvider,
      toolbox: new Toolbox().register(calculator),
      system: SYSTEM,
      prepareMessages: compactor.prepare,
    }).run('Задача', longHistory(2));
    assert.equal(run.stopReason, 'error');
    assert.match(run.answer, /пуст/);
  });
});
