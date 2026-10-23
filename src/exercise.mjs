export function solve(input) {
  const result = { text: '', state: 'incomplete' };
  for (const event of input) {
    if (event.type === 'cancel' || event.type === 'error') { result.state = event.type === 'cancel' ? 'cancelled' : 'failed'; break; }
    if (event.type === 'done') { result.state = 'complete'; break; }
    if (event.type === 'delta') result.text += event.text;
  }
  return result;
}
