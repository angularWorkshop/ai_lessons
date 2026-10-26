// PreToolUse для edit_file: сгенерированные файлы руками не правят.
// Под запретом папка src/generated/ и любой файл с пометкой @generated в первой строке —
// такое правило шаблоном в settings.json не напишешь, а кодом — пять строк.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export default async function noGenerated({ args, root }) {
  const file = path.posix.normalize(String(args.path)).replace(/^\.\//, '');
  const firstLine = await readFile(path.join(root, file), 'utf8').then(
    (text) => text.split('\n')[0],
    () => '',
  );
  if (file.startsWith('src/generated/') || firstLine.includes('@generated')) {
    return { block: `${file} сгенерирован (${firstLine || 'папка src/generated'}). Правь источник, а не результат` };
  }
}
