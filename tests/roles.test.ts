import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message } from '../src/llm.ts';
import { executorPrompt, reviewerPrompt, roleAgent, ROLES, runPipeline, type PipelineOptions } from '../src/subagents/roles.ts';
import { completeJson, VERDICT_REQUEST, VerdictSchema } from '../src/subagents/verdict.ts';
import { StructuredOutputError } from '../src/structured.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Workspace } from '../src/todo/workspace.ts';

const TASK = 'Почини average';
const approve = (usage = { input: 0, output: 0 }) => textReply(JSON.stringify({ verdict: 'approve', issues: [] }), { usage });
const revise = (...issues: string[]) => textReply(JSON.stringify({ verdict: 'revise', issues }));

// У каждой роли свой сценарий: так видно, кто что получил.
function scripted(planner: ScriptedProvider, executor: ScriptedProvider, reviewer: ScriptedProvider, extra: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    provider: new ScriptedProvider([]),
    providers: { planner, executor, reviewer },
    workspace: new Workspace({ 'src/math.ts': 'export function average() {}' }),
    ...extra,
  };
}

const lastUser = (messages: Message[]) => messages.filter((m) => m.role === 'user').at(-1)?.content;

describe('Шаг 1 / Step 1. Вердикт по схеме через Provider', () => {
  it('ответ по схеме — данные с первой попытки, response_format с именем verdict', async () => {
    const provider = new ScriptedProvider([textReply('{"verdict":"approve","issues":[]}', { usage: { input: 10, output: 5 } })]);
    const result = await completeJson(provider, [{ role: 'user', content: 'Вердикт?' }], VerdictSchema, { name: 'verdict' });

    assert.deepEqual(result.data, { verdict: 'approve', issues: [] });
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.usage, { input: 10, output: 5 });
    const format = provider.requests[0].options.responseFormat;
    assert.equal(format?.type, 'json_schema');
    assert.equal(format?.type === 'json_schema' && format.json_schema.name, 'verdict');
  });

  it('кривой ответ — одна попытка починки с описанием ошибки', async () => {
    const provider = new ScriptedProvider([textReply('{"verdict":"maybe"}'), revise('Нет теста')]);
    const result = await completeJson(provider, [{ role: 'user', content: 'Вердикт?' }], VerdictSchema);

    assert.deepEqual(result.data, { verdict: 'revise', issues: ['Нет теста'] });
    assert.equal(result.attempts, 2);
    const second = provider.requests[1].messages;
    assert.deepEqual(second.at(-2), { role: 'assistant', content: '{"verdict":"maybe"}' });
    assert.match(lastUser(second) ?? '', /Ответ не прошёл проверку/);
  });

  it('два кривых ответа — StructuredOutputError', async () => {
    const provider = new ScriptedProvider([textReply('не json'), textReply('{}')]);
    await assert.rejects(completeJson(provider, [{ role: 'user', content: 'Вердикт?' }], VerdictSchema), StructuredOutputError);
  });
});

describe('Шаг 2 / Step 2. Три роли', () => {
  it('планировщик и ревьюер только читают, исполнитель ещё и пишет', async () => {
    const planner = new ScriptedProvider([textReply('план')]);
    const executor = new ScriptedProvider([textReply('сделал')]);
    const reviewer = new ScriptedProvider([textReply('проверил')]);
    const options = scripted(planner, executor, reviewer);
    await roleAgent('planner', options).run('a');
    await roleAgent('executor', options).run('b');
    await roleAgent('reviewer', options).run('c');

    const tools = (provider: ScriptedProvider) => provider.requests[0].options.tools?.map((spec) => spec.function.name);
    assert.deepEqual(tools(planner), ['list_files', 'read_file']);
    assert.deepEqual(tools(executor), ['list_files', 'read_file', 'write_file']);
    assert.deepEqual(tools(reviewer), ['list_files', 'read_file']);
  });

  it('у каждой роли свой system prompt', async () => {
    const planner = new ScriptedProvider([textReply('план')]);
    const reviewer = new ScriptedProvider([textReply('проверил')]);
    const options = scripted(planner, new ScriptedProvider([]), reviewer);
    await roleAgent('planner', options).run('a');
    await roleAgent('reviewer', options).run('b');
    assert.deepEqual(planner.requests[0].messages[0], { role: 'system', content: ROLES.planner.system });
    assert.deepEqual(reviewer.requests[0].messages[0], { role: 'system', content: ROLES.reviewer.system });
    assert.notEqual(ROLES.planner.system, ROLES.executor.system);
  });

  it('без своего провайдера роль берёт общий', async () => {
    const shared = new ScriptedProvider([textReply('план')]);
    await roleAgent('planner', { provider: shared, workspace: new Workspace() }).run('a');
    assert.equal(shared.requests.length, 1);
  });

  it('промпты: исполнитель получает задачу и план, ревьюер — задачу и отчёт', () => {
    assert.equal(executorPrompt('T', 'P'), 'Задача:\nT\n\nПлан:\nP');
    assert.match(executorPrompt('T', 'P', ['нет теста']), /Ревьюер вернул работу. Исправь:\n- нет теста$/);
    assert.equal(reviewerPrompt('T', 'R'), 'Задача:\nT\n\nОтчёт исполнителя:\nR');
  });
});

