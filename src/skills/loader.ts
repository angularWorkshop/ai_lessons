// Загрузчик: найти скиллы на диске и рассказать о них модели.
// В system prompt уходят только имена и описания. Тела модель загружает сама, инструментом load_skill.
import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PromptSection } from '../prompt.ts';
import { parseSkill, SkillError, type Skill } from './skill.ts';

export interface LoadedSkills {
  /** Скиллы, прошедшие проверку, по алфавиту. */
  skills: Skill[];
  /** Скиллы, которые не прошли проверку: их нет в списке для модели, но человеку о них нужно сказать. */
  errors: SkillError[];
}

// Шаг 1: каждая папка внутри root, в которой есть SKILL.md, — скилл.
export async function discoverSkills(root: string): Promise<LoadedSkills> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    // Нет папки skills — нет и скиллов. Это не ошибка: у проекта их может не быть.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { skills: [], errors: [] };
    }
    throw error;
  }

  const skills: Skill[] = [];
  const errors: SkillError[] = [];
  // По алфавиту: одинаковый порядок — одинаковый system prompt от запуска к запуску.
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  for (const name of dirs) {
    const dir = resolve(root, name);
    let text: string;
    try {
      text = await readFile(join(dir, 'SKILL.md'), 'utf8');
    } catch {
      continue; // Папка без SKILL.md — не скилл.
    }
    try {
      skills.push(parseSkill(text, dir));
    } catch (error) {
      if (!(error instanceof SkillError)) {
        throw error;
      }
      errors.push(error);
    }
  }
  return { skills, errors };
}

export const SKILLS_INTRO =
  'Скилл — готовый рецепт для определённого вида задач. Если задача подходит под описание скилла, ' +
  'сначала загрузи его через load_skill и работай по нему. Файлы, на которые ссылается скилл, читай через read_skill_file.';

// Шаг 2: раздел для buildSystemPrompt. Нет скиллов — нет и раздела: пустой список только запутает модель.
export function skillsSection(skills: Skill[]): PromptSection[] {
  if (skills.length === 0) {
    return [];
  }
  const list = skills.map((skill) => `- ${skill.name} — ${skill.description.replace(/\s+/g, ' ')}`).join('\n');
  return [{ title: 'Скиллы', body: `${SKILLS_INTRO}\n\n${list}` }];
}

/** Сколько файлов скилла перечислять модели. Больше — значит, скилл пора делить. */
export const MAX_LISTED_FILES = 50;

/** Файлы внутри папки скилла, кроме SKILL.md: пути через «/», по алфавиту. */
export async function listSkillFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (prefix: string): Promise<void> => {
    for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && path !== 'SKILL.md') {
        files.push(path);
      }
    }
  };
  await walk('');
  return files.sort().slice(0, MAX_LISTED_FILES);
}

// Шаг 4: путь от модели → настоящий путь внутри папки скилла. Всё, что ведёт наружу, — ошибка.
export async function resolveInside(root: string, path: string): Promise<string> {
  if (isAbsolute(path)) {
    throw new Error(`путь ${path} абсолютный, а нужен относительный — от папки скилла`);
  }
  const outside = (rel: string) => rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  const full = resolve(root, path);
  if (outside(relative(root, full))) {
    throw new Error(`путь ${path} ведёт за пределы папки скилла`);
  }
  // Символическая ссылка внутри папки может вести куда угодно. Сверяем настоящие пути.
  const [realRoot, realFull] = await Promise.all([realpath(root), realpath(full)]);
  if (outside(relative(realRoot, realFull))) {
    throw new Error(`путь ${path} ведёт за пределы папки скилла`);
  }
  return realFull;
}
