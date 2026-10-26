// Отмена запроса по Ctrl+C. Запуск: npm run ctrl-c
// Можно передать число секунд — тогда программа отменит запрос сама: npm run ctrl-c -- 3
import { chat, LlmError, loadConfig, type Message } from './llm.ts';

const messages: Message[] = [{ role: 'user', content: 'Расскажи подробно историю JavaScript, 600 слов.' }];

const controller = new AbortController();
// once: второй Ctrl+C уже не перехватываем, и он завершит процесс сразу.
process.once('SIGINT', () => {
  console.log('\nCtrl+C — отменяю запрос...');
  controller.abort();
});

const autoCancelSeconds = Number(process.argv[2]);
if (autoCancelSeconds > 0) {
  setTimeout(() => {
    console.log(`Прошло ${autoCancelSeconds} с — отменяю запрос...`);
    controller.abort();
  }, autoCancelSeconds * 1000).unref();
}

console.log('Жду длинный ответ, это секунд 15. Нажми Ctrl+C, чтобы отменить.');
const started = Date.now();
const seconds = () => ((Date.now() - started) / 1000).toFixed(1);

try {
  const result = await chat(loadConfig(), messages, { maxTokens: 1500, signal: controller.signal });
  console.log(result.text);
  console.log(`\nГотово за ${seconds()} с, токенов на выходе: ${result.usage.output}`);
} catch (error) {
  if (error instanceof LlmError && error.code === 'aborted') {
    console.log(`Отменено через ${seconds()} с. Запрос закрыт, повторять его никто не будет.`);
    process.exitCode = 130;
  } else {
    throw error;
  }
}
