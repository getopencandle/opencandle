import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// Ledger ARCH.SCRIPT.ISOLATION: guest code runs in a QuickJS WASM realm whose
// compiler pointer (the Eval intrinsic) is cleared before any guest code executes.
const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const { executeSnapshot, disableGuestCompiler } = require('../../electron/script-runtime.cjs');
const { newQuickJSWASMModuleFromVariant, DefaultIntrinsics } = require('quickjs-emscripten-core');
const variant = require('@jitl/quickjs-wasmfile-release-sync').default;

const bars = [10, 11, 12].map((close, index) => ({
  id: 'synthetic-iso-' + index, revision: 0, time: 1000 + index * 60,
  open: close, high: close + 1, low: close - 1, close, volume: 1,
}));
const run = (source: string) => executeSnapshot({ requestId: 'synthetic-iso', source, bars });
async function refused(source: string) {
  try { await run(source); } catch (error: any) { return { code: error.code, message: String(error.message) }; }
  throw new Error('Script was expected to be refused.');
}
// Each attempt is recorded in ctx.state as the value it produced or the error it raised.
const attempts = (body: string) => `({onBar(ctx){if(ctx.bar.close!==10)return;const out={};
  const tryIt=(name,fn)=>{try{const v=fn();out[name]=v===undefined?'undefined':typeof v==='function'?'FUNCTION':String(v);}catch(e){out[name]='refused:'+e.message;}};
  ${body}
  ctx.state.out=out;}})`;
const state = async (body: string) => (await run(attempts(body))).state.state.out as Record<string, string>;

