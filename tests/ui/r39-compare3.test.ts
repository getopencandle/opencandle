// Compare searches like the main symbol search, loads a symbol that is not open yet
// through the chart loaders with a pending state, defaults to Same % scale (which switches the main scale to Percent) and
// lists recently compared symbols. SYNTHETIC bars and synthetic fixtures only; no account, key or endpoint is used.
import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ComparisonDialog,RECENT_COMPARISONS_KEY,comparisonLoadable,readRecentComparisons,rememberRecentComparison} from '../../src/ui/ComparisonDialog';
import {COMPARISON_PLACEMENT_LABELS,DEFAULT_COMPARISON_PLACEMENT,comparisonLoadState,sameScaleMainCommand} from '../../src/chart/compare-port';
import {buildSymbolSearchCandidates,liveTypedCandidates,type SymbolSearchCandidate} from '../../src/ui/symbol-search';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):typeof node==='number'?String(node):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

/** An Alpaca IEX live dataset as the feed publishes it once loaded (SYNTHETIC bars). */
function alpacaLive(symbol:string,count=5,state:'ready'|'loading'|'error'='ready'):BarDataset{const [row]=alpacaSearchDatasets(true,[symbol],'1D');const bars=count?fixtureDataset(symbol,count).bars:[];return{...row,bars,provenance:{...row.provenance,state,revision:'live-v1:'+count,coverage:'synthetic test bars',notes:state==='error'?['Synthetic feed refusal']:row.provenance.notes}};}
function memoryStorage(seed?:string[]){const map=new Map<string,string>();if(seed)map.set(RECENT_COMPARISONS_KEY,JSON.stringify(seed));return{map,getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};}
function setup(options:{datasets?:BarDataset[];mode?:string;load?:(request:any)=>any;storage?:ReturnType<typeof memoryStorage>;key?:boolean}={}){
 const scaleMode={value:options.mode??'regular'};
 const execute=vi.fn((_command:string,_options:any)=>{scaleMode.value='percent';return{ok:true};});
 const native={comparisons:{list:vi.fn(():any[]=>[]),subscribe:vi.fn(()=>()=>{}),add:vi.fn(),update:vi.fn(()=>true),remove:vi.fn()},priceScale:{state:vi.fn(()=>({paneId:'price',kind:'price',mode:scaleMode.value,auto:true,invert:false})),execute}};
 const changed=vi.fn(()=>true),storage=options.storage??memoryStorage();
 const loadSymbol=vi.fn(options.load??((request:any)=>({ok:true,datasetId:'live:alpaca-iex:'+request.symbol+':'+request.resolution})));
 const props:any={chart:native,datasets:options.datasets??[fixtureDataset('GME',5)],onClose:vi.fn(),onChange:changed,resolution:'1D',recentStorage:storage,loadSymbol,
  typedCandidates:(query:string,rows:readonly SymbolSearchCandidate[])=>liveTypedCandidates(query,rows,options.key??true,'1D')};
 props.candidates=buildSymbolSearchCandidates(props.datasets,[]);
 const render=()=>{hooks.cursor=0;hooks.effects=[];return ComparisonDialog(props);};
 const settle=()=>{render();for(const effect of hooks.effects.splice(0))effect();return render();};
 const row=(symbol:string,tree=render())=>find(tree,node=>node.type==='button'&&!!find(node.props.children,(child:any)=>child.type==='strong'&&text(child)===symbol));
 const search=(value:string)=>find(render(),node=>node.props?.['aria-label']==='Search comparison symbols').props.onChange({target:{value}});
 const error=(tree=render())=>text(find(tree,node=>node.props?.role==='alert'));
 const setDatasets=(next:BarDataset[])=>{props.datasets=next;props.candidates=buildSymbolSearchCandidates(next,[]);};
 return{native,changed,storage,loadSymbol,props,render,settle,row,search,error,setDatasets,scaleMode,execute};
}

