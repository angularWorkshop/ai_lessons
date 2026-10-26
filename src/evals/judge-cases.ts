// Рубрика для сообщений коммита и примеры с разметкой человека.
// Diff — решения задач из evals/tasks: те самые правки, которые делал агент в теме 14.1.
// Формат первой строки (type, длина, точка) проверяет код — CommitSchema из темы 2.2. Судье — только смысл.
import type { LabeledCase, Rubric } from './judge.ts';

export const COMMIT_RUBRIC: Rubric = {
  subject: 'сообщение коммита к diff',
  criteria: [
    {
      id: 'accurate',
      question:
        'Всё, что сообщение говорит об изменениях, видно в diff: не выдуманы файлы, тесты, функции, числа или поведение, которых в diff нет.',
    },
    {
      id: 'main-change',
      question: 'Главное изменение названо конкретно: что поменялось в поведении. «Исправил баг», «обновил файлы», «улучшил» — не конкретно.',
    },
    {
      id: 'why',
      question: 'Понятно, зачем изменение: какая была проблема или что теперь можно. Пересказ кода («floor заменён на ceil») — не объяснение.',
    },
  ],
};

export const DIFF_PROMO = `diff --git a/src/discount.js b/src/discount.js
@@ -9,7 +9,7 @@ export function findPromo(code) {
 export function applyPromo(sum, promo) {
-  if (sum > promo.threshold) {
+  if (sum >= promo.threshold) {
     return Math.round(sum * (100 - promo.percent)) / 100;
   }
   return sum;`;

export const DIFF_PAGES = `diff --git a/src/pages.js b/src/pages.js
@@ -1,6 +1,6 @@
 // Постраничный вывод заказов: сколько всего страниц и что на странице с номером number (с 1).
 export function pageCount(total, size) {
-  return Math.floor(total / size);
+  return Math.ceil(total / size);
 }`;

export const DIFF_EMAIL = `diff --git a/src/users.js b/src/users.js
@@ -3,5 +3,10 @@ export function createUser({ name, email }) {
   if (!name || !name.trim()) {
     throw new Error('пустое имя');
   }
-  return { name: name.trim(), email: email.trim().toLowerCase() };
+  const clean = email.trim().toLowerCase();
+  const at = clean.indexOf('@');
+  if (at <= 0 || at === clean.length - 1) {
+    throw new Error('некорректный email');
+  }
+  return { name: name.trim(), email: clean };
 }
diff --git a/tests/users.test.js b/tests/users.test.js
@@ -12,3 +12,7 @@ test('пустое имя — ошибка', () => {
   assert.throws(() => createUser({ name: '  ', email: 'a@b.ru' }), /пустое имя/);
 });
+
+test('email без @ — ошибка', () => {
+  assert.throws(() => createUser({ name: 'Боб', email: 'bob.example.com' }), /некорректный email/);
+});`;

export const DIFF_PORT = `diff --git a/config.json b/config.json
@@ -1,5 +1,5 @@
 {
   "host": "localhost",
-  "port": 3000,
+  "port": 8080,
   "logLevel": "info"
 }
diff --git a/src/server.js b/src/server.js
@@ -4,7 +4,7 @@ const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
-/** Порт из PORT, потом из config.json, а если нет и там — 3000. */
-export const PORT = Number(process.env.PORT ?? config.port ?? 3000);
+/** Порт из PORT, потом из config.json, а если нет и там — 8080. */
+export const PORT = Number(process.env.PORT ?? config.port ?? 8080);
diff --git a/README.md b/README.md
@@ -1,4 +1,4 @@
-Настройки — в \`config.json\`. По умолчанию сервер слушает порт 3000: http://localhost:3000.
+Настройки — в \`config.json\`. По умолчанию сервер слушает порт 8080: http://localhost:8080.
diff --git a/tests/server.test.js b/tests/server.test.js
@@ -3,9 +3,9 @@ import { address, PORT } from '../src/server.js';
-test('порт по умолчанию — 3000', () => {
-  assert.equal(PORT, 3000);
+test('порт по умолчанию — 8080', () => {
+  assert.equal(PORT, 8080);
 });
 test('адрес сервера', () => {
-  assert.equal(address(), 'http://localhost:3000');
+  assert.equal(address(), 'http://localhost:8080');
 });`;

