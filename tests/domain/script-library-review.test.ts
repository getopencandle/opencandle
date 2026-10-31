import { describe, expect, it } from 'vitest';
import { addScript, bindScript, createScriptLibrary, draftScript, importScriptLibrary, restoreScriptLibrary, restoreScriptVersion, saveScript } from '../../src/ui/script-library';
import { ScriptBindingRuntime } from '../../src/ui/script-binding-runtime';

const initial = { id: 'source-one', name: 'Original', source: '({onBar(ctx){ctx.plot("Close",ctx.bar.close)}})', pane: 'price' as const };
const savedAt = '2026-10-14T10:00:00.000Z';
function saved() { return saveScript(createScriptLibrary(initial), initial.id, savedAt); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const bar = (close: number) => ({ time: 100, open: 10, high: 30, low: 5, close, volume: 100 });
const execution = (tag: string) => ({ result: { plots: [], orders: [], alerts: [], diagnostics: [tag], elapsedMs: 0, provisional: false, state: null, provenance: { kind: 'synthetic', label: 'Independent test' } }, barIds: [tag] });

describe('independent script library invariants', () => {
  it('fails atomically rather than saving a version that cannot survive restore', () => {
    const input = saved(); input.documents[0].history[0].version = Number.MAX_SAFE_INTEGER;
    const restored = restoreScriptLibrary(input), edited = draftScript(restored, initial.id, { source: '({onBar(){}})' }), before = JSON.stringify(edited);
    expect(() => saveScript(edited, initial.id, savedAt)).toThrow(); expect(JSON.stringify(edited)).toBe(before);
    expect(restoreScriptLibrary(edited).documents[0].history[0].version).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('cannot smuggle a document identity mutation through a draft field patch', () => {
    const state = addScript(saved(), { ...initial, id: 'source-two' }, 'indicator'), before = JSON.stringify(state);
    const next = draftScript(state, initial.id, { id: 'source-two', source: '({onBar(){}})' } as any);
    expect(next.documents.map(row => row.id)).toEqual(['source-one', 'source-two']); expect(next.documents[0].source).toBe('({onBar(){}})');
    expect(JSON.stringify(state)).toBe(before); expect(restoreScriptLibrary(state).documents.map(row => row.id)).toEqual(['source-one', 'source-two']);
  });
  it('rolls back an entire import when identity allocation fails midway, without evaluating imported code', () => {
    const state = saved(), incoming = addScript(saved(), { id: 'import-second', name: 'Unevaluated code', source: 'throw new Error("must not execute on import")', pane: 'new' }, 'strategy');
    const before = JSON.stringify(state); let allocated = 0;
    expect(() => importScriptLibrary(state, JSON.stringify(incoming), () => ++allocated === 1 ? 'fresh-import' : initial.id)).toThrow();
    expect(allocated).toBe(2); expect(JSON.stringify(state)).toBe(before);
  });
  it('preserves detached execution source through historical restore, subsequent save and JSON restart', () => {
    let state = saved(); const attached = bindScript(state.documents[0], 'chart-instance');
    state = saveScript(draftScript(state, initial.id, { source: '({onBar(){}})', name: 'Second' }), initial.id, savedAt);
    state = restoreScriptVersion(state, initial.id, 1); state = saveScript(state, initial.id, savedAt);
    const restarted = restoreScriptLibrary(JSON.parse(JSON.stringify(state)));
    expect(restarted.documents[0].history.map(row => [row.version, row.name])).toEqual([[1, 'Original'], [2, 'Second'], [3, 'Original']]);
    expect(attached.version).toBe(1); expect(attached.source).toBe(initial.source); expect(attached.name).toBe('Original');
  });
});

describe('independent chart-script correction and title lifecycle', () => {
  it('suppresses late old-history results after a correction and exposes only copied current bars', async () => {
    const first = deferred<any>(), second = deferred<any>(), requests: any[] = [], rendered: any[] = [], outcomes: any[] = [];
    const port = { add: (result: any, settings: any) => { rendered.push({ result, settings }); return settings.id; }, update: () => {}, remove: () => {}, replaceStyles: () => {}, show: () => {}, place: () => {} };
    const owner = new ScriptBindingRuntime(port as any, () => {}, value => outcomes.push(value), (input: any) => { requests.push(input); return requests.length === 1 ? first.promise : second.promise; });
    const binding = bindScript(saved().documents[0], 'instance'), oldBars = [bar(11)];
    owner.update({ bars: oldBars, identity: 'source:revision', fixture: true, bindings: [binding], ready: true });
    owner.update({ bars: [bar(22)], identity: 'source:revision', fixture: true, bindings: [binding], ready: true });
    oldBars[0].close = 29; expect(requests[0].bars[0].close).toBe(11); expect(requests[0].signal.aborted).toBe(true);
    second.resolve(execution('corrected')); await tick(); first.resolve(execution('stale')); await tick();
    expect(rendered).toHaveLength(1); expect(rendered[0].result.diagnostics).toEqual(['corrected']); expect(outcomes).toHaveLength(1); expect(outcomes[0].bars[0].close).toBe(22); owner.dispose();
  });
  it('keeps the rendered title consistent when a renamed saved source updates an existing instance', async () => {
    const native = new Map<string, any>();
    const port = { add: (_result: any, settings: any) => { if (native.has(settings.id)) throw new Error('duplicate native instance'); native.set(settings.id, { ...settings }); return settings.id; }, update: () => {}, remove: (id: string) => { native.delete(id); }, replaceStyles: () => {}, show: () => {}, place: () => {}, rename: (id: string, title: string) => { native.get(id).title = title; } };
    const owner = new ScriptBindingRuntime(port as any, () => {}, () => {}, async () => execution('current') as any), binding = bindScript(saved().documents[0], 'instance');
    owner.update({ bars: [bar(11)], identity: 'test', fixture: true, bindings: [binding], ready: true }); await tick();
    owner.update({ bars: [bar(11)], identity: 'test', fixture: true, bindings: [{ ...binding, name: 'Renamed', version: 2 }], ready: true }); await tick();
    expect(native.get('instance')?.title).toBe('Renamed'); owner.dispose();
  });
  it('recovers from failed native output clearing without adding a duplicate instance', async () => {
    const native = new Set<string>(), statuses: any[] = []; let failClear = false, removalFails = true, executions = 0;
    const port = { add: (_result: any, settings: any) => { if (native.has(settings.id)) throw new Error('duplicate native instance'); native.add(settings.id); return settings.id; }, update: () => { if (failClear) throw new Error('renderer clear failed'); }, remove: (id: string) => { if (removalFails) throw new Error('native remove failed'); native.delete(id); }, replaceStyles: () => {}, show: () => {}, place: () => {}, rename: () => {} };
    const owner = new ScriptBindingRuntime(port as any, rows => statuses.push(rows), () => {}, async () => { executions++; return execution('current') as any; }), binding = bindScript(saved().documents[0], 'instance');
    owner.update({ bars: [bar(11)], identity: 'test', fixture: true, bindings: [binding], ready: true }); await tick(); failClear = true;
    const corrected = { bars: [bar(22)], identity: 'test', fixture: true, bindings: [binding], ready: true };
    owner.update(corrected); await tick(); expect(executions).toBe(1); expect(statuses.at(-1)[0].status).toBe('error'); expect(native.size).toBe(1);
    removalFails = false; owner.retry(); owner.update(corrected); await tick(); expect(executions).toBe(2); expect(native.size).toBe(1); expect(statuses.at(-1)[0].status).toBe('ready'); owner.dispose();
  });
  it('keeps a failed removal visible until a subsequent retry actually removes the orphan', async () => {
    const native = new Set<string>(), statuses: any[] = []; let fails = true;
    const port = { add: (_result: any, settings: any) => { native.add(settings.id); return settings.id; }, update: () => {}, remove: (id: string) => { if (fails) throw new Error('remove failed'); native.delete(id); }, replaceStyles: () => {}, show: () => {}, place: () => {}, rename: () => {} };
    const owner = new ScriptBindingRuntime(port as any, rows => statuses.push(rows), () => {}, async () => execution('current') as any), binding = bindScript(saved().documents[0], 'instance');
    owner.update({ bars: [bar(11)], identity: 'test', fixture: true, bindings: [binding], ready: true }); await tick();
    owner.update({ bars: [bar(11)], identity: 'test', fixture: true, bindings: [], ready: true }); expect(native.size).toBe(1); expect(statuses.at(-1)[0].status).toBe('error');
    fails = false; owner.retry(); owner.update({ bars: [bar(11)], identity: 'test', fixture: true, bindings: [], ready: true }); expect(native.size).toBe(0); expect(statuses.at(-1)).toEqual([]); owner.dispose();
  });
});
