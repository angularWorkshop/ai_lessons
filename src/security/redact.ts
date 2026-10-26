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
  const values: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= MIN_SECRET_LENGTH) values.push(value);
  }
  return values;
}

// Шаг 3: все секреты, которые знает агент: файлы .env* в корне проекта и секретные переменные его окружения.
export async function readSecrets(root: string, env: NodeJS.ProcessEnv = {}): Promise<string[]> {
  const secrets = new Set<string>();
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (!isSecret(name)) continue;
    const text = await readFile(path.join(root, name), 'utf8').catch(() => '');
    for (const value of parseEnvValues(text)) secrets.add(value);
  }
  for (const [name, value] of Object.entries(env)) {
    if (value && SECRET_NAME.test(name) && value.length >= MIN_SECRET_LENGTH) secrets.add(value);
  }
  return [...secrets];
}

// Шаг 3: заменить каждый секрет в тексте. Длинные — первыми: если один секрет — часть другого, маска не разорвёт длинный.
export function redact(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret.length < MIN_SECRET_LENGTH) continue;
    result = result.split(secret).join(REDACTED);
  }
  return result;
}
