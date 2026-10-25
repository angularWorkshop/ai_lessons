// Запуск на настоящей модели: npm run hello
// Перед первым запуском: cp .env.example .env и заполни .env.
import { chat, estimateCost, loadConfig, type Message } from './llm.ts';

// Цены qwen/qwen3.7-flash в долларах за миллион токенов.
// Для Ollama поставь 0 и 0: локальная модель бесплатная.
const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

const messages: Message[] = [
  { role: 'system', content: 'Ты лаконичный помощник. Отвечай одним предложением.' },
  { role: 'user', content: 'Что такое event loop в JavaScript?' },
];

const config = loadConfig();
const result = await chat(config, messages, { temperature: 0, maxTokens: 300 });

console.log('Ответ:', result.text);
console.log('finish_reason:', result.finishReason);
if (result.truncated) {
  console.log('⚠ Ответ обрезан: увеличь maxTokens');
}
console.log(`Токены: ${result.usage.input} на входе, ${result.usage.output} на выходе`);
console.log(`Стоимость: $${estimateCost(result.usage, PRICE).toFixed(6)}`);
