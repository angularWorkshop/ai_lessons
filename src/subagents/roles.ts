// Три роли — три агента с разными system prompt и инструментами. Порядок задаёт не модель, а наш код:
// планировщик → исполнитель → ревьюер, и снова исполнитель, пока ревьюер не скажет approve или не кончатся раунды.
import { Agent, type AgentEvent, type AgentLimits, type AgentRun } from '../agent.ts';
import type { Usage } from '../llm.ts';
import type { Provider } from '../provider.ts';
import { workspaceTools, type Workspace } from '../todo/workspace.ts';
import { Toolbox } from '../tools.ts';
import { completeJson, VERDICT_REQUEST, VerdictSchema, type Verdict } from './verdict.ts';

export type RoleName = 'planner' | 'executor' | 'reviewer';

export interface Role {
  system: string;
  /** Только чтение: планировщик и ревьюер ничего не меняют в проекте. */
  readOnly: boolean;
}

export const ROLES: Record<RoleName, Role> = {
  planner: {
    readOnly: true,
    system: `Ты — планировщик. Изучи проект (list_files, read_file) и составь план для исполнителя.
План — нумерованный список конкретных шагов: какой файл и что в нём изменить. Сам ничего не меняешь.
Ответь только планом, без вступлений.`,
  },
  executor: {
    readOnly: false,
    system: `Ты — исполнитель. Тебе дают задачу и план. Выполни план через инструменты: list_files, read_file, write_file.
Если ревьюер вернул работу, исправь каждую его проблему. В конце коротко перечисли, что изменил.`,
  },
  reviewer: {
    readOnly: true,
    system: `Ты — ревьюер. Проверь, что задача выполнена полностью и правильно.
Не верь отчёту исполнителя на слово: читай файлы сам (list_files, read_file). Ничего не меняешь.
Проверяй только требования задачи. Стиль, вкус и то, чего задача не просила, — не повод вернуть работу.
Каждая проблема — с файлом и цитатой из него. Закончив проверку, перечисли проблемы или напиши, что их нет.`,
  },
};

export interface PipelineOptions {
  provider: Provider;
  /** Свой провайдер для роли: в тестах у каждой роли свой сценарий. */
  providers?: Partial<Record<RoleName, Provider>>;
  workspace: Workspace;
  /** Сколько раз исполнитель может сдать работу. По умолчанию 3. */
  maxRounds?: number;
  /** Лимиты одного запуска роли. */
  limits?: AgentLimits;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent, role: RoleName) => void;
  onVerdict?: (verdict: Verdict, round: number) => void;
}

export interface PipelineResult {
  /** approved — ревьюер принял. max_rounds — раунды кончились. failed — роль не доработала: ошибка, отмена. */
  status: 'approved' | 'max_rounds' | 'failed';
  rounds: number;
  plan: string;
  /** Последний вердикт ревьюера. */
  verdict?: Verdict;
  /** При failed — что случилось. */
  error?: string;
  /** Токены всех ролей вместе. */
  usage: Usage;
}

export const DEFAULT_MAX_ROUNDS = 3;

// Шаг 2: агент для роли — свои system, инструменты и провайдер. История у каждого запуска своя.
export function roleAgent(name: RoleName, options: PipelineOptions): Agent {
  throw new Error('TODO: шаг 2');
}

/** Что получает исполнитель: задача, план и, со второго раунда, замечания ревьюера. */
export function executorPrompt(task: string, plan: string, issues: string[] = []): string {
  throw new Error('TODO: шаг 2');
}

/** Что получает ревьюер: задача и отчёт исполнителя. Проверять он будет по файлам. */
export function reviewerPrompt(task: string, report: string): string {
  throw new Error('TODO: шаг 2');
}

// Шаги 3–4: конвейер с лимитом раундов.
export async function runPipeline(task: string, options: PipelineOptions): Promise<PipelineResult> {
  throw new Error('TODO: шаги 3 и 4');
}
