export function solve(input) {
  return input.examples.filter(e => e.split === 'train' && e.approved === true && e.task === input.task)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.limit).map(e => e.id);
}
