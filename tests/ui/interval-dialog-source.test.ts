import {beforeEach,expect,it,vi} from 'vitest';
import {IntervalDialog} from '../../src/ui/IntervalDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState,intervalDatasetKey} from '../../src/domain/intervals';
import {coinbaseSearchDatasets} from '../../src/domain/coinbase-live';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
// Controlled handler tests. These do not exercise DOM rendering or native input.
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}else if(typeof tree?.type==='function'){/* not expanded */}return out;}
// Modal is a function component; expand it so its children are visible.
function expand(node:any):any{if(Array.isArray(node))return node.map(expand);if(node&&typeof node.type==='function'&&node.type.name==='Modal')return expand(node.props.children);if(node?.props?.children!==undefined)return{...node,props:{...node.props,children:expand(node.props.children)}};return node;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function setup(datasets:any[],current:any,over:Record<string,unknown>={}){
 const props={datasets,current,state:createIntervalMenuState(),onApply:vi.fn((..._a:unknown[])=>true),onApplyLive:vi.fn((..._a:unknown[])=>true),onClose:vi.fn(),...over};
 const render=()=>{hooks.cursor=0;return expand(IntervalDialog(props as any));};
 const addCustom=(value:string)=>{all(render(),n=>n.type==='input'&&n.props['aria-label']==='Custom interval')[0].props.onChange({target:{value}});all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});};
 const apply=()=>all(render(),n=>n.type==='button'&&text(n)==='Apply')[0];
 return{props,render,addCustom,apply};
}

it('I1b: adding a custom interval supplies the chart source, so Apply works without picking one by hand',()=>{
 const data=fixtureDataset('GME',120),{props,render,addCustom,apply}=setup([data],data);
 addCustom('3D');
 expect(text(render())).not.toContain('No exact interval source is loaded');
 expect(all(render(),n=>n.type==='select'&&n.props['aria-label']==='Interval source')[0].props.value).toBe(intervalDatasetKey(data));
 expect(apply().props.disabled).toBe(false);
 apply().props.onClick();
 expect(props.onApply).toHaveBeenCalledOnce();const [dataset,menu]=props.onApply.mock.calls[0] as any[];
 expect(dataset.resolution).toBe('3D');expect(menu.custom).toContain('3D');expect(props.onClose).toHaveBeenCalled();
});
it('I1b: an interval with a unique exact source keeps the exact preference',()=>{
 const data=fixtureDataset('GME',120),{render,apply}=setup([data],data);
 all(render(),n=>n.type==='button'&&text(n)==='1 week')[0].props.onClick();
 expect(all(render(),n=>n.type==='select'&&n.props['aria-label']==='Interval source')[0].props.value).toBe(intervalDatasetKey(data));
 expect(apply().props.disabled).toBe(false);
 all(render(),n=>n.type==='button'&&text(n)==='1 day')[0].props.onClick();
 expect(all(render(),n=>n.type==='select'&&n.props['aria-label']==='Interval source')[0].props.value).toBe('');
 expect(text(render())).toContain('Exact supplied data');
});
it('I2: on a live Coinbase chart a custom interval applies through the live feed',()=>{
 const live={...coinbaseSearchDatasets(true,'1m').find(row=>row.instrument.symbol==='BTC-USD')!,bars:[{time:1760000000,open:1,high:2,low:1,close:2,volume:1}]};
 const siblings=coinbaseSearchDatasets(true,'5m').filter(row=>row.instrument.symbol==='BTC-USD');
 const {props,render,addCustom,apply}=setup([live,...siblings],live);
 addCustom('7m');
 expect(text(render())).not.toContain('supplied bars');
 expect(apply().props.disabled).toBe(false);
 apply().props.onClick();
 expect(props.onApply).not.toHaveBeenCalled();expect(props.onApplyLive).toHaveBeenCalledOnce();
 const [interval,menu]=props.onApplyLive.mock.calls[0] as any[];expect(interval).toBe('7m');expect(menu.custom).toContain('7m');expect(props.onClose).toHaveBeenCalled();
});
it('I2: a live interval the feed cannot build stays refused with its reason',()=>{
 const live={...coinbaseSearchDatasets(true,'1m').find(row=>row.instrument.symbol==='BTC-USD')!,bars:[]};
 const {props,render,addCustom,apply}=setup([live],live);
 addCustom('5s');
 expect(apply().props.disabled).toBe(true);expect(text(render())).toContain('finer than 1 minute');expect(props.onApplyLive).not.toHaveBeenCalled();
});
it('I2: a rejected live apply keeps the dialog open',()=>{
 const live={...coinbaseSearchDatasets(true,'1m').find(row=>row.instrument.symbol==='BTC-USD')!,bars:[]};
 const {props,render,addCustom,apply}=setup([live],live,{onApplyLive:vi.fn(()=>false)});
 addCustom('7m');apply().props.onClick();
 expect(props.onClose).not.toHaveBeenCalled();expect(text(render())).toContain('rejected');
});
