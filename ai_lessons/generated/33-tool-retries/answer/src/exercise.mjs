export function solve(input) {
  if (input.attempt >= 3) return 'stop';
  if (input.status === 401 || input.status === 403) return 'human';
  if ((input.status === 429 || input.status >= 500) && input.idempotent === true) return 'retry-with-backoff';
  return input.status >= 200 && input.status < 300 ? 'accept' : 'stop';
}
