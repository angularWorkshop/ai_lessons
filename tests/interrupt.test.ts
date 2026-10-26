import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { Agent, type AgentEvent } from '../src/agent.ts';
import { Conversation } from '../src/conversation.ts';
import { INTERRUPTED_NOTE, INTERRUPTED_RESULT, untilAborted } from '../src/interrupt.ts';
import { listenForInterrupt, readKey } from '../src/keys.ts';
import { LlmError, type ChatResult, type Message } from '../src/llm.ts';
import type { Provider } from '../src/provider.ts';
import { ScriptedProvider, textReply, toolReply, type ScriptedRequest } from '../src/testing/scripted-provider.ts';
import { Toolbox, type Tool } from '../src/tools.ts';

const SYSTEM = 'Ты — агент.';

// Инструмент, который не слушает signal: ждёт, пока тест сам не отпустит его через release().
// Через полсекунды отпускает себя сам: агент, который ждёт его после отмены, заметно опоздает, но не зависнет.
function stubbornTool() {
  const started: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, 500);
  });
  const tool: Tool<{ label: string }> = {
    name: 'stubborn',
    description: 'Долгая работа, которую нельзя прервать',
    schema: z.object({ label: z.string() }),
    async run({ label }) {
      started.push(label);
      await gate;
      return `${label}: готово`;
    },
  };
  return { tool, started, release: () => release() };
}

// Вежливый инструмент: передаёт signal в ожидание и обрывается сразу.
const polite: Tool<{ ms: number }> = {
  name: 'polite',
  description: 'Ждёт ms миллисекунд',
  schema: z.object({ ms: z.number() }),
  async run({ ms }, ctx) {
    await delay(ms, undefined, { signal: ctx.signal });
    return 'готово';
  },
};

// За каждым tool_call в истории — его tool, и история не кончается ответом модели с вызовами.
function assertHistoryComplete(messages: readonly Message[]) {
  const answered = new Set(messages.filter((m) => m.role === 'tool').map((m) => (m.role === 'tool' ? m.tool_call_id : '')));
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.tool_calls ?? []) {
        assert.ok(answered.has(call.id), `у вызова ${call.id} нет результата в истории`);
      }
    }
  }
  const last = messages.at(-1);
  assert.ok(!(last?.role === 'assistant' && last.tool_calls?.length), 'история кончается вызовами без результатов');
}

// Шаг сценария: «модель думает», пока агента не отменят, — как fetch с signal.
function hangUntilAborted(request: ScriptedRequest): Promise<ChatResult> {
  return new Promise((_, reject) => {
    request.options.signal?.addEventListener('abort', () => reject(new LlmError('Запрос отменён', { code: 'aborted', retryable: false })));
  });
}

describe('Шаг 1 / Step 1. untilAborted', () => {
  it('без отмены — результат работы', async () => {
    const controller = new AbortController();
    assert.equal(await untilAborted(delay(5, 'готово'), controller.signal, () => 'отменено'), 'готово');
    assert.equal(await untilAborted(Promise.resolve('без signal'), undefined, () => 'отменено'), 'без signal');
  });

  it('отмена посреди работы — сразу onAbort(), не дожидаясь работы', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const started = Date.now();
    const result = await untilAborted(delay(1000, 'готово'), controller.signal, () => 'отменено');
    assert.equal(result, 'отменено');
    assert.ok(Date.now() - started < 300, 'должно вернуться сразу после отмены, а не через секунду');
  });

  it('уже отменённый signal — onAbort() без ожидания', async () => {
    const controller = new AbortController();
    controller.abort();
    assert.equal(await untilAborted(new Promise<string>(() => {}), controller.signal, () => 'отменено'), 'отменено');
  });

  it('ошибка работы до отмены — та же ошибка', async () => {
    const controller = new AbortController();
    await assert.rejects(untilAborted(Promise.reject(new Error('сломалось')), controller.signal, () => 'отменено'), /сломалось/);
  });

  it('после работы снимает свой слушатель с signal', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    let listeners = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((...args: Parameters<typeof add>) => {
      listeners++;
      add(...args);
    }) as typeof add;
    signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
      listeners--;
      remove(...args);
    }) as typeof remove;

    for (let i = 0; i < 3; i++) {
      await untilAborted(delay(1, i), signal, () => -1);
    }
    assert.equal(listeners, 0, 'слушатели копятся: за длинный разговор их будут тысячи');
  });
});

