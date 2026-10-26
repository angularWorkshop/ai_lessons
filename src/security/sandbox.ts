// Песочница для команд — насколько её можно сделать без помощи операционной системы.
// Белый список из 5.3 разрешал программу node с любыми аргументами. А node — это интерпретатор:
// он исполнит любой код из строки или из файла проекта, и этот код прочитает что угодно, до чего дотянется процесс.
// Поэтому здесь разрешены не программы, а команды целиком, объявленные человеком заранее.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { codeTools } from '../code-tools/index.ts';
import { Mutex } from '../code-tools/mutex.ts';
import { runCommandTool, type RunCommandOptions } from '../code-tools/run-command.ts';
import { PathError, safePath } from '../code-tools/safe-path.ts';
import type { Tool } from '../tools.ts';
import { redact } from './redact.ts';

/** Оболочки. В WebContainer sh -c и bash -c — псевдонимы jsh: внутри них любая команда, белый список не работает. */
export const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'jsh']);
/** Интерпретаторы: им всё равно, откуда код — из аргумента или из файла. */
export const INTERPRETERS = new Set(['node', 'npx', 'tsx', 'deno', 'bun', 'python', 'python3']);
/** Флаги «код прямо в строке». */
export const INLINE_CODE_FLAGS = new Set(['-e', '--eval', '-p', '--print']);

export interface SandboxRules {
  /** Команды целиком: программа и все аргументы. Например ['npm', 'test'] — без лишних аргументов. */
  commands: string[][];
  /** Скрипты package.json, которые можно запускать через npm run. npm test — это npm run test. */
  npmScripts: string[];
  /** Программы, которые только показывают файлы. Их аргументы-пути проверяет safePath. */
  fileViewers: string[];
}

export const DEFAULT_RULES: SandboxRules = {
  commands: [],
  npmScripts: ['test'],
  fileViewers: ['ls', 'cat'],
};

export type Scripts = Record<string, string>;

// Шаг 2: скрипты из package.json в корне проекта. Нет файла или он сломан — скриптов нет.
export async function readScripts(root: string): Promise<Scripts> {
  throw new Error('TODO: шаг 2');
}

/** Что можно запускать — строкой для модели и для отказа. */
export function describeRules(rules: SandboxRules): string {
  const npm = rules.npmScripts.map((name) => (name === 'test' ? 'npm test' : `npm run ${name}`));
  const viewers = rules.fileViewers.map((name) => `${name} <путь>`);
  return [...npm, ...rules.commands.map((line) => line.join(' ')), ...viewers].join(', ');
}

// Шаг 2: npm. Имя скрипта — из списка, а текст скрипта — тот же, что был при старте агента.
// Иначе модель поправит package.json через edit_file, и «npm test» станет чем угодно.
async function checkNpm(root: string, args: string[], rules: SandboxRules, snapshot: Scripts): Promise<string | null> {
  throw new Error('TODO: шаг 2');
}

// Шаг 1: решение по одной команде. null — можно, строка — почему нельзя.
export async function checkSandbox(
  root: string,
  command: string,
  args: string[],
  rules: SandboxRules = DEFAULT_RULES,
  snapshot: Scripts = {},
): Promise<string | null> {
  throw new Error('TODO: шаг 1');
}

export interface SandboxOptions extends RunCommandOptions {
  rules?: SandboxRules;
  /** Значения секретов: их не будет в выводе команды. */
  secrets?: string[];
}

// Шаг 3: run_command в песочнице. Запуск, таймаут, лимит вывода и чистое окружение — из 5.3.
// Новое: своя проверка вместо checkCommand и маскировка секретов в выводе.
export async function sandboxCommandTool(root: string, options: SandboxOptions = {}): Promise<Tool> {
  throw new Error('TODO: шаг 3');
}

// Шаг 3: инструменты агента для кода, где run_command заменён на песочницу. Замок с edit_file — общий, как в 5.3.
export async function secureCodeTools(root: string, options: SandboxOptions = {}): Promise<Tool[]> {
  throw new Error('TODO: шаг 3');
}
