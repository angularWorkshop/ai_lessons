// edit_file: заменить один фрагмент файла другим — как str_replace у Claude Code.
// Модель присылает не весь файл, а кусок «было» и кусок «стало».
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { Mutex } from './mutex.ts';
import { safePath } from './safe-path.ts';

/** Сколько строк «было» и «стало» показать в diff. */
export const MAX_DIFF_LINES = 15;

const EditFileArgs = z.object({
  path: z.string().describe('Путь от корня проекта, например src/cart.ts'),
  old_str: z
    .string()
    .describe('Фрагмент, который заменить: точная копия из файла, с отступами, без номеров строк из read_file. Должен встречаться ровно один раз. Пустая строка — создать новый файл'),
  new_str: z.string().describe('Чем заменить old_str. Для нового файла — всё его содержимое'),
});

// Шаг 1: где в тексте встречается needle. Совпадения не перекрываются: в «aaaa» фрагмент «aa» встречается 2 раза.
export function findAll(text: string, needle: string): number[] {
  const found: number[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    found.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return found;
}

// Шаг 1: номер строки (с 1), на которой стоит символ index.
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// Шаг 2: 0 совпадений — объясняем, почему так обычно бывает.
export function notFoundMessage(file: string, text: string, oldStr: string): string {
  let message = `old_str не найден в ${file}. Скопируй фрагмент из read_file точно, с отступами`;
  if (/^\s*\d+\t/m.test(oldStr)) {
    message += '. В old_str есть номера строк из read_file — в файле их нет, убери их';
  } else if (squash(text).includes(squash(oldStr))) {
    message += '. Похожий фрагмент есть, но отличаются пробелы или отступы';
  }
  return message;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// Шаг 3: короткий diff — целые строки вокруг правки: «-» было, «+» стало.
export function shortDiff(before: string, index: number, oldStr: string, newStr: string): string {
  const start = before.lastIndexOf('\n', index - 1) + 1;
  let end = before.indexOf('\n', index + oldStr.length);
  if (end === -1) end = before.length;
  const removed = before.slice(start, end).split('\n');
  const added = (before.slice(start, index) + newStr + before.slice(index + oldStr.length, end)).split('\n');
  return [`@@ строка ${lineAt(before, start)}`, ...cap(removed, '-'), ...cap(added, '+')].join('\n');
}

function cap(lines: string[], sign: string): string[] {
  const shown = lines.slice(0, MAX_DIFF_LINES).map((line) => `${sign}${line}`);
  if (lines.length > MAX_DIFF_LINES) {
    shown.push(`${sign}…ещё ${lines.length - MAX_DIFF_LINES} строк`);
  }
  return shown;
}

// Шаги 2–4
export function editFileTool(root: string, lock = new Mutex()): Tool<z.infer<typeof EditFileArgs>> {
  return {
    name: 'edit_file',
    description:
      'Меняет файл проекта: находит old_str и заменяет его на new_str. old_str должен встречаться в файле ровно один раз — ' +
      'если мест несколько, добавь соседние строки. Перед правкой прочитай файл через read_file. ' +
      'Чтобы создать новый файл, передай пустой old_str и всё содержимое в new_str. В ответе — diff правки.',
    schema: EditFileArgs,
    async run({ path: file, old_str, new_str }) {
      const full = await safePath(root, file);
      // Чтение и запись — под замком: следующая правка этого инструмента начнётся, когда закончится эта.
      return lock.run(async () => {
        if (old_str === '') {
          return createFile(full, file, new_str);
        }
        if (old_str === new_str) {
          throw new Error('old_str и new_str одинаковые — менять нечего');
        }

        let text: string;
        try {
          text = await readFile(full, 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`файла ${file} нет. Чтобы создать его, передай пустой old_str`);
          }
          throw error;
        }

        const found = findAll(text, old_str);
        if (found.length === 0) {
          throw new Error(notFoundMessage(file, text, old_str));
        }
        if (found.length > 1) {
          const lines = found.map((index) => lineAt(text, index)).join(', ');
          throw new Error(
            `old_str встречается в ${file} ${found.length} раз (строки ${lines}). Добавь в old_str соседние строки, чтобы фрагмент был один`,
          );
        }

        // Не text.replace(old_str, new_str): в new_str «$&» и «$'» — это шаблоны замены, а не текст.
        const index = found[0];
        await writeFile(full, text.slice(0, index) + new_str + text.slice(index + old_str.length));
        return `Изменён ${file}\n${shortDiff(text, index, old_str, new_str)}`;
      });
    },
  };
}

async function createFile(full: string, file: string, content: string): Promise<string> {
  const exists = await readFile(full).then(() => true, () => false);
  if (exists) {
    throw new Error(`файл ${file} уже есть. Чтобы изменить его, передай в old_str фрагмент, который заменить`);
  }
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
  const lines = content === '' ? 0 : content.replace(/\n$/, '').split('\n').length;
  return `Создан ${file}, строк: ${lines}`;
}
