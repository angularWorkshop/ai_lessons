// Один вопрос агенту поддержки на настоящей модели.
// Запуск: npm run ask -- "Как вернуть деньги за подписку?"
import { estimateCost, llmProvider, loadConfig } from './llm.ts';
import { createSupportAgent } from './support-agent.ts';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('Напиши вопрос: npm run ask -- "Как вернуть деньги за подписку?"');
  process.exit(1);
}

const agent = createSupportAgent({
  provider: llmProvider(loadConfig()),
  dataDir: 'data',
  onTool: ({ call, result }) => {
    const mark = result.isError ? '✗' : '✓';
    const first = result.content.split('\n')[0];
    console.log(`→ ${call.name} ${call.arguments}  ${mark} ${first.length > 90 ? `${first.slice(0, 90)}…` : first}`);
  },
});

const result = await agent.run(question);
console.log(`\nагент> ${result.answer}`);
console.log(`\nисточники: ${result.sources.join(', ') || 'нет'}`);
if (result.ticket) {
  console.log(`обращение: ${result.ticket.id} (${result.ticket.priority}) — ${result.ticket.summary}`);
}
console.log(`[${result.stopReason} · шагов ${result.steps} · вход ${result.usage.input} · выход ${result.usage.output} · $${estimateCost(result.usage).toFixed(6)}]`);
