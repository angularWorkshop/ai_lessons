export function solve(input) {
  return input.records.filter(r => r.scope === input.scope && r.approved === true && r.sensitive === false &&
    typeof r.fact === 'string' && r.fact.trim() && typeof r.source === 'string' && r.source.trim() && Number.isFinite(r.expiresAt) && r.expiresAt > input.now)
    .map(r => ({ id: r.id, fact: r.fact, source: r.source }));
}
