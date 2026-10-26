// Harness — всё, что превращает цикл из секции 4 в рабочего агента: модель, инструменты, права, контекст, состояние.
// createHarness ничего не пишет заново. Она берёт готовые модули курса и соединяет их в один набор опций для Agent.
import path from 'node:path';
import type { AgentEvent, AgentLimits, AgentOptions } from '../agent.ts';
import { codeTools } from '../code-tools/index.ts';
import { grepTool } from '../code-tools/grep.ts';
import { listFilesTool } from '../code-tools/list-files.ts';
import { allow, codePolicy, GuardedToolbox, type Confirm, type Mode, type Policy } from '../code-tools/permissions.ts';
import { readFileTool } from '../code-tools/read-file.ts';
import type { RunCommandOptions } from '../code-tools/run-command.ts';
import { buildAgentSystem } from '../context/agents-md.ts';
import { Compactor, type CompactEvent } from '../context/compaction.ts';
import { MEMORY_FILE, MemoryStore, memorySection, rememberTool } from '../context/memory.ts';
import { startMcpServers } from '../mcp/agent-tools.ts';
import type { ConnectOptions } from '../mcp/client.ts';
import type { McpConfig } from '../mcp/config.ts';
import type { PromptSection, SystemPromptSpec } from '../prompt.ts';
import type { Provider } from '../provider.ts';
import { discoverSkills, skillsSection } from '../skills/loader.ts';
import type { Skill } from '../skills/skill.ts';
import { skillTools } from '../skills/skill-tools.ts';
import { TASK_TOOL, taskTool } from '../subagents/task-tool.ts';
import { TODO_RULES, TODO_TOOL, TodoList, todoWriteTool } from '../todo/todo.ts';
import { HookedToolbox, loadHooks, type HooksConfig, type LoadedHook } from './hooks.ts';
import { Toolbox } from '../tools.ts';

/** Порог сжатия истории по оценке токенов. У qwen3.7-flash окно намного больше, но платим мы за каждый токен. */
export const DEFAULT_COMPACT_THRESHOLD = 30_000;
/** Сколько символов результата инструмента видит модель. */
export const MAX_RESULT_CHARS = 8000;

export interface HarnessSettings {
  /** Корень проекта: здесь работают инструменты, отсюда AGENTS.md, здесь .agent/memory.json. */
  root: string;
  provider: Provider;
  /** Режим прав из темы 5.4. По умолчанию ask. */
  mode?: Mode;
  /** Тема 12.2: своя политика вместо harnessPolicy(mode) — из настроек, для headless. */
  policy?: Policy;
  /** Тема 12.4: хуки до и после вызова инструмента. Пути к модулям — абсолютные. */
  hooks?: HooksConfig;
  /** Как спросить человека. Не задан — спрашивать некого, и ответ всегда «нет». */
  confirm?: Confirm;
  limits?: AgentLimits;
  compactThreshold?: number;
  /** Папки со скиллами, от корня проекта или абсолютные. При одинаковом имени побеждает скилл из папки позже. */
  skillDirs?: string[];
  /** MCP-серверы. Не заданы — без них. */
  mcp?: McpConfig;
  /** Инструмент task с субагентом-исследователем. По умолчанию есть. */
  subagents?: boolean;
  /** Стримить ответы. По умолчанию да: человек видит текст по мере генерации. */
  stream?: boolean;
  /** Все события агента: терминал, а дальше — трейс и журнал. */
  onEvent?: (event: AgentEvent) => void;
  /** События субагентов с именем подзадачи. */
  onSubagentEvent?: (event: AgentEvent, description: string) => void;
  onCompact?: (event: CompactEvent) => void;
  /** Тесты подменяют spawn у run_command и параметры MCP. */
  runCommand?: RunCommandOptions;
  mcpConnect?: ConnectOptions;
}

export interface HarnessInfo {
  tools: string[];
  skills: string[];
  /** AGENTS.md, попавшие в system, от корня проекта. */
  agentsFiles: string[];
  /** Что не поднялось: битый скилл, MCP-сервер. Агент работает без этого, человеку нужно сказать. */
  warnings: string[];
}

