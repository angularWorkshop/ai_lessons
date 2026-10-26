import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { SUMMARY_SYSTEM } from '../src/context/compaction.ts';
import { Conversation } from '../src/conversation.ts';
import { createHarness } from '../src/harness/create.ts';
import { RecordedToolbox, replay, replayProvider, replaySteps, replayTasks, toChatResult } from '../src/harness/replay.ts';
import { formatTrace, parseTrace, traceFile, Tracer, traceTotals, type TraceRecord } from '../src/harness/trace.ts';
import type { Message } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';
import { calculator } from '../src/demo-tools.ts';
import { tempProject, type TempProject } from './support/temp-project.ts';

const projects: TempProject[] = [];
after(async () => {
  await Promise.all(projects.map((project) => project.remove()));
});

async function shop() {
  const project = await tempProject({ 'package.json': '{}', 'src/cart.ts': 'export const total = 1;\n' });
  projects.push(project);
  return project;
}

const PRICE = { inputPerMillion: 1, outputPerMillion: 2 };

// Часы, которые идут на секунду за каждый вопрос.
function clock(start = Date.parse('2026-10-26T10:00:00Z')) {
  let now = start;
  return () => new Date((now += 1000));
}

const call = { id: 'c1', name: 'calculate', arguments: '{"expression":"2+2"}' };
const assistantWithCall: Extract<Message, { role: 'assistant' }> = {
  role: 'assistant',
  content: null,
  tool_calls: [{ id: 'c1', type: 'function', function: { name: 'calculate', arguments: '{"expression":"2+2"}' } }],
};

async function readTrace(file: string): Promise<TraceRecord[]> {
  return parseTrace(await readFile(file, 'utf8'));
}

describe('Шаг 1 / Step 1. Tracer: события в jsonl', () => {
  it('каждое событие — строка со временем; у ответа модели — токены и цена', async () => {
    const project = await shop();
    const tracer = new Tracer(traceFile(project.root, 's1'), { price: PRICE, now: clock() });
    tracer.onEvent({ type: 'step', step: 1 });
    tracer.onEvent({ type: 'text_delta', text: 'кусочек' });
    tracer.onEvent({ type: 'assistant', message: assistantWithCall, usage: { input: 1000, output: 500 } });
    tracer.onEvent({ type: 'tool_call', call });
    tracer.onEvent({ type: 'tool_result', call, result: { content: '4', isError: false } });
    tracer.onEvent({ type: 'stop', reason: 'done' });
    await tracer.flush();

    const records = await readTrace(tracer.file);
    assert.ok(tracer.file.endsWith(path.join('.agent', 'traces', 's1.jsonl')));
    assert.deepEqual(records.map((record) => record.type), ['step', 'assistant', 'tool_call', 'tool_result', 'stop'], 'text_delta в трейс не пишем');
    assert.equal(records[0].time, '2026-10-26T10:00:01.000Z');
    const answer = records[1] as Extract<TraceRecord, { type: 'assistant' }>;
    assert.deepEqual(answer.usage, { input: 1000, output: 500 });
    assert.equal(answer.cost, 0.002);
    assert.equal(answer.agent, undefined);
  });

  it('субагенты — с именем подзадачи, сжатие — с ценой сводки, задача — на первом шаге', async () => {
    const project = await shop();
    const tracer = new Tracer(traceFile(project.root, 's2'), { price: PRICE, now: clock() });
    tracer.onSubagentEvent({ type: 'step', step: 1 }, 'Где total');
    tracer.onCompact({ step: 3, summarized: 4, before: 900, after: 300, summary: '## Цель', usage: { input: 2000, output: 100 } });
    const prepare = tracer.wrapPrepare((messages) => messages.slice(-1));
    const history: Message[] = [{ role: 'user', content: 'раньше' }, { role: 'assistant', content: 'ок' }, { role: 'user', content: 'Почини тест' }];
    assert.deepEqual(await prepare(history, { step: 1 }), [history[2]], 'wrapPrepare не меняет то, что уходит модели');
    await prepare(history, { step: 2 });
    await tracer.flush();

    const records = await readTrace(tracer.file);
    assert.equal(records[0].agent, 'Где total');
    assert.deepEqual({ ...records[1], time: undefined }, { time: undefined, type: 'compact', summary: '## Цель', summarized: 4, usage: { input: 2000, output: 100 }, cost: 0.0022 });
    assert.deepEqual(records.slice(2).map((record) => ({ ...record, time: undefined })), [{ time: undefined, type: 'task', task: 'Почини тест', history: 2 }]);
  });
});