describe('Шаг 2 / Step 2. Агент не ждёт инструмент после отмены', () => {
  it('инструмент не слушает signal — агент всё равно останавливается сразу', async () => {
    const controller = new AbortController();
    const { tool, started, release } = stubbornTool();
    const provider = new ScriptedProvider([toolReply([{ id: 'call_s', name: 'stubborn', args: { label: 'долгий' } }]), textReply('не понадобится')]);
    const events: AgentEvent[] = [];
    const agent = new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM, signal: controller.signal, onEvent: (e) => events.push(e) });

    setTimeout(() => controller.abort(), 20);
    const begin = Date.now();
    const run = await agent.run('Работай');

    assert.ok(Date.now() - begin < 300, 'агент ждал инструмент, который не слушает signal');
    assert.equal(run.stopReason, 'aborted');
    assert.deepEqual(started, ['долгий']);
    assert.deepEqual(run.messages.at(-1), { role: 'tool', tool_call_id: 'call_s', content: INTERRUPTED_RESULT.content });
    assert.equal(provider.requests.length, 1);

    // Инструмент доработал в фоне. Его результат никому не нужен: ни события, ни правки истории.
    const count = events.length;
    release();
    await delay(5);
    assert.equal(events.length, count);
    assert.equal(run.messages.length, 3);
  });

  it('у вызова ровно один tool_result — с INTERRUPTED_RESULT', async () => {
    const controller = new AbortController();
    const { tool, release } = stubbornTool();
    const provider = new ScriptedProvider([toolReply([{ id: 'call_s', name: 'stubborn', args: { label: 'x' } }])]);
    const results: AgentEvent[] = [];
    const agent = new Agent({
      provider,
      toolbox: new Toolbox().register(tool),
      system: SYSTEM,
      signal: controller.signal,
      onEvent: (e) => e.type === 'tool_result' && results.push(e),
    });
    setTimeout(() => controller.abort(), 10);
    await agent.run('Работай');
    release();
    await delay(5);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].type === 'tool_result' && results[0].result, INTERRUPTED_RESULT);
  });

  it('шесть вызовов: запущенные прерваны, ждавшие очереди не стартовали, у каждого — результат', async () => {
    const controller = new AbortController();
    const { tool, started, release } = stubbornTool();
    const calls = [
      { id: 'call_1', name: 'stubborn', args: { label: '1' } },
      { id: 'call_2', name: 'polite', args: { ms: 1000 } },
      { id: 'call_3', name: 'stubborn', args: { label: '3' } },
      { id: 'call_4', name: 'polite', args: { ms: 1000 } },
      { id: 'call_5', name: 'stubborn', args: { label: '5' } },
      { id: 'call_6', name: 'polite', args: { ms: 1000 } },
    ];
    const provider = new ScriptedProvider([toolReply(calls)]);
    const agent = new Agent({ provider, toolbox: new Toolbox().register(tool).register(polite), system: SYSTEM, signal: controller.signal });

    setTimeout(() => controller.abort(), 20);
    const run = await agent.run('Работай');
    release();

    assert.equal(run.stopReason, 'aborted');
    assert.deepEqual(started, ['1', '3'], 'вызов 5 стоял в очереди и не должен был стартовать');
    const tools = run.messages.filter((m) => m.role === 'tool');
    assert.deepEqual(
      tools.map((m) => (m.role === 'tool' ? m.tool_call_id : '')),
      calls.map((c) => c.id),
    );
    assert.deepEqual(
      tools.slice(0, 4).map((m) => m.content),
      Array(4).fill(INTERRUPTED_RESULT.content),
    );
    assert.ok(tools.slice(4).every((m) => m.content.startsWith('Ошибка: вызов не выполнен')));
    assertHistoryComplete(run.messages);
  });

  it('без отмены инструмент работает как раньше', async () => {
    const { tool, release } = stubbornTool();
    const provider = new ScriptedProvider([toolReply([{ id: 'call_s', name: 'stubborn', args: { label: 'x' } }]), textReply('ok')]);
    setTimeout(release, 10);
    const run = await new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM, signal: new AbortController().signal }).run('Работай');
    assert.equal(run.stopReason, 'done');
    assert.deepEqual(run.messages[2], { role: 'tool', tool_call_id: 'call_s', content: 'x: готово' });
  });
});

