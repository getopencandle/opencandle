import {beforeEach,expect,it,vi} from 'vitest';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
// Actual Runner ownership effect, controlled React hooks/runtime port.
// Does not execute QuickJS, DOM effects, native event delivery or GUI.
const state=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>any>,owners:[] as Array<{dispose:ReturnType<typeof vi.fn>;update:ReturnType<typeof vi.fn>}>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useRef:(initial:any)=>{const at=state.cursor++;return state.cells[at]??(state.cells[at]={current:initial});},useState:(initial:any)=>{state.cursor++;return[initial,vi.fn()];},useMemo:(fn:()=>any)=>{state.cursor++;return fn();},useEffect:()=>{state.cursor++;},useLayoutEffect:(fn:()=>any)=>{state.cursor++;state.effects.push(fn);}};});
vi.mock('../../src/ui/script-binding-runtime',()=>({ScriptBindingRuntime:class {dispose=vi.fn();update=vi.fn();constructor(){state.owners.push(this);}}}));
function fixture(onRuntime:(owner:any)=>void){const dataset=fixtureDataset('GME',2),chart={scripts:{onInteraction:vi.fn(()=>vi.fn())}},props={chart:chart as any,bars:dataset.bars,source:sourceContextForDataset(dataset),style:'candles',bindings:[],ready:false,onRuntime};ScriptBindingsRunner(props);return{acquire:state.effects[1],update:state.effects[2]};}
beforeEach(()=>{state.cells=[];state.cursor=0;state.effects=[];state.owners=[];});
it('runtime teardown disposes its owner even if the ownership-clear callback throws',()=>{
 const s=fixture(owner=>{if(owner===null)throw Error('Synthetic ownership-clear failure');}),cleanup=s.acquire();expect(()=>cleanup()).toThrow('ownership-clear failure');expect(state.owners[0].dispose).toHaveBeenCalledOnce();s.update();expect(state.owners[0].update).not.toHaveBeenCalled();
});
it('a throwing initial runtime publication retires and disposes the just-created owner before propagating failure',()=>{
 const s=fixture(()=>{throw Error('Synthetic ownership-publication failure');});expect(()=>s.acquire()).toThrow('ownership-publication failure');expect(state.owners[0].dispose).toHaveBeenCalledOnce();s.update();expect(state.owners[0].update).not.toHaveBeenCalled();
});
it('acquisition publication and cleanup failures are both preserved while the owner is no longer current',()=>{
 const s=fixture(()=>{state.owners[0].dispose.mockImplementation(()=>{throw Error('Synthetic native disposal failure');});throw Error('Synthetic ownership-publication failure');});let failed:any;try{s.acquire();}catch(error){failed=error;}expect(failed).toBeInstanceOf(AggregateError);expect(failed.errors.map((error:Error)=>error.message)).toEqual(['Synthetic ownership-publication failure','Synthetic native disposal failure']);s.update();expect(state.owners[0].update).not.toHaveBeenCalled();
});
it('delayed cleanup of an older effect cannot clear a newer current runtime or publish a false null owner',()=>{
 const published:any[]=[],s=fixture(owner=>published.push(owner)),oldCleanup=s.acquire(),newCleanup=s.acquire();expect(state.owners).toHaveLength(2);oldCleanup();expect(state.owners[0].dispose).toHaveBeenCalledOnce();expect(published).toEqual(state.owners);s.update();expect(state.owners[0].update).not.toHaveBeenCalled();expect(state.owners[1].update).toHaveBeenCalledOnce();newCleanup();expect(published.at(-1)).toBeNull();expect(state.owners[1].dispose).toHaveBeenCalledOnce();
});
