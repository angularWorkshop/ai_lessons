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
  throw new Error('TODO: шаг 4');
}

// Шаг 5: текст SKILL.md → Skill. dir — папка скилла, её имя сверяем с name.
export function parseSkill(text: string, dir: string): Skill {
  throw new Error('TODO: шаг 5');
}
