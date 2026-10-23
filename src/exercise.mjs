export function solve(input) {
  const valid = input.filter(x => x.split === 'validation' && Number.isFinite(x.loss));
  return valid.length ? [...valid].sort((a, b) => a.loss - b.loss || a.id.localeCompare(b.id))[0].id : null;
}
