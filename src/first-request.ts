// Программа из теории: первый запрос к модели без всяких обёрток.
// Запуск: npm run first
interface ChatCompletionResponse {
  choices: {
    message: { role: 'assistant'; content: string | null };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// 1. Настройки — из переменных окружения.
const baseUrl = process.env.LLM_BASE_URL;
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;

// 2. Отправляем запрос.
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'Ты лаконичный помощник. Отвечай одним предложением.' },
      { role: 'user', content: 'Что такое event loop в JavaScript?' },
    ],
    temperature: 0,
    max_tokens: 300,
  }),
});

// 3. Провайдер ответил ошибкой — показываем её текст и выходим.
if (!response.ok) {
  console.error('API вернул ошибку:', response.status, await response.text());
  process.exit(1);
}

// 4. Разбираем JSON и печатаем результат.
const data = (await response.json()) as ChatCompletionResponse;
const choice = data.choices[0];

console.log('Ответ:', choice.message.content);
console.log('finish_reason:', choice.finish_reason);
console.log(`Токены: ${data.usage?.prompt_tokens} на входе, ${data.usage?.completion_tokens} на выходе`);
