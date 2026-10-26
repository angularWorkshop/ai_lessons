import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Agent } from '../src/agent.ts';
import type { ChatOptions, ChatResult, Message } from '../src/llm.ts';
import type { Provider } from '../src/provider.ts';
import { BudgetExceededError, TokenBudget, withBudget } from '../src/subagents/budget.ts';
import { taskTool } from '../src/subagents/task-tool.ts';
import { ScriptedProvider, textReply, toolReply, type ScriptStep } from '../src/testing/scripted-provider.ts';
import { Workspace, workspaceTools } from '../src/todo/workspace.ts';
import { Toolbox } from '../src/tools.ts';

const PARENT = 'Ты — ведущий агент.';
const CHILD = 'Ты — субагент.';

const task = (description: string, prompt = description, id = `call_${description}`) => ({
  name: 'task',
  args: { description, prompt },
  id,
});
const toolMessages = (messages: Message[]) => messages.filter((m): m is Extract<Message, { role: 'tool' }> => m.role === 'tool');

// Дети работают одновременно, поэтому один сценарий на всех не годится: порядок запросов заранее не известен.
// Роутер отдаёт запрос сценарию того ребёнка, чей prompt в первом user-сообщении.
function router(scripts: Record<string, ScriptStep[]>) {
  const providers = Object.fromEntries(Object.entries(scripts).map(([prompt, script]) => [prompt, new ScriptedProvider(script)]));
  const provider: Provider = {
    complete(messages: Message[], options: ChatOptions): Promise<ChatResult> {
      const prompt = messages.find((m) => m.role === 'user')?.content as string;
      const target = providers[prompt];
      if (!target) {
        throw new Error(`Нет сценария для ребёнка с prompt «${prompt}»`);
      }
      return target.complete(messages, options);
    },
  };
  return { provider, providers };
}

// Ответ модели через ms миллисекунд. Отмена прерывает ожидание, как настоящий fetch.
const slow = (ms: number, reply: ChatResult, stats?: { active: number; max: number }): ScriptStep => async (request) => {
  if (stats) {
    stats.active++;
    stats.max = Math.max(stats.max, stats.active);
  }
  try {
    await delay(ms, undefined, { signal: request.options.signal });
    return reply;
  } finally {
    if (stats) {
      stats.active--;
    }
  }
};

const childTools = (workspace = new Workspace(), checkStale = false) => () => {
  const toolbox = new Toolbox();
  workspaceTools(workspace, { checkStale }).forEach((tool) => toolbox.register(tool));
  return toolbox;
};

describe('Шаг 1 / Step 1. Несколько task за шаг: параллельно и каждому свои инструменты', () => {
  it('три ребёнка работают одновременно, ответы ложатся в порядке вызовов', async () => {
    const stats = { active: 0, max: 0 };
    const { provider } = router({
      A: [slow(60, textReply('ответ A'), stats)],
      B: [slow(10, textReply('ответ B'), stats)],
      C: [slow(30, textReply('ответ C'), stats)],
    });
    const parent = new ScriptedProvider([toolReply([task('A'), task('B'), task('C')]), textReply('Готово')]);
    const tool = taskTool({ provider, toolbox: childTools(), system: CHILD });
    const started = Date.now();
    await new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT }).run('Задача');

    assert.equal(stats.max, 3, 'дети шли по очереди');
    assert.ok(Date.now() - started < 150, 'три ребёнка по 60 + 10 + 30 мс должны уложиться во время самого долгого');
    assert.deepEqual(
      toolMessages(parent.requests[1].messages).map((m) => [m.tool_call_id, m.content]),
      [['call_A', 'ответ A'], ['call_B', 'ответ B'], ['call_C', 'ответ C']],
    );
  });

  it('toolbox-функция вызывается для каждого ребёнка заново', async () => {
    let made = 0;
    const factory = () => {
      made++;
      return childTools()();
    };
    const { provider } = router({ A: [textReply('a')], B: [textReply('b')] });
    const parent = new ScriptedProvider([toolReply([task('A'), task('B')]), textReply('Готово')]);
    const tool = taskTool({ provider, toolbox: factory, system: CHILD });
    await new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT }).run('Задача');
    assert.equal(made, 2);
  });

  it('отмена родителя останавливает всё дерево сразу', async () => {
    const controller = new AbortController();
    const { provider, providers } = router({
      A: [slow(5000, textReply('a'))],
      B: [slow(5000, textReply('b'))],
      C: [slow(5000, textReply('c'))],
    });
    const parent = new ScriptedProvider([toolReply([task('A'), task('B'), task('C')])]);
    const tool = taskTool({ provider, toolbox: childTools(), system: CHILD });
    const agent = new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT, signal: controller.signal });

    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    const run = await agent.run('Задача');

    assert.ok(Date.now() - started < 1000, 'дети не получили сигнал родителя');
    assert.equal(run.stopReason, 'aborted');
    const results = toolMessages(run.messages);
    assert.equal(results.length, 3, 'за каждым вызовом task — его результат');
    assert.ok(results.every((m) => m.content.startsWith('Ошибка')));
    assert.ok(Object.values(providers).every((p) => p.requests.length === 1));
  });
});

