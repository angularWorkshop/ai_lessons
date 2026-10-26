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
  throw new Error('TODO: шаг 1');
}

// Шаг 2: скиллы из нескольких папок. Скилл с тем же именем из папки позже заменяет прежний.
export async function loadSkills(root: string, dirs: string[]): Promise<{ skills: Skill[]; warnings: string[] }> {
  throw new Error('TODO: шаг 2');
}

export interface SystemParts {
  root: string;
  skills: Skill[];
  memory: PromptSection;
  subagents: boolean;
}

// Шаг 2: system prompt слоями — роль и правила, память, скиллы, план, а в конце AGENTS.md проекта (тема 7.3).
export async function harnessSystem({ root, skills, memory, subagents }: SystemParts): Promise<{ system: string; agentsFiles: string[] }> {
  throw new Error('TODO: шаг 2');
}

export interface ToolboxParts {
  root: string;
  provider: Provider;
  mode: Mode;
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
  throw new Error('TODO: шаг 3');
}

// Шаг 4: всё вместе — состояние, system, инструменты, MCP и сжатие истории.
export async function createHarness(settings: HarnessSettings): Promise<Harness> {
  throw new Error('TODO: шаг 4');
}
