// Минимальный read_file для замеров секции 7: читает текстовый файл проекта целиком.
// Настоящие инструменты для кода — с безопасным путём, поиском и правками — в секции 5.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tools.ts';

const ReadFileArgs = z.object({
  path: z.string().describe('Путь от корня проекта, например src/llm.ts'),
});

export function readFileTool(root = process.cwd()): Tool<z.infer<typeof ReadFileArgs>> {
  return {
    name: 'read_file',
    description: 'Читает текстовый файл проекта целиком. Путь — от корня проекта.',
    schema: ReadFileArgs,
    async run({ path: file }) {
      const full = path.resolve(root, file);
      const relative = path.relative(root, full);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${file} — за пределами проекта`);
      }
      return readFile(full, 'utf8');
    },
  };
}
