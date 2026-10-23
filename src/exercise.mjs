export function solve(input) {
  const total = input.reduce((n, item) => n + item.weight, 0);
  if (!input.length || !input.every(item => Number.isFinite(item.weight) && item.weight >= 0) || !Number.isFinite(total) || total <= 0) return [];
  return input.map(item => ({ token: item.token, probability: item.weight / total }));
}
