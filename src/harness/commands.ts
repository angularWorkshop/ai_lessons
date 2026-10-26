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
      const rewound = await checkpoints.rewind();
      if (!rewound) return { output: 'Откатывать нечего: агент в этой сессии ничего не правил.' };
      const files = rewound.files.map((file) => (file.existed ? file.path : `${file.path} (удалён — его не было)`));
      // Модель помнит свои правки. Без пометки она будет считать, что они на месте.
      conversation.addNote(`[Человек откатил правки задачи ${rewound.task}: ${rewound.files.map((file) => file.path).join(', ')}. Эти файлы снова такие, как до неё.]`);
      return { output: `Откатил задачу ${rewound.task}: ${files.join(', ')}.\nКоманды через run_command не откатываются — их последствия проверь сам.` };
    },
  },
  '/cost': {
    description: 'токены и деньги за сессию, с субагентами и сводками',
    run({ conversation, budget }) {
      const { input, output } = conversation.usage;
      const limit = budget.limit === undefined ? '' : ` из $${budget.limit.toFixed(6)}`;
      return { output: `За сессию: вход ${input} · выход ${output} токенов агента · всего $${budget.spent.toFixed(6)}${limit}` };
    },
  },
  '/session': {
    description: 'id сессии и как её продолжить',
    run: ({ conversation }) => ({ output: `Сессия ${conversation.id}. Продолжить: npm run harness -- --resume ${conversation.id}` }),
  },
};

// Шаг 4: команда harness, иначе — команда из 6.3, иначе — не команда.
export function harnessCommand(ctx: CommandContext): (line: string) => Promise<CommandResult | undefined> {
  return async (line) => {
    const name = line.trim().split(/\s+/)[0];
    if (name === '/help') {
      const all = { ...COMMANDS, ...HARNESS_COMMANDS };
      return { output: Object.entries(all).map(([key, command]) => `${key.padEnd(9)} ${command.description}`).join('\n') };
    }
    if (Object.hasOwn(HARNESS_COMMANDS, name)) return HARNESS_COMMANDS[name].run(ctx);
    return runCommand(line, ctx.conversation);
  };
}