describe(' Compare symbol search',()=>{
 it('labels the three add-to choices as the reference does and defaults to Same % scale',()=>{
  expect(Object.values(COMPARISON_PLACEMENT_LABELS)).toEqual(['Same % scale','New price scale','New pane']);expect(DEFAULT_COMPARISON_PLACEMENT).toBe('same-scale');
  const ui=setup(),target=find(ui.render(),node=>node.props?.['aria-label']==='Add comparison to');
  expect(target.props.value).toBe('same-scale');expect(findAll(target,node=>node.type==='option').map(text)).toEqual(['Same % scale','New price scale','New pane']);
  expect(find(ui.render(),node=>node.props?.['aria-label']==='Search comparison symbols').props.placeholder).not.toMatch(/loaded/i);
 });
 it('Same % scale adds the loaded symbol on the shared scale and switches the main scale to Percent',()=>{
  const ui=setup();ui.row('GME').props.onClick();
  expect(ui.native.comparisons.add).toHaveBeenCalledWith(expect.objectContaining({instrument:expect.objectContaining({symbol:'GME'})}),{mode:'percent',placement:'same-scale'});
  expect(ui.execute).toHaveBeenCalledWith('percent',{paneId:'price',origin:'toolbar'});expect(ui.changed).toHaveBeenCalledTimes(1);
 });
 it('leaves a main scale already in Percent or Indexed alone, and New price scale never switches it',()=>{
  const percent=setup({mode:'percent'});percent.row('GME').props.onClick();expect(percent.native.comparisons.add).toHaveBeenCalled();expect(percent.execute).not.toHaveBeenCalled();
  hooks.cells=[];const indexed=setup({mode:'indexed'});indexed.row('GME').props.onClick();expect(indexed.execute).not.toHaveBeenCalled();
  hooks.cells=[];const own=setup();find(own.render(),node=>node.props?.['aria-label']==='Add comparison to').props.onChange({target:{value:'new-scale'}});own.row('GME').props.onClick();
  expect(own.native.comparisons.add).toHaveBeenCalledWith(expect.anything(),{mode:'percent'});expect(own.execute).not.toHaveBeenCalled();
 });
 it('a refused Percent switch keeps the comparison and says why',()=>{
  const ui=setup();ui.execute.mockImplementation(()=>({ok:false,message:'Synthetic scale refusal.'}) as any);ui.row('GME').props.onClick();
  expect(ui.native.comparisons.add).toHaveBeenCalled();expect(ui.error()).toMatch(/did not switch to Percent\. Synthetic scale refusal\./);
 });
 it('finds a symbol that is not loaded through the main search model, and loads it at the chart interval with a pending row',()=>{
  const ui=setup();ui.search('spy');const button=ui.row('SPY');
  expect(button).toBeTruthy();expect(button.props.disabled).toBe(false);expect(text(button)).toMatch(/Live/);
  button.props.onClick();
  expect(ui.loadSymbol).toHaveBeenCalledWith({providerId:'alpaca-iex',symbol:'SPY',resolution:'1D'});expect(ui.native.comparisons.add).not.toHaveBeenCalled();
  const tree=ui.settle(),status=find(tree,node=>node.props?.role==='status');expect(text(status)).toMatch(/Loading SPY/);expect(ui.row('SPY',tree).props.disabled).toBe(true);
  // The feed is listed but still loading: nothing is added (never an empty or partial line).
  ui.setDatasets([fixtureDataset('GME',5),alpacaLive('SPY',0,'loading')]);ui.settle();expect(ui.native.comparisons.add).not.toHaveBeenCalled();
  // Its history arrives: the comparison is added once, with the placement chosen when it was clicked.
  ui.setDatasets([fixtureDataset('GME',5),alpacaLive('SPY',6)]);const after=ui.settle();ui.settle();
  expect(ui.native.comparisons.add).toHaveBeenCalledTimes(1);
  expect(ui.native.comparisons.add).toHaveBeenCalledWith(expect.objectContaining({provenance:expect.objectContaining({datasetId:'live:alpaca-iex:SPY:1D'})}),{mode:'percent',placement:'same-scale'});
  expect(find(after,node=>node.props?.role==='status')).toBeNull();expect(ui.execute).toHaveBeenCalledWith('percent',{paneId:'price',origin:'toolbar'});
  expect(readRecentComparisons(ui.storage)).toEqual(['SPY']);
 });
 it('adds at once when the loader answers with a feed that already has history',()=>{
  const ui=setup({datasets:[fixtureDataset('GME',5),alpacaLive('AMC',4,'loading')]});ui.setDatasets([fixtureDataset('GME',5),alpacaLive('AMC',4)]);
  ui.loadSymbol.mockImplementation(()=>({ok:true,datasetId:'live:alpaca-iex:AMC:1D'}));
  // A loaded row with bars is added straight away; the loader is not called for it.
  ui.search('amc');ui.row('AMC').props.onClick();expect(ui.loadSymbol).not.toHaveBeenCalled();expect(ui.native.comparisons.add).toHaveBeenCalledTimes(1);
 });
 it('a listed live source with no bars yet is loaded instead of refused when a loader is present',()=>{
  const [empty]=alpacaSearchDatasets(true,['GME'],'1D');const ui=setup({datasets:[empty]});const button=ui.row('GME');
  expect(button.props.disabled).toBe(false);button.props.onClick();expect(ui.loadSymbol).toHaveBeenCalledWith({providerId:'alpaca-iex',symbol:'GME',resolution:'1D'});
 });
 it('a loader refusal and a failed feed say why and add nothing',()=>{
  const refused=setup({load:()=>({ok:false,message:'Synthetic loader refusal.'})});refused.search('spy');refused.row('SPY').props.onClick();
  expect(refused.error()).toBe('Synthetic loader refusal.');expect(find(refused.settle(),node=>node.props?.role==='status')).toBeNull();
  hooks.cells=[];const failed=setup();failed.search('spy');failed.row('SPY').props.onClick();failed.settle();
  failed.setDatasets([fixtureDataset('GME',5),alpacaLive('SPY',0,'error')]);failed.settle();const tree=failed.settle();
  expect(failed.native.comparisons.add).not.toHaveBeenCalled();expect(failed.error(tree)).toMatch(/SPY could not be loaded: Synthetic feed refusal/);expect(find(tree,node=>node.props?.role==='status')).toBeNull();
 });
 it('Cancel drops a pending comparison, so a late feed adds nothing',()=>{
  const ui=setup();ui.search('spy');ui.row('SPY').props.onClick();const tree=ui.settle();
  find(tree,node=>node.props?.['aria-label']==='Cancel loading SPY').props.onClick();
  ui.setDatasets([fixtureDataset('GME',5),alpacaLive('SPY',6)]);ui.settle();ui.settle();expect(ui.native.comparisons.add).not.toHaveBeenCalled();
 });
 it('without an Alpaca key a typed ticker is not offered, and an unlisted row cannot be loaded',()=>{
  const ui=setup({key:false});ui.search('spy');expect(ui.row('SPY')).toBeNull();
  hooks.cells=[];const legacy=setup();delete legacy.props.loadSymbol;legacy.search('spy');const button=legacy.row('SPY');expect(button.props.disabled).toBe(true);expect(button.props.title).toMatch(/cannot be loaded/i);
 });
 it('an old render cannot open a feed for a replaced dialog',()=>{
  const ui=setup();ui.search('spy');const stale=ui.row('SPY');ui.props.ownerToken={};ui.render();stale.props.onClick();
  expect(ui.loadSymbol).not.toHaveBeenCalled();expect(ui.native.comparisons.add).not.toHaveBeenCalled();
 });
 it('lists recently compared symbols first with an empty query, including a live ticker that is only offered when typed',()=>{
  const ui=setup({storage:memoryStorage(['SPY','GME','NOT A SYMBOL'])});const tree=ui.render(),group=find(tree,node=>node.props?.['aria-label']==='Recently compared');
  expect(group).toBeTruthy();expect(findAll(group,node=>node.type==='strong').map(text)).toEqual(['SPY','GME']);
  find(group,node=>node.type==='button'&&text(node).includes('SPY')).props.onClick();expect(ui.loadSymbol).toHaveBeenCalledWith({providerId:'alpaca-iex',symbol:'SPY',resolution:'1D'});
  ui.search('g');expect(find(ui.render(),node=>node.props?.['aria-label']==='Recently compared')).toBeNull();
 });
});

