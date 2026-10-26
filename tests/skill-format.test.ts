import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseFrontmatter, parseScalar, splitFrontmatter } from '../src/skills/frontmatter.ts';
import { parseSkill, SkillError, validateSkill } from '../src/skills/skill.ts';

// Формат SKILL.md проверяется без модели и без сети: на вход текст, на выход объект или список проблем.

const VALID = `---
name: commit-message
description: Пишет сообщение коммита. Используй, когда нужно сообщение для git commit.
---

# Сообщение коммита

Сначала прочитай diff.
`;

describe('Шаг 1 / Step 1. Шапка и тело', () => {
  it('шапка — между строками ---, тело — всё после, без пустых строк по краям', () => {
    const { yaml, body } = splitFrontmatter(VALID);
    assert.equal(yaml, 'name: commit-message\ndescription: Пишет сообщение коммита. Используй, когда нужно сообщение для git commit.');
    assert.equal(body, '# Сообщение коммита\n\nСначала прочитай diff.');
  });

  it('Windows-переводы строк и BOM в начале файла не мешают', () => {
    const text = '\uFEFF' + VALID.replaceAll('\n', '\r\n');
    const { yaml, body } = splitFrontmatter(text);
    assert.equal(yaml.split('\n')[0], 'name: commit-message');
    assert.equal(body, '# Сообщение коммита\n\nСначала прочитай diff.');
  });

  it('--- в теле — это уже Markdown, шапка закрывается на первом', () => {
    const { body } = splitFrontmatter('---\nname: a\n---\nвыше\n\n---\n\nниже');
    assert.equal(body, 'выше\n\n---\n\nниже');
  });

  it('нет --- в первой строке — ошибка', () => {
    assert.throws(() => splitFrontmatter('# Просто Markdown\n---\nname: a\n---'), /---/);
  });

  it('нет закрывающей --- — ошибка', () => {
    assert.throws(() => splitFrontmatter('---\nname: a\ndescription: b\n'), /---/);
  });
});

describe('Шаг 2 / Step 2. Одно значение', () => {
  it('простое значение — как есть, без пробелов по краям', () => {
    assert.equal(parseScalar('  commit-message  '), 'commit-message');
  });

  it('комментарий « # …» после значения отрезается, а C# остаётся', () => {
    assert.equal(parseScalar('commit-message   # имя папки'), 'commit-message');
    assert.equal(parseScalar('Пишет код на C#'), 'Пишет код на C#');
  });

  it('двойные кавычки снимаются, \\" и \\n понимаются', () => {
    assert.equal(parseScalar('"1.0"'), '1.0');
    assert.equal(parseScalar('"Скажи \\"привет\\"\\nи всё"'), 'Скажи "привет"\nи всё');
  });

  it("одинарные кавычки снимаются, '' внутри — одна кавычка", () => {
    assert.equal(parseScalar("'Use when: the user asks'"), 'Use when: the user asks');
    assert.equal(parseScalar("'it''s'"), "it's");
  });

  it('незакрытые кавычки — ошибка', () => {
    assert.throws(() => parseScalar('"1.0'), /кавычк/);
    assert.throws(() => parseScalar("'1.0"), /кавычк/);
  });
});

describe('Шаг 3 / Step 3. Шапка целиком', () => {
  it('ключи и значения, двоеточие внутри значения — часть значения', () => {
    assert.deepEqual(parseFrontmatter('name: pdf\ndescription: Use this skill when: the user asks about PDFs'), {
      name: 'pdf',
      description: 'Use this skill when: the user asks about PDFs',
    });
  });

  it('пустые строки и комментарии пропускаются', () => {
    assert.deepEqual(parseFrontmatter('# шапка\n\nname: pdf\n\n# конец'), { name: 'pdf' });
  });

  it('«>» склеивает строки абзаца через пробел', () => {
    const data = parseFrontmatter('description: >\n  Пишет сообщение коммита.\n  Используй для git commit.\nname: a');
    assert.deepEqual(data, { description: 'Пишет сообщение коммита. Используй для git commit.', name: 'a' });
  });

  it('«|» сохраняет переводы строк', () => {
    const data = parseFrontmatter('license: |\n  MIT\n  см. LICENSE.txt\n');
    assert.equal(data.license, 'MIT\nсм. LICENSE.txt');
  });

  it('metadata — карта строк под ключом с пустым значением', () => {
    const data = parseFrontmatter('name: a\nmetadata:\n  author: edutec\n  version: "1.0"\n');
    assert.deepEqual(data.metadata, { author: 'edutec', version: '1.0' });
  });

  it('ключ без значения и без блока — пустая строка', () => {
    assert.deepEqual(parseFrontmatter('license:'), { license: '' });
  });

  it('повтор ключа — ошибка с номером строки', () => {
    assert.throws(() => parseFrontmatter('name: a\nname: b'), /строка 2/);
  });

  it('строка без «ключ:» — ошибка с номером строки', () => {
    assert.throws(() => parseFrontmatter('name: a\nпросто текст'), /строка 2/);
  });

  it('продолжение значения без «>» — ошибка с подсказкой', () => {
    assert.throws(() => parseFrontmatter('description: Пишет коммиты.\n  Используй для git.'), />/);
  });

  it('списки не поддерживаются — ошибка, а не молча неверный результат', () => {
    assert.throws(() => parseFrontmatter('tags:\n  - git\n  - commit'), /строка 1/);
  });
});

