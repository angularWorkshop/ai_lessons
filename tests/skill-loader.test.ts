import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { Agent } from '../src/agent.ts';
import { buildSystemPrompt } from '../src/prompt.ts';
import { skillAgentSystem, skillAgentToolbox } from '../src/skills/agent-setup.ts';
import { discoverSkills, resolveInside, skillsSection, SKILLS_INTRO } from '../src/skills/loader.ts';
import { SkillError, type Skill } from '../src/skills/skill.ts';
import { formatSkill, loadSkillTool, readSkillFileTool, skillTools } from '../src/skills/skill-tools.ts';
import { ScriptedProvider, textReply, toolReply } from '../src/testing/scripted-provider.ts';
import { Toolbox } from '../src/tools.ts';

// Скиллы для тестов лежат в tests/fixtures/skills: два правильных, один сломанный и папка без SKILL.md.
const FIXTURES = resolve('tests/fixtures/skills');

async function fixtureSkills(): Promise<Skill[]> {
  return (await discoverSkills(FIXTURES)).skills;
}

function byName(skills: Skill[], name: string): Skill {
  const skill = skills.find((item) => item.name === name);
  assert.ok(skill, `нет скилла ${name}`);
  return skill;
}

describe('Шаг 1 / Step 1. Поиск скиллов', () => {
  it('находит папки с SKILL.md, по алфавиту, с абсолютным путём к папке', async () => {
    const { skills } = await discoverSkills(FIXTURES);
    assert.deepEqual(
      skills.map((skill) => skill.name),
      ['api-review', 'release-notes'],
    );
    assert.equal(skills[1].dir, join(FIXTURES, 'release-notes'));
  });

  it('сломанный скилл не попадает в список, а возвращается ошибкой', async () => {
    const { errors } = await discoverSkills(FIXTURES);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof SkillError);
    assert.match(errors[0].file, /broken-skill/);
  });

  it('папка без SKILL.md — не скилл и не ошибка', async () => {
    const { skills, errors } = await discoverSkills(FIXTURES);
    // Четыре папки: два скилла, один сломанный и notes без SKILL.md.
    assert.equal(skills.length + errors.length, 3);
  });

  it('нет папки — нет скиллов, без исключения', async () => {
    assert.deepEqual(await discoverSkills(resolve('tests/fixtures/nope')), { skills: [], errors: [] });
  });

  it('скиллы проекта находятся без ошибок', async () => {
    const { skills, errors } = await discoverSkills('skills');
    assert.deepEqual(errors, []);
    assert.deepEqual(
      skills.map((skill) => skill.name),
      ['commit-message', 'failing-test'],
    );
  });
});

