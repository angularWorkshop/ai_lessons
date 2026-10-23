export function solve(input) {
  if (!Array.isArray(input.ids) || !Array.isArray(input.assistantMask) || !Array.isArray(input.attentionMask) ||
    input.ids.length !== input.assistantMask.length || input.ids.length !== input.attentionMask.length ||
    !input.ids.every(x => Number.isInteger(x) && x >= 0) || !input.assistantMask.every(x => x === 0 || x === 1) || !input.attentionMask.every(x => x === 0 || x === 1)) return { valid: false };
  const labels = input.ids.map((id, i) => input.assistantMask[i] === 1 && input.attentionMask[i] === 1 ? id : -100);
  return labels.some(x => x !== -100) ? { valid: true, labels } : { valid: false };
}
