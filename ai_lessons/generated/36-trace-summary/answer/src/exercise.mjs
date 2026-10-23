export function solve(input) {
  return { calls: input.length, durationMs: input.reduce((n, x) => n + x.durationMs, 0),
    failed: input.filter(x => x.ok === false).map(x => x.id) };
}