describe('Шаг 2 / Step 2. Чтение и итоги', () => {
  const records: TraceRecord[] = [
    { time: '2026-10-26T10:00:00.000Z', type: 'task', task: 'Сколько 2+2?', history: 0 },
    { time: '2026-10-26T10:00:00.000Z', type: 'step', step: 1 },
    { time: '2026-10-26T10:00:01.500Z', type: 'assistant', message: assistantWithCall, usage: { input: 1000, output: 20 }, cost: 0.00104 },
    { time: '2026-10-26T10:00:01.500Z', type: 'tool_call', call },
    { time: '2026-10-26T10:00:01.700Z', type: 'tool_result', call, result: { content: '4', isError: false } },
    { time: '2026-10-26T10:00:02.000Z', type: 'step', step: 2, agent: 'помощник' },
    { time: '2026-10-26T10:00:02.500Z', type: 'assistant', message: { role: 'assistant', content: '4' }, usage: { input: 300, output: 5 }, cost: 0.00031, agent: 'помощник' },
    { time: '2026-10-26T10:00:03.000Z', type: 'compact', summary: 'S', summarized: 2, usage: { input: 500, output: 50 }, cost: 0.0006 },
    { time: '2026-10-26T10:00:03.000Z', type: 'step', step: 2 },
    { time: '2026-10-26T10:00:04.000Z', type: 'assistant', message: { role: 'assistant', content: '4' }, usage: { input: 1100, output: 3 }, cost: 0.001106 },
    { time: '2026-10-26T10:00:04.000Z', type: 'stop', reason: 'done' },
  ];

  it('parseTrace: оборванную последнюю строку пропускает, битую в середине — нет', () => {
    const text = records.slice(0, 2).map((record) => JSON.stringify(record)).join('\n');
    assert.equal(parseTrace(`${text}\n{"time":`).length, 2);
    assert.throws(() => parseTrace(`{"time":\n${text}`), /строке 1/);
  });

  it('traceTotals: все запросы к модели — агент, субагенты и сводки', () => {
    const totals = traceTotals(records);
    assert.deepEqual(totals.usage, { input: 2900, output: 78 });
    assert.equal(totals.requests, 4);
    assert.equal(totals.tasks, 1);
    assert.equal(totals.ms, 4000);
    assert.ok(Math.abs(totals.cost - 0.003056) < 1e-9);
  });

  it('formatTrace: задача, время запроса, вызовы с длительностью, сводка по инструментам', () => {
    const text = formatTrace(records);
    assert.match(text, /^задач: 1 · запросов к модели: 4 · 2900 → 78 токенов · \$0\.003056 · 4\.0с/);
    assert.match(text, /задача> Сколько 2\+2\?/);
    assert.match(text, /\+1\.5с {2}модель 1\.5с {2}1000 → 20 {2}\$0\.001040 · вызовов: 1/);
    assert.match(text, /✓ calculate \{"expression":"2\+2"\} {2}0\.2с/);
    assert.match(text, /\[помощник\] {2}модель 0\.5с/);
    assert.match(text, /⇣ сжатие: 2 сообщ\. → сводка/);
    assert.match(text, /■ done/);
    assert.match(text, /инструменты: calculate ×1 0\.2с/);
    assert.equal(formatTrace([]), 'Трейс пуст.');
  });
});

describe('Шаг 3 / Step 3. Трейс в harness', () => {
  it('createHarness с tracer: в трейсе задача, шаги, ответы, вызовы и сжатие, терминал тоже получает события', async () => {
    const project = await shop();
    const tracer = new Tracer(traceFile(project.root, 's'), { price: PRICE });
    const printed: string[] = [];
    const provider = new ScriptedProvider([
      toolReply([{ name: 'read_file', args: { path: 'src/cart.ts' } }], { usage: { input: 100, output: 10 } }),
      textReply('total = 1', { usage: { input: 150, output: 5 } }),
    ]);
    const harness = await createHarness({ root: project.root, provider, tracer, onEvent: (event) => printed.push(event.type) });
    await new Conversation(harness.agent).send('Чему равен total?');
    await tracer.flush();
    await harness.close();
    const records = await readTrace(tracer.file);
    assert.deepEqual(
      records.map((record) => record.type),
      ['step', 'task', 'assistant', 'tool_call', 'tool_result', 'step', 'assistant', 'stop'],
    );
    assert.deepEqual(printed, ['step', 'assistant', 'tool_call', 'tool_result', 'step', 'assistant', 'stop']);
    assert.equal(traceTotals(records).usage.input, 250);

    // Без tracer опции агента прежние.
    const plain = await createHarness({ root: project.root, provider: new ScriptedProvider([]) });
    assert.equal(plain.agent.prepareMessages, plain.compactor.prepare);
    await plain.close();
  });

});

