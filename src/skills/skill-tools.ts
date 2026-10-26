// Два инструмента, через которые модель получает скилл по частям:
// load_skill — тело SKILL.md, read_skill_file — файл из папки скилла, когда тело на него ссылается.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { listSkillFiles, resolveInside } from './loader.ts';
import type { Skill } from './skill.ts';

// Шаг 3: тело в тегах — модель видит, где кончается скилл, а позже сжатие контекста (секция 7) найдёт его в истории.
export function formatSkill(skill: Skill, files: string[]): string {
  const parts = [`<skill name="${skill.name}">\n${skill.body}\n</skill>`];
  if (files.length > 0) {
    parts.push(`Файлы скилла — читай через read_skill_file, когда инструкция на них ссылается:\n${files.map((file) => `- ${file}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

// Имя — enum из настоящих имён: модель не придумает скилл, которого нет, а если придумает, получит список.
function skillNames(skills: Skill[]) {
  if (skills.length === 0) {
    throw new Error('Инструменты скиллов без скиллов не нужны: не регистрируй их');
  }
  return z.enum(skills.map((skill) => skill.name) as [string, ...string[]]).describe('Имя скилла из раздела «Скиллы»');
}

export function loadSkillTool(skills: Skill[]): Tool<{ name: string }> {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return {
    name: 'load_skill',
    description: 'Загружает инструкции скилла из раздела «Скиллы». Зови, как только задача подходит под описание скилла, до того как начнёшь её решать.',
    schema: z.object({ name: skillNames(skills) }),
    async run({ name }) {
      const skill = byName.get(name)!;
      return formatSkill(skill, await listSkillFiles(skill.dir));
    },
  };
}

// Шаг 4: файл внутри папки скилла. Путь пришёл от модели — проверяем его, как любой ввод снаружи.
export function readSkillFileTool(skills: Skill[]): Tool<{ name: string; path: string }> {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return {
    name: 'read_skill_file',
    description: 'Читает файл из папки скилла, например references/scopes.md. Зови, когда загруженный скилл ссылается на файл.',
    schema: z.object({
      name: skillNames(skills),
      path: z.string().min(1).describe('Путь внутри папки скилла, как в списке файлов скилла'),
    }),
    async run({ name, path }) {
      const skill = byName.get(name)!;
      let file: string;
      try {
        file = await resolveInside(skill.dir, path);
      } catch (error) {
        // Файла нет — подскажем, какие есть. Модель исправит путь сама.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          const files = await listSkillFiles(skill.dir);
          throw new Error(`в скилле ${name} нет файла ${path}. Есть: ${files.join(', ') || 'только SKILL.md'}`);
        }
        throw error;
      }
      return readFile(file, 'utf8');
    },
  };
}

// Шаг 5: оба инструмента разом. Нет скиллов — нет инструментов.
export function skillTools(skills: Skill[]): Tool[] {
  return skills.length === 0 ? [] : [loadSkillTool(skills), readSkillFileTool(skills)];
}
