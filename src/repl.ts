// Разговор с агентом в терминале: приглашение, слэш-команды, задачи и их прерывание по Esc или Ctrl+C.
import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline/promises';
import { runCommand, type CommandResult } from './commands.ts';
import type { Conversation } from './conversation.ts';
import { listenForInterrupt } from './keys.ts';

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
async function runTask(conversation: Conversation, task: string): Promise<void> {
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
  } finally {
    stopListening();
  }
}

/** Тема 12.6: свои команды. Не задано — команды из commands.ts, как раньше. */
export interface ReplOptions {
  command?: (line: string) => CommandResult | undefined | Promise<CommandResult | undefined>;
}

export async function runRepl(conversation: Conversation, firstTask?: string, options: ReplOptions = {}): Promise<void> {
  console.log('Агент. /help — команды, Esc или Ctrl+C — остановить задачу, /exit или Ctrl+D — выход.');
  if (firstTask) {
    console.log(`\nты> ${firstTask}`);
    await runTask(conversation, firstTask);
  }
  while (true) {
    const line = await ask();
    if (line === null) {
      return;
    }
    // Команды обрабатывает программа. Модель их не видит, и токены на них не тратятся.
    const command = options.command ? await options.command(line) : runCommand(line, conversation);
    if (command) {
      console.log(command.output);
      if (command.exit) {
        return;
      }
      continue;
    }
    if (line.trim()) {
      await runTask(conversation, line.trim());
    }
  }
}
