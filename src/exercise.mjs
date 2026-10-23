export function solve(input) {
  return { ready: input.clean === true && input.branch !== 'main' && input.backupVerified === true && input.secretsTracked === false };
}
