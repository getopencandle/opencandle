import { describe, expect, it } from 'vitest';
import { getNativeIndicator, type Vela } from '@luxalgo/vela';
import { createScriptPort } from '../../src/chart/script-port';
import type { PaneRegistry } from '../../src/chart/pane-registry';
import type { ChartController } from '../../src/chart/adapter';
import { ScriptBindingRuntime, type BindingStatus, type ScriptBindingExecution, type ScriptTransactionLease } from '../../src/ui/script-binding-runtime';
import type { ScriptBinding } from '../../src/ui/script-library';
import type { executeScriptOnBars, ScriptResult } from '../../src/ui/script-jobs';

// Synthetic deferred execution isolates publication ownership from worker math.
const binding: ScriptBinding = {
  id: 'synthetic-binding', documentId: 'synthetic-document', version: 1,
  name: 'Synthetic A', source: '({onBar(){/* Synthetic A */}})',
  pane: 'price', visible: true, plots: {},
};
const bars = [{ time: 1, open: 2, high: 3, low: 1, close: 2, volume: 1 }];
const context = { bars, identity: 'synthetic-input', fixture: true, bindings: [binding], ready: true };
const alternate = { ...context, bindings: [{ ...binding, source: '({onBar(){/* Synthetic B */}})' }] };
type Completion = Awaited<ReturnType<typeof executeScriptOnBars>>;
type Pending = { input: Parameters<typeof executeScriptOnBars>[0]; resolve: (value: Completion) => void; reject: (error: unknown) => void };
type Operation = 'add' | 'update' | 'rename' | 'remove' | 'styles' | 'show' | 'place';

