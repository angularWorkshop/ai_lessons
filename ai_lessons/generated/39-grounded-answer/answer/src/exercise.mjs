export function solve(input) {
  const known = new Set(input.retrieved);
  return { accepted: input.claims.length > 0 && input.claims.every(c => c.sources.length > 0 && c.sources.every(s => known.has(s))) };
}
