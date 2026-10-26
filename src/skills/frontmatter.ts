// SKILL.md — это YAML-шапка между строками --- и Markdown-тело после неё.
// Полный YAML — большой язык. Скиллу нужна малая часть: строки, блоки > и | и одна вложенная карта metadata.
// Всё остальное (списки, якоря, вложенность глубже) — понятная ошибка, а не молча неверный результат.

/** Значение поля шапки: строка или карта строк (так устроено поле metadata). */
export type FrontmatterValue = string | Record<string, string>;
export type Frontmatter = Record<string, FrontmatterValue>;

// «ключ:» или «ключ: значение». Двоеточие дальше в значении — часть значения.
const KEY_LINE = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/;

// Шаг 1: шапка — между первой строкой --- и следующей такой же. Тело — всё после, без пустых строк по краям.
export function splitFrontmatter(text: string): { yaml: string; body: string } {
  throw new Error('TODO: шаг 1');
}

// Шаг 2: одно значение. Кавычки снимаем, комментарий « # …» после значения отрезаем.
export function parseScalar(raw: string): string {
  throw new Error('TODO: шаг 2');
}

// Шаг 3: шапка целиком. Строка без отступа — новый ключ, строки с отступом под ней — его продолжение.
export function parseFrontmatter(yaml: string): Frontmatter {
  throw new Error('TODO: шаг 3');
}

/** Блок «|» сохраняет переводы строк. Блок «>» склеивает строки абзаца через пробел. */
export function blockScalar(kind: '|' | '>', block: string[]): string {
  const filled = block.filter((line) => line.trim() !== '');
  if (filled.length === 0) {
    return '';
  }
  const indent = Math.min(...filled.map((line) => line.length - line.trimStart().length));
  const text = block.map((line) => line.slice(indent).trimEnd()).join('\n').trim();
  if (kind === '|') {
    return text;
  }
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split('\n').map((part) => part.trim()).join(' '))
    .join('\n');
}

/** Вложенная карта «ключ: значение» на один уровень — поле metadata. */
export function nestedMap(block: string[], lineNo: number): Record<string, string> {
  const filled = block.filter((line) => !isBlank(line));
  const indents = new Set(filled.map((line) => line.length - line.trimStart().length));
  if (indents.size > 1) {
    throw new Error(`строка ${lineNo}: вложенность глубже одного уровня не поддерживается`);
  }
  const map: Record<string, string> = {};
  for (const line of filled) {
    const match = KEY_LINE.exec(line.trim());
    if (!match) {
      throw new Error(`строка ${lineNo}: внутри поддерживаются только строки «ключ: значение», а не «${line.trim()}»`);
    }
    map[match[1]] = parseScalar(match[2] ?? '');
  }
  return map;
}

function isBlank(line: string): boolean {
  const text = line.trim();
  return text === '' || text.startsWith('#');
}
