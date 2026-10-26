// Агент, которого мы проверяем: тот же агент для кода из секции 5, только корень — копия задачи,
// а человека рядом нет. Права — режим auto: правки и команды без вопросов, deny остаётся deny.
import { Agent, type AgentLimits } from '../agent.ts';
import { codeTools } from '../code-tools/index.ts';
import { codePolicy, GuardedToolbox } from '../code-tools/permissions.ts';
import type { Provider } from '../provider.ts';
import type { AgentFactory } from './runner.ts';

export const EVAL_SYSTEM = `Ты — агент для работы с кодом. Ты работаешь в одном проекте, пути пиши от его корня: src/cart.js.
Читать: list_files, read_file, grep. Менять: edit_file. Запускать: run_command — node, npm test, ls, cat, без shell.
Не угадывай содержимое файлов — читай их. Ищи через grep, а не читая всё подряд.
Перед правкой прочитай файл. В edit_file old_str — точная копия фрагмента без номеров строк; меняй маленькими кусками.
После правки проверь себя: запусти тесты через run_command {"command": "npm", "args": ["test"]}.
Человека рядом нет: вопросов не задавай, доведи задачу до конца сам. В конце коротко напиши, что сделал.`;

/** Лимиты на одну задачу. Задачи маленькие: если агенту не хватило 15 шагов, он уже заблудился. */
export const EVAL_LIMITS: AgentLimits = { maxSteps: 15, maxTokens: 100_000 };

export interface CodeAgentOptions {
  system?: string;
  limits?: AgentLimits;
}

export function codeAgent(provider: Provider, options: CodeAgentOptions = {}): AgentFactory {
  return (dir, onEvent) => {
    const toolbox = new GuardedToolbox({
      maxResultChars: 8000,
      policy: codePolicy('auto'),
      // Спросить некого: всё, что требует вопроса, — отказ. В auto таких вызовов почти нет.
      confirm: async () => 'no',
    });
    for (const tool of codeTools(dir)) {
      toolbox.register(tool);
    }
    return new Agent({
      provider,
      toolbox,
      system: options.system ?? EVAL_SYSTEM,
      limits: options.limits ?? EVAL_LIMITS,
      onEvent,
    });
  };
}
