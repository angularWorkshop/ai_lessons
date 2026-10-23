# Before the JavaScript exercises / Перед заданиями с кодом

The 26 policy labs use JSON. The 24 code labs require basic JavaScript functions, objects, arrays, and modules. They do not require React or Angular. If this is new, read the examples below and try them in a disposable `demo.mjs` with `node demo.mjs`. Our JavaScript course covers the prerequisites in depth.

26 заданий используют JSON-политики, ещё 24 — функции JavaScript. Для них нужны объекты, массивы и модули, но не Angular или React. Если это незнакомо, выполните примеры в отдельном `demo.mjs`: `node demo.mjs`. Полная база есть в курсе JavaScript; здесь только мост к лабораторным.

## Function, input, result / Функция, вход, результат

```js
export function solve(input) {
  const remaining = input.total - input.used;
  return { remaining, fits: remaining >= input.requested };
}
console.log(solve({ total: 10, used: 4, requested: 7 }));
// { remaining: 6, fits: false }
```

`export` lets a test import the function. `input.total` reads a property. `return` produces the result. `===` checks a value without converting its type: `true` is not the same as `"true"`.

`export` позволяет тесту импортировать функцию. `input.total` читает поле. `return` возвращает результат. `===` сравнивает без приведения типов: `true` не равняется `"true"`. В src/exercise.mjs оставьте экспорт solve: тест вызывает именно его, а не вывод console.log.

## Arrays / Массивы

```js
const records = [{ id: 'a', score: 2 }, { id: 'b', score: 5 }];
const ids = records.filter(x => x.score > 3).map(x => x.id);
console.log(ids); // ['b']
const ordered = [...records].sort((a, b) => b.score - a.score);
const total = records.reduce((sum, x) => sum + x.score, 0);
console.log(ordered[0].id, total); // b 7
```

`filter` selects, `map` transforms, `reduce` accumulates. `sort` modifies its array; `[...records]` creates a shallow copy first. `some` asks whether at least one item matches; `every` requires all items to match. Note that `[].every(...)` is true: separately check length when an empty result must not pass.

`filter` отбирает элементы, `map` преобразует, `reduce` накапливает. `sort` меняет массив; `[...records]` сначала создаёт поверхностную копию. `some` ищет хотя бы одно совпадение, `every` требует все. Для пустого массива every возвращает true: если пустой ответ не считается успехом, проверяйте длину отдельно.

## JSON text versus an object / JSON-строка и объект

```js
try {
  const value = JSON.parse('{"count":2}');
  console.log(value.count); // 2
} catch (error) {
  console.log('Invalid JSON');
}
```

JSON is text. Parse it before accessing fields, then validate types. `typeof null` is `"object"`, so reject null explicitly for object contracts. `Number.isFinite(value)` rejects strings, null, NaN, and Infinity. A successful parse does not prove semantic correctness.

JSON — текст: сначала разберите его, потом проверьте типы. `typeof null` возвращает `"object"`, поэтому null проверяется отдельно. `Number.isFinite` отклоняет строки, null, NaN и Infinity. Корректный синтаксис не гарантирует правильного содержания.

## A useful failed test / Как читать падение теста

Run `npm test` in the starter directory. Read the scenario name, expected, and actual. Change only `src/exercise.mjs`. Save with `npm run start:dev` running to see status update. Copying the answer into that file must pass the same tests. Do not copy test or runtime files and do not remove checks.

Выполните `npm test` внутри starter. Прочитайте имя сценария, expected и actual. Меняйте только `src/exercise.mjs`. Runner `npm run start:dev` повторяет проверку при сохранении. Эталон из answer должен проходить те же тесты после копирования только файла решения. Удаление проверки — не выполнение задания.
