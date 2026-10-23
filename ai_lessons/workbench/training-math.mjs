const sigmoid = z => 1 / (1 + Math.exp(-z));
const loss = (p, y) => -y * Math.log(Math.max(1e-12, p)) - (1 - y) * Math.log(Math.max(1e-12, 1 - p));

export function gradientStep({ x, y, weight, bias, rate }) {
  if (![x, y, weight, bias, rate].every(Number.isFinite) || ![0, 1].includes(y) || rate <= 0) throw new Error('invalid-training-input');
  const p = sigmoid(weight * x + bias), error = p - y;
  const nextWeight = weight - rate * error * x, nextBias = bias - rate * error;
  const after = sigmoid(nextWeight * x + nextBias);
  return { before: { weight, bias, probability: p, loss: loss(p, y) }, gradient: { weight: error * x, bias: error },
    after: { weight: nextWeight, bias: nextBias, probability: after, loss: loss(after, y) } };
}

export function lowRankDelta(A, B, alpha = 1) {
  const rank = A.length, columns = A[0]?.length;
  if (!rank || !columns || !B.length || !Number.isFinite(alpha) ||
    !A.every(row => row.length === columns && row.every(Number.isFinite)) || !B.every(row => row.length === rank && row.every(Number.isFinite))) throw new Error('invalid-adapter-dimensions');
  return B.map(row => Array.from({ length: columns }, (_, col) => row.reduce((sum, b, i) => sum + b * A[i][col], 0) * alpha / rank));
}