describe(' helpers',()=>{
 it('comparisonLoadState reads loading, ready and unavailable like the second-symbol alert loader',()=>{
  expect(comparisonLoadState(undefined,'SPY').state).toBe('loading');expect(comparisonLoadState(undefined,'SPY',true)).toEqual({state:'unavailable',message:'SPY stopped loading. Choose it again to retry.'});
  expect(comparisonLoadState(alpacaLive('SPY',0,'loading'),'SPY').state).toBe('loading');expect(comparisonLoadState(alpacaLive('SPY',3,'loading'),'SPY').state).toBe('loading');
  expect(comparisonLoadState(alpacaLive('SPY',3),'SPY').state).toBe('ready');expect(comparisonLoadState(alpacaLive('SPY',0,'error'),'SPY').state).toBe('unavailable');
 });
 it('sameScaleMainCommand switches Regular and Logarithmic to Percent only',()=>{
  expect(['regular','logarithmic','percent','indexed'].map(sameScaleMainCommand)).toEqual(['percent','percent',null,null]);
 });
 it('recent comparisons are unique, newest first, capped and never throw on blocked storage',()=>{
  const storage=memoryStorage();for(const symbol of ['A','B','C','D','E','F','G','H','I','J','K','b'])rememberRecentComparison(storage,symbol);
  expect(readRecentComparisons(storage)).toEqual(['B','K','J','I','H','G','F','E','D','C']);
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};expect(readRecentComparisons(blocked)).toEqual([]);expect(rememberRecentComparison(blocked,'SPY')).toEqual(['SPY']);
  expect(readRecentComparisons({getItem:()=>'{bad',setItem:()=>{}})).toEqual([]);
 });
 it('only live feed and symbol math rows are loadable',()=>{
  const [live]=buildSymbolSearchCandidates(alpacaSearchDatasets(true,['SPY'],'1D'),[]);expect(comparisonLoadable(live)).toBe(true);
  const [demo]=buildSymbolSearchCandidates([fixtureDataset('GME',3)],[]);expect(comparisonLoadable(demo)).toBe(false);
  expect(comparisonLoadable({...live,openable:false})).toBe(false);
 });
 it('App wires Compare to the main search model and the chart feed opener',()=>{
  const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8'),mount=app.split(/\r?\n/).find(line=>line.includes('<ComparisonDialog '))!;
  expect(mount).toContain('candidates={symbolCandidates}');expect(mount).toContain('liveTypedCandidates(query,rows,alpacaKeyConfigured,dataset.resolution)');
  expect(mount).toContain('resolution={dataset.resolution}');expect(mount).toMatch(/loadSymbol=\{request=>\{.*attachLive\(request\.providerId,request\.symbol,request\.resolution\)/);
 });
});
