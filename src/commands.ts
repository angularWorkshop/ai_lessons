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
    run: (conversation) => {
      const count = conversation.messages.length;
      conversation.clear();
      return { output: `История очищена, сообщений было: ${count}. Потраченное за сессию осталось в /cost.` };
    },
  },
  '/cost': {
    description: 'токены и деньги за сессию',
    run: (conversation) => {
      const usage = conversation.usage;
      const cost = estimateCost(usage, PRICE);
      return {
        output: `За сессию: вход ${usage.input} · выход ${usage.output} токенов · $${cost.toFixed(6)}\nСообщений в истории: ${conversation.messages.length}`,
      };
    },
  },
  '/exit': {
    description: 'выйти',
    run: () => ({ output: 'Пока!', exit: true }),
  },
};

// Шаг 1: команда это или задача. undefined — не команда, строку получит модель.
export function runCommand(line: string, conversation: Conversation): CommandResult | undefined {
  const text = line.trim();
  if (!text.startsWith('/')) {
    return undefined;
  }
  const name = text.split(/\s+/)[0];
  // Object.hasOwn: у объекта есть и унаследованные свойства, команда из них нам не нужна.
  if (!Object.hasOwn(COMMANDS, name)) {
    return { output: `Нет команды ${name}. Список — /help.` };
  }
  return COMMANDS[name].run(conversation);
}
