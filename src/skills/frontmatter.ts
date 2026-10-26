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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0].trimEnd() !== '---') {
    throw new Error('файл должен начинаться со строки ---');
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  if (end === -1) {
    throw new Error('нет закрывающей строки --- после шапки');
  }
  return { yaml: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n').trim() };
}

// Шаг 2: одно значение. Кавычки снимаем, комментарий « # …» после значения отрезаем.
export function parseScalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    // Строка в двойных кавычках в YAML почти совпадает со строкой JSON: те же \" \\ \n.
    try {
      return JSON.parse(value) as string;
    } catch {
      throw new Error(`незакрытые или неверные двойные кавычки: ${value}`);
    }
  }
  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'")) {
      throw new Error(`незакрытые одинарные кавычки: ${value}`);
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value.replace(/\s+#.*$/, '');
}

// Шаг 3: шапка целиком. Строка без отступа — новый ключ, строки с отступом под ней — его продолжение.
export function parseFrontmatter(yaml: string): Frontmatter {
  const lines = yaml.split('\n');
  const data: Frontmatter = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNo = ++i;
    if (isBlank(line)) {
      continue;
    }
    const match = KEY_LINE.exec(line);
    if (!match) {
      throw new Error(`строка ${lineNo}: ожидали «ключ: значение», пришло «${line.trim()}»`);
    }
    const [, key, raw = ''] = match;
    if (Object.hasOwn(data, key)) {
      throw new Error(`строка ${lineNo}: ключ ${key} уже был`);
    }

    // Всё, что идёт с отступом (и пустые строки между), принадлежит этому ключу.
    const block: string[] = [];
    while (i < lines.length && (lines[i].trim() === '' || /^\s/.test(lines[i]))) {
      block.push(lines[i++]);
    }
    const value = raw.trim();
    const hasBlock = block.some((item) => !isBlank(item));

    if (/^[|>][+-]?$/.test(value)) {
      data[key] = blockScalar(value[0] as '|' | '>', block);
    } else if (value === '' && hasBlock) {
      data[key] = nestedMap(block, lineNo);
    } else if (hasBlock) {
      throw new Error(`строка ${lineNo}: значение ${key} продолжается на следующей строке — длинный текст пиши после «${key}: >»`);
    } else {
      data[key] = parseScalar(value);
    }
  }
  return data;
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
