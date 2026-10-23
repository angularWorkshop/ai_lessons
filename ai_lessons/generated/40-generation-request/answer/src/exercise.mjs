export function solve(input) {
  return { model: input.model, messages: [{ role: 'user', content: input.question }], stream: false,
    options: { temperature: 0, num_predict: input.maxOutput } };
}
