import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const { LIMITS, inputForScript } = require('../../electron/script-runtime.cjs');
const bars = [2, 99].map((close, index) => ({
  id: 'synthetic-bootstrap-' + index, revision: 0, time: 1000 + index,
  open: close, high: close + 1, low: close - 1, close, volume: 1,
}));

async function run(source: string) {
  const jobs = new ScriptJobs();
  try { return await jobs.run({ requestId: 'synthetic-bootstrap', source, bars }); }
  finally { jobs.close(); }
}

describe('guest bootstrap isolation in the actual script worker', () => {
  it('keeps future bars private when the definition replaces the JSON global', async () => {
    const result = await run(`(()=>{
      const parse=JSON.parse,stringify=JSON.stringify;
      globalThis.JSON={parse(text){const value=parse(text);globalThis.future=value.bars;return value;},stringify};
      return {onBar(ctx){ctx.plot('Synthetic',globalThis.future?globalThis.future[1].close:ctx.bar.close);}};
    })()`);
    expect(result.ok).toBe(true);
    expect(result.value.plots[0].values.map((point: any) => point.value)).toEqual([2, 99]);
    expect(result.value.state.processedIds).toEqual(bars.map(bar => bar.id));
  });

  it('never hands private snapshot/effect objects to a substituted serializer', async () => {
    const result = await run(`(()=>{
      const parse=JSON.parse,stringify=JSON.stringify;let observed=0;
      globalThis.JSON={parse,stringify(value){observed++;if(value&&value.snapshot)value.snapshot.state.tampered=true;return stringify(value);}};
      return {onBar(ctx){ctx.state.serializerCalls=observed;ctx.alert('Synthetic','Synthetic message');ctx.plot('Synthetic',ctx.bar.close);}};
    })()`);
    expect(result.ok).toBe(true);
    expect(result.value.state.state).toEqual({ serializerCalls: 0 });
    expect(result.value.alerts).toHaveLength(2);
  });

  it('does not iterate private engine arrays with a guest-modified iterator provider', async () => {
    const result = await run(`(()=>{
      const iterator=Object.getPrototypeOf([][Symbol.iterator]()),next=iterator.next;let seen=0;
      iterator.next=function(){const result=next.call(this);if(result.value&&typeof result.value.close==='number')seen++;return result;};
      return {onBar(ctx){ctx.state.engineBarsSeen=seen;ctx.plot('Synthetic',ctx.bar.close);}};
    })()`);
    expect(result.ok).toBe(true);
    expect(result.value.state.state.engineBarsSeen).toBe(0);
    expect(result.value.plots[0].values.map((point: any) => point.value)).toEqual([2, 99]);
  });

  it('does not consult guest-modified Array species when appending private effects', async () => {
    const result = await run(`(()=>{
      const state={speciesCalls:0};
      Object.defineProperty(Array,Symbol.species,{get(){state.speciesCalls++;return Array;}});
      return {init(ctx){ctx.state=state;},onBar(ctx){ctx.plot('Synthetic',ctx.bar.close);}};
    })()`);
    expect(result.ok).toBe(true);
    expect(result.value.state.state.speciesCalls).toBe(0);
    expect(result.value.state.plots).toHaveLength(2);
  });

  it('retains validation, state traversal and color checks despite mutable guest globals', async () => {
    const result = await run(`(()=>{
      const fail=()=>{throw 'guest provider invoked';};
      Object.keys=fail;Object.getPrototypeOf=fail;Object.getOwnPropertyDescriptor=fail;Object.freeze=fail;
      Number.isFinite=fail;Number.isInteger=fail;Reflect.apply=fail;
      Set.prototype.has=fail;Set.prototype.add=fail;Set.prototype.delete=fail;
      RegExp.prototype.test=fail;RegExp.prototype.exec=fail;
      globalThis.Error=fail;globalThis.String=fail;
      return {onBar(ctx){ctx.state.mean=ctx.sma('Synthetic',ctx.bar.close,2);ctx.plot('Synthetic',ctx.bar.close,'#Ab12f0');ctx.order('buy',1);}};
    })()`);
    expect(result.ok).toBe(true);
    expect(result.value.state.state.mean).toBe(50.5);
    expect(result.value.orders).toHaveLength(2);
    expect(result.value.plots[0].color).toBe('#Ab12f0');
  });

  it('keeps invalid numbers invalid even when the guest replaces Number validators', async () => {
    const result = await run(`(()=>{Number.isFinite=()=>true;return {onBar(ctx){ctx.plot('Synthetic',1/0);}};})()`);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SCRIPT_FAILED');
    expect(result.value).toBeUndefined();
  });

  it('does not execute an enumerable state getter during validation or serialization', async () => {
    const result = await run(`({init(ctx){Object.defineProperty(ctx.state,'secret',{enumerable:true,get(){throw 'GUEST_GETTER_EXECUTED';}});},onBar(){}})`);
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('own data');
    expect(result.error.message).not.toContain('GUEST_GETTER_EXECUTED');
  });

  it('does not execute a nonenumerable state toJSON hook', async () => {
    const result = await run(`({init(ctx){ctx.state={value:7};Object.defineProperty(ctx.state,'toJSON',{get(){throw 'GUEST_TOJSON_EXECUTED';}});},onBar(ctx){ctx.plot('Synthetic',ctx.bar.close);}})`);
    expect(result.ok).toBe(true);
    expect(result.value.state.state).toEqual({ value: 7 });
    expect(result.value.state.processedCount).toBe(2);
  });

  it('rejects an accessor replacing ctx.state without reading it', async () => {
    const result = await run(`({onBar(ctx){Object.defineProperty(ctx,'state',{configurable:true,get(){throw 'GUEST_STATE_EXECUTED';}});}})`);
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('own data');
    expect(result.error.message).not.toContain('GUEST_STATE_EXECUTED');
  });

  it('rejects a nonenumerable array-index getter without executing it', async () => {
    const result = await run(`({init(ctx){const values=[];Object.defineProperty(values,'0',{get(){throw 'GUEST_INDEX_EXECUTED';}});ctx.state.values=values;},onBar(){}})`);
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('own data');
    expect(result.error.message).not.toContain('GUEST_INDEX_EXECUTED');
  });

  it('preserves finite plain state, sparse JSON arrays and snapshot continuation', async () => {
    const jobs = new ScriptJobs();
    const source = `({init(ctx){ctx.state={initializations:1,values:[,3]};},onBar(ctx){ctx.state.last=ctx.bar.close;ctx.plot('Synthetic',ctx.sma('Synthetic',ctx.bar.close,2));}})`;
    try {
      const first = await jobs.run({ requestId: 'synthetic-first', source, bars: bars.slice(0, 1) });
      expect(first.ok).toBe(true);
      expect(first.value.state.state.values).toEqual([null, 3]);
      const second = await jobs.run({ requestId: 'synthetic-next', source, bars: bars.slice(1), snapshot: first.value.state });
      expect(second.ok).toBe(true);
      expect(second.value.state.state).toEqual({ initializations: 1, values: [null, 3], last: 99 });
      expect(second.value.plots[0].values[0].value).toBe(50.5);
    } finally { jobs.close(); }
  });

  it('retains ordinary own data keys shadowing frozen Object prototype members', async () => {
    const result = await run(`({init(ctx){ctx.state=JSON.parse('{"toString":"literal","valueOf":7,"hasOwnProperty":false}');},onBar(ctx){ctx.plot('Synthetic',ctx.bar.close);}})`);
    expect(result.ok).toBe(true);
    expect(result.value.state.state).toEqual({ toString: 'literal', valueOf: 7, hasOwnProperty: false });
  });
});

