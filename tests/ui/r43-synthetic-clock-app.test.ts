import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {alpacaMarketNow,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {readSyntheticMarketClock,SYNTHETIC_MARKET_EPOCHS} from '../../src/domain/synthetic-market-clock';
import {LiveDataSettings,describeStreamStatus} from '../../src/ui/LiveDataSettings';

// Actual App startup and returned visible output, with the same controlled hook scheduler as the App compatibility tests.
// Only the startup-key and new disclosure effects run here. No DOM, Electron window, app launch or clock override.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<{index:number;run:()=>unknown}>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(factory:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.deps.length||deps.some((value,i)=>!Object.is(value,old.deps[i])))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(run:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.length||deps.some((value,i)=>!Object.is(value,old[i]))){hooks.cells[index]=deps;hooks.effects.push({index,run});}}};
});
const flush=async()=>{for(let turn=0;turn<12;turn++)await Promise.resolve();};
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const text=(node:any):string=>Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
const cleanups:Array<()=>void>=[];
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];selectAlpacaSyntheticStub(false);});
afterEach(()=>{for(const cleanup of cleanups.splice(0).reverse())cleanup();selectAlpacaSyntheticStub(false);vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(status:Promise<unknown>){
 const bridge={alpacaKeyStatus:vi.fn(()=>status),fetchAlpacaBars:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();
 const initialDisclosure=hooks.effects.find(effect=>String(effect.run).includes('syntheticMarketClockLabel'));
 const key=hooks.effects.find(effect=>String(effect.run).includes('alpacaKeyStatus'))!;expect(key).toBeTruthy();hooks.effects=[];
 const cleanup=key.run();if(typeof cleanup==='function')cleanups.push(cleanup as()=>void);
 const disclosure=()=>{const effect=hooks.effects.find(value=>String(value.run).includes('syntheticMarketClockLabel'))??initialDisclosure;expect(effect).toBeTruthy();hooks.effects=[];const cleanup=effect!.run();if(typeof cleanup==='function')cleanups.push(cleanup as()=>void);return find(render(),node=>node.type==='output'&&node.props['aria-label']==='Synthetic market clock');};
 return{bridge,render,disclosure,keyIndex:key.index};
}
it.each(['regular','closed'] as const)('actual App accepts the admitted %s startup sample before showing the visible clock',async scenario=>{
 const before=Date.now(),ui=setup(Promise.resolve({ok:true,value:{configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true,syntheticClock:{scenario,nowMs:SYNTHETIC_MARKET_EPOCHS[scenario]}}}));
 await flush();ui.render();const output=ui.disclosure();expect(output).toBeTruthy();
 expect(text(output)).toContain(scenario==='regular'?'Regular session fixture':'Closed session fixture');expect(text(output)).toContain(scenario==='regular'?'2026-10-20T16:00:':'2026-10-21T02:00:');expect(text(output)).toContain(scenario==='regular'?'New York: regular session':'New York: market closed');
 expect(alpacaMarketNow()).toBeGreaterThanOrEqual(SYNTHETIC_MARKET_EPOCHS[scenario]);expect(alpacaMarketNow()).toBeLessThan(SYNTHETIC_MARKET_EPOCHS[scenario]+10000);
 expect(Date.now()).toBeGreaterThanOrEqual(before);expect(Date.now()-before).toBeLessThan(10000);expect(ui.bridge.fetchAlpacaBars).not.toHaveBeenCalled();
});
it('actual ordinary App adds no clock disclosure or timer and retains its real startup deadline',async()=>{
 const timers=vi.spyOn(globalThis,'setTimeout'),intervals=vi.spyOn(globalThis,'setInterval'),before=Date.now();
 const ui=setup(Promise.resolve({ok:true,value:{configured:true,keyIdHint:null,encryption:true}}));
 expect(timers.mock.calls.some(call=>call[1]===8000)).toBe(true);await flush();ui.render();expect(ui.disclosure()).toBeNull();expect(intervals).not.toHaveBeenCalled();expect(alpacaMarketNow()).toBeGreaterThanOrEqual(before);expect(alpacaMarketNow()).toBeLessThanOrEqual(Date.now());
});
it('actual named-fixture App keeps the real eight-second startup deadline and one-second display timer',async()=>{
 const timers=vi.spyOn(globalThis,'setTimeout'),intervals=vi.spyOn(globalThis,'setInterval');
 const ui=setup(Promise.resolve({ok:true,value:{configured:true,synthetic:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular}}}));
 expect(timers.mock.calls.some(call=>call[1]===8000)).toBe(true);await flush();ui.render();expect(ui.disclosure()).toBeTruthy();expect(intervals.mock.calls.map(call=>call[1])).toEqual([1000]);
});
it('actual App rejects a non-synthetic clock sample and never activates fixture business time',async()=>{
 const before=Date.now(),ui=setup(Promise.resolve({ok:true,value:{configured:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular}}}));
 await flush();const tree=ui.render();expect(text(tree)).toContain('Live stocks are off for this session.');expect(ui.disclosure()).toBeNull();expect(alpacaMarketNow()).toBeGreaterThanOrEqual(before);expect(ui.bridge.fetchAlpacaBars).not.toHaveBeenCalled();
});
it('a retired startup response cannot activate a clock or publish a disclosure',async()=>{
 let resolve!:(value:unknown)=>void;const pending=new Promise<unknown>(done=>{resolve=done;}),before=Date.now(),ui=setup(pending);
 cleanups.shift()!();resolve({ok:true,value:{configured:true,synthetic:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular}}});await flush();ui.render();expect(ui.disclosure()).toBeNull();expect(alpacaMarketNow()).toBeGreaterThanOrEqual(before);expect(ui.bridge.fetchAlpacaBars).not.toHaveBeenCalled();
});
it.each(['regular','closed'] as const)('Data sources uses admitted %s business time for both actual status and connection-test labels',async scenario=>{
 const status={configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true as const,syntheticClock:{scenario,nowMs:SYNTHETIC_MARKET_EPOCHS[scenario]}},clock=readSyntheticMarketClock(status,()=>0)!;selectAlpacaSyntheticStub(true,clock);
 expect(describeStreamStatus({state:'ready',feed:'iex'} as any).includes('Market closed')).toBe(scenario==='closed');
 const checkedAt=new Date().toISOString(),connection=Object.freeze({ok:true as const,value:Object.freeze({connected:true as const,feed:'iex' as const,checkedAt})}),bridge={alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:status})),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(async()=>connection)};
 const render=()=>{hooks.cursor=0;return LiveDataSettings({coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge});};
 render();const effect=hooks.effects.find(value=>String(value.run).includes('alpacaKeyStatus'))!;expect(effect).toBeTruthy();hooks.effects=[];const cleanup=effect.run();if(typeof cleanup==='function')cleanups.push(cleanup as()=>void);await flush();
 const test=find(render(),node=>node.type==='button'&&text(node)==='Test connection');expect(test.props.disabled).toBe(false);test.props.onClick();await flush();
 const visible=text(render());expect(visible).toContain('Connected: Alpaca accepted the key (IEX feed).');expect(visible.includes('The US market is closed now')).toBe(scenario==='closed');expect(bridge.testAlpacaConnection).toHaveBeenCalledOnce();expect(connection.value.checkedAt).toBe(checkedAt);
});