export interface Harness {
  root: string;
  system: string;
  toolbox: GuardedToolbox;
  todos: TodoList;
  memory: MemoryStore;
  compactor: Compactor;
  /** Всё для Agent или Conversation, кроме signal: у каждой задачи он свой. */
  agent: Omit<AgentOptions, 'signal'>;
  info: HarnessInfo;
  /** Остановить MCP-серверы. Звать при любом выходе. */
  close(): Promise<void>;
}

export const HARNESS_ROLE =
  'Ты — агент для работы с кодом в терминале. Ты работаешь в одном проекте, пути пиши от его корня: src/cart.ts.';

export const HARNESS_RULES = [
  'Читать: list_files, read_file, grep. Менять: edit_file. Запускать: run_command — node, npm test, ls, cat, без shell.',
  'Не угадывай содержимое файлов — читай их. Перед правкой прочитай файл; в edit_file old_str — точная копия фрагмента без номеров строк.',
  'После правки проверь себя: запусти тесты через run_command {"command": "npm", "args": ["test"]}.',
  'Ссылайся на место в коде так: src/cart.ts:12. Отвечай по-русски, коротко.',
];

export const SUBAGENT_RULE =
  'Широкий поиск по многим файлам отдавай субагенту через task: он прочитает всё сам, а тебе вернёт только вывод.';

/** Субагент-исследователь: только чтение, своя чистая история. */
export const EXPLORER_SYSTEM = `Ты — исследователь кода. Тебе дают вопрос о проекте. Найди ответ через list_files, grep и read_file.
Ничего не меняешь. Ответь коротко: факты, пути и номера строк вида src/cart.ts:12.`;

/** Инструменты harness, которые не трогают код проекта. Про них политика не спрашивает. */
export const HARNESS_TOOLS = new Set([TODO_TOOL, 'remember', 'load_skill', 'read_skill_file', TASK_TOOL]);

// Шаг 1: политика harness — политика агента для кода из 5.4 плюс служебные инструменты.
// Без этого codePolicy спрашивала бы человека про каждое обновление плана.
export function harnessPolicy(mode: Mode): Policy {
  const code = codePolicy(mode);
  return (request) => (HARNESS_TOOLS.has(request.tool) ? allow('служебный инструмент harness') : code(request));
}

// Шаг 2: скиллы из нескольких папок. Скилл с тем же именем из папки позже заменяет прежний.
export async function loadSkills(root: string, dirs: string[]): Promise<{ skills: Skill[]; warnings: string[] }> {
  const byName = new Map<string, Skill>();
  const warnings: string[] = [];
  for (const dir of dirs) {
    const found = await discoverSkills(path.resolve(root, dir));
    found.skills.forEach((skill) => byName.set(skill.name, skill));
    found.errors.forEach((error) => warnings.push(`скилл пропущен — ${error.message}`));
  }
  const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { skills, warnings };
}

export interface SystemParts {
  root: string;
  skills: Skill[];
  memory: PromptSection;
  subagents: boolean;
}

// Шаг 2: system prompt слоями — роль и правила, память, скиллы, план, а в конце AGENTS.md проекта (тема 7.3).
export async function harnessSystem({ root, skills, memory, subagents }: SystemParts): Promise<{ system: string; agentsFiles: string[] }> {
  const base: SystemPromptSpec = {
    role: HARNESS_ROLE,
    rules: subagents ? [...HARNESS_RULES, SUBAGENT_RULE] : HARNESS_RULES,
    // TODO_RULES уже с заголовком «## План»: заголовок раздела даст buildSystemPrompt.
    sections: [memory, ...skillsSection(skills), { title: 'План', body: TODO_RULES.split('\n').slice(1).join('\n') }],
  };
  const { system, layers } = await buildAgentSystem(base, { cwd: root, root });
  return { system, agentsFiles: layers.filter((layer) => layer.content !== '').map((layer) => layer.file) };
}

