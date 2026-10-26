// Чат с моделью в терминале: npm run chat
// Адрес, ключ и модель платформа уже положила в .env.
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import { loadConfig } from './llm.ts';
import { ChatSession } from './session.ts';

// Цены qwen/qwen3.7-flash в долларах за миллион токенов.
const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

const session = new ChatSession(loadConfig(), {
  system: 'Ты помощник программиста. Отвечай кратко.',
  price: PRICE,
});
const rl = readline.createInterface({ input, output });
// Ctrl+C или Ctrl+D закрывают ввод. Сигнал отменит вопрос, который ждёт строку.
const closed = new AbortController();
rl.on('close', () => closed.abort());

console.log('Чат с моделью. Команды: /reset — забыть историю, /cost — расход, /exit — выход.');

while (true) {
  let line: string;
  try {
    line = await rl.question('\nты> ', { signal: closed.signal });
  } catch {
    break; // ввод закрыт
  }
  const text = line.trim();

  if (text === '') continue;
  if (text === '/exit') break;
  if (text === '/reset') {
    session.reset();
    console.log('История очищена. Потраченное за сессию остаётся в /cost.');
    continue;
  }
  if (text === '/cost') {
    const { input, output } = session.usage;
    console.log(`Сообщений в истории: ${session.messages.length}`);
    console.log(`За сессию: вход ${input} · выход ${output} · $${session.cost?.toFixed(6)}`);
    continue;
  }

  try {
    const result = await session.send(text);
    console.log(`\nмодель> ${result.text}`);
    if (result.truncated) {
      console.log('⚠ Ответ обрезан: не хватило maxTokens');
    }
    console.log(`[вход ${result.usage.input} · выход ${result.usage.output} · всего за сессию $${session.cost?.toFixed(6)}]`);
  } catch (error) {
    // История не изменилась: можно просто повторить вопрос.
    console.log(`Ошибка: ${(error as Error).message}`);
  }
}

rl.close();
