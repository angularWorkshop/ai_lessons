// Сырые кусочки вызовов инструментов в стриме. Запуск: npm run tool-chunks
// Можно передать свою задачу: npm run tool-chunks -- "Сколько будет 17 * 23?"
import { calculator, currentTime } from './demo-tools.ts';
import { LineBuffer, loadConfig, sseData } from './llm.ts';
import { ToolCallBuffer, type ToolCallDelta } from './tool-call-deltas.ts';
import { Toolbox } from './tools.ts';

const config = loadConfig();
const task = process.argv.slice(2).join(' ') || 'Который час в Москве и в Токио?';
const tools = new Toolbox().register(currentTime).register(calculator).specs();

const response = await fetch(`${config.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: config.model,
    messages: [{ role: 'user', content: task }],
    tools,
    stream: true,
    stream_options: { include_usage: true },
  }),
});
if (!response.ok || !response.body) {
  throw new Error(`LLM API ответил ${response.status}: ${await response.text()}`);
}

console.log(`задача> ${task}\n`);
const buffer = new ToolCallBuffer();
const lines = new LineBuffer();
const decoder = new TextDecoder();
for await (const bytes of response.body) {
  for (const line of lines.push(decoder.decode(bytes, { stream: true }))) {
    const data = sseData(line);
    if (data === undefined || data === '[DONE]') {
      continue;
    }
    const choice = JSON.parse(data).choices[0];
    const deltas: ToolCallDelta[] | undefined = choice?.delta?.tool_calls;
    if (deltas) {
      // Каждый кусочек — как пришёл: index, а в первом ещё id и имя.
      console.log(JSON.stringify(deltas));
      buffer.push(deltas);
    } else if (choice?.delta?.content) {
      console.log(`текст: ${JSON.stringify(choice.delta.content)}`);
    }
  }
}

console.log('\nСобрано:');
for (const call of buffer.calls()) {
  console.log(`${call.id} ${call.name}(${call.arguments})`);
}
