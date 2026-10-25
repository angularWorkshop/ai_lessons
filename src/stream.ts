// Ответ по кусочкам. Запуск: npm run stream
// Ctrl+C посреди ответа отменяет его, как в npm run ctrl-c.
import { chatStream, LlmError, loadConfig, type Message } from './llm.ts';

const messages: Message[] = [{ role: 'user', content: 'Расскажи подробно историю JavaScript, 600 слов.' }];

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());

const started = Date.now();
const seconds = (at: number) => ((at - started) / 1000).toFixed(1);
let firstDeltaAt: number | undefined;

try {
  const result = await chatStream(loadConfig(), messages, { maxTokens: 1500, signal: controller.signal }, (text) => {
    firstDeltaAt ??= Date.now();
    process.stdout.write(text);
  });

  console.log('\n');
  console.log(`Первый кусочек через ${seconds(firstDeltaAt ?? Date.now())} с, весь ответ за ${seconds(Date.now())} с`);
  console.log(`finish_reason: ${result.finishReason}`);
  console.log(`Токены: ${result.usage.input} на входе, ${result.usage.output} на выходе`);
} catch (error) {
  if (error instanceof LlmError && error.code === 'aborted') {
    console.log(`\n\nОтменено через ${seconds(Date.now())} с. Что успело прийти, уже на экране.`);
    process.exitCode = 130;
  } else {
    throw error;
  }
}
