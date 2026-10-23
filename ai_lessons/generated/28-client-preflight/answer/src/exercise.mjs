export function solve(input) {
  const missing = ['workspace', 'model', 'permissions', 'testCommand'].filter(key => typeof input[key] !== 'string' || !input[key].trim());
  return { ready: missing.length === 0, missing };
}
