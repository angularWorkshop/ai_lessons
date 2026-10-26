// Слэш-команды harness поверх команд из 6.3: /rewind, /cost в деньгах, /session.
// Неизвестное здесь уходит в runCommand из commands.ts: /clear и /exit работают как раньше.
import { COMMANDS, runCommand, type CommandResult } from '../commands.ts';
import type { CostBudget } from './budget.ts';
import type { CheckpointStore } from './checkpoints.ts';
import type { SessionConversation } from './session.ts';

export interface CommandContext {
  conversation: SessionConversation;
  checkpoints: CheckpointStore;
  budget: CostBudget;
}

interface HarnessCommand {
  description: string;
  run(ctx: CommandContext): CommandResult | Promise<CommandResult>;
}

// Шаг 4
export const HARNESS_COMMANDS: Record<string, HarnessCommand> = {
  '/rewind': {
    description: 'откатить правки последней задачи',
    async run({ conversation, checkpoints }) {
      throw new Error('TODO: шаг 4');
    },
  },
  '/cost': {
    description: 'токены и деньги за сессию, с субагентами и сводками',
    run({ conversation, budget }) {
      throw new Error('TODO: шаг 4');
    },
  },
  '/session': {
    description: 'id сессии и как её продолжить',
    run: ({ conversation }) => ({ output: `Сессия ${conversation.id}. Продолжить: npm run harness -- --resume ${conversation.id}` }),
  },
};

// Шаг 4: команда harness, иначе — команда из 6.3, иначе — не команда.
export function harnessCommand(ctx: CommandContext): (line: string) => Promise<CommandResult | undefined> {
  throw new Error('TODO: шаг 4');
}
