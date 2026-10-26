import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEval } from '../src/eval.ts';
import { skillAgentSystem, skillAgentToolbox } from '../src/skills/agent-setup.ts';
import { discoverSkills } from '../src/skills/loader.ts';
import { SkillError } from '../src/skills/skill.ts';
import {
  formatTriggerReport,
  requestedSkills,
  triggers,
  triggersMostly,
  triggerStats,
  withDescription,
  TRIGGER_MAX_TOKENS,
  type TriggerCase,
} from '../src/skills/trigger-eval.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';

// Модель в тестах — ScriptedProvider: проверяем, как мы считаем срабатывания, а не саму модель.

const { skills } = await discoverSkills('skills');

function setupWith(provider: ScriptedProvider) {
  return { provider, system: skillAgentSystem(skills), tools: skillAgentToolbox(skills).specs() };
}

describe('Шаг 1 / Step 1. Какой скилл попросила модель', () => {
  it('имена из вызовов load_skill, другие инструменты не считаются', () => {
    const result = toolReply([
      { name: 'get_current_time', args: { timezone: 'UTC' } },
      { name: 'load_skill', args: { name: 'failing-test' } },
      { name: 'load_skill', args: { name: 'commit-message' } },
    ]);
    assert.deepEqual(requestedSkills(result), ['failing-test', 'commit-message']);
  });

  it('ответ текстом — ни одного скилла', () => {
    assert.deepEqual(requestedSkills(textReply('fix(agent): …')), []);
  });

  it('сломанные аргументы и аргументы без name — не загрузка, и без исключения', () => {
    const result = toolReply([
      { name: 'load_skill', args: '{"name": "failing-' },
      { name: 'load_skill', args: { skill: 'failing-test' } },
      { name: 'load_skill', args: { name: 42 } },
    ]);
    assert.deepEqual(requestedSkills(result), []);
  });
});

describe('Шаг 2 / Step 2. Один запрос — одно решение', () => {
  it('модель получает system агента, запрос пользователя и все инструменты', async () => {
    const provider = new ScriptedProvider([textReply('ok')]);
    const setup = setupWith(provider);
    await triggers(setup, 'failing-test', 'npm test красный');
    const [request] = provider.requests;
    assert.deepEqual(request.messages, [
      { role: 'system', content: setup.system },
      { role: 'user', content: 'npm test красный' },
    ]);
    assert.deepEqual(request.options.tools, setup.tools);
    assert.equal(request.options.maxTokens, TRIGGER_MAX_TOKENS);
  });

  it('load_skill нужного скилла — сработал', async () => {
    const provider = new ScriptedProvider([toolReply([{ name: 'load_skill', args: { name: 'failing-test' } }])]);
    assert.equal(await triggers(setupWith(provider), 'failing-test', 'CI упал'), true);
  });

  it('другой скилл или ответ текстом — не сработал', async () => {
    const provider = new ScriptedProvider([
      toolReply([{ name: 'load_skill', args: { name: 'commit-message' } }]),
      textReply('Вот как пропустить тест: it.skip(...)'),
    ]);
    const setup = setupWith(provider);
    assert.equal(await triggers(setup, 'failing-test', 'сообщение коммита'), false);
    assert.equal(await triggers(setup, 'failing-test', 'как пропустить тест'), false);
  });
});

describe('Шаг 2 / Step 2. Несколько прогонов', () => {
  const fired = () => toolReply([{ name: 'load_skill', args: { name: 'failing-test' } }]);
  const silent = () => textReply('Сейчас посмотрю.');

  it('по умолчанию три прогона: сработал в двух — сработал', async () => {
    const provider = new ScriptedProvider([fired(), silent(), fired()]);
    assert.equal(await triggersMostly(setupWith(provider), 'failing-test', 'CI упал'), true);
    assert.equal(provider.requests.length, 3);
  });

  it('сработал в одном из трёх — не сработал', async () => {
    const provider = new ScriptedProvider([silent(), fired(), silent()]);
    assert.equal(await triggersMostly(setupWith(provider), 'failing-test', 'CI упал'), false);
  });

  it('ровно половина — ещё не «больше половины»', async () => {
    const provider = new ScriptedProvider([fired(), silent()]);
    assert.equal(await triggersMostly(setupWith(provider), 'failing-test', 'CI упал', 2), false);
    assert.equal(provider.remaining, 0);
  });
});

describe('Шаг 3 / Step 3. Другое описание для замера', () => {
  it('меняется описание только у нужного скилла, в frontmatter — тоже', () => {
    const changed = withDescription(skills, 'failing-test', 'Помогает с тестами.');
    const target = changed.find((skill) => skill.name === 'failing-test');
    assert.equal(target?.description, 'Помогает с тестами.');
    assert.equal(target?.frontmatter.description, 'Помогает с тестами.');
    assert.equal(target?.body, skills.find((skill) => skill.name === 'failing-test')?.body);
    assert.equal(changed.find((skill) => skill.name === 'commit-message'), skills.find((skill) => skill.name === 'commit-message'));
  });

  it('исходный список не меняется', () => {
    const before = skills.map((skill) => skill.description);
    withDescription(skills, 'failing-test', 'Помогает с тестами.');
    assert.deepEqual(
      skills.map((skill) => skill.description),
      before,
    );
  });

  it('новое описание попадает в system prompt', () => {
    const system = skillAgentSystem(withDescription(skills, 'failing-test', 'Помогает с тестами.'));
    assert.match(system, /- failing-test — Помогает с тестами\.$/m);
  });

  it('нет такого скилла — ошибка со списком имён', () => {
    assert.throws(() => withDescription(skills, 'failing-tests', 'x'), /failing-test/);
  });

  it('описание проходит те же правила, что SKILL.md', () => {
    assert.throws(() => withDescription(skills, 'failing-test', 'а'.repeat(1025)), SkillError);
    assert.throws(() => withDescription(skills, 'failing-test', '  '), SkillError);
    assert.throws(() => withDescription(skills, 'failing-test', 'Читает <log> и объясняет'), SkillError);
  });
});

describe('Шаг 4 / Step 4. Пропуски и ложные срабатывания', () => {
  const cases: TriggerCase[] = [
    { id: 'нужно-1', input: 'a', expected: true },
    { id: 'нужно-2', input: 'b', expected: true },
    { id: 'нужно-3', input: 'c', expected: true },
    { id: 'не-нужно-1', input: 'd', expected: false },
    { id: 'не-нужно-2', input: 'e', expected: false },
  ];
  const answers: Record<string, boolean | Error> = {
    a: true,
    b: false,
    c: new Error('LLM API ответил 502: <html>\n<head><title>502 Bad Gateway</title></head>\n</html>'),
    d: true,
    e: false,
  };
  const run = (input: string) => {
    const answer = answers[input];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };

  it('считает попадания, ложные срабатывания и ошибки отдельно', async () => {
    const report = await runEval(cases, run);
    assert.deepEqual(triggerStats(report), { hits: 1, shouldTrigger: 2, falseTriggers: 1, shouldNotTrigger: 2, errors: 1 });
  });

  it('отчёт: строка из formatReport, промахи и строка с пропусками и ложными', async () => {
    const report = await runEval(cases, run);
    const lines = formatTriggerReport('Помогает с тестами', report).split('\n');
    assert.equal(lines[0], 'Помогает с тестами: 2/5 (40%)');
    assert.equal(lines.length, 5);
    assert.equal(lines[2], '  ✖ нужно-3: ошибка — LLM API ответил 502: <html>');
    assert.equal(lines.at(-1), '  сработал, где нужно: 1/2 · сработал зря: 1/2');
  });
});
