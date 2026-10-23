export function solve(input) {
  const c = input.candidate, a = input.active;
  const ready = typeof c.version === 'string' && c.version.trim().length > 0 && Number.isInteger(c.schema) && typeof c.embeddingModel === 'string' && c.schema === a.schema && c.embeddingModel === a.embeddingModel &&
    c.health === true && c.qualityPassed === true && c.failureChecksPassed === true && input.rollbackAvailable === true;
  return { version: ready ? c.version : a.version, switched: ready };
}
