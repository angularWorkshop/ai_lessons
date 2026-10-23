export function solve(input) {
  const tp = input.filter(x => x.actual === true && x.predicted === true).length;
  const fp = input.filter(x => x.actual === false && x.predicted === true).length;
  const fn = input.filter(x => x.actual === true && x.predicted === false).length;
  return { precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 };
}
