// Агент в терминале. npm run agent — разговор; npm run agent "задача" — начать сразу с задачи.
// С темы 6.1 ответ печатается по мере генерации. С темы 6.2 Esc или Ctrl+C останавливают задачу, а разговор продолжается.
import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline/promises';
import { Conversation } from './conversation.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { listenForInterrupt } from './keys.ts';
import { loadConfig } from './llm.ts';
import { createPrinter } from './printer.ts';
import { llmProvider } from './provider.ts';
import { wait } from './slow-tools.ts';
import { Toolbox } from './tools.ts';

const SYSTEM = `Ты — агент, который решает задачи с помощью инструментов.
Текущее время узнавай только через get_current_time, любые вычисления делай только через calculate.
Когда всё узнал, ответь коротко и по-русски.`;

const conversation = new Conversation({
  provider: llmProvider(loadConfig()),
  toolbox: new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator).register(wait),
  system: SYSTEM,
  onEvent: createPrinter(),
  stream: true,
});

// Строка от человека. null — ввод закрыт: Ctrl+D или Ctrl+C в приглашении.
// readline на каждый вопрос свой: пока идёт задача, stdin принадлежит listenForInterrupt.
async function ask(): Promise<string | null> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const closed = new AbortController();
  rl.on('close', () => closed.abort());
  try {
    return await rl.question('\nты> ', { signal: closed.signal });
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

// Одна задача: свой AbortController, а клавиши прерывания слушаем, только пока она идёт.
async function runTask(task: string): Promise<void> {
  const controller = new AbortController();
  const stopListening = listenForInterrupt(stdin, (key) => {
    if (controller.signal.aborted) {
      // Второе нажатие: агент почему-то не остановился. Выходим совсем, 130 = 128 + номер SIGINT.
      process.exit(130);
    }
    stdout.write(`\n${key === 'esc' ? 'Esc' : 'Ctrl+C'} — останавливаю агента...\n`);
    controller.abort();
  });

  try {
    const run = await conversation.send(task, controller.signal);
    if (run.stopReason === 'error') {
      console.error(run.answer);
    }
    const { input, output } = conversation.usage;
    console.log(`шагов: ${run.steps}, за разговор токенов: ${input} → ${output}, сообщений в истории: ${conversation.messages.length}`);
  } finally {
    stopListening();
  }
}

console.log('Агент. Esc или Ctrl+C — остановить задачу. Ctrl+D или Ctrl+C в приглашении — выход.');
const first = process.argv.slice(2).join(' ').trim();
if (first) {
  console.log(`\nты> ${first}`);
  await runTask(first);
}
while (true) {
  const line = await ask();
  if (line === null) {
    break;
  }
  if (line.trim()) {
    await runTask(line.trim());
  }
}
