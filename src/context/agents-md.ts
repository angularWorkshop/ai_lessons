// AGENTS.md: правила проекта, которые лежат в репозитории рядом с кодом.
// System prompt собирается слоями: базовый → AGENTS.md корня проекта → AGENTS.md вложенных папок до рабочей.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { truncate } from '../tools.ts';
import { buildSystemPrompt, type PromptSection, type SystemPromptSpec } from '../prompt.ts';

export const AGENTS_FILE = 'AGENTS.md';
/** Сколько символов всех AGENTS.md вместе попадает в system. Около 9 тысяч токенов — больше правил модель всё равно не удержит. */
export const DEFAULT_MAX_AGENTS_CHARS = 32_000;
/** Это правило добавляется к базовым, когда в проекте нашёлся хоть один AGENTS.md. */
export const AGENTS_RULE =
  'Следуй правилам из разделов AGENTS.md ниже: они важнее общих. Если они спорят друг с другом, действует раздел, который ниже, — он ближе к рабочей папке.';

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

// Папки от start вверх до корня диска: start, его родитель, …, '/'.
function ancestors(start: string): string[] {
  const dirs: string[] = [];
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    dirs.push(dir);
    if (path.dirname(dir) === dir) {
      return dirs;
    }
  }
}

// Шаг 1: корень проекта — ближайшая папка с .git. Нет git (как в StackBlitz) — ближайшая с package.json.
// Ничего не нашлось — проектом считаем саму рабочую папку.
export async function findProjectRoot(start: string): Promise<string> {
  const dirs = ancestors(start);
  for (const marker of ['.git', 'package.json']) {
    for (const dir of dirs) {
      if (await exists(path.join(dir, marker))) {
        return dir;
      }
    }
  }
  return path.resolve(start);
}

// Шаг 2: все AGENTS.md от корня проекта до рабочей папки, сначала корень. Выше корня не смотрим:
// файл из соседнего проекта или из домашней папки не должен попадать в чужой промпт.
export async function findAgentsFiles(cwd: string, root: string): Promise<string[]> {
  const from = path.resolve(cwd);
  const top = path.resolve(root);
  const relative = path.relative(top, from);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${cwd} не внутри проекта ${root}`);
  }

  const dirs = [top];
  for (const part of relative.split(path.sep).filter(Boolean)) {
    dirs.push(path.join(dirs.at(-1)!, part));
  }
  const files: string[] = [];
  for (const dir of dirs) {
    const file = path.join(dir, AGENTS_FILE);
    if (await exists(file)) {
      files.push(file);
    }
  }
  return files;
}

export interface AgentsLayer {
  /** Путь от корня проекта: AGENTS.md, billing/AGENTS.md. */
  file: string;
  /** Что попадёт в промпт. Короче оригинала, если упёрлись в лимит, и пусто, если места не осталось. */
  content: string;
  /** Сколько символов в файле на самом деле. content.length < chars — файл обрезан. */
  chars: number;
}

// Шаг 3: читаем по порядку и делим один лимит на всех. Что не влезло — обрезаем с пометкой.
export async function loadAgentsLayers(
  files: string[],
  root: string,
  maxChars = DEFAULT_MAX_AGENTS_CHARS,
): Promise<AgentsLayer[]> {
  const layers: AgentsLayer[] = [];
  let left = maxChars;
  for (const file of files) {
    const text = (await readFile(file, 'utf8')).trim();
    const content = left > 0 ? truncate(text, left) : '';
    left -= Math.min(text.length, left);
    layers.push({ file: path.relative(path.resolve(root), file).split(path.sep).join('/'), content, chars: text.length });
  }
  return layers;
}

// Шаг 4: каждый слой — раздел промпта с путём в заголовке: модель видит, откуда правило.
export function agentsSections(layers: AgentsLayer[]): PromptSection[] {
  return layers.map((layer) => ({ title: layer.file, body: layer.content }));
}

export interface AgentSystemOptions {
  /** Рабочая папка агента. */
  cwd: string;
  /** Корень проекта. Не задан — ищем через findProjectRoot. */
  root?: string;
  maxChars?: number;
}

export interface AgentSystem {
  system: string;
  root: string;
  layers: AgentsLayer[];
}

// Шаг 4: базовый промпт + слои AGENTS.md. Собирает buildSystemPrompt из темы 2.1.
export async function buildAgentSystem(base: SystemPromptSpec, options: AgentSystemOptions): Promise<AgentSystem> {
  const root = path.resolve(options.root ?? (await findProjectRoot(options.cwd)));
  const layers = await loadAgentsLayers(await findAgentsFiles(options.cwd, root), root, options.maxChars);
  const found = layers.some((layer) => layer.content !== '');
  const system = buildSystemPrompt({
    ...base,
    rules: found ? [...(base.rules ?? []), AGENTS_RULE] : base.rules,
    sections: [...(base.sections ?? []), ...agentsSections(layers)],
  });
  return { system, root, layers };
}
