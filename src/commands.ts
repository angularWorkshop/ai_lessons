// Слэш-команды REPL. Строка с / в начале — команда программе, а не задача для модели: в историю она не попадает.
import type { Conversation } from './conversation.ts';
import { estimateCost, type Price } from './llm.ts';

// Цены qwen/qwen3.7-flash в долларах за миллион токенов — те же, что в npm run chat.
export const PRICE: Price = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

export interface CommandResult {
  /** Что показать человеку. */
  output: string;
  /** true — REPL пора закончить. */
  exit?: boolean;
}

interface Command {
  description: string;
  run(conversation: Conversation): CommandResult;
}

// Шаг 1: таблица команд. Новая команда — новая строка здесь, цикл REPL не меняется.
export const COMMANDS: Record<string, Command> = {
  '/help': {
    description: 'список команд',
    run: () => ({ output: Object.entries(COMMANDS).map(([name, command]) => `${name.padEnd(7)} ${command.description}`).join('\n') }),
  },
  '/clear': {
    description: 'забыть историю разговора и начать с чистого листа',
    run: () => {
      throw new Error('TODO: шаг 1 — очисти историю и скажи, сколько сообщений было');
    },
  },
  '/cost': {
    description: 'токены и деньги за сессию',
    run: () => {
      throw new Error('TODO: шаг 1 — токены за сессию и цена по PRICE через estimateCost');
    },
  },
  '/exit': {
    description: 'выйти',
    run: () => ({ output: 'Пока!', exit: true }),
  },
};

// Шаг 1: команда это или задача. undefined — не команда, строку получит модель.
export function runCommand(line: string, conversation: Conversation): CommandResult | undefined {
  throw new Error('TODO: шаг 1 — не команда → undefined, неизвестная → подсказка, иначе COMMANDS[name].run');
}