describe('SCRIPT-ISO: no host objects or compilers reach guest code', () => {
  it('sees no Node, Electron or browser host globals', async () => {
    const out = await state(`for(const name of ['require','process','module','exports','Buffer','global','__dirname','__filename','setTimeout','setImmediate','queueMicrotask','fetch','WebAssembly','importScripts','postMessage','document','window','eval','Function','Date','Proxy','Pro'+'mise'])tryIt(name,()=>typeof globalThis[name]);
      tryIt('globalProcess',()=>globalThis.process&&globalThis.process.env);
      tryIt('importMeta',()=>typeof std+typeof os);`);
    for (const [name, value] of Object.entries(out)) expect(value, name).toMatch(/^(undefined|refused:)/);
  });

  it('refuses constructor-chain escapes to the Function constructor', async () => {
    const out = await state(`
      tryIt('objectChain',()=>({}).constructor.constructor('return process')());
      tryIt('ctxChain',()=>ctx.constructor.constructor('return this')());
      tryIt('plotChain',()=>ctx.plot.constructor('return 1')());
      tryIt('arrowChain',()=>(()=>0).constructor('return 1')());
      tryIt('classChain',()=>(class{}).constructor('return 1')());
      tryIt('boundChain',()=>(function(){}).bind(null).constructor('return 1')());
      tryIt('generatorChain',()=>(function*(){}).constructor('yield 1')().next().value);
      tryIt('protoChain',()=>Object.getPrototypeOf(()=>0).constructor('return 1')());
      tryIt('descriptorChain',()=>Object.getOwnPropertyDescriptor(Object.getPrototypeOf(()=>0),'constructor').value('return 1')());
      tryIt('reflectChain',()=>Reflect.construct(Object.getPrototypeOf(()=>0).constructor,['return 1'])());`);
    for (const [name, value] of Object.entries(out)) expect(value, name).not.toMatch(/^(1|FUNCTION|\[object)/);
    expect(Object.values(out).every(value => value === 'undefined' || value.startsWith('refused:'))).toBe(true);
  });

  it('refuses eval and Function inside scripts, including definition-time code', async () => {
    const out = await state(`tryIt('eval',()=>eval('1'));tryIt('indirectEval',()=>(0,globalThis.eval)('1'));tryIt('Function',()=>Function('return 1')());tryIt('newFunction',()=>new Function('return 1')());`);
    for (const value of Object.values(out)) expect(value).toMatch(/^refused:/);
    // Async function constructors are a further compiler route; async syntax is refused before compiling.
    expect(await refused('({onBar(){return (async function(){}).constructor;}})')).toEqual({ code: 'UNSUPPORTED_SYNTAX', message: expect.any(String) });
    const early = await refused(`(()=>{const f=({}).constructor.constructor;return f('return 1')();})()`);
    expect(early.code).toBe('SCRIPT_FAILED');
  });

  it('runs no guest code before the compiler is cleared, even with wrapper-escape source', async () => {
    // A source that tries to close the definition wrapper early fails the separate syntax check.
    const escape = await refused(`0)}),(globalThis.ran=Function('return 1')()),(()=>{return (0`);
    expect(escape).toEqual({ code: 'SCRIPT_FAILED', message: expect.stringMatching(/expect|unexpected|token/i) });
    // A balanced comma source stays inside the wrapper, so it only runs after the compiler is gone.
    const comma = await run(`0), (globalThis.r=(()=>{try{return String(eval('1'));}catch(e){return 'refused';}})()), ({onBar(ctx){ctx.state.r=globalThis.r;}}`);
    expect(comma.state.state.r).toBe('refused');
  });

  it('clears the engine compiler itself, not only the guest-visible names', async () => {
    const quickJS = await newQuickJSWASMModuleFromVariant(variant);
    const runtime = quickJS.newRuntime();
    const context = runtime.newContext({ intrinsics: { ...DefaultIntrinsics, Date: false, Promise: false, Proxy: false } });
    try {
      // No lockdown here: Function and eval are still installed as globals.
      const probe = context.unwrapResult(context.evalCode(`()=>{const out=[];for(const fn of [()=>Function('return 1')(),()=>eval('1'),()=>(function*(){}).constructor('yield 1')]){try{out.push(String(fn()));}catch(e){out.push(e.message);}}return out;}`));
      const call = () => { const handle = context.unwrapResult(context.callFunction(probe, context.undefined)); try { return context.dump(handle); } finally { handle.dispose(); } };
      const before = call();
      expect(before.slice(0, 2)).toEqual(['1', '1']);
      expect(before[2]).not.toBe('eval is not supported');
      disableGuestCompiler(quickJS, context);
      const after = call();
      expect(after).toEqual(['eval is not supported', 'eval is not supported', 'eval is not supported']);
      const host = context.evalCode('1');
      expect(host.error && context.dump(host.error).message).toBe('eval is not supported');
      host.error?.dispose(); probe.dispose();
    } finally { context.dispose(); runtime.dispose(); }
  });
});

describe('SCRIPT-ISO: resource limits refuse cleanly', () => {
  it('stops an infinite onBar loop with a user-facing error', async () => {
    const started = performance.now();
    const error = await refused(`({onBar(ctx){while(true){}}})`);
    expect(error.code).toBe('SCRIPT_FAILED');
    expect(error.message).toMatch(/interrupted/i);
    expect(performance.now() - started).toBeLessThan(4000);
  });

  it('stops an infinite definition-time loop', async () => {
    const error = await refused(`(()=>{for(;;){}})()`);
    expect(error).toEqual({ code: 'SCRIPT_FAILED', message: expect.stringMatching(/interrupted/i) });
  });

  it('refuses huge allocations at the 16 MiB guest heap limit', async () => {
    const array = await refused(`({onBar(ctx){const a=[];for(;;)a.push(new Array(100000).fill(1));}})`);
    expect(array.code).toBe('SCRIPT_FAILED');
    expect(array.message).toMatch(/out of memory|interrupted/i);
    const text = await refused(`({onBar(ctx){let s='x';for(;;)s+=s;}})`);
    expect(text.message).toMatch(/out of memory|string too long|interrupted/i);
  });

  it('reports limits through the actual worker as ok:false results', async () => {
    const jobs = new ScriptJobs();
    try {
      const loop = await jobs.run({ requestId: 'synthetic-iso-loop', source: `({onBar(){for(;;){}}})`, bars });
      expect(loop).toEqual({ ok: false, error: { code: 'SCRIPT_FAILED', message: expect.stringMatching(/interrupted/i) } });
      const escape = await jobs.run({ requestId: 'synthetic-iso-escape', source: `({onBar(ctx){ctx.state.p=typeof ({}).constructor.constructor;}})`, bars });
      expect(escape.ok).toBe(true);
      expect(escape.value.state.state.p).toBe('undefined');
    } finally { jobs.close(); }
  });
});

describe('SCRIPT-ISO: no prototype pollution path and deterministic APIs', () => {
  it('cannot pollute host prototypes through guest prototypes or output keys', async () => {
    const result = await run(`({onBar(ctx){
      try{Object.prototype.polluted=1;}catch(e){}try{Array.prototype.polluted=1;}catch(e){}
      ctx.state.constructor={prototype:{polluted:1}};}})`);
    expect(result.state).toBeTruthy();
    // A __proto__ key in guest state is refused at the boundary rather than merged.
    const proto = await refused(`({onBar(ctx){ctx.state['__proto__']={polluted:1};}})`);
    expect(proto.message).toMatch(/plain/);
    expect(({} as any).polluted).toBeUndefined();
    expect(([] as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty('polluted')).toBe(false);
  });

  it('keeps clocks and randomness deterministic', async () => {
    const out = await state(`tryIt('random',()=>Math.random());tryIt('date',()=>typeof Date);tryIt('perf',()=>typeof performance);`);
    expect(out.random).toMatch(/^refused:.*ctx\.random/);
    expect(out.date).toBe('undefined');
    expect(out.perf).toBe('undefined');
  });
});
