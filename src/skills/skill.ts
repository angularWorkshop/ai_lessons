// Скилл — папка с SKILL.md: шапка с name и description и тело с инструкциями.
// Ограничения на поля — из открытого формата Agent Skills (agentskills.io/specification).
import { basename, join } from 'node:path';
import { parseFrontmatter, splitFrontmatter, type Frontmatter } from './frontmatter.ts';

export interface Skill {
  /** Имя: совпадает с именем папки. По нему модель загружает скилл. */
  name: string;
  /** Что делает скилл и когда его брать. Единственное, что модель видит до загрузки. */
  description: string;
  /** Инструкции после шапки. В контекст попадают, только когда скилл загружен. */
  body: string;
  /** Папка скилла: от неё считаются пути к дополнительным файлам. */
  dir: string;
  /** Вся шапка, включая необязательные поля: license, compatibility, metadata. */
  frontmatter: Frontmatter;
}

export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;
export const MAX_COMPATIBILITY_LENGTH = 500;
// Строчные латинские буквы и цифры, слова через один дефис: commit-message, pdf2text.
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** SKILL.md не прошёл проверку. problems — все найденные проблемы, а не только первая. */
export class SkillError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`${file}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'SkillError';
  }
}

// Шаг 4: все нарушения формата сразу — автору скилла удобнее починить их за один раз.
export function validateSkill(frontmatter: Frontmatter, dirName: string): string[] {
  const problems: string[] = [];
  const { name, description, compatibility, metadata } = frontmatter;

  if (typeof name !== 'string' || name === '') {
    problems.push('name: обязательное поле, строка');
  } else {
    if (name.length > MAX_NAME_LENGTH) {
      problems.push(`name: не длиннее ${MAX_NAME_LENGTH} символов, сейчас ${name.length}`);
    }
    if (!NAME_PATTERN.test(name)) {
      problems.push(`name: «${name}» — только a-z, 0-9 и дефис, без дефиса по краям и двух подряд`);
    }
    if (name !== dirName) {
      problems.push(`name: «${name}» не совпадает с именем папки «${dirName}»`);
    }
  }

  if (typeof description !== 'string' || description.trim() === '') {
    problems.push('description: обязательное поле, непустая строка');
  } else {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      problems.push(`description: не длиннее ${MAX_DESCRIPTION_LENGTH} символов, сейчас ${description.length}`);
    }
    // Описание попадает в system prompt. Тег в нём смешается с разметкой промпта.
    if (/<\/?[a-zA-Z][^>]*>/.test(description)) {
      problems.push('description: без XML-тегов');
    }
  }

  if (compatibility !== undefined && (typeof compatibility !== 'string' || compatibility.length > MAX_COMPATIBILITY_LENGTH)) {
    problems.push(`compatibility: строка до ${MAX_COMPATIBILITY_LENGTH} символов`);
  }
  if (metadata !== undefined && typeof metadata !== 'object') {
    problems.push('metadata: карта «ключ: значение» с отступом под metadata:');
  }
  return problems;
}

// Шаг 5: текст SKILL.md → Skill. dir — папка скилла, её имя сверяем с name.
export function parseSkill(text: string, dir: string): Skill {
  const file = join(dir, 'SKILL.md');
  let frontmatter: Frontmatter;
  let body: string;
  try {
    const parts = splitFrontmatter(text);
    frontmatter = parseFrontmatter(parts.yaml);
    body = parts.body;
  } catch (error) {
    throw new SkillError(file, [`шапка не читается: ${error instanceof Error ? error.message : String(error)}`]);
  }

  const problems = validateSkill(frontmatter, basename(dir));
  if (body === '') {
    problems.push('тело пустое: после шапки нужны инструкции');
  }
  if (problems.length > 0) {
    throw new SkillError(file, problems);
  }
  return {
    name: frontmatter.name as string,
    description: (frontmatter.description as string).trim(),
    body,
    dir,
    frontmatter,
  };
}
