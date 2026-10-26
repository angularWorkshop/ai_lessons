// Набор для trigger-eval скилла failing-test. Маленький: лимит запросов к модели общий на весь курс.
// Отрицательные кейсы — «почти»: про тесты, но разбирать падение в них не нужно.
import type { TriggerCase } from './trigger-eval.ts';

export const TRIGGER_SKILL = 'failing-test';

export const TRIGGER_CASES: TriggerCase[] = [
  {
    id: 'лог-ci',
    input: `CI упал после моего пуша, вот кусок лога:
✖ failing tests:

test at tests/session.test.ts:41:3
✖ история не теряет system (1.2ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  3 !== 2`,
    expected: true,
  },
  {
    id: 'not-completed',
    input: `Пишет ASSIGNMENT STATUS: NOT COMPLETED, хотя я вроде всё сделал. Что ему не нравится?
✖ Шаг 3 / Step 3. Цикл
  Error: TODO: шаг 3
      at Agent.run (/home/projects/app/src/agent.ts:88:11)`,
    expected: true,
  },
  {
    id: 'typeerror',
    input: `npm test валится: TypeError: Cannot read properties of undefined (reading 'trim') at parseSkill (src/skills/skill.ts:87:41). Как починить?`,
    expected: true,
  },
  {
    id: 'красное-в-консоли',
    input: `почему после сохранения в консоли красное?  ✖ пустые правила пропускаются  '- a' !== '- a\\n- '`,
    expected: true,
  },
  {
    id: 'написать-тест',
    input: 'Напиши тест на node:test для truncate из src/tools.ts: короткий текст не меняется, длинный обрезается с пометкой.',
    expected: false,
  },
  {
    id: 'коммит-после-фикса',
    input: 'Я починил падающий тест в tests/session.test.ts, поменял одну строку в src/session.ts. Придумай сообщение коммита.',
    expected: false,
  },
  {
    id: 'пропустить-тест',
    input: 'Как в node:test временно пропустить один тест, не удаляя его?',
    expected: false,
  },
  {
    id: 'медленные-тесты',
    input: 'npm test идёт 40 секунд, хотя тестов штук двадцать и все зелёные. С чего начать ускорение?',
    expected: false,
  },
];

// Описания, которые сравниваем с тем, что сейчас в skills/failing-test/SKILL.md. Добавляй сюда свои варианты.
export const DESCRIPTION_VARIANTS: string[] = ['Помогает с тестами.'];