describe('Шаг 4 / Step 4. Сценарий replay из трейса', () => {
  const answer = { time: 't', type: 'assistant' as const, message: assistantWithCall, usage: { input: 10, output: 1 }, cost: 0 };

  it('toChatResult восстанавливает ответ провайдера', () => {
    const result = toChatResult(answer);
    assert.deepEqual(result.toolCalls, [call]);
    assert.equal(result.finishReason, 'tool_calls');
    assert.equal(result.message, answer.message);
    assert.equal(toChatResult({ ...answer, message: { role: 'assistant', content: 'Привет' } }).text, 'Привет');
    assert.equal(toChatResult(answer, true).truncated, true);
  });

  it('сводки и ответы — в порядке записи, субагенты пропускаются; не тот запрос — расхождение', async () => {
    const records: TraceRecord[] = [
      { ...answer, agent: 'ребёнок' },
      { time: 't', type: 'compact', summary: 'S', summarized: 2, usage: { input: 1, output: 1 }, cost: 0 },
      answer,
    ];
    const steps = replaySteps(records);
    assert.equal(steps.length, 2);
    const provider = new ScriptedProvider(steps);
    const summary = await provider.complete([{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: 'история' }], {});
    assert.equal(summary.text, 'S');
    await assert.rejects(provider.complete([{ role: 'system', content: SUMMARY_SYSTEM }], {}), /replay разошёлся с записью/);
  });

  it('RecordedToolbox: результат по id вызова, описания — от настоящего Toolbox', async () => {
    const real = new Toolbox().register(calculator);
    const recorded = new RecordedToolbox([{ time: 't', type: 'tool_result', call, result: { content: '4', isError: false } }], real);
    assert.deepEqual(recorded.specs(), real.specs());
    assert.deepEqual(await recorded.execute(call), { content: '4', isError: false });
    assert.match((await recorded.execute({ ...call, id: 'other' })).content, /в записи нет результата/);
  });

  it('replayTasks: задачи и длина истории перед ними', () => {
    assert.deepEqual(
      replayTasks([
        { time: 't', type: 'task', task: 'раз', history: 0 },
        { time: 't', type: 'task', task: 'два', history: 2 },
      ]),
      [{ task: 'раз', history: 0 }, { task: 'два', history: 2 }],
    );
  });
});

describe('Шаг 5 / Step 5. Replay сессии без сети', () => {
  async function recordSession(project: TempProject) {
    const tracer = new Tracer(traceFile(project.root, 'rec'), { price: PRICE });
    const provider = new ScriptedProvider([
      toolReply([{ name: 'read_file', args: { path: 'src/cart.ts' } }], { usage: { input: 100, output: 10 } }),
      toolReply([{ name: 'edit_file', args: { path: 'src/cart.ts', old_str: '1;', new_str: '2;' } }], { usage: { input: 150, output: 20 } }),
      textReply('Поменял на 2.', { usage: { input: 200, output: 5 } }),
      textReply('Было 1, стало 2.', { usage: { input: 250, output: 6 } }),
    ]);
    const harness = await createHarness({ root: project.root, provider, mode: 'auto', tracer });
    const conversation = new Conversation(harness.agent);
    const runs = [await conversation.send('Поменяй total на 2'), await conversation.send('Что поменял?')];
    await tracer.flush();
    await harness.close();
    return { records: await readTrace(tracer.file), runs };
  }

  it('тот же harness на записанных ответах: те же ответы и причины остановки, диск и сеть не тронуты', async () => {
    const project = await shop();
    const { records, runs } = await recordSession(project);
    // Вернём файл как был: replay не должен его менять — правка отвечает из записи.
    await writeFile(path.join(project.root, 'src/cart.ts'), 'export const total = 1;\n');

    const provider = replayProvider(records);
    const harness = await createHarness({ root: project.root, provider, mode: 'auto' });
    const result = await replay(records, harness.agent);
    await harness.close();

    assert.deepEqual(result.runs.map((run) => run.answer), runs.map((run) => run.answer));
    assert.deepEqual(result.runs.map((run) => run.stopReason), result.recorded);
    assert.deepEqual(result.runs[1].messages.map((message) => message.content), runs[1].messages.map((message) => message.content));
    assert.equal(provider.remaining, 0);
    assert.equal(await readFile(path.join(project.root, 'src/cart.ts'), 'utf8'), 'export const total = 1;\n');
  });

  it('«что было бы, если»: с maxSteps 2 первая задача упирается в лимит', async () => {
    const project = await shop();
    const { records } = await recordSession(project);
    const harness = await createHarness({ root: project.root, provider: replayProvider(records), mode: 'auto', limits: { maxSteps: 2 } });
    const result = await replay(records, harness.agent);
    await harness.close();
    assert.equal(result.recorded[0], 'done');
    assert.equal(result.runs[0].stopReason, 'max_steps');
  });
});
