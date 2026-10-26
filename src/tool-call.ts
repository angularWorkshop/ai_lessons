// Один круг tool calling руками: npm run tool-call
// Адрес, ключ и модель платформа уже положила в .env.
import { chat, loadConfig, type Message, type ToolSpec } from './llm.ts';

// Инструмент для модели — только описание: имя, зачем он нужен и какие аргументы ждёт.
const tools: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Текущие дата и время в указанном часовом поясе.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Часовой пояс IANA, например Europe/Moscow или Asia/Tokyo' },
        },
        required: ['timezone'],
      },
    },
  },
];

// А это код, который исполняет программа. Модель его не видит и вызвать не может.
function getCurrentTime(timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
}

const config = loadConfig();
const messages: Message[] = [{ role: 'user', content: 'Который час в Токио?' }];

// 1. Вопрос вместе со списком инструментов.
const first = await chat(config, messages, { tools });
console.log(`1. finish_reason: ${first.finishReason}, токенов на входе: ${first.usage.input}`);
if (first.toolCalls.length === 0) {
  console.log(`модель ответила сама: ${first.text}`);
  process.exit(0);
}
// Ответ с tool_calls — часть истории. Без него следующий запрос не поймёт, на что пришёл результат.
messages.push(first.message);

// 2. Исполняем вызовы сами и кладём результаты в историю с тем же id.
for (const call of first.toolCalls) {
  console.log(`2. модель просит: ${call.name}(${call.arguments})`);
  if (call.name !== 'get_current_time') {
    throw new Error(`Модель вызвала неизвестный инструмент: ${call.name}`);
  }
  const args = JSON.parse(call.arguments) as { timezone: string };
  const result = getCurrentTime(args.timezone);
  console.log(`   программа ответила: ${result}`);
  messages.push({ role: 'tool', tool_call_id: call.id, content: result });
}

// 3. Второй запрос: та же история плюс результаты. Инструменты отправляем снова.
const second = await chat(config, messages, { tools });
console.log(`3. finish_reason: ${second.finishReason}, токенов на входе: ${second.usage.input}`);
console.log(`\nмодель> ${second.text}`);
