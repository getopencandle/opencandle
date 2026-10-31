// Compare symbols with live (Alpaca IEX, Coinbase) and keyless Alpaca stub sources.
// Gaps fixed: a live or stub source was labelled "Local import" / "LOCAL IMPORT" (AGENTS.md: synthetic data is labelled
// synthetic everywhere); a live source with no bars yet (an Alpaca search row "not connected until opened") could be added
// as an empty line; a live comparison froze at the bars it had when it was added. SYNTHETIC bars; not interface evidence.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {alpacaSearchDatasets,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {comparisonSourceTag,comparisonSourceText,createComparisonPort} from '../../src/chart/compare-port';
import {followLiveComparisons} from '../../src/ui/comparison-live-follow';
import {nativeCoreHarness} from '../chart/native-core-harness';
import type {BarDataset} from '../../src/domain/types';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{selectAlpacaSyntheticStub(false);});

/** An Alpaca IEX live dataset as the feed publishes it: the search row's identity plus SYNTHETIC bars. */
function alpacaLive(symbol:string,count=5):BarDataset{const [row]=alpacaSearchDatasets(true,[symbol],'1D');const bars=fixtureDataset(symbol,count).bars;return{...row,bars,provenance:{...row.provenance,state:'ready',revision:'live-v1:'+count,coverage:'synthetic test bars'}};}
function coinbaseLive(count=5):BarDataset{const base=fixtureDataset('BTC-USD',count);return{...base,provenance:{...base.provenance,providerId:'coinbase-public',providerName:'Coinbase Exchange public market data',datasetId:'live:coinbase-public:BTC-USD:1D',fixture:false,state:'ready'}};}
const nativeChart=()=>({comparisons:{list:vi.fn(():any[]=>[]),subscribe:vi.fn(()=>()=>{}),add:vi.fn(),update:vi.fn(),remove:vi.fn()}});
function dialog(datasets:BarDataset[]){
 const native=nativeChart(),changed=vi.fn();const props:any={chart:native,datasets,onClose:vi.fn(),onChange:changed};const render=()=>{hooks.cursor=0;return ComparisonDialog(props);};
 const row=(symbol:string)=>find(render(),node=>node.type==='button'&&!!find(node.props.children,(child:any)=>child.type==='strong'&&text(child)===symbol));
 const search=(value:string)=>find(render(),node=>node.props?.['aria-label']==='Search comparison symbols').props.onChange({target:{value}});
 return{native,changed,render,row,search};
}

describe('comparison source labels',()=>{
 it('tags fixture, live, keyless stub, delayed and imported sources',()=>{
  expect(comparisonSourceTag(fixtureDataset('GME',3))).toBe('SYNTHETIC');
  expect(comparisonSourceTag(alpacaLive('GME'))).toBe('LIVE');
  expect(comparisonSourceTag(coinbaseLive())).toBe('LIVE');
  const imported=fixtureDataset('SPY',3);imported.provenance={...imported.provenance,fixture:false,providerId:'local-csv',providerName:'Local CSV',datasetId:'import:spy'};
  expect(comparisonSourceTag(imported)).toBe('LOCAL IMPORT');expect(comparisonSourceText(imported)).toBe('Local import');
  const delayed={...imported,provenance:{...imported.provenance,providerId:'alpaca-sip-delayed',datasetId:'alpaca-sip-delayed:SPY:1D'}};
  expect(comparisonSourceTag(delayed)).toBe('DELAYED');
  selectAlpacaSyntheticStub(true);const stub=alpacaLive('GME');expect(stub.provenance.providerId).toBe('alpaca-stub');
  expect(comparisonSourceTag(stub)).toBe('SYNTHETIC');expect(comparisonSourceText(stub)).toMatch(/^SYNTHETIC/);
 });
 it('live text names the provider and never says Local import',()=>{
  expect(comparisonSourceText(alpacaLive('GME'))).toMatch(/^Live/);expect(comparisonSourceText(alpacaLive('GME'))).toContain('Alpaca');
  expect(comparisonSourceText(coinbaseLive())).toContain('Coinbase');expect(comparisonSourceText(fixtureDataset('GME',3))).toBe('Synthetic demo');
 });
});

