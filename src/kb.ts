// База знаний: статьи — файлы .md в data/kb. Поиск по словам и безопасный путь к статье.
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export interface Article {
  /** Путь от корня базы через /, например billing/refund.md. По нему модель ссылается на статью. */
  id: string;
  title: string;
  text: string;
}

export interface SearchHit {
  id: string;
  title: string;
  /** Строка статьи, где больше всего слов запроса. */
  snippet: string;
  score: number;
}

export const MAX_HITS = 5;
const SNIPPET_CHARS = 160;

// Слова, которые есть почти в каждом вопросе и почти в каждой статье. По ним не найти ничего.
const STOP_WORDS = new Set(
  'как что это для или мне мой моя мои мою если при где когда можно нужно надо есть уже еще все всё был была было вас вам ваш наш нас они она оно его ее её там тут так чтобы почему какой какая какие сколько через после перед'.split(' '),
);

// Русские слова меняют окончания: «возврат», «возврата», «вернуть». Отрезаем хвост и ищем подстроку.
export function stems(text: string): string[] {
  const words = text.toLowerCase().replaceAll('ё', 'е').match(/[a-zа-я0-9]+/g) ?? [];
  const result = new Set<string>();
  for (const word of words) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    result.add(word.length <= 4 ? word : word.slice(0, Math.max(4, word.length - 2)));
  }
  return [...result];
}

export async function loadArticles(kbDir: string): Promise<Article[]> {
  const files = (await readdir(kbDir, { recursive: true })).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(path.join(kbDir, file), 'utf8');
      const title = text.match(/^#\s+(.+)$/m)?.[1].trim() ?? file;
      return { id: file.split(path.sep).join('/'), title, text };
    }),
  );
}

// Совпадение в заголовке весит втрое больше: заголовок говорит, о чём статья целиком.
export function searchArticles(articles: Article[], query: string): SearchHit[] {
  const wanted = stems(query);
  const hits: SearchHit[] = [];
  for (const article of articles) {
    const title = article.title.toLowerCase().replaceAll('ё', 'е');
    const body = article.text.toLowerCase().replaceAll('ё', 'е');
    let score = 0;
    for (const stem of wanted) {
      if (title.includes(stem)) score += 3;
      else if (body.includes(stem)) score += 1;
    }
    if (score > 0) {
      hits.push({ id: article.id, title: article.title, snippet: bestLine(article.text, wanted), score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, MAX_HITS);
}

function bestLine(text: string, wanted: string[]): string {
  let best = '';
  let bestCount = 0;
  for (const line of text.split('\n').slice(1)) {
    const lower = line.toLowerCase().replaceAll('ё', 'е');
    const count = wanted.filter((stem) => lower.includes(stem)).length;
    if (count > bestCount) {
      best = line.trim();
      bestCount = count;
    }
  }
  return best.length > SNIPPET_CHARS ? `${best.slice(0, SNIPPET_CHARS)}…` : best;
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Путь от модели → статья внутри базы. Бросает ошибку с подсказкой: её текст уйдёт модели.
 * Тикеты лежат рядом, в data/tickets, и через read_article их не прочитать.
 */
export async function resolveArticle(kbDir: string, input: string): Promise<{ id: string; file: string }> {
  if (input.trim() === '' || path.isAbsolute(input)) {
    throw new Error(`«${input}» — не путь статьи. Пиши путь из результатов search_kb, например billing/refund.md`);
  }
  const root = await realpath(kbDir);
  const full = path.resolve(root, input);
  if (!isInside(root, full)) {
    throw new Error(`«${input}» выходит за пределы базы знаний`);
  }
  if (!full.endsWith('.md')) {
    throw new Error(`«${input}» — не статья: статьи — файлы .md, например billing/refund.md`);
  }
  let real: string;
  try {
    real = await realpath(full);
  } catch {
    throw new Error(`статьи «${input}» нет. Найди нужную через search_kb`);
  }
  // Ссылка внутри базы может вести наружу — проверяем настоящий путь.
  if (!isInside(root, real)) {
    throw new Error(`«${input}» выходит за пределы базы знаний`);
  }
  return { id: path.relative(root, real).split(path.sep).join('/'), file: real };
}
