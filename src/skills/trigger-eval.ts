// Trigger-eval: срабатывает ли скилл там, где должен, и молчит ли там, где не должен.
// Один кейс — один запрос к модели: смотрим только, попросила ли она load_skill первым же ответом.
import { basename } from 'node:path';
import { formatReport, type EvalCase, type EvalReport } from '../eval.ts';
import type { ChatResult, ToolSpec } from '../llm.ts';
import type { Provider } from '../provider.ts';
import { SkillError, validateSkill, type Skill } from './skill.ts';

/** input — запрос пользователя, expected — должен ли скилл сработать. */
export type TriggerCase = EvalCase<string, boolean>;

export interface TriggerSetup {
  provider: Provider;
  /** System prompt агента со списком скиллов. */
  system: string;
  /** Все инструменты агента: модель выбирает load_skill среди них, как в настоящей работе. */
  tools: ToolSpec[];
}

/** Ответу хватит начала: load_skill — короткий вызов, а длинный текст значит, что модель пошла без скилла. */
export const TRIGGER_MAX_TOKENS = 200;

// Шаг 1: какие скиллы модель попросила загрузить в этом ответе.
export function requestedSkills(result: ChatResult): string[] {
  const names: string[] = [];
  for (const call of result.toolCalls) {
    if (call.name !== 'load_skill') {
      continue;
    }
    try {
      const args = JSON.parse(call.arguments) as { name?: unknown };
      if (typeof args.name === 'string') {
        names.push(args.name);
      }
    } catch {
      // Сломанные аргументы — не загрузка. Агент вернул бы модели ошибку.
    }
  }
  return names;
}

// Шаг 2: один запрос — тот же system и те же инструменты, что у агента. Агент целиком не нужен.
export async function triggers(setup: TriggerSetup, skill: string, query: string): Promise<boolean> {
  const result = await setup.provider.complete(
    [
      { role: 'system', content: setup.system },
      { role: 'user', content: query },
    ],
    { tools: setup.tools, maxTokens: TRIGGER_MAX_TOKENS },
  );
  return requestedSkills(result).includes(skill);
}

/** Сколько раз спрашивать модель на один запрос: от запуска к запуску она решает по-разному. */
export const TRIGGER_RUNS = 3;

// Шаг 2: один прогон — шум. Скилл сработал, если модель загрузила его больше чем в половине прогонов.
export async function triggersMostly(setup: TriggerSetup, skill: string, query: string, runs = TRIGGER_RUNS): Promise<boolean> {
  let fired = 0;
  for (let i = 0; i < runs; i++) {
    if (await triggers(setup, skill, query)) {
      fired++;
    }
  }
  return fired * 2 > runs;
}

// Шаг 3: тот же набор скиллов, но с другим описанием у одного. Файл на диске не трогаем.
export function withDescription(skills: Skill[], name: string, description: string): Skill[] {
  const target = skills.find((skill) => skill.name === name);
  if (!target) {
    throw new Error(`скилла ${name} нет. Есть: ${skills.map((skill) => skill.name).join(', ')}`);
  }
  const frontmatter = { ...target.frontmatter, description };
  // Новое описание проходит ту же проверку, что и SKILL.md: иначе замер будет про скилл, которого не может быть.
  const problems = validateSkill(frontmatter, basename(target.dir));
  if (problems.length > 0) {
    throw new SkillError(`${target.dir} (описание для замера)`, problems);
  }
  return skills.map((skill) => (skill === target ? { ...skill, description: description.trim(), frontmatter } : skill));
}

export interface TriggerStats {
  /** Сколько раз сработал из тех, где должен. */
  hits: number;
  shouldTrigger: number;
  /** Сколько раз сработал из тех, где не должен. */
  falseTriggers: number;
  shouldNotTrigger: number;
  /** Сколько запросов упало с ошибкой: их не считаем ни туда, ни сюда. */
  errors: number;
}

// Шаг 4: доля верных — одно число. Нам нужны два: пропуски и ложные срабатывания чинятся по-разному.
export function triggerStats(report: EvalReport<boolean>): TriggerStats {
  const stats: TriggerStats = { hits: 0, shouldTrigger: 0, falseTriggers: 0, shouldNotTrigger: 0, errors: 0 };
  for (const result of report.results) {
    if (result.error !== undefined) {
      stats.errors++;
      continue;
    }
    if (result.expected) {
      stats.shouldTrigger++;
      stats.hits += result.actual ? 1 : 0;
    } else {
      stats.shouldNotTrigger++;
      stats.falseTriggers += result.actual ? 1 : 0;
    }
  }
  return stats;
}

// Шаг 4: отчёт из темы 2.3 плюс строка с пропусками и ложными срабатываниями.
export function formatTriggerReport(title: string, report: EvalReport<boolean>): string {
  const stats = triggerStats(report);
  // Ошибка шлюза бывает целой HTML-страницей. В отчёт — только первая строка.
  const results = report.results.map((result) =>
    result.error === undefined ? result : { ...result, error: result.error.split('\n')[0] },
  );
  return (
    `${formatReport(title, { ...report, results })}\n` +
    `  сработал, где нужно: ${stats.hits}/${stats.shouldTrigger} · сработал зря: ${stats.falseTriggers}/${stats.shouldNotTrigger}`
  );
}
