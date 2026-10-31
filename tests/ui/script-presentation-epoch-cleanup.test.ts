import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {scriptPresentationFixture,SYNTHETIC_BINDING,settle} from '../fixtures/script-presentation';
import * as proof from '../../src/chart/script-presentation-proof';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';

const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[],runtimes:ScriptBindingRuntime[]=[];
afterEach(()=>{for(const runtime of runtimes.splice(0).reverse())runtime.dispose();for(const f of fixtures.splice(0).reverse())f.close();vi.restoreAllMocks();});
const fixture=()=>{const f=scriptPresentationFixture();fixtures.push(f);return f;};
function ready(f:ReturnType<typeof fixture>){const view=f.port.captureReadout?.(SYNTHETIC_BINDING.id);expect(view?.state).toBe('ready');if(view?.state!=='ready')throw Error('Expected accepted synthetic values.');return view;}
const removeSpy=()=>vi.spyOn(AbortSignal.prototype,'removeEventListener');
const removed=(spy:ReturnType<typeof removeSpy>,signal:AbortSignal)=>spy.mock.calls.filter((args,index)=>spy.mock.contexts[index]===signal&&args[0]==='abort').length;
async function accepted(f:ReturnType<typeof fixture>){f.runtime().update(f.context());f.complete();await settle();return ready(f);}
/** Change only the actual extracted host's epoch; no runtime update, native change or explicit proof retirement. */
const epoch=(f:ReturnType<typeof fixture>)=>f.produced.publish(f.input);

it('the actual adapter retirement advances its epoch first without an imported script-cleanup dependency',()=>{
 const sourceRoot=process.env.LV_SP_EPOCH_SOURCE_ROOT??process.cwd(),text=readFileSync(resolve(sourceRoot,'src/chart/adapter.ts'),'utf8');
 const line=text.split('\n').find(value=>value.startsWith('  const retireVwapSource='));if(!line)throw Error('Actual source retirement is unavailable.');
 const code=stripTypeScriptTypes(`function build(fail){let vwapSourceEpoch={},seen=null,message='';const before=vwapSourceEpoch;const indicators={invalidateVwap(){seen=vwapSourceEpoch;if(fail)throw Error('Synthetic retirement failure');}};const unavailable=value=>{message=value;};${line};return{run:retireVwapSource,before,read:()=>({epoch:vwapSourceEpoch,seen,message})};}`,{mode:'transform'});
 const build=new Function(code+';return build;')(),normal=build(false);normal.run();expect(normal.read().epoch).not.toBe(normal.before);expect(normal.read().seen).toBe(normal.read().epoch);
 const failed=build(true);expect(()=>failed.run()).toThrow('Synthetic retirement failure');expect(failed.read().epoch).not.toBe(failed.before);expect(failed.read().seen).toBe(failed.read().epoch);expect(failed.read().message).toContain('VWAP output retirement failed');
});
it('an epoch-retired late success detaches its actual pending-job listener while preserving normal calculation',async()=>{
 const f=fixture(),off=removeSpy();f.runtime().update(f.context());const signal=f.pending[0].input.signal as AbortSignal;expect(removed(off,signal)).toBe(0);
 epoch(f);f.complete();await settle();expect(removed(off,signal)).toBe(1);expect(f.port.list()).toHaveLength(1);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
});
it('an epoch-retired worker rejection clears its pending listener even though no result was staged',async()=>{
 const f=fixture(),off=removeSpy();f.runtime().update(f.context());const signal=f.pending[0].input.signal as AbortSignal;epoch(f);f.pending[0].reject(Error('Synthetic worker rejected'));await settle();
 expect(removed(off,signal)).toBe(1);expect(f.port.list()).toHaveLength(0);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
});
it('a synchronous executor rejection releases the exact captured pending job before preserving the original error',()=>{
 const f=fixture(),off=removeSpy();let signal:AbortSignal|undefined;
 const runtime=new ScriptBindingRuntime(f.port,()=>{},()=>{},input=>{signal=input.signal;throw Error('Synthetic synchronous dispatch rejection');});runtimes.push(runtime);
 expect(()=>runtime.update(f.context())).toThrow('Synthetic synchronous dispatch rejection');expect(signal).toBeInstanceOf(AbortSignal);expect(removed(off,signal!)).toBe(1);expect(f.port.list()).toHaveLength(0);
});
it('an old ready owner is immediately unavailable and remains retired after an owned unchanged-input renewal',async()=>{
 const f=fixture(),old=await accepted(f);epoch(f);expect(()=>old.assertCurrent()).toThrow();expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
 proof.renewScriptPresentationPort(f.port);expect(ready(f).readAt(100).plots[0].value).toBe(7);expect(()=>old.readAt(100)).toThrow();
});
it('renewal changes the view version even when the old view never observed the intervening epoch retirement',async()=>{
 const f=fixture(),old=await accepted(f);epoch(f);proof.renewScriptPresentationPort(f.port);const current=ready(f);expect(current).not.toBe(old);expect(current.readAt(220).plots[0].value).toBe(11);expect(()=>old.assertCurrent()).toThrow();
});
it('exact-token finish cannot cancel another port or a foreign job and never blocks normal calculation',async()=>{
 const captured=vi.spyOn(proof,'captureScriptPresentationJob'),a=fixture(),b=fixture(),off=removeSpy();a.runtime().update(a.context());b.runtime().update(b.context());
 const token=captured.mock.results.find(row=>row.type==='return'&&row.value)?.value as proof.ScriptPresentationJob;expect(token).toBeTruthy();const aSignal=a.pending[0].input.signal as AbortSignal,bSignal=b.pending[0].input.signal as AbortSignal;
 proof.finishScriptPresentationJob(b.port,token);proof.finishScriptPresentationJob(a.port,{});expect(removed(off,aSignal)).toBe(0);expect(removed(off,bSignal)).toBe(0);
 proof.finishScriptPresentationJob(a.port,token);expect(removed(off,aSignal)).toBe(1);expect(removed(off,bSignal)).toBe(0);a.complete();b.complete();await settle();
 expect(a.port.list()).toHaveLength(1);expect(a.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');expect(ready(b).readAt(100).plots[0].value).toBe(7);
});
it('finishing an already accepted job never revokes its current accepted metadata descendant',async()=>{
 const captured=vi.spyOn(proof,'captureScriptPresentationJob'),f=fixture(),old=await accepted(f);const token=captured.mock.results.find(row=>row.type==='return'&&row.value)?.value as proof.ScriptPresentationJob;expect(token).toBeTruthy();
 f.port.rename(SYNTHETIC_BINDING.id,'Current synthetic descendant');const current=ready(f);proof.finishScriptPresentationJob(f.port,token);proof.finishScriptPresentationJob(f.port,null);
 expect(current.readAt(100).title).toBe('Current synthetic descendant');expect(()=>old.assertCurrent()).toThrow();
});
