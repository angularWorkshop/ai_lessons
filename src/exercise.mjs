export function solve(input) {
  const known = new Set(input.approved);
  return input.discovered.filter(t => known.has(t.name) && t.readOnly === true).map(t => t.name).sort();
}