/** Пять хороших сообщений и семь плохих. Разметка — человека: так сказал бы ревьюер в команде. */
export const JUDGE_CASES: LabeledCase[] = [
  {
    id: 'promo-good',
    expected: true,
    input: {
      context: DIFF_PROMO,
      answer: 'fix(discount): apply promo from threshold inclusive\n\nЗаказ ровно на 1000 ₽ не получал скидку WELCOME: сравнение с порогом было строгим. Теперь sum >= threshold.',
    },
  },
  {
    id: 'promo-vague',
    expected: false,
    input: { context: DIFF_PROMO, answer: 'fix: исправил баг со скидкой' },
  },
  {
    id: 'promo-invented-tests',
    expected: false,
    input: {
      context: DIFF_PROMO,
      answer:
        'fix(discount): apply promo from threshold inclusive\n\nЗаказ ровно на 1000 ₽ не получал скидку: сравнение было строгим, теперь sum >= threshold. Добавил тесты на границу для WELCOME и BIG.',
    },
  },
  {
    id: 'pages-good',
    expected: true,
    input: {
      context: DIFF_PAGES,
      answer:
        'fix(pages): count the last partial page\n\nПри 21 заказе по 10 на странице pageCount возвращал 2, и 21-й заказ было не открыть. Неполная последняя страница теперь тоже считается.',
    },
  },
  {
    id: 'pages-paraphrase',
    expected: false,
    input: { context: DIFF_PAGES, answer: 'fix(pages): use Math.ceil instead of Math.floor\n\nВ pageCount Math.floor заменён на Math.ceil.' },
  },
  {
    id: 'pages-long-invented',
    expected: false,
    input: {
      context: DIFF_PAGES,
      answer:
        'fix(pages): make pagination robust\n\nПереработан постраничный вывод заказов. Количество страниц теперь считается с учётом неполной последней страницы, ' +
        'пустой список и номер страницы 0 обрабатываются отдельно, а page() корректно возвращает пустой массив при выходе за пределы. ' +
        'Это делает пагинацию надёжнее и удобнее для пользователей с длинными списками заказов.',
    },
  },
  {
    id: 'email-good',
    expected: true,
    input: {
      context: DIFF_EMAIL,
      answer:
        'feat(users): reject email without @\n\ncreateUser бросает «некорректный email», если @ нет или он стоит первым или последним: раньше такие адреса сохранялись как есть. Добавлен тест на email без @.',
    },
  },
  {
    id: 'email-wrong-rule',
    expected: false,
    input: {
      context: DIFF_EMAIL,
      answer:
        'feat(users): validate email format\n\ncreateUser бросает «некорректный email», если в адресе нет @ или точки в домене: раньше такие адреса сохранялись как есть. Добавлен тест.',
    },
  },
  {
    id: 'port-good',
    expected: true,
    input: {
      context: DIFF_PORT,
      answer: 'chore(config): change default port to 8080\n\nПорт по умолчанию теперь 8080 везде: в config.json, в запасном значении в server.js, в README и в тестах — чтобы они не расходились.',
    },
  },
  {
    id: 'port-wrong-number',
    expected: false,
    input: {
      context: DIFF_PORT,
      answer: 'chore(config): change default port to 8000\n\nСервер по умолчанию слушает 8000 вместо 3000. Обновлены config.json, server.js, README и тесты.',
    },
  },
  {
    id: 'promo-short-good',
    expected: true,
    input: { context: DIFF_PROMO, answer: 'fix(discount): give promo at exactly the threshold\n\nСкидка не срабатывала на сумме, равной порогу.' },
  },
  {
    id: 'promo-rounding-claim',
    expected: false,
    input: {
      context: DIFF_PROMO,
      answer:
        'fix(discount): apply promo from threshold inclusive\n\nЗаказ ровно на пороге не получал скидку. Теперь sum >= threshold, а суммы округляются до копеек.',
    },
  },
];

/** Пары для сравнения: first и second — два сообщения к одному diff. */
export interface JudgePair {
  title: string;
  context: string;
  first: string;
  second: string;
}

const answerOf = (id: string) => JUDGE_CASES.find((item) => item.id === id)!.input.answer;

export const JUDGE_PAIRS: JudgePair[] = [
  { title: 'короткое верное / длинное с выдумкой', context: DIFF_PAGES, first: answerOf('pages-good'), second: answerOf('pages-long-invented') },
  { title: 'верное правило / неверное правило', context: DIFF_EMAIL, first: answerOf('email-good'), second: answerOf('email-wrong-rule') },
  { title: 'два верных: короткое / подробное', context: DIFF_PROMO, first: answerOf('promo-short-good'), second: answerOf('promo-good') },
];
