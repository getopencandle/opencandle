import { StrategyReportWorkerSession } from './worker-core';

// This worker contains trusted LV calculation code. User scripts execute in the
// separate restricted QuickJS worker; no user code or source URLs enter here.
const port = globalThis as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
};
const session = new StrategyReportWorkerSession((progress, job, sequence) => {
  port.postMessage({ version: 1, kind: 'progress', job, sequence, progress });
});
port.addEventListener('message', event => {
  const reply = session.handle(event.data);
  port.postMessage(reply, reply.ok && reply.kind === 'export' ? [reply.buffer] : []);
});
port.postMessage({ version: 1, kind: 'started' });
