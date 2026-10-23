import { runAssistant } from './agent.mjs';
import { demoCorpus, retrieve, evidencePacket } from './rag.mjs';
import { gradientStep, lowRankDelta } from './training-math.mjs';
import { localClient } from './local-client.mjs';

const mode = process.argv[2];
if (mode === 'agent') {
  const provider = async ({ messages }) => {
    const result = messages.find(m => m.role === 'tool');
    return result ? { content: `The calculator returned ${JSON.parse(result.content).value}.` } :
      { tool_calls: [{ function: { name: 'add', arguments: { a: 2, b: 3 } } }] };
  };
  console.log(JSON.stringify({ provider: 'explicit offline stub; add really executes', ...await runAssistant({ provider, question: 'Add 2 and 3' }) }, null, 2));
} else if (mode === 'rag') {
  const found = retrieve({ query: [1, 0], model: 'teaching-vectors-v1', tenant: 'demo', documents: demoCorpus });
  console.log(JSON.stringify({ vectors: 'hand-authored, not learned', result: evidencePacket(found),
    noEvidence: evidencePacket(retrieve({ query: [-1, 0], model: 'teaching-vectors-v1', tenant: 'demo', documents: demoCorpus })) }, null, 2));
} else if (mode === 'training') {
  console.log(JSON.stringify({ step: gradientStep({ x: 1, y: 1, weight: 0, bias: 0, rate: 0.5 }),
    loraDelta: lowRankDelta([[1, 2, 3]], [[2], [4]], 1), note: 'Real arithmetic; not an LLM training run. Use local-training/train.py for the actual classifier.' }, null, 2));
} else if (mode === 'local-agent') {
  const client = localClient({ model: process.env.AI_LOCAL_MODEL });
  console.log(JSON.stringify(await runAssistant({ provider: client.chat, question: 'Use add to calculate 2 + 3.', timeoutMs: 30000 }), null, 2));
} else {
  console.error('Use: node ai_lessons/workbench/demo.mjs agent | rag | training | local-agent');
  process.exitCode = 2;
}