describe('ComparisonDialog with live and stub sources',()=>{
 it('lists a live Alpaca symbol (dotted GME.WS too) as Live and adds it',()=>{
  const ui=dialog([fixtureDataset('SPY',5),alpacaLive('GME'),alpacaLive('GME.WS')]);
  expect(text(ui.row('GME'))).toContain('Live');expect(text(ui.row('GME'))).not.toContain('Local import');
  ui.search('gme.ws');expect(ui.row('GME.WS')).toBeTruthy();expect(ui.row('SPY')).toBeNull();
  ui.row('GME.WS').props.onClick();
  expect(ui.native.comparisons.add).toHaveBeenCalledWith(expect.objectContaining({provenance:expect.objectContaining({datasetId:'live:alpaca-iex:GME.WS:1D'})}),{mode:'percent',placement:'same-scale'}); // Same % scale is the default
 });
 it('labels a keyless stub source SYNTHETIC',()=>{
  selectAlpacaSyntheticStub(true);const ui=dialog([alpacaLive('GME')]);
  expect(text(ui.row('GME'))).toMatch(/SYNTHETIC/);expect(text(ui.row('GME'))).not.toContain('Local import');
 });
 it('labels a live comparison row on the chart LIVE and a stub row SYNTHETIC',()=>{
  selectAlpacaSyntheticStub(true);const stub=alpacaLive('SPY');selectAlpacaSyntheticStub(false);const live=alpacaLive('GME');
  const ui=dialog([live]);ui.native.comparisons.list.mockReturnValue([{id:'a',dataset:live,mode:'percent',color:'#ffb74d',width:2,visible:true,baseline:'first-visible-match',rendererId:'r1'},{id:'b',dataset:stub,mode:'percent',color:'#ffb74d',width:2,visible:true,baseline:'first-visible-match',rendererId:'r2'}]);
  hooks.cells=[];const legends=findAll(ui.render(),node=>node.type==='legend').map(text);
  expect(legends).toEqual(['GME · LIVE','SPY · SYNTHETIC']);
 });
 it('a live source with no bars yet is shown but cannot be added',()=>{
  const [empty]=alpacaSearchDatasets(true,['GME'],'1D');expect(empty.bars).toEqual([]);
  const ui=dialog([empty]);const button=ui.row('GME');
  expect(button.props.disabled).toBe(true);expect(button.props.title).toMatch(/no bars/i);
  button.props.onClick?.();expect(ui.native.comparisons.add).not.toHaveBeenCalled();
 });
});

describe('a live comparison follows its feed',()=>{
 it('refreshSource swaps in the newer live bars, ignores other and non-live ids, and keeps the saved settings',async()=>{
  const native=await nativeCoreHarness(),port=createComparisonPort(native.chart,native.bridge.claim);
  try{
   const live=alpacaLive('GME',4),spy=fixtureDataset('SPY',4);
   const id=port.add(live),other=port.add(spy);
   expect(port.list().find(row=>row.id===id)!.dataset.bars).toHaveLength(4);
   const newer=alpacaLive('GME',6);
   expect(port.refreshSource(newer)).toBe(true);
   const row=port.list().find(item=>item.id===id)!;expect(row.dataset.bars).toHaveLength(6);expect(row.mode).toBe('percent');expect(row.dataset.provenance.datasetId).toBe(live.provenance.datasetId);
   expect(port.refreshSource(newer)).toBe(false);
   expect(port.refreshSource(alpacaLive('AMC',9))).toBe(false);
   expect(port.refreshSource(fixtureDataset('SPY',8))).toBe(false);expect(port.list().find(item=>item.id===other)!.dataset.bars).toHaveLength(4);
  }finally{port.dispose();native.dispose();}
 });
 it('followLiveComparisons subscribes per live comparison, refreshes on each publish and unsubscribes',()=>{
  const live=alpacaLive('GME',4);let rows:{dataset:BarDataset}[]=[{dataset:live},{dataset:fixtureDataset('SPY',3)}];let notify=()=>{};
  const refreshSource=vi.fn((_dataset:BarDataset)=>true);
  const port={list:()=>rows,subscribe:(fn:()=>void)=>{notify=fn;return()=>{notify=()=>{};};},refreshSource};
  const listeners=new Map<string,(d:BarDataset)=>void>(),off=vi.fn();
  const feed={latest:(id:string)=>id===live.provenance.datasetId?alpacaLive('GME',5):undefined,subscribe:(id:string,fn:(d:BarDataset)=>void)=>{listeners.set(id,fn);return()=>{off(id);listeners.delete(id);};}};
  const stop=followLiveComparisons(port,feed);
  expect([...listeners.keys()]).toEqual([live.provenance.datasetId]);expect(refreshSource).toHaveBeenCalledTimes(1);expect(refreshSource.mock.calls[0][0].bars).toHaveLength(5);
  listeners.get(live.provenance.datasetId)!(alpacaLive('GME',7));expect(refreshSource).toHaveBeenCalledTimes(2);expect(refreshSource.mock.calls[1][0].bars).toHaveLength(7);
  rows=[{dataset:fixtureDataset('SPY',3)}];notify();expect(off).toHaveBeenCalledWith(live.provenance.datasetId);expect(listeners.size).toBe(0);
  rows=[{dataset:coinbaseLive()}];notify();expect([...listeners.keys()]).toEqual(['live:coinbase-public:BTC-USD:1D']);
  stop();expect(listeners.size).toBe(0);
 });
 it('a refresh failure never escapes the feed callback',()=>{
  const live=alpacaLive('GME',4),listeners=new Map<string,(d:BarDataset)=>void>();
  const port={list:()=>[{dataset:live}],subscribe:()=>()=>{},refreshSource:vi.fn((_dataset:BarDataset):boolean=>{throw Error('Chart analysis is unavailable.');})};
  const stop=followLiveComparisons(port,{latest:()=>undefined,subscribe:(id,fn)=>{listeners.set(id,fn);return()=>{listeners.delete(id);};}});
  expect(()=>listeners.get(live.provenance.datasetId)!(alpacaLive('GME',5))).not.toThrow();stop();
 });
});