describe('Шаг 3 / Step 3. Conversation: разговор после отмены', () => {
  it('история переходит из задачи в задачу, usage копится', async () => {
    const provider = new ScriptedProvider([
      textReply('Привет!', { usage: { input: 10, output: 2 } }),
      textReply('Тебя зовут Аня.', { usage: { input: 20, output: 5 } }),
    ]);
    const conversation = new Conversation({ provider, toolbox: new Toolbox(), system: SYSTEM });
    await conversation.send('Привет, я Аня');
    const run = await conversation.send('Как меня зовут?');

    assert.equal(run.answer, 'Тебя зовут Аня.');
    assert.deepEqual(
      provider.requests[1].messages.map((m) => m.content),
      [SYSTEM, 'Привет, я Аня', 'Привет!', 'Как меня зовут?'],
    );
    assert.equal(conversation.messages.length, 4);
    assert.deepEqual(conversation.usage, { input: 30, output: 7 });
  });

  it('отмена посреди ответа модели: в истории задача и пометка, ответа модели нет', async () => {
    const provider = new ScriptedProvider([hangUntilAborted, textReply('4')]);
    const conversation = new Conversation({ provider, toolbox: new Toolbox(), system: SYSTEM });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    const run = await conversation.send('Расскажи историю JavaScript', controller.signal);
    assert.equal(run.stopReason, 'aborted');
    assert.deepEqual(conversation.messages, [
      { role: 'user', content: 'Расскажи историю JavaScript' },
      { role: 'user', content: INTERRUPTED_NOTE },
    ]);
  });

  it('следующая задача — со своим signal и всей историей', async () => {
    const provider = new ScriptedProvider([hangUntilAborted, textReply('4')]);
    const conversation = new Conversation({ provider, toolbox: new Toolbox(), system: SYSTEM });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await conversation.send('Расскажи историю JavaScript', controller.signal);

    const run = await conversation.send('Сколько будет 2 + 2?', new AbortController().signal);
    assert.equal(run.stopReason, 'done', 'отмена прошлой задачи не должна задеть следующую');
    assert.deepEqual(
      provider.requests[1].messages.map((m) => m.content),
      [SYSTEM, 'Расскажи историю JavaScript', INTERRUPTED_NOTE, 'Сколько будет 2 + 2?'],
    );
  });

  it('отмена посреди инструментов: история целая, и с ней можно продолжать', async () => {
    const { tool, release } = stubbornTool();
    const provider = new ScriptedProvider([
      toolReply([
        { id: 'call_a', name: 'stubborn', args: { label: 'a' } },
        { id: 'call_b', name: 'stubborn', args: { label: 'b' } },
      ]),
      textReply('Остановился, как ты просил.'),
    ]);
    const conversation = new Conversation({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await conversation.send('Работай', controller.signal);
    release();

    assert.deepEqual(
      conversation.messages.map((m) => m.role),
      ['user', 'assistant', 'tool', 'tool', 'user'],
    );
    assertHistoryComplete(conversation.messages);

    await conversation.send('Что случилось?');
    assertHistoryComplete(provider.requests[1].messages);
    assert.equal(provider.requests[1].messages.at(-1)?.content, 'Что случилось?');
  });

  it('отмена посреди стрима: текст успел прийти событиями, но в историю не попал', async () => {
    const deltas: string[] = [];
    const streaming: Provider = {
      complete: () => Promise.reject(new Error('ждали stream')),
      stream: (_messages, options, onDelta) =>
        new Promise((_, reject) => {
          onDelta('История JavaScript началась');
          options.signal?.addEventListener('abort', () => reject(new LlmError('Запрос отменён', { code: 'aborted', retryable: false })));
        }),
    };
    const conversation = new Conversation({
      provider: streaming,
      toolbox: new Toolbox(),
      system: SYSTEM,
      stream: true,
      onEvent: (e) => e.type === 'text_delta' && deltas.push(e.text),
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const run = await conversation.send('Расскажи историю JavaScript', controller.signal);

    assert.equal(run.stopReason, 'aborted');
    assert.deepEqual(deltas, ['История JavaScript началась']);
    assert.ok(!conversation.messages.some((m) => m.role === 'assistant'), 'половина ответа не должна лечь в историю');
  });

  it('историю снаружи не поменять, а ответ без отмены — без пометки', async () => {
    const provider = new ScriptedProvider([textReply('ok')]);
    const conversation = new Conversation({ provider, toolbox: new Toolbox(), system: SYSTEM });
    await conversation.send('ok?');
    assert.deepEqual(conversation.messages, [
      { role: 'user', content: 'ok?' },
      { role: 'assistant', content: 'ok' },
    ]);
  });
});

// Поток, который притворяется терминалом: isTTY и setRawMode, как у process.stdin.
function fakeTerminal() {
  const input = new PassThrough() as PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode(mode: boolean): void };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (mode: boolean) => {
    input.isRaw = mode;
  };
  return input;
}

describe('Шаг 4 / Step 4. Клавиши: Esc и Ctrl+C в сыром режиме', () => {
  it('readKey: Esc — один байт 0x1b, Ctrl+C — 0x03', () => {
    assert.equal(readKey(Buffer.from([0x1b])), 'esc');
    assert.equal(readKey(Buffer.from([0x03])), 'ctrl-c');
    assert.equal(readKey('\x1b'), 'esc');
  });

  it('readKey: стрелки, буквы и Enter — не прерывание', () => {
    assert.equal(readKey(Buffer.from([0x1b, 0x5b, 0x41])), undefined, 'стрелка вверх тоже начинается с 0x1b');
    assert.equal(readKey('a'), undefined);
    assert.equal(readKey('\r'), undefined);
  });

  it('listenForInterrupt включает сырой режим, ловит клавиши и всё возвращает', async () => {
    const input = fakeTerminal();
    const keys: string[] = [];
    const stop = listenForInterrupt(input as unknown as NodeJS.ReadStream, (key) => keys.push(key));
    assert.equal(input.isRaw, true, 'без сырого режима Esc не дойдёт до программы');

    input.write(Buffer.from([0x61]));
    input.write(Buffer.from([0x1b]));
    input.write(Buffer.from([0x03]));
    await delay(5);
    assert.deepEqual(keys, ['esc', 'ctrl-c']);

    stop();
    assert.equal(input.isRaw, false, 'после задачи терминал должен вернуться в обычный режим: иначе readline не увидит Enter');
    assert.equal(input.listenerCount('data'), 0);
  });

  it('stdin не терминал — слушает SIGINT и снимает слушателя', () => {
    const before = process.listenerCount('SIGINT');
    const stop = listenForInterrupt(new PassThrough() as unknown as NodeJS.ReadStream, () => {});
    assert.equal(process.listenerCount('SIGINT'), before + 1);
    stop();
    assert.equal(process.listenerCount('SIGINT'), before);
  });
});