describe('existing script output byte budget includes provenance', () => {
  const source = '({onBar(ctx){ctx.plot("Synthetic",ctx.bar.close);}})';
  const request = { requestId: 'synthetic-provenance', source, bars };

  it('admits an individual label at the byte boundary and refuses one byte more', () => {
    const label = 'S'.repeat(LIMITS.outputBytes);
    expect(inputForScript({ ...request, provenance: { kind: 'synthetic', label } }).provenance.label).toBe(label);
    expect(() => inputForScript({ ...request, provenance: { kind: 'synthetic', label: label + 'S' } })).toThrow('provenance label');
  });

  it('counts UTF-8 bytes rather than UTF-16 units without truncation', () => {
    const label = '€'.repeat(Math.floor(LIMITS.outputBytes / 3)) + 'ab';
    expect(Buffer.byteLength(label, 'utf8')).toBe(LIMITS.outputBytes);
    expect(inputForScript({ ...request, provenance: { kind: 'local-import', label } }).provenance.label).toBe(label);
    expect(() => inputForScript({ ...request, provenance: { kind: 'local-import', label: label + 'c' } })).toThrow('provenance label');
  });

  it('rejects an actual worker result whose admitted label alone fills the envelope budget', async () => {
    const jobs = new ScriptJobs();
    try {
      const result = await jobs.run({ ...request, provenance: { kind: 'synthetic', label: 'S'.repeat(LIMITS.outputBytes) } });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('OUTPUT_LIMIT');
      expect(result.value).toBeUndefined();
    } finally { jobs.close(); }
  });

  it('charges escaped label bytes in the serialized result and preserves a normal label exactly', async () => {
    const jobs = new ScriptJobs();
    try {
      const escaped = await jobs.run({ ...request, provenance: { kind: 'synthetic', label: '\n'.repeat(LIMITS.outputBytes / 2) } });
      expect(escaped.ok).toBe(false);
      expect(escaped.error.code).toBe('OUTPUT_LIMIT');
      const provenance = { kind: 'synthetic', label: 'Synthetic output budget control €' };
      const normal = await jobs.run({ ...request, provenance });
      expect(normal.ok).toBe(true);
      expect(normal.value.provenance).toEqual(provenance);
      expect(Buffer.byteLength(JSON.stringify(normal.value), 'utf8')).toBeLessThanOrEqual(LIMITS.outputBytes);
    } finally { jobs.close(); }
  });
});
