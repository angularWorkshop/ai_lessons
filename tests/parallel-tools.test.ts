import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { Agent, TOOL_CONCURRENCY, type AgentEvent } from '../src/agent.ts';
import { mapLimit } from '../src/concurrency.ts';
import { calculator } from '../src/demo-tools.ts';
import type { Message, ToolCall } from '../src/llm.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox, type Tool, type ToolContext, type ToolResult } from '../src/tools.ts';

const SYSTEM = 'Ты — агент.';

// Медленный инструмент: ждёт ms миллисекунд и запоминает, сколько вызовов работало одновременно.
function slowTool() {
  const stats = { active: 0, maxActive: 0, started: [] as string[], finished: [] as string[] };
  const tool: Tool<{ label: string; ms: number }> = {
    name: 'wait',
    description: 'Ждёт ms миллисекунд',
    schema: z.object({ label: z.string(), ms: z.number() }),
    async run({ label, ms }, ctx: ToolContext) {
      stats.active++;
      stats.maxActive = Math.max(stats.maxActive, stats.active);
      stats.started.push(label);
      try {
        await delay(ms, undefined, { signal: ctx.signal });
        stats.finished.push(label);
        return `${label}: готово`;
      } finally {
        stats.active--;
      }
    },
  };
  return { tool, stats };
}

// Только результаты инструментов, по порядку.
const toolMessages = (messages: Message[]) =>
  messages.filter((m): m is Extract<Message, { role: 'tool' }> => m.role === 'tool');

const wait = (label: string, ms: number) => ({ name: 'wait', args: { label, ms }, id: `call_${label}` });

describe('Шаг 1 / Step 1. mapLimit', () => {
  it('результаты — в порядке входа, даже если задачи закончились в другом', async () => {
    const result = await mapLimit([30, 10, 20], 3, async (ms) => {
      await delay(ms);
      return ms * 2;
    });
    assert.deepEqual(result, [60, 20, 40]);
  });

  it('не больше limit задач одновременно, и limit действительно используется', async () => {
    let active = 0;
    let maxActive = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active--;
    });
    assert.equal(maxActive, 3);
  });

  it('limit 1 — строго по очереди', async () => {
    const log: string[] = [];
    await mapLimit(['a', 'b', 'c'], 1, async (item) => {
      log.push(`start ${item}`);
      await delay(1);
      log.push(`end ${item}`);
    });
    assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('fn получает индекс; пустой массив — пустой результат', async () => {
    assert.deepEqual(await mapLimit(['x', 'y'], 5, async (item, index) => `${index}:${item}`), ['0:x', '1:y']);
    assert.deepEqual(await mapLimit([], 4, async () => 1), []);
  });

  it('limit меньше 1 — ошибка сразу, а не зависание', async () => {
    await assert.rejects(mapLimit([1], 0, async (x) => x), RangeError);
  });
});

describe('Шаг 2 / Step 2. Вызовы шага — параллельно, результаты — по порядку', () => {
  it('три вызова работают одновременно', async () => {
    const { tool, stats } = slowTool();
    const provider = new ScriptedProvider([toolReply([wait('a', 30), wait('b', 30), wait('c', 30)]), textReply('ok')]);
    await new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM }).run('Жди');
    assert.equal(stats.maxActive, 3);
  });

  it(`не больше TOOL_CONCURRENCY (${TOOL_CONCURRENCY}) сразу`, async () => {
    const { tool, stats } = slowTool();
    const calls = ['a', 'b', 'c', 'd', 'e', 'f'].map((label) => wait(label, 10));
    const provider = new ScriptedProvider([toolReply(calls), textReply('ok')]);
    await new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM }).run('Жди');
    assert.equal(stats.maxActive, TOOL_CONCURRENCY);
    assert.equal(stats.finished.length, 6);
  });

  it('первый закончил последним — в истории он всё равно первый, с правильными id', async () => {
    const { tool, stats } = slowTool();
    const reply = toolReply([wait('slow', 60), wait('fast', 5), wait('mid', 30)]);
    const provider = new ScriptedProvider([reply, textReply('ok')]);
    await new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM }).run('Жди');

    assert.deepEqual(stats.finished, ['fast', 'mid', 'slow']);
    assert.deepEqual(provider.requests[1].messages.slice(3), [
      { role: 'tool', tool_call_id: 'call_slow', content: 'slow: готово' },
      { role: 'tool', tool_call_id: 'call_fast', content: 'fast: готово' },
      { role: 'tool', tool_call_id: 'call_mid', content: 'mid: готово' },
    ]);
  });

  it('события: все tool_call сразу, tool_result — по готовности', async () => {
    const { tool } = slowTool();
    const events: string[] = [];
    const onEvent = (event: AgentEvent) => {
      if (event.type === 'tool_call' || event.type === 'tool_result') {
        events.push(`${event.type} ${event.call.id}`);
      }
    };
    const provider = new ScriptedProvider([toolReply([wait('slow', 50), wait('fast', 5)]), textReply('ok')]);
    await new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM, onEvent }).run('Жди');

    assert.deepEqual(events, ['tool_call call_slow', 'tool_call call_fast', 'tool_result call_fast', 'tool_result call_slow']);
  });
});

