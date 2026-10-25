// Ошибка инструмента как данные для модели: npm run tool-errors
import { calculator, currentTime } from './demo-tools.ts';
import { chat, loadConfig, type Message } from './llm.ts';
import { Toolbox } from './tools.ts';

const toolbox = new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator);
const tools = toolbox.specs();

const config = loadConfig();
const messages: Message[] = [{ role: 'user', content: 'Корень из 144 умножь на 3,5' }];

// Не больше четырёх запросов: модели хватит, чтобы ошибиться, прочитать ошибку и исправиться.
// В секции 4 этот цикл станет агентом — с лимитами и причинами остановки.
for (let step = 1; step <= 4; step++) {
  const result = await chat(config, messages, { tools });
  messages.push(result.message);

  if (result.toolCalls.length === 0) {
    console.log(`\nмодель> ${result.text}`);
    break;
  }
  for (const call of result.toolCalls) {
    const { content, isError } = await toolbox.execute(call);
    console.log(`\n${step}. ${call.name}(${call.arguments})`);
    console.log(`${isError ? '✗' : '✓'} ${content}`);
    messages.push({ role: 'tool', tool_call_id: call.id, content });
  }
}
