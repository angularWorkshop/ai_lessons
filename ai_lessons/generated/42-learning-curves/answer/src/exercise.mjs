export function solve(input) {
  if (input.some(x => !Number.isFinite(x.train) || !Number.isFinite(x.validation))) return 'invalid';
  if (input.length < 2) return 'more-evidence';
  const first = input[0], last = input.at(-1);
  if (last.train < first.train && last.validation > first.validation) return 'possible-overfit';
  return last.validation < first.validation ? 'improving' : 'investigate';
}
