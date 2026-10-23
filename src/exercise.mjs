export function solve(input) {
  const remaining = input.window - input.instructions - input.history - input.tools - input.output;
  return { remaining: Math.max(0, remaining), fits: remaining >= input.document };
}
