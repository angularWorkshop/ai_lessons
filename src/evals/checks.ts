// Проверки eval: смотрим на файлы, которые оставил агент, а не на его ответ.
// Две основные: тесты проверки, которые кладутся поверх проекта, и функция над файлами.
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { cleanEnv } from '../code-tools/run-command.ts';
import { copyDir } from './workspace.ts';

export interface CheckResult {
  pass: boolean;
  /** Коротко, что увидела проверка: «тесты: 3/5, упали: …». Это читает человек в отчёте. */
  detail: string;
}

export interface CheckContext {
  /** Рабочая копия проекта после агента. */
  dir: string;
  /** Папка задачи в evals/tasks: в ней project/, check/ и solution/. */
  fixture: string;
}

export type Check = (ctx: CheckContext) => Promise<CheckResult>;

export const TESTS_TIMEOUT_MS = 30_000;

export interface TestsRun {
  /** Код выхода node --test. null — процесс убит по таймауту. */
  code: number | null;
  timedOut: boolean;
  output: string;
}

// Запустить node --test в папке. TAP — потому что его формат одинаков в Node 20 и новее.
export function runTests(dir: string, timeoutMs = TESTS_TIMEOUT_MS): Promise<TestsRun> {
  return new Promise((resolve, reject) => {
    // cleanEnv из темы 5.3: ключи не нужны тестам, а NODE_TEST_CONTEXT от внешнего node --test их бы сломал.
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap'], {
      cwd: dir,
      env: cleanEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => (output += chunk));
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, output });
    });
  });
}

export interface TestSummary {
  tests: number;
  pass: number;
  fail: number;
  /** Имена упавших тестов, без повторов. */
  failed: string[];
}

// Шаг 2: итог из вывода TAP. В конце есть строки «# tests 5», «# pass 3», «# fail 2»,
// а каждый упавший тест — строка «not ok 3 - имя» (у вложенных — с отступом).
export function testSummary(output: string): TestSummary {
  throw new Error('TODO: шаг 2');
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

// Шаг 2: тесты проверки. check/ из папки задачи кладём поверх копии — агент их не видел и поправить не мог.
// Если агент поменял тест с тем же именем, наш его заменит. Потом запускаем все тесты проекта.
export function testsCheck(): Check {
  return async ({ dir, fixture }) => {
    throw new Error('TODO: шаг 2');
  };
}

/** Все файлы папки с путями от неё: src/cart.js. Без node_modules. */
export async function listFiles(dir: string, sub = '.'): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(dir, sub), { withFileTypes: true })) {
    const relative = path.join(sub, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...(await listFiles(dir, relative)));
    } else if (entry.isFile()) {
      files.push(relative.split(path.sep).join('/'));
    }
  }
  return files.sort();
}

export const readText = (dir: string, file: string): Promise<string> => readFile(path.join(dir, file), 'utf8');

/** Проверка функцией над файлами. Она возвращает список проблем: пустой — всё в порядке. */
export function filesCheck(inspect: (dir: string) => Promise<string[]>): Check {
  return async ({ dir }) => {
    const problems = await inspect(dir);
    return problems.length === 0 ? { pass: true, detail: 'файлы в порядке' } : { pass: false, detail: problems.join('; ') };
  };
}

/** Несколько проверок по порядку. Задача решена, если прошли все. Порядок важен: testsCheck кладёт файлы. */
export function allOf(...checks: Check[]): Check {
  return async (ctx) => {
    const results: CheckResult[] = [];
    for (const check of checks) {
      results.push(await check(ctx));
    }
    return { pass: results.every((result) => result.pass), detail: results.map((result) => result.detail).join(' · ') };
  };
}
