// Два инструмента, через которые модель получает скилл по частям:
// load_skill — тело SKILL.md, read_skill_file — файл из папки скилла, когда тело на него ссылается.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { listSkillFiles, resolveInside } from './loader.ts';
import type { Skill } from './skill.ts';

// Шаг 3: тело в тегах — модель видит, где кончается скилл, а позже сжатие контекста (секция 7) найдёт его в истории.
export function formatSkill(skill: Skill, files: string[]): string {
  throw new Error('TODO: шаг 3');
}

// Имя — enum из настоящих имён: модель не придумает скилл, которого нет, а если придумает, получит список.
function skillNames(skills: Skill[]) {
  if (skills.length === 0) {
    throw new Error('Инструменты скиллов без скиллов не нужны: не регистрируй их');
  }
  return z.enum(skills.map((skill) => skill.name) as [string, ...string[]]).describe('Имя скилла из раздела «Скиллы»');
}

export function loadSkillTool(skills: Skill[]): Tool<{ name: string }> {
  throw new Error('TODO: шаг 3');
}

// Шаг 4: файл внутри папки скилла. Путь пришёл от модели — проверяем его, как любой ввод снаружи.
export function readSkillFileTool(skills: Skill[]): Tool<{ name: string; path: string }> {
  throw new Error('TODO: шаг 4');
}

// Шаг 5: оба инструмента разом. Нет скиллов — нет инструментов.
export function skillTools(skills: Skill[]): Tool[] {
  throw new Error('TODO: шаг 5');
}