describe('Шаг 4 / Step 4. Правила формата', () => {
  const ok = { name: 'commit-message', description: 'Пишет сообщение коммита. Используй для git commit.' };

  it('правильная шапка — проблем нет', () => {
    assert.deepEqual(validateSkill(ok, 'commit-message'), []);
    assert.deepEqual(validateSkill({ ...ok, name: 'pdf2text' }, 'pdf2text'), []);
  });

  it('без name и description — две проблемы, по одной на поле', () => {
    const problems = validateSkill({}, 'x');
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^name/);
    assert.match(problems[1], /^description/);
  });

  it('name: только a-z, 0-9 и одиночные дефисы не по краям', () => {
    for (const name of ['Commit-Message', '-commit', 'commit-', 'commit--message', 'commit_message', 'коммит']) {
      const problems = validateSkill({ ...ok, name }, name);
      assert.equal(problems.length, 1, `${name}: ${problems.join('; ')}`);
      assert.match(problems[0], /^name/);
    }
  });

  it('name: до 64 символов', () => {
    const name = 'a'.repeat(65);
    assert.match(validateSkill({ ...ok, name }, name).join('\n'), /64/);
    assert.deepEqual(validateSkill({ ...ok, name: 'a'.repeat(64) }, 'a'.repeat(64)), []);
  });

  it('name совпадает с именем папки', () => {
    const problems = validateSkill(ok, 'commit');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /папк/);
  });

  it('description: непустая, до 1024 символов, без XML-тегов', () => {
    assert.equal(validateSkill({ ...ok, description: '   ' }, ok.name).length, 1);
    assert.match(validateSkill({ ...ok, description: 'а'.repeat(1025) }, ok.name).join('\n'), /1024/);
    assert.deepEqual(validateSkill({ ...ok, description: 'а'.repeat(1024) }, ok.name), []);
    assert.equal(validateSkill({ ...ok, description: 'Читает <file> и пишет отчёт' }, ok.name).length, 1);
    assert.deepEqual(validateSkill({ ...ok, description: 'Сравнивает a < b и b > c' }, ok.name), []);
  });

  it('name и description — строки, а не карты', () => {
    const problems = validateSkill({ name: { a: 'b' }, description: { c: 'd' } }, 'x');
    assert.equal(problems.length, 2);
  });

  it('необязательные поля: compatibility до 500 символов, metadata — карта', () => {
    assert.equal(validateSkill({ ...ok, compatibility: 'x'.repeat(501) }, ok.name).length, 1);
    assert.equal(validateSkill({ ...ok, metadata: 'edutec' }, ok.name).length, 1);
    assert.deepEqual(validateSkill({ ...ok, license: 'MIT', metadata: { author: 'edutec' } }, ok.name), []);
  });
});

describe('Шаг 5 / Step 5. SKILL.md целиком', () => {
  it('текст → Skill: имя, описание, тело и папка', () => {
    const skill = parseSkill(VALID, '/project/skills/commit-message');
    assert.equal(skill.name, 'commit-message');
    assert.equal(skill.description, 'Пишет сообщение коммита. Используй, когда нужно сообщение для git commit.');
    assert.equal(skill.body, '# Сообщение коммита\n\nСначала прочитай diff.');
    assert.equal(skill.dir, '/project/skills/commit-message');
    assert.equal(skill.frontmatter.name, 'commit-message');
  });

  it('нарушения формата — SkillError с путём к файлу и всеми проблемами', () => {
    const text = VALID.replace('name: commit-message', 'name: Commit_Message');
    assert.throws(
      () => parseSkill(text, '/project/skills/commit-message'),
      (error: unknown) => {
        assert.ok(error instanceof SkillError);
        assert.match(error.file, /commit-message[\\/]SKILL\.md$/);
        assert.equal(error.problems.length, 2);
        assert.match(error.message, /Commit_Message/);
        return true;
      },
    );
  });

  it('сломанная шапка — тоже SkillError, а не голое исключение', () => {
    assert.throws(() => parseSkill('# без шапки', '/project/skills/x'), SkillError);
    assert.throws(() => parseSkill('---\nname: x\nmetadata:\n  - a\n---\nтело', '/project/skills/x'), SkillError);
  });

  it('пустое тело — проблема: скилл без инструкций бесполезен', () => {
    assert.throws(() => parseSkill('---\nname: x\ndescription: y\n---\n\n', '/project/skills/x'), /тело/);
  });

  it('все скиллы проекта в skills/ проходят проверку', () => {
    const dirs = readdirSync('skills').filter((name) => existsSync(join('skills', name, 'SKILL.md')));
    assert.ok(dirs.length >= 2, 'в skills/ должно быть хотя бы два скилла');
    for (const name of dirs) {
      const skill = parseSkill(readFileSync(join('skills', name, 'SKILL.md'), 'utf8'), join('skills', name));
      assert.equal(skill.name, name);
    }
  });

  it('файлы, на которые ссылаются тела скиллов, существуют', () => {
    for (const name of readdirSync('skills')) {
      const file = join('skills', name, 'SKILL.md');
      if (!existsSync(file)) {
        continue;
      }
      const { body } = parseSkill(readFileSync(file, 'utf8'), join('skills', name));
      for (const [path] of body.matchAll(/(?:references|scripts|assets)\/[\w.-]+/g)) {
        assert.ok(existsSync(join('skills', name, path)), `${file} ссылается на ${path}, а его нет`);
      }
    }
  });
});