describe('Шаг 2 / Step 2. Общий бюджет токенов на всё дерево', () => {
  it('TokenBudget считает вход и выход', () => {
    const budget = new TokenBudget(100);
    budget.charge({ input: 60, output: 10 });
    assert.equal(budget.used, 70);
    assert.equal(budget.remaining, 30);
    assert.equal(budget.exhausted, false);
    budget.charge({ input: 25, output: 5 });
    assert.equal(budget.exhausted, true);
    assert.equal(budget.remaining, 0);
    assert.throws(() => new TokenBudget(0), RangeError);
  });

  it('withBudget списывает каждый ответ и не пускает запрос, когда бюджет кончился', async () => {
    const budget = new TokenBudget(100);
    const inner = new ScriptedProvider([textReply('1', { usage: { input: 80, output: 30 } }), textReply('2')]);
    const provider = withBudget(inner, budget);

    await provider.complete([{ role: 'user', content: 'x' }], {});
    assert.equal(budget.used, 110);
    await assert.rejects(provider.complete([{ role: 'user', content: 'x' }], {}), BudgetExceededError);
    assert.equal(inner.requests.length, 1, 'запрос сверх бюджета не должен уйти к модели');
  });

  it('родитель и дети тратят один бюджет: дерево останавливается целиком', async () => {
    const budget = new TokenBudget(1000);
    const usage = (n: number) => ({ usage: { input: n, output: 0 } });
    const { provider: children, providers } = router({
      A: [textReply('a', usage(700))],
      B: [slow(30, textReply('b', usage(500)))],
      C: [textReply('c')],
    });
    // Родитель: 100 токенов на первый шаг, потом три ребёнка, потом новый запрос — уже сверх бюджета.
    const parent = new ScriptedProvider([toolReply([task('A'), task('B')], usage(100)), toolReply([task('C')]), textReply('не дойдём')]);
    const tool = taskTool({ provider: withBudget(children, budget), toolbox: childTools(), system: CHILD });
    const run = await new Agent({ provider: withBudget(parent, budget), toolbox: new Toolbox().register(tool), system: PARENT }).run('Задача');

    assert.equal(budget.used, 1300, 'A и B стартовали, пока бюджет был: 100 + 700 + 500');
    assert.equal(run.stopReason, 'error');
    assert.match(run.answer, /бюджет токенов исчерпан/);
    assert.equal(parent.requests.length, 1, 'второй запрос родителя не ушёл');
    assert.equal(providers.C.requests.length, 0);
  });

  it('ребёнок упёрся в бюджет — у родителя результат-ошибка с причиной', async () => {
    const budget = new TokenBudget(10);
    budget.charge({ input: 10, output: 0 });
    const tool = taskTool({ provider: withBudget(new ScriptedProvider([]), budget), toolbox: childTools(), system: CHILD });
    const result = await new Toolbox().register(tool).execute({ id: 'c', name: 'task', arguments: JSON.stringify({ description: 'A', prompt: 'A' }) });
    assert.equal(result.isError, true);
    assert.match(result.content, /бюджет токенов исчерпан/);
  });
});

