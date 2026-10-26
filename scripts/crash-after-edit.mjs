// Хук для npm run crash-demo: после первой удачной правки убивает процесс агента сигналом SIGKILL.
// Хук — код внутри процесса агента (тема 12.4), поэтому он может и уронить его. Так и симулируем падение.
export default function crashAfterEdit({ result }) {
  if (result.isError) return;
  console.error('✗ SIGKILL: процесс агента убит сразу после правки');
  process.kill(process.pid, 'SIGKILL');
}
