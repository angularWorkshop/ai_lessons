import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSystemPrompt, formatRules } from '../src/prompt.ts';

// buildSystemPrompt — чистая функция: модель и сеть для проверки не нужны.

const ROLE = 'Ты пишешь сообщения коммитов для TypeScript-проекта. Тебе присылают git diff.';
const GOAL = 'Сообщение, которое можно сразу передать в git commit -m без правок.';
const FORMAT = 'Одна строка — само сообщение. Без кавычек, без Markdown, без пояснений до и после.';

describe('Шаг 1 / Step 1. Роль', () => {
  it('промпт из одной роли — это сама роль', () => {
    assert.equal(buildSystemPrompt({ role: ROLE }), ROLE);
  });

  it('пробелы и переводы строк по краям роли убираются', () => {
    assert.equal(buildSystemPrompt({ role: `\n  ${ROLE}  \n` }), ROLE);
  });

  it('пустая роль — ошибка, в которой упомянута role', () => {
    assert.throws(() => buildSystemPrompt({ role: '' }), /role/);
    assert.throws(() => buildSystemPrompt({ role: '   \n' }), /role/);
  });
});

describe('Шаг 2 / Step 2. Правила списком', () => {
  it('каждое правило — пункт «- …» на своей строке', () => {
    assert.equal(formatRules(['Пиши по-английски.', 'Без точки в конце.']), '- Пиши по-английски.\n- Без точки в конце.');
  });

  it('пробелы по краям правила убираются, пустые правила пропускаются', () => {
    assert.equal(formatRules(['  Одна строка.  ', '', '   ', 'До 72 символов.']), '- Одна строка.\n- До 72 символов.');
  });

  it('нет правил — пустая строка', () => {
    assert.equal(formatRules([]), '');
    assert.equal(formatRules(['', ' ']), '');
  });
});

describe('Шаг 3 / Step 3. Разделы по порядку', () => {
  it('роль, цель, правила, формат — через пустую строку, с заголовками ##', () => {
    const prompt = buildSystemPrompt({
      role: ROLE,
      goal: GOAL,
      rules: ['Формат Conventional Commits.', 'Без точки в конце.'],
      format: FORMAT,
    });
    assert.equal(
      prompt,
      [
        ROLE,
        `## Цель\n${GOAL}`,
        '## Правила\n- Формат Conventional Commits.\n- Без точки в конце.',
        `## Формат ответа\n${FORMAT}`,
      ].join('\n\n'),
    );
  });

  it('порядок не зависит от порядка полей в объекте', () => {
    const prompt = buildSystemPrompt({ format: FORMAT, rules: ['Без точки в конце.'], goal: GOAL, role: ROLE });
    assert.equal(prompt, `${ROLE}\n\n## Цель\n${GOAL}\n\n## Правила\n- Без точки в конце.\n\n## Формат ответа\n${FORMAT}`);
  });

  it('пустые и непереданные разделы пропускаются вместе с заголовком', () => {
    assert.equal(buildSystemPrompt({ role: ROLE, goal: '  ', rules: ['', ' '], format: FORMAT }), `${ROLE}\n\n## Формат ответа\n${FORMAT}`);
    assert.equal(buildSystemPrompt({ role: ROLE, rules: [] }), ROLE);
  });

  it('текст раздела обрезается по краям', () => {
    assert.equal(buildSystemPrompt({ role: ROLE, goal: `\n${GOAL}\n\n` }), `${ROLE}\n\n## Цель\n${GOAL}`);
  });
});

describe('Шаг 4 / Step 4. Дополнительные разделы', () => {
  it('идут после формата ответа, в том порядке, в каком переданы', () => {
    const prompt = buildSystemPrompt({
      role: ROLE,
      format: FORMAT,
      sections: [
        { title: 'Проект', body: 'Агент для работы с кодом, Node 20, TypeScript.' },
        { title: 'Модули', body: 'llm — клиент к модели, session — история диалога.' },
      ],
    });
    assert.equal(
      prompt,
      [
        ROLE,
        `## Формат ответа\n${FORMAT}`,
        '## Проект\nАгент для работы с кодом, Node 20, TypeScript.',
        '## Модули\nllm — клиент к модели, session — история диалога.',
      ].join('\n\n'),
    );
  });

  it('заголовок и текст раздела обрезаются, раздел с пустым текстом пропускается', () => {
    const prompt = buildSystemPrompt({
      role: ROLE,
      sections: [
        { title: '  Проект ', body: ' Агент для работы с кодом. ' },
        { title: 'Пусто', body: '   ' },
      ],
    });
    assert.equal(prompt, `${ROLE}\n\n## Проект\nАгент для работы с кодом.`);
  });

  it('раздел без заголовка — ошибка', () => {
    assert.throws(() => buildSystemPrompt({ role: ROLE, sections: [{ title: ' ', body: 'Текст' }] }), /заголов/);
  });
});
