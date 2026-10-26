// Настройки harness по слоям, как у Claude Code:
//   ~/.agent/settings.json            пользователь: мои привычки во всех проектах
//   .agent/settings.json              проект: общие правила команды, лежит в git
//   .agent/settings.local.json        локальные: мои правки для этого проекта, в .gitignore
// Слой ниже в списке сильнее: скаляр берётся из последнего слоя, где он задан. Правила прав складываются.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { allow, ask, deny, MODES, type Mode, type PermissionRequest, type Policy } from '../code-tools/permissions.ts';
import { harnessPolicy, type HarnessSettings } from './create.ts';

export const SETTINGS_DIR = '.agent';

// Правило: имя инструмента или имя с шаблоном в скобках. edit_file, run_command(npm test), edit_file(src/generated/**), project__*.
const RuleSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_*-]+(\(.+\))?$/, 'правило пишется так: edit_file или edit_file(src/**)');

const McpServerSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
  })
  .strict();

const HookSchema = z.object({ matcher: z.string().min(1).optional(), module: z.string().min(1) }).strict();

// Шаг 1: схема. strict — опечатка в ключе («permisions») должна быть ошибкой, а не молча пропущенной настройкой.
export const SettingsSchema = z
  .object({
    /** Модель вместо LLM_MODEL из .env. */
    model: z.string().min(1).optional(),
    /** Тема 12.5: цена модели, долларов за миллион токенов. Нужна трейсу. Не задана — цена qwen3.7-flash. */
    price: z.object({ inputPerMillion: z.number().nonnegative(), outputPerMillion: z.number().nonnegative() }).strict().optional(),
    limits: z
      .object({
        maxSteps: z.number().int().positive().optional(),
        maxTokens: z.number().int().positive().optional(),
        compactThreshold: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    permissions: z
      .object({
        mode: z.enum(MODES).optional(),
        allow: z.array(RuleSchema).optional(),
        ask: z.array(RuleSchema).optional(),
        deny: z.array(RuleSchema).optional(),
      })
      .strict()
      .optional(),
    mcpServers: z.record(z.string(), McpServerSchema).optional(),
    /** Папки со скиллами: у пользователя — от домашней папки, у проекта — от его корня. */
    skills: z.array(z.string()).optional(),
    /** Тема 12.4: хуки. Путь к модулю — как у скиллов: от домашней папки или от корня проекта. */
    hooks: z
      .object({ PreToolUse: z.array(HookSchema).optional(), PostToolUse: z.array(HookSchema).optional() })
      .strict()
      .optional(),
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;
export type Permissions = NonNullable<Settings['permissions']>;

/** Ошибка в файле настроек. В тексте — путь к файлу: человек должен знать, что чинить. */
export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

// Шаг 1: текст файла → проверенные настройки.
export function parseSettings(text: string, file: string): Settings {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new SettingsError(`${file}: не JSON — ${(error as Error).message}`);
  }
  const parsed = SettingsSchema.safeParse(data);
  if (!parsed.success) {
    throw new SettingsError(`${file}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

// Объединение без повторов в порядке появления. Обоих списков нет — нет и результата.
function union(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  return a === undefined && b === undefined ? undefined : [...new Set([...(a ?? []), ...(b ?? [])])];
}

// Списки подряд, с повторами: один и тот же хук в двух слоях — два запуска, как написано.
function concat<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  return a === undefined && b === undefined ? undefined : [...(a ?? []), ...(b ?? [])];
}

// Убрать ключи со значением undefined: так в объединённых настройках нет пустых полей.
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

// Шаг 2: слияние слоёв, первый — самый слабый.
// Скаляры — из последнего слоя, где они есть. Правила и скиллы — объединение. MCP-серверы — по имени, последний побеждает.
export function mergeSettings(layers: Settings[]): Settings {
  const merged: Settings = {};
  for (const layer of layers) {
    if (layer.model !== undefined) merged.model = layer.model;
    if (layer.price !== undefined) merged.price = layer.price;
    if (layer.limits) merged.limits = { ...merged.limits, ...layer.limits };
    if (layer.permissions) {
      const before = merged.permissions ?? {};
      const now = layer.permissions;
      merged.permissions = clean({
        mode: now.mode ?? before.mode,
        allow: union(before.allow, now.allow),
        ask: union(before.ask, now.ask),
        deny: union(before.deny, now.deny),
      });
    }
    if (layer.mcpServers) merged.mcpServers = { ...merged.mcpServers, ...layer.mcpServers };
    if (layer.skills) merged.skills = union(merged.skills, layer.skills);
    // Тема 12.4: хуки — как правила, складываются. Сначала хуки пользователя, потом проекта.
    if (layer.hooks) {
      const before = merged.hooks ?? {};
      merged.hooks = clean({
        PreToolUse: concat(before.PreToolUse, layer.hooks.PreToolUse),
        PostToolUse: concat(before.PostToolUse, layer.hooks.PostToolUse),
      });
    }
  }
  return merged;
}

export interface SettingsFile {
  layer: 'user' | 'project' | 'local';
  file: string;
  /** От чего считать относительные пути в этом слое: домашняя папка или корень проекта. */
  base: string;
}

export function settingsFiles(home: string, root: string): SettingsFile[] {
  return [
    { layer: 'user', file: path.join(home, SETTINGS_DIR, 'settings.json'), base: home },
    { layer: 'project', file: path.join(root, SETTINGS_DIR, 'settings.json'), base: root },
    { layer: 'local', file: path.join(root, SETTINGS_DIR, 'settings.local.json'), base: root },
  ];
}

export interface LoadedSettings {
  settings: Settings;
  /** Файлы, которые нашлись и прочитались, в порядке слоёв. */
  files: string[];
}

// Шаг 3: прочитать все слои. Нет файла — слоя нет. Битый файл — ошибка: молча работать без запретов опасно.
export async function loadSettings({ home, root }: { home: string; root: string }): Promise<LoadedSettings> {
  const layers: Settings[] = [];
  const files: string[] = [];
  for (const { file, base } of settingsFiles(home, root)) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const settings = parseSettings(text, file);
    // Пути скиллов — сразу абсолютные: после слияния уже не узнать, из какого они слоя.
    if (settings.skills) settings.skills = settings.skills.map((dir) => path.resolve(base, dir));
    // Тема 12.4: и модули хуков — по той же причине.
    for (const list of Object.values(settings.hooks ?? {})) {
      list.forEach((hook) => (hook.module = path.resolve(base, hook.module)));
    }
    layers.push(settings);
    files.push(file);
  }
  return { settings: mergeSettings(layers), files };
}

// ---------- Правила прав ----------

export interface Rule {
  tool: string;
  pattern?: string;
}

export function parseRule(rule: string): Rule {
  const open = rule.indexOf('(');
  return open === -1 ? { tool: rule } : { tool: rule.slice(0, open), pattern: rule.slice(open + 1, -1) };
}

// Шаблон → RegExp. Для путей * не проходит через /, ** — проходит. В командах * — что угодно.
export function globToRegExp(glob: string, kind: 'path' | 'text'): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      source += '.*';
      i++;
    } else if (char === '*') {
      source += kind === 'path' ? '[^/]*' : '.*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

// С чем сравнивать шаблон: команда целиком для run_command, путь для инструментов с path.
function subject(request: PermissionRequest): { text: string; kind: 'path' | 'text' } | undefined {
  const { tool, args } = request;
  if (tool === 'run_command') {
    return { text: [args.command, ...((args.args as string[] | undefined) ?? [])].join(' '), kind: 'text' };
  }
  if (typeof args.path === 'string') {
    return { text: path.posix.normalize(args.path.split(path.sep).join('/')).replace(/^\.\//, ''), kind: 'path' };
  }
  return undefined;
}

// Шаг 4: подходит ли правило к вызову.
export function matchRule(rule: string, request: PermissionRequest): boolean {
  const { tool, pattern } = parseRule(rule);
  if (!globToRegExp(tool, 'text').test(request.tool)) return false;
  if (pattern === undefined) return true;
  const target = subject(request);
  return target !== undefined && globToRegExp(pattern, target.kind).test(target.text);
}

// Шаг 4: политика из настроек. Порядок: запреты кода (секреты, выход за корень, read-only) → deny → ask → allow → режим.
// deny сильнее allow: в каком бы слое ни лежало разрешение, запрет из любого слоя его перекрывает.
export function settingsPolicy(permissions: Permissions = {}, mode: Mode = permissions.mode ?? 'ask'): Policy {
  const base = harnessPolicy(mode);
  const find = (rules: string[] | undefined, request: PermissionRequest) => rules?.find((rule) => matchRule(rule, request));
  return (request) => {
    const verdict = base(request);
    if (verdict.decision === 'deny') return verdict;
    let rule: string | undefined;
    if ((rule = find(permissions.deny, request))) return deny(`запрещено настройками: ${rule}`);
    if ((rule = find(permissions.ask, request))) return ask(`настройки просят спросить: ${rule}`);
    if ((rule = find(permissions.allow, request))) return allow(`разрешено настройками: ${rule}`);
    return verdict;
  };
}

// Шаг 5: в headless человека нет. ask превращается в deny — с честной причиной, а не «человек не разрешил».
export function headlessPolicy(policy: Policy): Policy {
  return (request) => {
    const verdict = policy(request);
    if (verdict.decision !== 'ask') return verdict;
    return deny(`${verdict.reason}: без человека спросить некого. Разрешить можно правилом allow в ${SETTINGS_DIR}/settings.local.json`);
  };
}

// Тема 12.4: агент не правит то, что его держит. В .agent/ лежат настройки, хуки и журналы:
// одна правка settings.json или хука — и все запреты сняты. Ни правило allow, ни режим auto этого не меняют.
export function protectHarness(policy: Policy): Policy {
  return (request) => {
    if (request.tool === 'edit_file' && typeof request.args.path === 'string') {
      const file = path.posix.normalize(request.args.path.split(path.sep).join('/')).replace(/^\.\//, '');
      if (file === SETTINGS_DIR || file.startsWith(`${SETTINGS_DIR}/`)) {
        return deny(`${SETTINGS_DIR}/ — настройки, хуки и журналы harness, агент их не меняет`);
      }
    }
    return policy(request);
  };
}

export interface FromSettingsOptions {
  settings: Settings;
  /** Флаг --mode: командная строка сильнее любого слоя. */
  mode?: Mode;
  headless: boolean;
}

// Шаг 5: настройки → часть HarnessSettings. Модель подставляет cli.ts: ей нужен ещё и .env.
export function fromSettings({ settings, mode, headless }: FromSettingsOptions): Pick<
  HarnessSettings,
  'mode' | 'policy' | 'limits' | 'compactThreshold' | 'skillDirs' | 'mcp' | 'hooks'
> {
  const finalMode = mode ?? settings.permissions?.mode ?? 'ask';
  const policy = protectHarness(settingsPolicy(settings.permissions, finalMode));
  return {
    mode: finalMode,
    policy: headless ? headlessPolicy(policy) : policy,
    limits: clean({ maxSteps: settings.limits?.maxSteps, maxTokens: settings.limits?.maxTokens }),
    compactThreshold: settings.limits?.compactThreshold,
    skillDirs: settings.skills ?? [],
    mcp: { mcpServers: settings.mcpServers ?? {} },
    hooks: settings.hooks ?? {},
  };
}
