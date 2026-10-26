// Маленькая библиотека для демо секции 10: десять модулей, README, CHANGELOG и package.json.
// Задача «подготовь релиз» требует десятка шагов — на ней видно, держит ли агент длинную задачу.
import { chat, loadConfig } from '../llm.ts';
import type { Provider } from '../provider.ts';
import type { Workspace } from './workspace.ts';

export const DEMO_PROJECT: Record<string, string> = {
  'package.json': `{
  "name": "tinykit",
  "version": "0.3.0",
  "type": "module"
}
`,
  'README.md': `# tinykit

Маленькие функции на каждый день: числа, строки, даты, массивы, объекты, цвета, ссылки, промисы, случайности и проверки.
`,
  'CHANGELOG.md': `# Changelog

## 0.3.0
- Модуль arrays: chunk, unique.
`,
  'src/math.ts': `export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function average(values: number[]): number {
  return sum(values) / values.length;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
`,
  'src/strings.ts': `export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
`,
  'src/dates.ts': `export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
`,
  'src/arrays.ts': `export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
`,
  'src/objects.ts': `export function pick<T extends object, K extends keyof T>(source: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = source[key];
  }
  return result;
}

export function isEmpty(value: object): boolean {
  return Object.keys(value).length === 0;
}
`,
  'src/colors.ts': `export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('');
}
`,
  'src/urls.ts': `export function withQuery(url: string, params: Record<string, string>): string {
  const result = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    result.searchParams.set(key, value);
  }
  return result.toString();
}

export function isAbsolute(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}
`,
  'src/async.ts': `export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts) throw error;
    }
  }
}
`,
  'src/random.ts': `export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
`,
  'src/validate.ts': `export function isEmail(text: string): boolean {
  return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(text);
}

export function isUuid(text: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
}
`,
};

/** Модуль → его функции. По этому списку проверяем, что агент ничего не пропустил. */
export const MODULE_FUNCTIONS: Record<string, string[]> = {
  math: ['sum', 'average', 'clamp'],
  strings: ['capitalize', 'slugify'],
  dates: ['isWeekend', 'addDays'],
  arrays: ['chunk', 'unique'],
  objects: ['pick', 'isEmpty'],
  colors: ['hexToRgb', 'rgbToHex'],
  urls: ['withQuery', 'isAbsolute'],
  async: ['sleep', 'retry'],
  random: ['randomInt', 'shuffle'],
  validate: ['isEmail', 'isUuid'],
};

export const RELEASE_TASK = `Подготовь tinykit к релизу 1.0.0. У каждой экспортируемой функции в src/ должен появиться JSDoc-комментарий. \
Заодно почини average: на пустом массиве она возвращает NaN, а должна бросать RangeError. \
На каждую функцию нужен хотя бы один тест в tests/<модуль>.test.ts на node:test, для average — ещё и тест на RangeError. \
В README.md нужен раздел «## API» со строкой на каждую функцию. \
В CHANGELOG.md сверху — раздел «## 1.0.0», исправление average отдельным подпунктом «Исправлено». \
В package.json — версия 1.0.0 и поле "files": ["src"].`;

/** Что из RELEASE_TASK сделано: строка на каждое требование, ✓ или ✗ и чего не хватает. */
export function checkRelease(workspace: Workspace): string[] {
  const lines: string[] = [];
  const check = (text: string, missing: string[]) =>
    lines.push(missing.length === 0 ? `✓ ${text}` : `✗ ${text} — нет: ${missing.join(', ')}`);
  const read = (path: string) => workspace.read(path) ?? '';
  const modules = Object.entries(MODULE_FUNCTIONS);

  check(
    'JSDoc у каждой функции',
    modules.flatMap(([module, functions]) =>
      functions.filter((name) => !new RegExp(`\\*/\\s*export (async )?function ${name}\\b`).test(read(`src/${module}.ts`))),
    ),
  );
  check('average бросает RangeError', /RangeError/.test(read('src/math.ts')) ? [] : ['src/math.ts']);
  check(
    'тест на каждую функцию',
    modules.flatMap(([module, functions]) => {
      const tests = workspace.read(`tests/${module}.test.ts`);
      return tests === undefined ? [`tests/${module}.test.ts`] : functions.filter((name) => !tests.includes(name));
    }),
  );
  check('тест на RangeError', /RangeError/.test(read('tests/math.test.ts')) ? [] : ['tests/math.test.ts']);
  const readme = read('README.md');
  check('README.md: раздел API', [
    ...(readme.includes('## API') ? [] : ['## API']),
    ...modules.flatMap(([, functions]) => functions).filter((name) => !readme.includes(name)),
  ]);
  check('CHANGELOG.md: раздел 1.0.0', read('CHANGELOG.md').includes('## 1.0.0') ? [] : ['## 1.0.0']);
  check('CHANGELOG.md: подпункт «Исправлено»', /Исправлено/.test(read('CHANGELOG.md')) ? [] : ['Исправлено']);
  check('package.json: версия 1.0.0', /"version":\s*"1\.0\.0"/.test(read('package.json')) ? [] : ['version']);
  check('package.json: поле files', /"files":\s*\[\s*"src"\s*\]/.test(read('package.json')) ? [] : ['files']);
  return lines;
}

/**
 * Настоящая модель для длинных демо. У шлюза 30 запросов в минуту, а агент на быстрых шагах
 * делает их чаще. Шесть повторов с паузами 1, 2, 4, 8, 16 и 30 секунд переживают целую минуту лимита.
 * Ответ — до 4096 токенов: модель пишет файлы целиком, 1024 по умолчанию на это мало.
 */
export function patientProvider(): Provider {
  const config = loadConfig();
  return { complete: (messages, options) => chat(config, messages, { maxTokens: 4096, ...options, retries: 6 }) };
}