describe('Шаг 2 / Step 2. Список скиллов в system prompt', () => {
  it('нет скиллов — нет раздела', () => {
    assert.deepEqual(skillsSection([]), []);
  });

  it('раздел «Скиллы»: вступление и строка «- имя — описание» на каждый скилл', async () => {
    const skills = await fixtureSkills();
    const [section] = skillsSection(skills);
    assert.equal(section.title, 'Скиллы');
    assert.equal(
      section.body,
      `${SKILLS_INTRO}\n\n` +
        '- api-review — Проверяет публичный API модуля. Используй перед релизом.\n' +
        '- release-notes — Пишет заметки к релизу по списку коммитов. Используй, когда просят changelog или release notes.',
    );
  });

  it('многострочное описание сворачивается в одну строку', () => {
    const skill = { name: 'a', description: 'Первая строка.\nВторая   строка.', body: 'x', dir: '/a', frontmatter: {} };
    assert.match(skillsSection([skill])[0].body, /- a — Первая строка\. Вторая строка\.$/);
  });

  it('в system prompt — имена и описания, но не тела', async () => {
    const skills = await fixtureSkills();
    const system = buildSystemPrompt({ role: 'Ты агент.', sections: skillsSection(skills) });
    assert.match(system, /## Скиллы/);
    assert.match(system, /- release-notes — /);
    assert.doesNotMatch(system, /Сгруппируй коммиты/);
  });
});

describe('Шаг 3 / Step 3. load_skill', () => {
  it('formatSkill: тело в теге <skill>, потом список файлов', async () => {
    const skill = byName(await fixtureSkills(), 'release-notes');
    assert.equal(
      formatSkill(skill, ['references/template.md']),
      `<skill name="release-notes">\n${skill.body}\n</skill>\n\n` +
        'Файлы скилла — читай через read_skill_file, когда инструкция на них ссылается:\n- references/template.md',
    );
  });

  it('formatSkill: без файлов — только тело', async () => {
    const skill = byName(await fixtureSkills(), 'api-review');
    assert.equal(formatSkill(skill, []), `<skill name="api-review">\n${skill.body}\n</skill>`);
  });

  it('load_skill возвращает тело и все файлы скилла, включая вложенные папки', async () => {
    const tool = loadSkillTool(await fixtureSkills());
    assert.equal(tool.name, 'load_skill');
    const text = await tool.run({ name: 'release-notes' }, {});
    assert.match(text, /^<skill name="release-notes">\n# Заметки к релизу/);
    assert.match(text, /- references\/examples\/one\.md\n- references\/template\.md$/);
    assert.doesNotMatch(text, /SKILL\.md/);
  });

  it('имени нет в списке — ошибка с допустимыми именами, а не исключение', async () => {
    const toolbox = new Toolbox().register(loadSkillTool(await fixtureSkills()));
    const result = await toolbox.execute({ id: 'call_1', name: 'load_skill', arguments: '{"name":"changelog"}' });
    assert.equal(result.isError, true);
    assert.match(result.content, /release-notes/);
  });
});

describe('Шаг 4 / Step 4. read_skill_file и проверка пути', () => {
  it('читает файл внутри папки скилла', async () => {
    const tool = readSkillFileTool(await fixtureSkills());
    assert.equal(tool.name, 'read_skill_file');
    assert.equal(await tool.run({ name: 'release-notes', path: 'references/template.md' }, {}), '## Что нового\n');
  });

  it('путь с .. внутри папки допустим, если не выходит наружу', async () => {
    const dir = join(FIXTURES, 'release-notes');
    assert.equal(await resolveInside(dir, 'references/../references/template.md'), join(dir, 'references', 'template.md'));
  });

  it('выход за папку скилла — ошибка', async () => {
    const dir = join(FIXTURES, 'release-notes');
    await assert.rejects(resolveInside(dir, '../api-review/SKILL.md'), /за пределы/);
    await assert.rejects(resolveInside(dir, '../../secret.txt'), /за пределы/);
    await assert.rejects(resolveInside(dir, '..'), /за пределы/);
    await assert.rejects(resolveInside(dir, '.'), /за пределы/);
  });

  it('абсолютный путь — ошибка, даже если он ведёт внутрь', async () => {
    const dir = join(FIXTURES, 'release-notes');
    await assert.rejects(resolveInside(dir, join(dir, 'references', 'template.md')), /абсолютный/);
  });

  it('через Toolbox: попытка прочитать чужой файл — результат-ошибка, секрет не утёк', async () => {
    const toolbox = new Toolbox().register(readSkillFileTool(await fixtureSkills()));
    const result = await toolbox.execute({
      id: 'call_1',
      name: 'read_skill_file',
      arguments: JSON.stringify({ name: 'release-notes', path: '../../secret.txt' }),
    });
    assert.equal(result.isError, true);
    assert.doesNotMatch(result.content, /секрет/);
  });

  it('файла нет — ошибка со списком файлов, которые есть', async () => {
    const tool = readSkillFileTool(await fixtureSkills());
    await assert.rejects(tool.run({ name: 'release-notes', path: 'references/changelog.md' }, {}), /references\/template\.md/);
  });
});

describe('Шаг 5 / Step 5. Скиллы в агенте', () => {
  it('нет скиллов — нет инструментов', () => {
    assert.deepEqual(skillTools([]), []);
  });

  it('есть скиллы — load_skill и read_skill_file', async () => {
    assert.deepEqual(
      skillTools(await fixtureSkills()).map((tool) => tool.name),
      ['load_skill', 'read_skill_file'],
    );
  });

  it('агент со скиллами: список в system, четыре инструмента', async () => {
    const { skills } = await discoverSkills('skills');
    const system = skillAgentSystem(skills);
    assert.match(system, /## Скиллы\n/);
    assert.match(system, /- commit-message — /);
    assert.match(system, /- failing-test — /);
    assert.deepEqual(
      skillAgentToolbox(skills)
        .specs()
        .map((spec) => spec.function.name),
      ['get_current_time', 'calculate', 'load_skill', 'read_skill_file'],
    );
  });

  it('без скиллов system и инструменты — как у агента без них', () => {
    assert.doesNotMatch(skillAgentSystem([]), /Скилл/);
    assert.equal(skillAgentToolbox([]).specs().length, 2);
  });

  it('тело скилла приходит в историю, только когда модель его загрузила', async () => {
    const { skills } = await discoverSkills('skills');
    const provider = new ScriptedProvider([
      toolReply([{ name: 'load_skill', args: { name: 'commit-message' } }]),
      toolReply([{ name: 'read_skill_file', args: { name: 'commit-message', path: 'references/scopes.md' } }]),
      textReply('fix(agent): show the first non-empty line of a tool result'),
    ]);
    const agent = new Agent({ provider, toolbox: skillAgentToolbox(skills), system: skillAgentSystem(skills) });
    const run = await agent.run('Напиши сообщение коммита для diff');

    assert.equal(run.stopReason, 'done');
    const [first, second, third] = provider.requests;
    assert.doesNotMatch(JSON.stringify(first.messages), /# Сообщение коммита/);
    const loaded = second.messages.at(-1);
    assert.ok(loaded?.role === 'tool');
    assert.match(loaded.content, /^<skill name="commit-message">/);
    assert.match(loaded.content, /- references\/scopes\.md/);
    assert.equal(third.messages.at(-1)?.content, readFileSync('skills/commit-message/references/scopes.md', 'utf8'));
  });
});