describe('Шаг 3 / Step 3. Конвейер: план → работа → проверка', () => {
  it('approve с первого раунда', async () => {
    const planner = new ScriptedProvider([textReply('1. Бросать RangeError')]);
    const executor = new ScriptedProvider([
      toolReply([{ name: 'write_file', args: { path: 'src/math.ts', content: 'throw new RangeError()' } }]),
      textReply('Добавил RangeError'),
    ]);
    const reviewer = new ScriptedProvider([
      toolReply([{ name: 'read_file', args: { path: 'src/math.ts' } }]),
      textReply('Проблем нет'),
      approve(),
    ]);
    const options = scripted(planner, executor, reviewer);
    const result = await runPipeline(TASK, options);

    assert.equal(result.status, 'approved');
    assert.equal(result.rounds, 1);
    assert.equal(result.plan, '1. Бросать RangeError');
    assert.deepEqual(result.verdict, { verdict: 'approve', issues: [] });
    assert.equal(options.workspace.read('src/math.ts'), 'throw new RangeError()');

    assert.equal(executor.requests[0].messages[1].content, executorPrompt(TASK, '1. Бросать RangeError'));
    assert.equal(reviewer.requests[0].messages[1].content, reviewerPrompt(TASK, 'Добавил RangeError'));
  });

  it('вердикт просим в истории ревьюера: он видит, что прочитал', async () => {
    const reviewer = new ScriptedProvider([
      toolReply([{ name: 'read_file', args: { path: 'src/math.ts' } }]),
      textReply('Проблем нет'),
      approve(),
    ]);
    await runPipeline(TASK, scripted(new ScriptedProvider([textReply('план')]), new ScriptedProvider([textReply('сделал')]), reviewer));

    const request = reviewer.requests[2];
    assert.equal(request.options.responseFormat?.type, 'json_schema');
    assert.deepEqual(request.messages[0], { role: 'system', content: ROLES.reviewer.system });
    assert.equal(lastUser(request.messages), VERDICT_REQUEST);
    assert.ok(request.messages.some((m) => m.role === 'tool' && m.content.includes('export function average')));
  });

  it('revise → исполнитель получает замечания, второй раунд → approve', async () => {
    const executor = new ScriptedProvider([textReply('сделал'), textReply('исправил')]);
    const reviewer = new ScriptedProvider([textReply('нет теста'), revise('tests/math.test.ts: нет теста на RangeError'), textReply('ок'), approve()]);
    const verdicts: string[] = [];
    const result = await runPipeline(
      TASK,
      scripted(new ScriptedProvider([textReply('план')]), executor, reviewer, {
        onVerdict: (verdict, round) => verdicts.push(`${round}: ${verdict.verdict}`),
      }),
    );

    assert.equal(result.status, 'approved');
    assert.equal(result.rounds, 2);
    assert.deepEqual(verdicts, ['1: revise', '2: approve']);
    assert.equal(executor.requests[1].messages[1].content, executorPrompt(TASK, 'план', ['tests/math.test.ts: нет теста на RangeError']));
    // Исполнитель второго раунда начинает с чистой истории: состояние — в файлах, замечания — в задании.
    assert.equal(executor.requests[1].messages.length, 2);
  });
});

describe('Шаг 4 / Step 4. Лимит раундов и сбои', () => {
  it('ревьюер всегда недоволен — остановка на maxRounds', async () => {
    const executor = new ScriptedProvider([textReply('1'), textReply('2')]);
    const reviewer = new ScriptedProvider([textReply('плохо'), revise('А'), textReply('плохо'), revise('Б')]);
    const result = await runPipeline(TASK, scripted(new ScriptedProvider([textReply('план')]), executor, reviewer, { maxRounds: 2 }));

    assert.equal(result.status, 'max_rounds');
    assert.equal(result.rounds, 2);
    assert.deepEqual(result.verdict, { verdict: 'revise', issues: ['Б'] });
    assert.equal(executor.remaining, 0);
    assert.equal(reviewer.remaining, 0);
  });

  it('по умолчанию — три раунда', async () => {
    const executor = new ScriptedProvider([textReply('1'), textReply('2'), textReply('3')]);
    const reviewer = new ScriptedProvider([textReply('-'), revise('x'), textReply('-'), revise('x'), textReply('-'), revise('x')]);
    const result = await runPipeline(TASK, scripted(new ScriptedProvider([textReply('план')]), executor, reviewer));
    assert.equal(result.status, 'max_rounds');
    assert.equal(result.rounds, 3);
  });

  it('исполнитель упал — failed, ревьюера не зовём', async () => {
    const reviewer = new ScriptedProvider([]);
    const result = await runPipeline(
      TASK,
      scripted(new ScriptedProvider([textReply('план')]), new ScriptedProvider([new Error('LLM API ответил 502')]), reviewer),
    );
    assert.equal(result.status, 'failed');
    assert.match(result.error ?? '', /executor: error.*502/);
    assert.equal(reviewer.requests.length, 0);
  });

  it('вердикт так и не прошёл схему — failed, а не исключение', async () => {
    const reviewer = new ScriptedProvider([textReply('ок'), textReply('approve'), textReply('approve!')]);
    const result = await runPipeline(TASK, scripted(new ScriptedProvider([textReply('план')]), new ScriptedProvider([textReply('сделал')]), reviewer));
    assert.equal(result.status, 'failed');
    assert.match(result.error ?? '', /^reviewer:/);
  });

  it('usage — сумма всех ролей и вердикта', async () => {
    const u = (n: number) => ({ usage: { input: n, output: 1 } });
    const result = await runPipeline(
      TASK,
      scripted(
        new ScriptedProvider([textReply('план', u(100))]),
        new ScriptedProvider([textReply('сделал', u(200))]),
        new ScriptedProvider([textReply('ок', u(300)), approve({ input: 400, output: 1 })]),
      ),
    );
    assert.deepEqual(result.usage, { input: 1000, output: 4 });
  });
});
