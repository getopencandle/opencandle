import type { ReportWorkerPort } from '../../src/strategy-report/client';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
// This deterministic transport runs the real protocol/calculation in this test
// process. A separate actual worker-thread corpus covers process scheduling.
export class ReportLoopbackPort implements ReportWorkerPort {
  listeners = new Map<string, Set<(event: any) => void>>(); messages: any[] = []; terminated = 0;
  hold = new Set<string>(); held: (() => void)[] = []; reply: (value: any, request: any) => any = value => value;
  throwPost = false; throwTerminate = false;
  session = new StrategyReportWorkerSession((progress, job, sequence) => this.emit({ version: 1, kind: 'progress', job, sequence, progress }));
  constructor(public startup = true) { if (startup) queueMicrotask(() => this.emit({ version: 1, kind: 'started' })); }
  addEventListener(type: string, listener: (event: any) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  emit(data: unknown) { for (const listener of this.listeners.get('message') ?? []) listener({ data }); }
  postMessage(raw: unknown) {
    if (this.throwPost) throw Error('Injected post failure');
    const message = structuredClone(raw) as any; this.messages.push(message);
    let response: unknown;
    const send = () => { response ??= this.reply(this.session.handle(message), message); this.emit(response); };
    if (this.hold.has(message.kind)) this.held.push(send); else queueMicrotask(send);
  }
  terminate() { this.terminated++; if (this.throwTerminate) throw Error('Injected termination failure'); }
}
