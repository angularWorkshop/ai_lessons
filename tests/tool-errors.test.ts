import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { calculator, currentTime } from '../src/demo-tools.ts';
import type { ToolCall } from '../src/llm.ts';
import { Toolbox, truncate, type Tool, type ToolContext } from '../src/tools.ts';

let callId = 0;
function call(name: string, args: string): ToolCall {
  callId++;
  return { id: `call_${callId}`, name, arguments: args };
}

// Инструмент, который запоминает, вызывали ли его, и делает то, что попросит тест.
function spy(name: string, schema: z.ZodType, run: (args: any, ctx: ToolContext) => Promise<string>) {
  const calls: unknown[] = [];
  const tool: Tool = {
    name,
    description: `Инструмент ${name}`,
    schema,
    async run(args, ctx) {
      calls.push(args);
      return run(args, ctx);
    },
  };
  return { tool, calls };
}

const demo = () => new Toolbox().register(currentTime).register(calculator);

describe('Шаг 1 / Step 1. Неизвестный инструмент', () => {
  it('ошибка с именем и списком доступных инструментов', async () => {
    const result = await demo().execute(call('read_file', '{"path": "src/llm.ts"}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /read_file/);
    assert.match(result.content, /get_current_time/);
    assert.match(result.content, /calculate/);
  });

  it('пустой реестр тоже не бросает', async () => {
    const result = await new Toolbox().execute(call('calculate', '{"expression": "1 + 1"}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /calculate/);
  });
});

describe('Шаг 2 / Step 2. Аргументы: JSON и схема', () => {
  it('обрезанный JSON: ошибка, в ней — что пришло, run не вызывался', async () => {
    const time = spy('get_current_time', currentTime.schema, async () => '05:39');
    // Настоящие arguments модели при max_tokens: 18.
    const result = await new Toolbox().register(time.tool).execute(call('get_current_time', '{"timezone": "Asia/Tok'));
    assert.equal(result.isError, true);
    assert.ok(result.content.includes('{"timezone": "Asia/Tok'), 'покажи модели, что она прислала');
    assert.equal(time.calls.length, 0);
  });

  it('пустая строка вместо аргументов — это {}', async () => {
    const ping = spy('ping', z.object({}), async () => 'pong');
    const result = await new Toolbox().register(ping.tool).execute(call('ping', ''));
    assert.deepEqual(result, { content: 'pong', isError: false });
  });

  it('не прошла схема: текст ошибки zod с полем и сообщением', async () => {
    const calc = spy('calculate', calculator.schema, async () => '42');
    const result = await new Toolbox().register(calc.tool).execute(call('calculate', '{"expression": "sqrt(144) * 3.5"}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /expression/);
    assert.match(result.content, /Только числа, пробелы, \+ - \* \/ и скобки/);
    assert.equal(calc.calls.length, 0);
  });

  it('нет обязательного поля — ошибка называет поле', async () => {
    const result = await demo().execute(call('get_current_time', '{}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /timezone/);
  });

  it('run получает аргументы после zod, а не сырой JSON', async () => {
    const read = spy('read_file', z.object({ path: z.string(), limit: z.number().default(200) }), async () => 'ok');
    await new Toolbox().register(read.tool).execute(call('read_file', '{"path": "src/llm.ts"}'));
    assert.deepEqual(read.calls, [{ path: 'src/llm.ts', limit: 200 }]);
  });
});

describe('Шаг 3 / Step 3. Исполнение и исключения', () => {
  it('успех: результат run и isError: false', async () => {
    const result = await demo().execute(call('calculate', '{"expression": "12 * 3.5"}'));
    assert.deepEqual(result, { content: '42', isError: false });
  });

  it('исключение внутри run — ошибка с его текстом', async () => {
    const result = await demo().execute(call('calculate', '{"expression": "1 / 0"}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /calculate/);
    assert.match(result.content, /Infinity/);
  });

  it('неверный часовой пояс: RangeError из Intl становится ошибкой для модели', async () => {
    const result = await demo().execute(call('get_current_time', '{"timezone": "Tokyo"}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /Tokyo/);
  });

  it('бросили не Error, а строку — тоже не падаем', async () => {
    const broken = spy('broken', z.object({}), async () => {
      throw 'диск отвалился';
    });
    const result = await new Toolbox().register(broken.tool).execute(call('broken', '{}'));
    assert.equal(result.isError, true);
    assert.match(result.content, /диск отвалился/);
  });

  it('ctx доходит до run', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const tool = spy('wait', z.object({}), async (_args, ctx) => {
      seen = ctx.signal;
      return 'ok';
    });
    await new Toolbox().register(tool.tool).execute(call('wait', '{}'), { signal: controller.signal });
    assert.equal(seen, controller.signal);
  });
});

describe('Шаг 4 / Step 4. Длинный результат', () => {
  it('truncate: короткий текст не трогает', () => {
    assert.equal(truncate('42', 10), '42');
    assert.equal(truncate('x'.repeat(10), 10), 'x'.repeat(10));
  });

  it('truncate: оставляет начало и пишет, сколько было', () => {
    const text = truncate('строка\n'.repeat(1000), 100);
    assert.ok(text.startsWith('строка\n'.repeat(14)), 'начало должно остаться');
    assert.ok(text.length < 200, `слишком длинно: ${text.length}`);
    assert.match(text, /100/);
    assert.match(text, /7000/);
  });

  it('лимит Toolbox — параметр', async () => {
    const big = spy('dump', z.object({}), async () => 'x'.repeat(1000));
    const result = await new Toolbox({ maxResultChars: 100 }).register(big.tool).execute(call('dump', '{}'));
    assert.equal(result.isError, false);
    assert.ok(result.content.startsWith('x'.repeat(100)));
    assert.ok(!result.content.startsWith('x'.repeat(101)), 'обрезать надо по лимиту');
    assert.match(result.content, /1000/);
  });

  it('по умолчанию — 20 000 символов', async () => {
    const toolbox = new Toolbox()
      .register(spy('exact', z.object({}), async () => 'x'.repeat(20_000)).tool)
      .register(spy('over', z.object({}), async () => 'x'.repeat(20_001)).tool);
    assert.equal((await toolbox.execute(call('exact', '{}'))).content, 'x'.repeat(20_000));
    assert.match((await toolbox.execute(call('over', '{}'))).content, /20001/);
  });

  it('ошибки тоже обрезаются', async () => {
    const toolbox = new Toolbox({ maxResultChars: 300 }).register(calculator);
    const result = await toolbox.execute(call('calculate', `{"expression": "${'1+'.repeat(5000)}`));
    assert.equal(result.isError, true);
    assert.ok(result.content.length < 400, `слишком длинно: ${result.content.length}`);
  });
});