describe('Шаг 3 / Step 3. Одна ошибка не роняет остальные', () => {
  it('упал один инструмент — остальные результаты на месте, агент идёт дальше', async () => {
    const { tool } = slowTool();
    const provider = new ScriptedProvider([
      toolReply([wait('a', 10), { name: 'calculate', args: { expression: '1 / 0' }, id: 'call_div' }, wait('b', 5)]),
      textReply('На ноль делить нельзя, остальное готово.'),
    ]);
    const run = await new Agent({ provider, toolbox: new Toolbox().register(tool).register(calculator), system: SYSTEM }).run('Работай');

    assert.equal(run.stopReason, 'done');
    const tools = toolMessages(provider.requests[1].messages);
    assert.deepEqual(
      tools.map((m) => m.tool_call_id),
      ['call_a', 'call_div', 'call_b'],
    );
    assert.equal(tools[0].content, 'a: готово');
    assert.match(tools[1].content, /^Ошибка/);
    assert.equal(tools[2].content, 'b: готово');
  });

  it('даже если бросил сам реестр — у вызова результат-ошибка, остальные не потерялись', async () => {
    // Реестр, который нарушает обещание «execute не бросает». Так может повести себя чужой реестр, например MCP.
    class FlakyToolbox extends Toolbox {
      override async execute(call: ToolCall, ctx: ToolContext = {}): Promise<ToolResult> {
        if (call.id === 'call_boom') {
          await delay(5);
          throw new Error('соединение с сервером инструментов потеряно');
        }
        return super.execute(call, ctx);
      }
    }
    const { tool } = slowTool();
    const results: ToolResult[] = [];
    const provider = new ScriptedProvider([
      toolReply([wait('a', 20), { name: 'wait', args: { label: 'boom', ms: 1 }, id: 'call_boom' }, wait('b', 10)]),
      textReply('ok'),
    ]);
    const run = await new Agent({
      provider,
      toolbox: new FlakyToolbox().register(tool),
      system: SYSTEM,
      onEvent: (event) => event.type === 'tool_result' && results.push(event.result),
    }).run('Работай');

    assert.equal(run.stopReason, 'done');
    const tools = toolMessages(provider.requests[1].messages);
    assert.deepEqual(
      tools.map((m) => m.content),
      ['a: готово', 'Ошибка: wait не выполнился: соединение с сервером инструментов потеряно', 'b: готово'],
    );
    assert.equal(results.filter((r) => r.isError).length, 1);
  });
});

describe('Шаг 4 / Step 4. Отмена посреди параллельных вызовов', () => {
  it('запущенные получают signal, ждущие очереди не стартуют, история целая', async () => {
    const controller = new AbortController();
    const { tool, stats } = slowTool();
    const calls = ['a', 'b', 'c', 'd', 'e', 'f'].map((label) => wait(label, 1000));
    const provider = new ScriptedProvider([toolReply(calls), textReply('не должен понадобиться')]);
    const agent = new Agent({ provider, toolbox: new Toolbox().register(tool), system: SYSTEM, signal: controller.signal });

    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    const run = await agent.run('Жди');

    assert.ok(Date.now() - started < 500, 'запущенные вызовы должны прерваться, а не ждать секунду');
    assert.equal(run.stopReason, 'aborted');
    assert.equal(provider.requests.length, 1);
    assert.deepEqual(stats.started, ['a', 'b', 'c', 'd'], 'до отмены успели стартовать TOOL_CONCURRENCY вызовов');
    assert.deepEqual(stats.finished, []);

    const tools = toolMessages(run.messages);
    assert.deepEqual(
      tools.map((m) => m.tool_call_id),
      calls.map((call) => call.id),
    );
    assert.ok(tools.every((m) => m.content.startsWith('Ошибка')));
  });
});
