export function solve(input) {
  const missing = ['licensed', 'basePinned', 'splitChecked', 'templateChecked', 'maskChecked', 'smokePassed'].filter(key => input[key] !== true);
  return { ready: missing.length === 0, missing };
}
