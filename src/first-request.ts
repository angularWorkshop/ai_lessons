// Программа из теории: первый запрос к модели без всяких обёрток.
// Запуск: npm run first
interface ChatCompletionResponse {
  choices: {
    message: { role: 'assistant'; content: string | null };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

const response = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: process.env.LLM_MODEL,
    messages: [
      { role: 'system', content: 'Ты лаконичный помощник. Отвечай одним предложением.' },
      { role: 'user', content: 'Что такое event loop в JavaScript?' },
    ],
    temperature: 0,
    max_tokens: 300,
  }),
});

if (!response.ok) {
  console.error('API вернул ошибку:', response.status, await response.text());
  process.exit(1);
}

const data = (await response.json()) as ChatCompletionResponse;
console.log('Ответ:', data.choices[0].message.content);
console.log('finish_reason:', data.choices[0].finish_reason);
