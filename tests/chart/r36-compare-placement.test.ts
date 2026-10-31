import {beforeEach,describe,expect,it,vi} from 'vitest';
import {getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext} from '@luxalgo/vela';
import {compareAligned,compareRebased,createComparisonPort,validateComparisonSettings,COMPARISON_MODE_LABELS,COMPARISON_PLACEMENT_LABELS} from '../../src/chart/compare-port';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {liveComparisonsOf} from '../../src/ui/live-workspace';
import {ALPACA_IEX_PROVIDER_ID} from '../../src/domain/alpaca-live';

// The Compare symbols add-to choice (same scale, new price scale, new pane) and readable mode
// labels. Native chart double as in native-port-transactions; SYNTHETIC data only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(tree:any,match:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const dataset=fixtureDataset('GME',5),other=fixtureDataset('SPY',5),bars=dataset.bars.map(bar=>({...bar,time:bar.time*1000}));
function nativeChart(){
 let sequence=0;const live=new Map<string,{model:NativeIndicator;pane:string;mounted:boolean}>(),moves:Array<[string,unknown]>=[],emitted=new Map<string,any>();
 const chart={on:()=>()=>undefined,panes:{list:()=>[...new Set(['price',...[...live.values()].filter(row=>row.mounted).map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.mounted&&row.pane===id).map(([id])=>({id}))}))},getVisibleRange:()=>({from:bars[0].time,to:bars.at(-1)!.time}),addNativeIndicator(type:string){
  const descriptor=getNativeIndicator(type)!,id=`native-${++sequence}`,model=descriptor.create(),row={model,pane:`pane-${sequence}`,mounted:false};live.set(id,row);
  model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>bars,emit:(output:unknown)=>{row.mounted=true;emitted.set(id,output);},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,descriptor.defaultInputs());
  return {id,setInputs:()=>{},setVisible:(visible:boolean)=>{visible?model.resume():model.suspend();},moveTo:(target:any)=>{if(!row.mounted)return;moves.push([id,target]);row.pane=typeof target==='string'?target:target.pane??`new-pane-${++sequence}`;},remove:()=>{model.stop();live.delete(id);}};
 }};
 return {chart:chart as unknown as Vela,live,moves,emitted};
}
describe(' comparison placement',()=>{
 it('New price scale is the original placement and stays absent from saved settings',()=>{
  const native=nativeChart(),port=createComparisonPort(native.chart);port.add(other,{id:'scale',placement:'new-scale'});
  expect(native.moves).toEqual([['native-1','price']]);expect(Object.hasOwn(port.list()[0],'placement')).toBe(false);
 });
 it('New pane keeps the comparison in its own pane, and a placement edit moves it',()=>{
  const native=nativeChart(),port=createComparisonPort(native.chart);port.add(other,{id:'pane',placement:'new-pane'});
  expect(native.moves).toEqual([]);expect(port.list()[0].placement).toBe('new-pane');expect(native.live.get('native-1')!.pane).toBe('pane-1');
  port.update('pane',{placement:'new-scale'});expect(native.moves).toEqual([['native-1','price']]);expect(Object.hasOwn(port.list()[0],'placement')).toBe(false);
  port.update('pane',{placement:'new-pane'});expect(native.moves.at(-1)).toEqual(['native-1',{newPane:true}]);expect(port.list()[0].placement).toBe('new-pane');
 });
 it('Same scale rebases onto the main series and is refused, with nothing left behind, by a renderer that cannot share the scale',()=>{
  const primary=[{time:1,close:100},{time:2,close:110},{time:3,close:120}].map(row=>({...row,open:row.close,high:row.close,low:row.close,volume:0})),comparison=primary.map(row=>({...row,close:row.close/10}));
  expect(compareRebased(primary,comparison)).toEqual([{time:1,value:100},{time:2,value:110},{time:3,value:120}]);
  expect(compareRebased(primary,comparison.slice(1),2)).toEqual([{time:1,value:null},{time:2,value:110},{time:3,value:120}]);
  expect(compareAligned(primary,comparison,'percent')[2].value).toBeCloseTo(20);
  const native=nativeChart(),port=createComparisonPort(native.chart);
  expect(()=>port.add(other,{id:'same',placement:'same-scale'})).toThrow(/scale/i);expect(port.list()).toEqual([]);expect(native.live.size).toBe(0);
  expect(()=>validateComparisonSettings({id:'x',dataset:other,mode:'percent',color:'#fff',width:1,visible:true,baseline:'first-visible-match',placement:'side' as any})).toThrow();
 });
 it('a live comparison reference keeps its placement',()=>{
  const ref=(comparison:Record<string,unknown>)=>({liveComparisons:{cell:[{providerId:ALPACA_IEX_PROVIDER_ID,symbol:'SPY',interval:'5m',position:0,comparison:{id:'c',mode:'percent',color:'#fff',width:1,visible:true,baseline:'first-visible-match',...comparison}}]}});
  expect(liveComparisonsOf(ref({placement:'new-pane'})).cell?.[0].comparison.placement).toBe('new-pane');
  const plain=liveComparisonsOf(ref({})).cell!;expect(plain).toHaveLength(1);expect(Object.hasOwn(plain[0].comparison,'placement')).toBe(false);
  expect(liveComparisonsOf(ref({placement:'sideways'})).cell??[]).toEqual([]);
 });
});
describe(' Compare symbols dialog',()=>{
 it('shows readable mode labels and the add-to choice, and adds with the chosen placement',()=>{
  const add=vi.fn(),chart={comparisons:{list:()=>[],subscribe:()=>()=>undefined,add,update:vi.fn(),remove:vi.fn()}} as any;
  const render=()=>{hooks.cursor=0;return ComparisonDialog({chart,datasets:[other],onClose:vi.fn(),onChange:()=>true});};
  const scale=findAll(render(),node=>node.props['aria-label']==='Comparison scale')[0];
  expect(findAll(scale,node=>node.type==='option').map(option=>[option.props.value,text(option)])).toEqual([['percent',COMPARISON_MODE_LABELS.percent],['indexed',COMPARISON_MODE_LABELS.indexed],['absolute',COMPARISON_MODE_LABELS.absolute]]);
  const target=findAll(render(),node=>node.props['aria-label']==='Add comparison to')[0];
  expect(findAll(target,node=>node.type==='option').map(text)).toEqual(['Same % scale','New price scale','New pane']);expect(target.props.value).toBe('same-scale'); // The reference default and wording
  target.props.onChange({target:{value:'new-pane'}});
  findAll(render(),node=>node.type==='button'&&text(node).startsWith('SPY'))[0].props.onClick();
  expect(add).toHaveBeenCalledWith(expect.objectContaining({instrument:expect.objectContaining({symbol:'SPY'})}),{mode:'percent',placement:'new-pane'});
  expect(Object.values(COMPARISON_PLACEMENT_LABELS)).toEqual(['Same % scale','New price scale','New pane']);
 });
});
