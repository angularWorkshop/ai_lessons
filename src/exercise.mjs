export function solve(input) {
  if (!Number.isInteger(input.size) || !Number.isInteger(input.overlap) || input.size <= input.overlap || input.overlap < 0) throw new Error('invalid chunk settings');
  const chunks = [];
  for (let start = 0; start < input.text.length; start += input.size - input.overlap) {
    chunks.push({ source: input.source, start, text: input.text.slice(start, start + input.size) });
    if (start + input.size >= input.text.length) break;
  }
  return chunks;
}
