// Маскировка секретов в результатах инструментов — как маскировка ключей в логах CI.
// safePath не даёт прочитать .env через read_file и cat. Но node -e или скрипт из проекта прочитает его сам,
// и ключ придёт модели в выводе команды. Последний рубеж: секрет не должен попасть в контекст модели ни в каком виде.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isSecret } from '../code-tools/safe-path.ts';

export const REDACTED = '[секрет скрыт]';
/** Короткие значения не маскируем: «1», «true», «dev» встречаются в коде на каждом шагу. */
export const MIN_SECRET_LENGTH = 8;
/** По имени переменной окружения понятно, что в ней секрет. */
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH/i;

// Шаг 3: значения из строк вида NAME=value. Кавычки вокруг значения снимаем.
export function parseEnvValues(text: string): string[] {
  throw new Error('TODO: шаг 3');
}

// Шаг 3: все секреты, которые знает агент: файлы .env* в корне проекта и секретные переменные его окружения.
export async function readSecrets(root: string, env: NodeJS.ProcessEnv = {}): Promise<string[]> {
  throw new Error('TODO: шаг 3');
}

// Шаг 3: заменить каждый секрет в тексте. Длинные — первыми: если один секрет — часть другого, маска не разорвёт длинный.
export function redact(text: string, secrets: string[]): string {
  throw new Error('TODO: шаг 3');
}
