// Временный проект для тестов инструментов: настоящие файлы на диске, в системной временной папке.
// Не в tests/: раннер проверки следит за этой папкой и перезапускался бы от каждого файла.
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface TempProject {
  /** Корень проекта — настоящий путь, без ссылок. */
  root: string;
  /** Папка рядом с проектом: то, что агент видеть не должен. */
  outside: string;
  write(file: string, text: string | Buffer): Promise<void>;
  /** Символическая ссылка link → target. false — файловая система ссылок не умеет. */
  link(target: string, link: string): Promise<boolean>;
  remove(): Promise<void>;
}

export async function tempProject(files: Record<string, string> = {}): Promise<TempProject> {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'edutec-tools-')));
  const root = path.join(base, 'project');
  const outside = path.join(base, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.txt'), 'чужой файл');

  const project: TempProject = {
    root,
    outside,
    async write(file, text) {
      const full = path.join(root, file);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, text);
    },
    async link(target, link) {
      try {
        await symlink(target, path.join(root, link));
        return true;
      } catch {
        return false;
      }
    },
    remove: () => rm(base, { recursive: true, force: true }),
  };
  for (const [file, text] of Object.entries(files)) {
    await project.write(file, text);
  }
  return project;
}

/** Мини-проект, похожий на playground. */
export const SHOP = {
  'package.json': '{ "name": "shop" }\n',
  'src/cart.ts': "import { applyPromo } from './discount.ts';\n\nexport function total(sum: number) {\n  return applyPromo(sum);\n}\n",
  'src/discount.ts': '// Скидка 10% от 1000 ₽\nexport function applyPromo(sum: number) {\n  if (sum > 1000) {\n    return sum * 0.9;\n  }\n  return sum;\n}\n',
  'tests/cart.test.ts': "import { total } from '../src/cart.ts';\n",
  '.env': 'LLM_API_KEY=edt_secret_promo\n',
  'node_modules/lib/index.js': 'export const applyPromo = 1;\n',
  '.git/HEAD': 'ref: refs/heads/main\n',
};
