export function solve(input) {
  const valid = v => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite);
  if (!valid(input.query)) return [];
  const norm = v => Math.sqrt(v.reduce((n, x) => n + x * x, 0));
  const qn = norm(input.query);
  if (!qn || typeof input.tenant !== 'string' || !input.tenant) return [];
  return input.documents.filter(d => d.tenant === input.tenant && d.model === input.model && valid(d.vector) && d.vector.length === input.query.length && norm(d.vector) > 0)
    .map(d => ({ id: d.id, score: d.vector.reduce((n, x, i) => n + x * input.query[i], 0) / (norm(d.vector) * qn) }))
    .filter(d => d.score >= input.threshold).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.k).map(d => d.id);
}
