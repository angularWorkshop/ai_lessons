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
  throw new Error('TODO: шаг 1');
}

// Шаг 2: один запрос — тот же system и те же инструменты, что у агента. Агент целиком не нужен.
export async function triggers(setup: TriggerSetup, skill: string, query: string): Promise<boolean> {
  throw new Error('TODO: шаг 2');
}

/** Сколько раз спрашивать модель на один запрос: от запуска к запуску она решает по-разному. */
export const TRIGGER_RUNS = 3;

// Шаг 2: один прогон — шум. Скилл сработал, если модель загрузила его больше чем в половине прогонов.
export async function triggersMostly(setup: TriggerSetup, skill: string, query: string, runs = TRIGGER_RUNS): Promise<boolean> {
  throw new Error('TODO: шаг 2');
}

// Шаг 3: тот же набор скиллов, но с другим описанием у одного. Файл на диске не трогаем.
export function withDescription(skills: Skill[], name: string, description: string): Skill[] {
  throw new Error('TODO: шаг 3');
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
  throw new Error('TODO: шаг 4');
}

// Шаг 4: отчёт из темы 2.3 плюс строка с пропусками и ложными срабатываниями.
export function formatTriggerReport(title: string, report: EvalReport<boolean>): string {
  throw new Error('TODO: шаг 4');
}