function completion(value: number): Completion {
  const result: ScriptResult = {
    plots: [{ id: 'synthetic-plot', title: 'Synthetic', color: '#123456', values: [{ time: 1, value }] }],
    alerts: [], orders: [], diagnostics: [], elapsedMs: 1, provisional: false,
    state: null, provenance: { kind: 'synthetic', label: 'Synthetic deferred publication' },
  };
  return { result, barIds: ['synthetic-bar'] };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function controlled() {
  const pending: Pending[] = [], states: BindingStatus[][] = [], results: ScriptBindingExecution[] = [];
  const mounted = new Map<string, any>(), calls: Array<{ operation: Operation; id: string; result?: any }> = [];
  let callback: ((operation: Operation, value?: any) => void) | undefined;
  let releaseCallback: (() => void) | undefined;
  const event = (operation: Operation, id: string, value?: any) => { calls.push({ operation, id, result: value }); callback?.(operation, value); };
  const port = {
    add(result: any, settings: any) { if (mounted.has(settings.id)) throw new Error('Synthetic duplicate ID'); mounted.set(settings.id, result); event('add', settings.id, result); return settings.id; },
    update(id: string, result: any) { if (!mounted.has(id)) throw new Error('Synthetic missing ID'); mounted.set(id, result); event('update', id, result); },
    rename(id: string, title: string) { event('rename', id, title); },
    remove(id: string) { mounted.delete(id); event('remove', id); },
    replaceStyles(id: string) { event('styles', id); }, show(id: string) { event('show', id); },
    place(id: string) { event('place', id); },
    beginExternalTransaction() { let active = true; return { release(publish: boolean) { if (!active) throw new Error('Synthetic duplicate release'); active = false; if (publish) releaseCallback?.(); } }; },
  } as unknown as ChartController['scripts'];
  const execute: typeof executeScriptOnBars = input => new Promise((resolve, reject) => pending.push({ input, resolve, reject }));
  const runtime = new ScriptBindingRuntime(port, rows => states.push(rows.map(row => ({ ...row }))), value => results.push(value), execute);
  return { runtime, pending, states, results, calls, mounted, callback(value: typeof callback) { callback = value; }, release(value: typeof releaseCallback) { releaseCallback = value; } };
}

describe('independent script completion publication boundaries', () => {
  it('does not publish result effects or ready status after add callback disposal', async () => {
    const t = controlled();
    try {
      t.callback(operation => { if (operation === 'add') t.runtime.dispose(); });
      t.runtime.update(context); t.pending[0].resolve(completion(99)); await settle();
      expect(t.results).toEqual([]);
      expect(t.states.flat().some(row => row.status === 'ready')).toBe(false);
      expect(t.mounted.size).toBe(0);
      expect(t.calls.filter(row => row.operation === 'add')).toHaveLength(1);
      expect(t.calls.filter(row => row.operation === 'remove')).toHaveLength(1);
    } finally { t.runtime.dispose(); }
  });

  it('does not lose an initial job when native publication reports the exact same context', async () => {
    const t = controlled();
    try {
      t.release(() => t.runtime.update(context));
      t.runtime.update(context); t.pending[0].resolve(completion(2)); await settle();
      expect(t.pending).toHaveLength(1);
      expect(t.pending[0].input.signal.aborted).toBe(false);
      expect(t.results.map(row => row.result.plots[0].values[0].value)).toEqual([2]);
      expect(t.states.at(-1)?.[0].status).toBe('ready');
      expect(t.mounted.size).toBe(1);
    } finally { t.runtime.dispose(); }
  });

  for (const aba of [false, true]) it(`retires initial add completion when a callback requests ${aba ? 'A to B to A' : 'a different source'}`, async () => {
    const t = controlled();
    try {
      let fired = false;
      t.callback(operation => { if (operation !== 'add' || fired) return; fired = true; t.runtime.update(alternate); if (aba) t.runtime.update(context); });
      t.runtime.update(context); t.pending[0].resolve(completion(99)); await settle();
      expect(t.pending[0].input.signal.aborted).toBe(true);
      expect(t.results).toEqual([]);
      expect(t.pending).toHaveLength(2);
      expect(t.pending[1].input.source).toBe((aba ? context : alternate).bindings[0].source);
      t.pending[1].resolve(completion(2)); await settle();
      expect(t.results.map(row => row.result.plots[0].values[0].value)).toEqual([2]);
      expect(t.calls.filter(row => row.operation === 'add')).toHaveLength(1);
      expect(t.mounted.get(binding.id).plots[0].values[0].value).toBe(2);
    } finally { t.runtime.dispose(); }
  });

  for (const aba of [false, true]) it(`rechecks source after numeric update callback${aba ? ' even with A to B to A' : ''}`, async () => {
    const t = controlled();
    try {
      t.runtime.update(context); t.pending[0].resolve(completion(2)); await settle();
      const replacement = { ...context, identity: 'synthetic-next-input' };
      t.runtime.update(replacement);
      let fired = false;
      t.callback((operation, result) => {
        if (operation !== 'update' || !result.plots.length || fired) return; fired = true;
        t.runtime.update({ ...alternate, identity: replacement.identity });
        if (aba) t.runtime.update(replacement);
      });
      t.pending[1].resolve(completion(99)); await settle();
      expect(fired).toBe(true);
      expect(t.pending[1].input.signal.aborted).toBe(true);
      expect(t.results).toHaveLength(1);
      expect(t.pending).toHaveLength(3);
      t.pending[2].resolve(completion(3)); await settle();
      expect(t.results.map(row => row.result.plots[0].values[0].value)).toEqual([2, 3]);
      expect(t.states.at(-1)?.[0].status).toBe('ready');
    } finally { t.runtime.dispose(); }
  });

  for (const aba of [false, true]) it(`rechecks source after rename callback${aba ? ' even with A to B to A' : ''}`, async () => {
    const t = controlled();
    try {
      t.runtime.update(context); t.pending[0].resolve(completion(2)); await settle();
      const next = { ...context, identity: 'synthetic-next-input' };
      t.runtime.update(next);
      const renamed = { ...next, bindings: [{ ...binding, name: 'Synthetic renamed' }] };
      let fired = false;
      t.callback(operation => {
        if (operation !== 'rename' || fired) return; fired = true;
        t.runtime.update({ ...renamed, bindings: [{ ...renamed.bindings[0], source: alternate.bindings[0].source }] });
        if (aba) t.runtime.update(renamed);
      });
      t.runtime.update(renamed);
      expect(fired).toBe(true);
      expect(t.pending[1].input.signal.aborted).toBe(true);
      t.pending[1].resolve(completion(99)); await settle();
      expect(t.results).toHaveLength(1);
      expect(t.pending).toHaveLength(3);
      t.pending[2].resolve(completion(3)); await settle();
      expect(t.results.map(row => row.result.plots[0].values[0].value)).toEqual([2, 3]);
      expect(t.results[1].sourceCode).toBe((aba ? binding : alternate.bindings[0]).source);
    } finally { t.runtime.dispose(); }
  });

  it('cleans a committed initial reservation after add throws and permits one explicit retry', async () => {
    const t = controlled();
    try {
      const cause = new Error('Synthetic add commit-tail failure');
      t.callback(operation => { if (operation === 'add') throw cause; });
      t.runtime.update(context); t.pending[0].resolve(completion(99)); await settle();
      expect(t.mounted.size).toBe(0);
      expect(t.results).toEqual([]);
      expect(t.states.at(-1)?.[0]).toMatchObject({ status: 'error', message: cause.message });
      expect(t.calls.filter(row => row.operation === 'remove')).toHaveLength(1);
      t.callback(undefined); t.runtime.retry(); t.runtime.update(context);
      expect(t.pending).toHaveLength(2);
      t.pending[1].resolve(completion(2)); await settle();
      expect(t.results).toHaveLength(1);
      expect(t.mounted.size).toBe(1);
      expect(t.states.at(-1)?.[0].status).toBe('ready');
    } finally { t.runtime.dispose(); }
  });

  it('does not let a native completion failure overwrite the replacement job status', async () => {
    const t = controlled();
    try {
      t.runtime.update(context); t.pending[0].resolve(completion(2)); await settle();
      const next = { ...context, identity: 'synthetic-next-input' };
      t.runtime.update(next);
      let fired = false;
      t.callback((operation, result) => {
        if (operation !== 'update' || !result.plots.length || fired) return; fired = true;
        t.runtime.update({ ...alternate, identity: next.identity });
        throw new Error('Synthetic stale native failure');
      });
      t.pending[1].resolve(completion(99)); await settle();
      expect(fired).toBe(true);
      expect(t.pending).toHaveLength(3);
      expect(t.states.at(-1)?.[0].status).toBe('running');
      expect(t.states.flat().some(row => row.message.includes('Synthetic stale native failure'))).toBe(false);
      t.pending[2].resolve(completion(3)); await settle();
      expect(t.results.map(row => row.result.plots[0].values[0].value)).toEqual([2, 3]);
    } finally { t.runtime.dispose(); }
  });

  it('does not replace newer ready status with an older executor rejection', async () => {
    const t = controlled();
    try {
      t.runtime.update(context); t.runtime.update(alternate);
      t.pending[1].resolve(completion(3)); await settle();
      const before = structuredClone(t.states.at(-1));
      t.pending[0].reject(new Error('Synthetic old executor failure')); await settle();
      expect(t.states.at(-1)).toEqual(before);
      expect(t.results).toHaveLength(1);
      expect(t.results[0].sourceCode).toBe(alternate.bindings[0].source);
    } finally { t.runtime.dispose(); }
  });

  it('rechecks the request after formatting a reentrant rejection message', async () => {
    const t = controlled();
    try {
      t.runtime.update(context);
      const count = t.states.length;
      let reads = 0;
      const cause = new Error();
      Object.defineProperty(cause, 'message', { get() { reads++; t.runtime.update(alternate); return 'Synthetic retired formatting error'; } });
      t.pending[0].reject(cause); await settle();
      expect(reads).toBe(1);
      expect(t.pending[0].input.signal.aborted).toBe(true);
      expect(t.pending).toHaveLength(2);
      expect(t.states.slice(count).flat().some(row => row.message.includes('Synthetic retired formatting error'))).toBe(false);
      expect(t.states.at(-1)?.[0].status).toBe('running');
      t.pending[1].resolve(completion(3)); await settle();
      expect(t.results).toHaveLength(1);
      expect(t.results[0].sourceCode).toBe(alternate.bindings[0].source);
    } finally { t.runtime.dispose(); }
  });

  it('refuses transactional staging from inside a native completion callback', async () => {
    const t = controlled();
    let lease: ScriptTransactionLease | undefined, stageFailure: unknown;
    try {
      t.callback(operation => {
        if (operation !== 'add') return;
        lease = t.runtime.prepareBindings([]); lease.pauseAndCapture();
        try { lease.stage(); } catch (error) { stageFailure = error; }
      });
      t.runtime.update(context); t.pending[0].resolve(completion(99)); await settle();
      expect(stageFailure).toBeInstanceOf(Error);
      expect(String(stageFailure)).toContain('native script callback');
      expect(t.pending[0].input.signal.aborted).toBe(true);
      expect(t.results).toEqual([]);
      expect(t.calls.filter(row => row.operation === 'remove')).toEqual([]);
      // Native checkpoint restoration belongs to the caller; this is solely
      // the runtime barrier, not a test of native checkpoint rollback.
      lease!.rollback(); lease!.resume(false);
    } finally { t.runtime.dispose(); }
  });

  it('applies the guard to the actual script port notification release', async () => {
    const pending: Pending[] = [], states: BindingStatus[][] = [], results: ScriptBindingExecution[] = [];
    let runtime!: ScriptBindingRuntime, mounted = 0;
    const chart = {
      addNativeIndicator(type: string) {
        const descriptor = getNativeIndicator(type);
        if (!descriptor) throw new Error('Missing genuine synthetic descriptor');
        const model = (descriptor.create as any)(); mounted++;
        const handle = { id: 'synthetic-native-handle', remove() { mounted--; model.stop(); }, setVisible() {}, moveTo() {} };
        model.start({ bars: () => bars.map(bar => ({ ...bar, time: bar.time * 1000 })), emit() {} });
        return handle;
      },
    } as unknown as Vela;
    const panes = { info: () => undefined } as unknown as PaneRegistry;
    const port = createScriptPort(chart, panes);
    const off = port.subscribe(() => runtime.dispose());
    const execute: typeof executeScriptOnBars = input => new Promise((resolve, reject) => pending.push({ input, resolve, reject }));
    runtime = new ScriptBindingRuntime(port, rows => states.push(rows), row => results.push(row), execute);
    try {
      runtime.update(context); pending[0].resolve(completion(99)); await settle();
      expect(results).toEqual([]);
      expect(states.flat().some(row => row.status === 'ready')).toBe(false);
      expect(port.list()).toEqual([]);
      expect(mounted).toBe(0);
      expect(pending[0].input.signal.aborted).toBe(true);
    } finally { off(); runtime.dispose(); port.dispose(); }
  });
});
