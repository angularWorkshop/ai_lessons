export function solve(input) {
  const warm = input.filter(x => x.warm === true && x.ok === true && x.seconds > 0);
  return { samples: warm.length, tokensPerSecond: warm.length ? warm.reduce((n, x) => n + x.tokens, 0) / warm.reduce((n, x) => n + x.seconds, 0) : null };
}
