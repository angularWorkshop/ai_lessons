export function solve(input) {
  if (input.used >= input.limit) return { action: 'stop' };
  if (input.type === 'text') return { action: 'answer', text: input.text };
  if (input.name !== 'add' || input.approved !== true || !input.args ||
    Object.keys(input.args).length !== 2 || !Number.isFinite(input.args.a) || !Number.isFinite(input.args.b)) return { action: 'deny' };
  return { action: 'tool-result', id: input.id, value: input.args.a + input.args.b };
}
