// npm run providers "задача": агент решает задачу через шлюз курса (Chat Completions),
// а потом печатает последний запрос так, как его отправил бы anthropicProvider в Anthropic Messages API.
import { Agent } from './agent.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { loadConfig, type ChatOptions, type Message } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider, type Provider } from './provider.ts';
import { toAnthropicRequest } from './providers/anthropic.ts';
import { Toolbox } from './tools.ts';

const SYSTEM = `Ты — агент, который решает задачи с помощью инструментов.
Текущее время узнавай только через get_current_time, любые вычисления делай только через calculate.
Когда всё узнал, ответь коротко и по-русски.`;

// Provider — интерфейс, поэтому его легко обернуть: запоминаем последний запрос и передаём дальше.
function recording(inner: Provider) {
  let last: { messages: Message[]; options: ChatOptions } | undefined;
  const provider: Provider = {
    complete(messages, options) {
      last = { messages: [...messages], options };
      return inner.complete(messages, options);
    },
  };
  return { provider, last: () => last };
}

const task = process.argv.slice(2).join(' ') || 'Сколько минут осталось до полуночи в Токио?';
console.log(`задача> ${task}`);

const recorder = recording(llmProvider(loadConfig()));
const agent = new Agent({
  provider: recorder.provider,
  toolbox: new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator),
  system: SYSTEM,
  onEvent: printEvent,
});

const run = await agent.run(task);
if (run.stopReason === 'error') {
  console.error(run.answer);
  process.exit(1);
}

const last = recorder.last();
if (last) {
  const body = toAnthropicRequest('claude-opus-5-5', last.messages, last.options);
  // Схемы инструментов длинные и те же, что в tools у Chat Completions, — печатаем только имена.
  const short = { ...body, tools: body.tools?.map((tool) => `${tool.name}: input_schema …`) };
  console.log('\nПоследний запрос агента в формате Anthropic (POST /v1/messages):');
  console.log(JSON.stringify(short, null, 2));
}
