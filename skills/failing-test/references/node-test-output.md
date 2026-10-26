# Как читать вывод node:test

`npm test` в проекте запускает `tsx --test tests/*.test.ts`. Сначала идёт дерево: группы `describe` и тесты внутри, `✔` — прошёл, `✖` — упал. Потом сводка `ℹ tests … ℹ pass … ℹ fail …`. Подробности падений — в самом конце, после строки `✖ failing tests:`.

## Падение проверки

```text
test at tests/prompt.test.ts:10:3
✖ пустые правила пропускаются (0.615125ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  '- a' !== '- a\n- '

      at TestContext.<anonymous> (/project/tests/prompt.test.ts:11:12)
      at Test.runInAsyncScope (node:async_hooks:214:14)
  {
    code: 'ERR_ASSERTION',
    actual: '- a',
    expected: '- a\n- ',
    operator: 'strictEqual'
  }
```

- `test at …:10:3` — где объявлен тест.
- Строка с `!==` — слева `actual`, что вернул код, справа `expected`, что ждал тест.
- `operator` — какая проверка: `strictEqual`, `deepStrictEqual`, `throws`, `match`.

## Функция ещё не написана

```text
✖ промпт из одной роли — это сама роль (0.4ms)
  Error: TODO: шаг 1
      at buildSystemPrompt (/project/src/prompt.ts:24:9)
```

Первая строка стека указывает в `src/` — это та функция, которую пора писать.

## Исключение в коде

```text
  TypeError: Cannot read properties of undefined (reading 'trim')
      at parseSkill (/project/src/skills/skill.ts:87:41)
      at TestContext.<anonymous> (/project/tests/skill-format.test.ts:40:5)
```

Проверка не дошла до сравнения: код упал на строке 87. Смотри, откуда пришёл `undefined`.

## Тест не закончился

```text
✖ агент останавливается по сигналу (30001ms)
  'test timed out after 30000ms'
```

Промис внутри теста так и не выполнился: забытый `await`, `resolve`, который никто не вызвал, или таймер, который никто не снял.
