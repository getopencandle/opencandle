import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Actual Runner effect bodies; only React scheduling/runtime/native callback delivery is controlled.
// No QuickJS, chart-calculation authority, DOM or packaged interaction claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,layout:[] as Array<{run:()=>any;deps:any[]}>,owners:[] as any[],writes:[] as any[],trace:[] as string[],onUpdate:undefined as undefined|(()=>void)}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useRef:(initial:any)=>{const at=hooks.cursor++;return hooks.cells[at]??(hooks.cells[at]={current:initial});},
 useState:(initial:any)=>{const at=hooks.cursor++;if(!hooks.cells[at])hooks.cells[at]={value:typeof initial==='function'?initial():initial};return[hooks.cells[at].value,(value:any)=>{hooks.cells[at].value=typeof value==='function'?value(hooks.cells[at].value):value;hooks.writes.push({at,value:hooks.cells[at].value});}];},
 useMemo:(create:()=>any)=>{hooks.cursor++;return create();},useEffect:()=>{hooks.cursor++;},useLayoutEffect:(run:()=>any,deps:any[])=>{hooks.cursor++;hooks.layout.push({run,deps});}
};});
vi.mock('../../src/ui/script-binding-runtime',()=>({ScriptBindingRuntime:class{
 dispose=vi.fn();interact=vi.fn();update=vi.fn(()=>{hooks.trace.push('update');hooks.onUpdate?.();});constructor(){hooks.owners.push(this);hooks.trace.push('owner');}
}}));
const cleanups:Array<()=>void>=[];
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.layout=[];hooks.owners=[];hooks.writes=[];hooks.trace=[];hooks.onUpdate=undefined;});
afterEach(()=>{const failures:unknown[]=[];for(const off of cleanups.splice(0).reverse())try{off();}catch(error){failures.push(error);}vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'Synthetic Runner fixture cleanup failed.');});
function fixture(style='candles'){
 const dataset=fixtureDataset('GME',2),binding={id:'SYNTHETIC one',documentId:'SYNTHETIC document',version:1,name:'SYNTHETIC lifecycle',source:'({onBar(){}})',pane:'price' as const,visible:true,plots:{}};
 let interaction!:(event:any)=>void,market!:()=>void;const listeners=new Set<()=>void>(),interactionOff=vi.fn(),marketOff=vi.fn(()=>{listeners.delete(market);}),changed=vi.fn(()=>true);
 const chart:any={scripts:{onInteraction:vi.fn((callback:any)=>{hooks.trace.push('interaction');interaction=callback;return interactionOff;})},getChartSettingsBook:()=>({renko:{}}),onMarketApplied:vi.fn((callback:()=>void)=>{hooks.trace.push('market');market=callback;listeners.add(callback);return marketOff;})};
 const props:any={chart,bars:dataset.bars,source:sourceContextForDataset(dataset),style,bindings:[binding],ready:false,onBindingsChange:changed,onRuntime:(owner:any)=>{hooks.trace.push(owner?'publish':'clear');}};
 const render=()=>{hooks.cursor=0;hooks.layout=[];ScriptBindingsRunner(props);};render();
 const observers=()=>{const off=hooks.layout[0].run();expect(off).toBeTypeOf('function');cleanups.push(off);return off;};
 const owner=()=>{const off=hooks.layout[1].run();expect(off).toBeTypeOf('function');cleanups.push(off);return off;};
 return{chart,props,render,observers,owner,interactionOff,marketOff,changed,listeners,get interaction(){return interaction;},get market(){return market;},emitMarket(){for(const callback of [...listeners])callback();}};
}
it('restores the actual first three layout roles to subscriptions owner and runtime update for ordinary charts',()=>{
 const h=fixture();expect(hooks.layout).toHaveLength(3);h.observers();h.owner();hooks.layout[2].run();expect(hooks.trace).toEqual(['interaction','owner','publish','update']);expect(hooks.owners).toHaveLength(1);expect(hooks.owners[0].update).toHaveBeenCalledOnce();expect(h.chart.onMarketApplied).not.toHaveBeenCalled();
});
it('derived completion observers are present for synchronous owner-publication and update notifications',()=>{
 const h=fixture('renko');h.props.onRuntime=(owner:any)=>{if(owner){hooks.trace.push('publish');h.emitMarket();}};h.render();hooks.onUpdate=()=>h.emitMarket();h.observers();expect(hooks.writes).toHaveLength(0);h.owner();expect(hooks.writes).toHaveLength(1);hooks.layout[2].run();expect(hooks.writes).toHaveLength(2);expect(hooks.trace).toEqual(['interaction','market','owner','publish','update']);expect(hooks.writes.map(row=>row.value)).toEqual([1,2]);
});
it('a failing second acquisition unwinds the first and preserves original acquisition plus cleanup failures',()=>{
 const h=fixture('renko'),acquisition=Error('SYNTHETIC market subscribe failure'),release=Error('SYNTHETIC interaction unsubscribe failure');h.chart.onMarketApplied.mockImplementation(()=>{throw acquisition;});h.interactionOff.mockImplementation(()=>{throw release;});let caught:any;
 try{hooks.layout[0].run();}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);expect(caught.errors).toEqual([acquisition,release]);expect(h.interactionOff).toHaveBeenCalledOnce();expect(hooks.owners).toHaveLength(0);h.interaction({id:'SYNTHETIC one',kind:'removed'});expect(h.changed).not.toHaveBeenCalled();expect(hooks.writes).toHaveLength(0);
});
it('cleanup retires both callbacks before attempting every release and is idempotent after multiple failures',()=>{
 const h=fixture('renko'),stop=h.observers(),interaction=h.interaction,market=h.market,first=Error('SYNTHETIC first release'),second=Error('SYNTHETIC second release');h.interactionOff.mockImplementation(()=>{interaction({id:'SYNTHETIC one',kind:'removed'});market();throw first;});h.marketOff.mockImplementation(()=>{market();throw second;});let caught:any;
 try{stop();}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);expect(caught.errors).toEqual([first,second]);expect(h.interactionOff).toHaveBeenCalledOnce();expect(h.marketOff).toHaveBeenCalledOnce();expect(h.changed).not.toHaveBeenCalled();expect(hooks.writes).toHaveLength(0);expect(()=>stop()).not.toThrow();
});
it('style rebind retires the old observers while preserving the existing chart runtime and ordinary interaction behavior',()=>{
 const h=fixture('renko'),stop=h.observers();h.owner();const owner=hooks.owners[0],oldMarket=h.market,oldInteraction=h.interaction,ownerDeps=hooks.layout[1].deps;h.props.style='candles';h.render();expect(hooks.layout).toHaveLength(3);expect(hooks.layout[1].deps).toEqual(ownerDeps);stop();h.observers();oldMarket();oldInteraction({id:'SYNTHETIC one',kind:'removed'});expect(hooks.writes).toHaveLength(0);expect(h.changed).not.toHaveBeenCalled();hooks.layout[2].run();expect(hooks.owners).toEqual([owner]);expect(h.chart.onMarketApplied).toHaveBeenCalledOnce();h.interaction({id:'SYNTHETIC one',kind:'visibility',visible:false});expect(owner.interact).toHaveBeenCalledOnce();expect(h.changed).toHaveBeenCalledOnce();
});
it('replacement during first registration releases its returned subscription before any second-method lookup',()=>{
 const h=fixture('renko'),first=hooks.layout[0].run,replacement={scripts:{},getChartSettingsBook:()=>({renko:{}})};let secondLookups=0,retained!:(event:any)=>void;
 Object.defineProperty(h.chart,'onMarketApplied',{configurable:true,get(){secondLookups++;throw Error('Retired chart cannot acquire another observer');}});
 h.chart.scripts.onInteraction.mockImplementation((callback:any)=>{retained=callback;h.props.chart=replacement;h.render();return h.interactionOff;});const off=first();cleanups.push(off);expect(h.interactionOff).toHaveBeenCalledOnce();expect(secondLookups).toBe(0);retained({id:'SYNTHETIC one',kind:'removed'});expect(h.changed).not.toHaveBeenCalled();expect(hooks.writes).toHaveLength(0);expect(hooks.owners).toHaveLength(0);
});