describe('Шаг 3 / Step 3. Таймаут ребёнка', () => {
  it('ребёнок не уложился — ошибка с понятной причиной, остальные и родитель работают дальше', async () => {
    const { provider } = router({ A: [slow(5000, textReply('a'))], B: [textReply('b')] });
    const parent = new ScriptedProvider([toolReply([task('A'), task('B')]), textReply('Готово без A')]);
    const tool = taskTool({ provider, toolbox: childTools(), system: CHILD, timeoutMs: 30 });
    const started = Date.now();
    const run = await new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT }).run('Задача');

    assert.ok(Date.now() - started < 1000);
    assert.equal(run.stopReason, 'done');
    const [a, b] = toolMessages(parent.requests[1].messages);
    assert.match(a.content, /не уложился в 30 мс/);
    assert.equal(b.content, 'b');
  });

  it('отмена родителя — это не таймаут', async () => {
    const controller = new AbortController();
    const { provider } = router({ A: [slow(5000, textReply('a'))] });
    const parent = new ScriptedProvider([toolReply([task('A')])]);
    const tool = taskTool({ provider, toolbox: childTools(), system: CHILD, timeoutMs: 10_000 });
    setTimeout(() => controller.abort(), 20);
    const run = await new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT, signal: controller.signal }).run('Задача');

    assert.equal(run.stopReason, 'aborted');
    const result = toolMessages(run.messages)[0].content;
    assert.match(result, /остановлен|остановил/);
    assert.doesNotMatch(result, /не уложился/);
  });
});

describe('Шаг 4 / Step 4. Два агента пишут в один файл', () => {
  // Оба ребёнка сначала читают REPORT.md, потом каждый пишет «старое + свой раздел». B пишет чуть позже A.
  function writers(checkStale: boolean, bRetry: ScriptStep[] = []) {
    const workspace = new Workspace({ 'REPORT.md': '# Отчёт\n' });
    const read = toolReply([{ name: 'read_file', args: { path: 'REPORT.md' } }]);
    const write = (content: string) => toolReply([{ name: 'write_file', args: { path: 'REPORT.md', content } }]);
    const { provider, providers } = router({
      A: [read, slow(5, write('# Отчёт\nA\n')), textReply('A готов')],
      B: [read, slow(30, write('# Отчёт\nB\n')), ...bRetry, textReply('B готов')],
    });
    const parent = new ScriptedProvider([toolReply([task('A'), task('B')]), textReply('Готово')]);
    const tool = taskTool({ provider, toolbox: childTools(workspace, checkStale), system: CHILD });
    return { workspace, providers, agent: new Agent({ provider: parent, toolbox: new Toolbox().register(tool), system: PARENT }) };
  }

  it('без проверки: запись B молча затирает раздел A', async () => {
    const { workspace, agent } = writers(false);
    await agent.run('Задача');
    assert.equal(workspace.read('REPORT.md'), '# Отчёт\nB\n');
  });

  it('с проверкой: B получает ошибку, перечитывает и пишет поверх — оба раздела на месте', async () => {
    const retry = [
      toolReply([{ name: 'read_file', args: { path: 'REPORT.md' } }]),
      toolReply([{ name: 'write_file', args: { path: 'REPORT.md', content: '# Отчёт\nA\nB\n' } }]),
    ];
    const { workspace, providers, agent } = writers(true, retry);
    await agent.run('Задача');
    assert.equal(workspace.read('REPORT.md'), '# Отчёт\nA\nB\n');
    // B узнал о конфликте из результата своей первой записи.
    const afterWrite = providers.B.requests[2].messages.at(-1);
    assert.equal(afterWrite?.role, 'tool');
    assert.match(afterWrite.content as string, /изменился после того, как ты его прочитал/);
  });

  it('с проверкой: текст ошибки объясняет, что делать', async () => {
    const workspace = new Workspace({ 'REPORT.md': '# Отчёт\n' });
    const [mine, other] = [childTools(workspace, true)(), childTools(workspace, true)()];
    const exec = (toolbox: Toolbox, name: string, args: unknown) => toolbox.execute({ id: 'c', name, arguments: JSON.stringify(args) });

    const blind = await exec(mine, 'write_file', { path: 'REPORT.md', content: 'x' });
    assert.equal(blind.isError, true);
    assert.match(blind.content, /не читал/);

    await exec(mine, 'read_file', { path: 'REPORT.md' });
    await exec(other, 'read_file', { path: 'REPORT.md' });
    assert.equal((await exec(other, 'write_file', { path: 'REPORT.md', content: 'other' })).isError, false);
    const stale = await exec(mine, 'write_file', { path: 'REPORT.md', content: 'mine' });
    assert.equal(stale.isError, true);
    assert.match(stale.content, /изменился после того, как ты его прочитал/);
    assert.equal(workspace.read('REPORT.md'), 'other');

    assert.equal((await exec(mine, 'write_file', { path: 'NEW.md', content: 'новый файл можно' })).isError, false);
    // Без checkStale те же инструменты пишут вслепую, как раньше.
    const plain = childTools(workspace, false)();
    assert.equal((await exec(plain, 'write_file', { path: 'REPORT.md', content: 'вслепую' })).isError, false);
  });
});
