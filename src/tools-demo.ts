// Инструменты из реестра на настоящей модели: npm run tools
import { calculator, currentTime } from './demo-tools.ts';
import { chat, loadConfig, type Message } from './llm.ts';
import { Toolbox } from './tools.ts';

const toolbox = new Toolbox().register(currentTime).register(calculator);
const tools = toolbox.specs();
console.log('Модель увидит:');
console.log(JSON.stringify(tools[1], null, 2));

const config = loadConfig();
const messages: Message[] = [{ role: 'user', content: 'Сколько будет 17% от 2350? И который сейчас час в Москве?' }];

const first = await chat(config, messages, { tools });
messages.push(first.message);

for (const call of first.toolCalls) {
  console.log(`\nмодель просит: ${call.name}(${call.arguments})`);
  // Пока без страховки: неизвестное имя, кривой JSON или неверные аргументы уронят программу. Это тема 3.3.
  const tool = toolbox.get(call.name);
  if (!tool) {
    throw new Error(`Модель вызвала неизвестный инструмент: ${call.name}`);
  }
  const args = tool.schema.parse(JSON.parse(call.arguments));
  const content = await tool.run(args, {});
  console.log(`программа ответила: ${content}`);
  messages.push({ role: 'tool', tool_call_id: call.id, content });
}

const second = await chat(config, messages, { tools });
console.log(`\nмодель> ${second.text}`);
console.log(`\nТокенов на входе: ${first.usage.input} и ${second.usage.input}`);
