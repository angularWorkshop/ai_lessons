// Агент со скиллами: тот же Agent из секции 4, только в system prompt — список скиллов,
// а в наборе инструментов — load_skill и read_skill_file. Сам Agent ничего о скиллах не знает.
import { calculator, currentTime } from '../demo-tools.ts';
import { buildSystemPrompt } from '../prompt.ts';
import { Toolbox } from '../tools.ts';
import { skillsSection } from './loader.ts';
import type { Skill } from './skill.ts';
import { skillTools } from './skill-tools.ts';

export const SKILL_AGENT_ROLE =
  'Ты — агент-помощник программиста в терминале. Тебе присылают задачи по TypeScript-проекту: diff, вывод тестов, вопросы по коду.';

export const SKILL_AGENT_RULES = [
  'Текущее время узнавай только через get_current_time, вычисления делай только через calculate.',
  'Отвечай по-русски, если скилл не требует другого языка.',
];

// Шаг 5
export function skillAgentSystem(skills: Skill[]): string {
  throw new Error('TODO: шаг 5');
}

// Шаг 5
export function skillAgentToolbox(skills: Skill[]): Toolbox {
  throw new Error('TODO: шаг 5');
}
