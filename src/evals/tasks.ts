// Набор задач для eval агента для кода. Задача — маленький проект в evals/tasks/<id>/project,
// задание словами, как его дал бы человек, и проверка результата.
// В evals/tasks/<id>/check — тесты проверки, в solution — эталонное решение: на нём проверяем саму проверку.
import { fileURLToPath } from 'node:url';
import { allOf, filesCheck, listFiles, readText, testsCheck, type Check } from './checks.ts';

export interface EvalTask {
  id: string;
  /** Задание для агента. */
  prompt: string;
  /** Папка задачи: project/, check/, solution/. */
  fixture: string;
  check: Check;
}

export const TASKS_DIR = fileURLToPath(new URL('../../evals/tasks/', import.meta.url));

const fixture = (id: string) => `${TASKS_DIR}${id}`;

export const TASKS: EvalTask[] = [
  {
    id: 'promo-threshold',
    prompt: 'Тест «ровно 1000 ₽» в tests/discount.test.js падает. Почини код, тесты не меняй.',
    fixture: fixture('promo-threshold'),
    check: testsCheck(),
  },
  {
    id: 'last-page',
    prompt:
      'Жалоба от пользователей: когда заказов 21, а на странице по 10, третья страница пустая и последний заказ не увидеть. Найди причину и почини.',
    fixture: fixture('last-page'),
    check: testsCheck(),
  },
  {
    id: 'slugify',
    prompt: 'Напиши функцию slugify в src/slug.js по правилам из README.md.',
    fixture: fixture('slugify'),
    check: testsCheck(),
  },
  {
    id: 'rename-calc',
    prompt: 'Переименуй функцию calc в sumPrices во всём проекте, включая тесты. Поведение не меняй.',
    fixture: fixture('rename-calc'),
    check: allOf(
      filesCheck(async (dir) => {
        const problems: string[] = [];
        for (const file of await listFiles(dir)) {
          if (file.endsWith('.js') && /\bcalc\b/.test(await readText(dir, file))) {
            problems.push(`в ${file} осталось calc`);
          }
        }
        return problems;
      }),
      testsCheck(),
    ),
  },
  {
    id: 'port-8080',
    prompt: 'Смени порт по умолчанию с 3000 на 8080 везде, где он упомянут: конфиг, код, README и тесты.',
    fixture: fixture('port-8080'),
    check: allOf(
      filesCheck(async (dir) => {
        let config: Record<string, unknown>;
        try {
          config = JSON.parse(await readText(dir, 'config.json'));
        } catch {
          return ['config.json больше не JSON'];
        }
        const problems: string[] = [];
        if (config.port !== 8080) {
          problems.push(`в config.json port: ${JSON.stringify(config.port)}`);
        }
        if (config.host !== 'localhost' || config.logLevel !== 'info') {
          problems.push('в config.json поменялись другие поля');
        }
        for (const file of await listFiles(dir)) {
          if ((await readText(dir, file)).includes('3000')) {
            problems.push(`в ${file} остался 3000`);
          }
        }
        return problems;
      }),
      testsCheck(),
    ),
  },
  {
    id: 'email-check',
    prompt:
      'createUser в src/users.js должен бросать ошибку «некорректный email», если в email нет @ или @ стоит первым или последним символом. Добавь проверку и тест на неё.',
    fixture: fixture('email-check'),
    // Сначала — добавил ли агент свой тест. Потом testsCheck положит наш, и отличить их будет уже нельзя.
    check: allOf(
      filesCheck(async (dir) => {
        for (const file of await listFiles(dir, 'tests')) {
          if ((await readText(dir, file)).includes('некорректный email')) {
            return [];
          }
        }
        return ['тест на некорректный email не добавлен'];
      }),
      testsCheck(),
    ),
  },
];
