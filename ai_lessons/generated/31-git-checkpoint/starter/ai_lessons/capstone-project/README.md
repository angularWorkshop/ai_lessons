# Task brief / Постановка

## Goal

Normalize tags consistently before displaying a filter. The function receives an array of strings; other input types are outside this task's contract.

## Scope

Edit only `src/tags.mjs`. Do not change tests, package scripts, dependencies, networking, or any other project. No publication or external tools are needed.

## Acceptance

- Trim each tag, lowercase it, and discard empty results.
- Remove duplicates after normalization.
- Return the normalized tags in ascending JavaScript string sort order.
- Return a new array without mutating the input.
- Empty input returns an empty array.
- `npm test` passes without changing its tests.

## Evidence

Preserve the changed source, actual test output, independent review findings, and handoff. A claimed success without command output is not verification.

## Русский

Цель: одинаково нормализовать теги для фильтра. Вход — массив строк, другие типы за рамками задачи. Менять можно только `src/tags.mjs`. Удалите пробелы по краям, приведите строки к нижнему регистру, отбросьте пустые значения, уберите дубликаты и отсортируйте стандартным строковым порядком JavaScript. Верните новый массив, исходный не меняйте. Для пустого входа верните пустой массив. `npm test` должен пройти без изменения тестов. Сохраните фактический вывод, отдельное ревью и handoff. Не публикуйте результат автоматически.
