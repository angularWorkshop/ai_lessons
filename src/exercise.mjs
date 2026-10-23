export function solve(input) {
  const words = value => new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
  const query = words(input.query);
  return input.documents.filter(d => d.tenant === input.tenant).map(d => ({ id: d.id, score: [...words(d.text)].filter(w => query.has(w)).length }))
    .filter(d => d.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.k).map(d => d.id);
}
