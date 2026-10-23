export const addTool = { type: 'function', function: { name: 'add', description: 'Add two finite numbers. No filesystem or network access.',
  parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false } } };

const validArgs = args => args && !Array.isArray(args) && Object.keys(args).length === 2 && Number.isFinite(args.a) && Number.isFinite(args.b);
export function executeAdd(args) {
  if (!validArgs(args)) throw new Error('invalid-arguments');
  const value = args.a + args.b;
  if (!Number.isFinite(value)) throw new Error('result-overflow');
  return value;
}

// The host owns dispatch and budgets. A proposed tool name is never evaluated as code.
export async function runAssistant({ provider, question, approved = ['add'], maxModelCalls = 3, timeoutMs = 1000 }) {
  if (!Number.isInteger(maxModelCalls) || maxModelCalls < 1 || maxModelCalls > 10 || !(timeoutMs > 0)) throw new Error('invalid-budget');
  const messages = [{ role: 'user', content: question }], trace = [], seen = new Set();
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, timeoutMs); });
  try {
    for (let turn = 0; turn < maxModelCalls; turn++) {
      const message = await Promise.race([provider({ messages: structuredClone(messages), tools: [addTool], signal: controller.signal }), deadline]);
      trace.push({ kind: 'model', turn: turn + 1 });
      if (!message || typeof message !== 'object' || (message.content !== undefined && typeof message.content !== 'string')) throw new Error('invalid-response');
      const calls = message.tool_calls;
      if (calls === undefined || (Array.isArray(calls) && calls.length === 0)) {
        if (typeof message.content !== 'string' || !message.content.trim()) throw new Error('empty-response');
        return { status: 'answered', answer: message.content, trace };
      }
      // This first workbench deliberately supports one proposed call per turn.
      if (!Array.isArray(calls) || calls.length !== 1) return { status: 'blocked', reason: 'one-call-per-turn', trace };
      const call = calls[0]?.function;
      if (!call || call.name !== 'add' || !approved.includes(call.name)) return { status: 'denied', trace };
      if (!validArgs(call.arguments)) throw new Error('invalid-arguments');
      const key = `add:${call.arguments.a}:${call.arguments.b}`;
      if (seen.has(key)) return { status: 'blocked', reason: 'repeated-call', trace };
      seen.add(key);
      const value = executeAdd(call.arguments);
      messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
      messages.push({ role: 'tool', tool_name: call.name, content: JSON.stringify({ value }) });
      trace.push({ kind: 'tool', name: call.name, value });
    }
    return { status: 'budget-exhausted', trace };
  } catch (error) {
    return { status: error.message === 'deadline' ? 'timed-out' : 'failed', reason: error.message, trace };
  } finally { clearTimeout(timer); controller.abort(); }
}