export interface ToolboxParts {
  root: string;
  provider: Provider;
  mode: Mode;
  policy?: Policy;
  /** Тема 12.4: загруженные хуки. Есть — инструменты идут через HookedToolbox. */
  hooks?: LoadedHook[];
  confirm?: Confirm;
  todos: TodoList;
  memory: MemoryStore;
  skills: Skill[];
  subagents: boolean;
  onSubagentEvent?: (event: AgentEvent, description: string) => void;
  runCommand?: RunCommandOptions;
}

// Шаг 3: инструменты с правами. Порядок постоянный: описания инструментов — начало каждого запроса,
// а постоянный префикс кешируется (тема 8.2).
export function harnessToolbox(parts: ToolboxParts): GuardedToolbox {
  const { root, provider, todos, memory, skills } = parts;
  const guarded = {
    maxResultChars: MAX_RESULT_CHARS,
    policy: parts.policy ?? harnessPolicy(parts.mode),
    confirm: parts.confirm ?? (async () => 'no' as const),
  };
  // Тема 12.4: с хуками — HookedToolbox, он же GuardedToolbox: права никуда не деваются.
  const toolbox = parts.hooks?.length ? new HookedToolbox({ ...guarded, hooks: parts.hooks, root }) : new GuardedToolbox(guarded);
  const tools = [...codeTools(root, parts.runCommand), todoWriteTool(todos), rememberTool(memory), ...skillTools(skills)];
  if (parts.subagents) {
    tools.push(
      taskTool({
        provider,
        // Каждому ребёнку — свой Toolbox: только чтение. Права не нужны — читать можно всегда.
        toolbox: () => new Toolbox({ maxResultChars: MAX_RESULT_CHARS }).register(listFilesTool(root)).register(readFileTool(root)).register(grepTool(root)),
        system: EXPLORER_SYSTEM,
        onEvent: parts.onSubagentEvent,
      }),
    );
  }
  tools.forEach((tool) => toolbox.register(tool));
  return toolbox;
}

// Шаг 4: всё вместе — состояние, system, инструменты, MCP и сжатие истории.
export async function createHarness(settings: HarnessSettings): Promise<Harness> {
  const root = path.resolve(settings.root);
  const { provider, mode = 'ask', subagents = true } = settings;

  const memory = new MemoryStore(path.join(root, MEMORY_FILE));
  const { skills, warnings } = await loadSkills(root, settings.skillDirs ?? []);
  const { system, agentsFiles } = await harnessSystem({ root, skills, memory: memorySection(await memory.active()), subagents });

  const todos = new TodoList();
  const toolbox = harnessToolbox({
    root,
    provider,
    mode,
    policy: settings.policy,
    // Нет хуков в настройках — нечего и загружать.
    hooks: Object.values(settings.hooks ?? {}).some((list) => list?.length) ? await loadHooks(settings.hooks) : [],
    confirm: settings.confirm,
    todos,
    memory,
    skills,
    subagents,
    onSubagentEvent: settings.onSubagentEvent,
    runCommand: settings.runCommand,
  });

  // MCP — последними: их набор зависит от конфига, а постоянная часть списка остаётся в начале.
  const mcp = await startMcpServers(toolbox, settings.mcp ?? { mcpServers: {} }, { cwd: root, ...settings.mcpConnect });
  warnings.push(...mcp.failed.map(({ error }) => `${error}. Работаем без него`));

  // Контекст: сжатие истории из 7.2 через prepareMessages.
  const compactor = new Compactor({
    provider,
    threshold: settings.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD,
    onCompact: settings.onCompact,
  });

  return {
    root,
    system,
    toolbox,
    todos,
    memory,
    compactor,
    agent: {
      provider,
      toolbox,
      system,
      limits: settings.limits,
      prepareMessages: compactor.prepare,
      stream: settings.stream ?? true,
      onEvent: settings.onEvent,
    },
    info: {
      tools: toolbox.specs().map((spec) => spec.function.name),
      skills: skills.map((skill) => skill.name),
      agentsFiles,
      warnings,
    },
    close: () => mcp.close(),
  };
}
