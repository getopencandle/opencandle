import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StrategyDialog,strategyProvenanceText,type StrategyDialogProps,type StrategyExecution} from '../../src/ui/StrategyDialog';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
import {ReportLoopbackPort} from '../domain/strategy-report-test-port';

// F7 (Find box remounts while the worker query runs) and F8 (toolbar prints serialized
// provenance). Actual StrategyDialog and report hook with controlled React hooks and the real report
// protocol on a loopback port. React keeps a DOM node (and its focus) only while an element of the same
// type stays at the same position, so the Find input's element path is compared across renders.
// No DOM, focus, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const same=(a:any[]|undefined,b:any[]|undefined)=>Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));
 return {...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(next:any)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:(factory:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;},
  useEffect:(effect:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps)){const cell={deps,cleanup:old?.cleanup};hooks.cells[index]=cell;hooks.effects.push(()=>{cell.cleanup?.();cell.cleanup=effect();});}},
 };
});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
/** Element path (child position, element type, key) from the root to the first match, or null. */
function path(node:any,predicate:(value:any)=>boolean,trail:string[]=[]):string[]|null{
 if(Array.isArray(node)){for(let i=0;i<node.length;i++){const found=path(node[i],predicate,[...trail,'#'+i]);if(found)return found;}return null;}
 if(!node?.props)return null;const here=[...trail,(typeof node.type==='string'?node.type:node.type?.name??String(node.type))+(node.key!=null?'@'+node.key:'')];
 return predicate(node)?here:path(node.props.children,predicate,here);
}
const findBox=(node:any)=>node.props?.['aria-label']==='Find report trade';
function element(tree:any,predicate:(value:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=element(child,predicate);if(found)return found;}return null;}if(!tree?.props)return null;return predicate(tree)?tree:element(tree.props.children,predicate);}
const PROVENANCE='Synthetic demo history · '+JSON.stringify(['lv-synthetic-v1:GME','1','1D',true,JSON.stringify([1,'GME','1D',0.01,1,true]),'LV synthetic fixture','candles','ordinary']);
function execution():StrategyExecution{
 const closes=[100,100,120,90,110,130,95,105],bars=closes.map((close,index)=>({time:1000+index*86400,open:close,high:close,low:close,close,volume:1})),barIds=bars.map((_,index)=>'synthetic-find:'+index);
 const orders=[0,1,2,3,4,5].map(index=>({sequence:index+1,side:index%2?'sell' as const:'buy' as const,quantity:1,event:{id:barIds[index],revision:1,time:bars[index].time},virtual:true as const}));
 return {bars,barIds,identity:'synthetic-find-run',source:PROVENANCE,currency:null,timezone:'UTC',chartType:'standard',result:{plots:[],alerts:[],state:null,diagnostics:[],elapsedMs:0,provisional:false,provenance:{kind:'synthetic',label:PROVENANCE},orders}};
}
function setup(){
 const props:StrategyDialogProps={execution:execution(),config:{...DEFAULT_STRATEGY_CONFIG,commission:{kind:'fixed',value:0},initialCapital:1000},onChange:vi.fn(()=>true),onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return StrategyDialog(props);};
 const flush=()=>{const effects=hooks.effects.splice(0);for(const effect of effects)effect();};
 const settle=async(done:(tree:any)=>boolean)=>{for(let i=0;i<120;i++){const tree=render();flush();if(done(tree))return tree;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Report did not settle');};
 const click=(label:string)=>element(render(),node=>node.type==='button'&&text(node)===label).props.onClick();
 return {props,render,flush,settle,click};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('window',{lv:{exportData:vi.fn()}});vi.stubGlobal('Worker',ReportLoopbackPort);});
afterEach(()=>{for(const cell of hooks.cells)if(cell&&typeof cell==='object'&&typeof cell.cleanup==='function')cell.cleanup();vi.unstubAllGlobals();});

it('F7: the Find box stays mounted at the same element position on every keystroke while the query runs',async()=>{
 const ui=setup();await ui.settle(tree=>!element(tree,node=>node.type==='button'&&text(node)==='Export metrics CSV')?.props.disabled);
 ui.click('Trades');const loaded=await ui.settle(tree=>text(tree).includes('closed allocations'));
 const home=path(loaded,findBox);expect(home).not.toBeNull();
 for(const value of ['s','sy','syn']){
  element(ui.render(),findBox).props.onChange({target:{value}});
  const typing=ui.render();// before the worker answers: the page is cleared meanwhile
  expect(path(typing,findBox)).toEqual(home);expect(element(typing,findBox).props.value).toBe(value);
  ui.flush();expect(path(ui.render(),findBox)).toEqual(home);
  const answered=await ui.settle(tree=>text(tree).includes('closed allocations'));expect(path(answered,findBox)).toEqual(home);
 }
});
it('F8: the strategy toolbar shows readable provenance, not serialized JSON or internal ids',async()=>{
 const ui=setup(),tree=ui.render(),toolbar=element(tree,node=>node.props?.className==='screener-toolbar');
 const label=text(toolbar.props.children[0]);
 expect(label).toBe('Example data · 1D');expect(label).not.toMatch(/[[\]{}"]|lv-synthetic-v1/);
 expect(strategyProvenanceText('User-supplied local history · '+JSON.stringify(['import:abc',3,'4h',false,null,'My CSV','heikinashi','replay:123']))).toBe('User-supplied local history · My CSV · 4h · Heikin Ashi chart · Replay run');
 expect(strategyProvenanceText('Synthetic handler test')).toBe('Synthetic handler test');
 expect(strategyProvenanceText('Explicit synthetic provider · no real security prices')).toBe('Explicit synthetic provider · no real security prices');
 expect(strategyProvenanceText('Synthetic demo history · [not json')).toBe('Example data');
});
