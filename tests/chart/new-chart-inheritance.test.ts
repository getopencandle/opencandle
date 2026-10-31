import {it,expect} from 'vitest';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';
const data=fixtureDataset('GME',3),source=sourceContextForDataset(data),study={id:'rsi',kind:'rsi' as const,inputs:{length:7},plots:{},visible:true,offset:0,paneId:'shared'},binding={id:'script',documentId:'document',version:3,name:'Synthetic study',source:'({onBar(){}})',pane:'new' as const,paneId:'shared',ownScale:true,visible:true,plots:{}};
function initial(){return createMultiChartState(data,{appearance:defaultTheme.appearance,indicators:[structuredClone(study)],scriptBindings:[structuredClone(binding)]});}
const comparison={id:'compare',datasetId:'synthetic-other',mode:'absolute' as const,color:'#123456',width:2,visible:true,baseline:'first-loaded-match' as const};
it('allocation failure, malformed first studies and descendant accessors reject before publication',()=>{
 const grid=initial(),before=structuredClone(grid);expect(()=>resizeMultiChartState(grid,'two-columns',()=> 'repeated')).toThrow('collided');expect(grid).toEqual(before);
 grid.cells[grid.layout.activeCellId].indicators[0].kind='future' as any;let ids=0;expect(()=>resizeMultiChartState(grid,'two-columns',()=>{ids++;return 'id';})).toThrow();expect(ids).toBe(0);
 const unsafe=initial();let reads=0;Object.defineProperty(unsafe.cells[unsafe.layout.activeCellId].indicators[0].inputs,'length',{get(){reads++;return 14;},enumerable:true});expect(()=>resizeMultiChartState(unsafe,'two-columns')).toThrow('accessors');expect(reads).toBe(0);
});
it('unknown or mixed comparison pane ownership rejects before allocating chart or study IDs',()=>{
 const grid=initial(),cell=grid.cells[grid.layout.activeCellId];cell.comparisons=[comparison];let calls=0;const allocate=()=>{calls++;return 'id-'+calls;};expect(()=>resizeMultiChartState(grid,'two-columns',allocate)).toThrow('placement is unknown');expect(calls).toBe(0);
 const mixed:AnalysisPaneInventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]},{paneId:'native',logicalPaneId:'shared',replaceable:false,owners:[{kind:'built',id:'rsi',rendererId:'built-native'},{kind:'script',id:'script',rendererId:'script-native'},{kind:'comparison',id:'compare',rendererId:'comparison-native'}]}],occupiedIds:[]};expect(()=>resizeMultiChartState(grid,'two-columns',allocate,mixed)).toThrow('shares an inherited');expect(calls).toBe(0);
});
it('owners-key historical frame proves the saved logical graph only with exact current source and fingerprints',()=>{
 const grid=initial(),cell=grid.cells[grid.layout.activeCellId];cell.comparisons=[comparison];const calculationFingerprints={'["built","rsi"]':'builtin-fingerprint','["script","script"]':'script-fingerprint','["comparison","compare"]':'comparison-fingerprint'},owners=[{kind:'built' as const,id:'rsi'},{kind:'script' as const,id:'script'}],flags={heightWeight:1,collapsed:false,mode:'price' as const,log:false,invert:false,manualRange:null};cell.frame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints,panes:[{key:{kind:'price'},owners:[{kind:'comparison',id:'compare'}],order:0,...flags},{key:{kind:'owners',owners},owners,order:1,...flags}],independent:[{owner:{kind:'comparison',id:'compare'},manualRange:null}],maximized:null} satisfies HistoricalChartFrame;
 let id=0;const next=resizeMultiChartState(grid,'two-columns',()=> 'new-'+(++id),undefined,{source,calculationFingerprints}),added=next.cells[next.layout.cells[1].id];expect(added.indicators[0].paneId).toBe(added.scriptBindings![0].paneId);expect(added.frame).toBeUndefined();expect(added.comparisons).toEqual([]);
 expect(()=>resizeMultiChartState(grid,'two-columns',()=> 'new-id',undefined,{source:{...source,revision:'correction'},calculationFingerprints})).toThrow('incompatible');expect(()=>resizeMultiChartState(grid,'two-columns',()=> 'new-id',undefined,{source,calculationFingerprints:{...calculationFingerprints,'["built","rsi"]':'different'}})).toThrow('incompatible');
});
it('sixteen-chart aggregate payload rejects before clones or external ID allocation',()=>{
 const grid=initial(),cell=grid.cells[grid.layout.activeCellId];cell.scriptBindings=Array.from({length:70},(_,index)=>({...binding,id:'script-'+index,pane:'price',paneId:null,source:'x'.repeat(60000)}));let ids=0;expect(()=>resizeMultiChartState(grid,'sixteen',()=>{ids++;return 'new-'+ids;})).toThrow('32 MiB');expect(ids).toBe(0);expect(grid.layout.cells).toHaveLength(1);
});
it('same-count rearrangement allocates nothing and shrink/grow never resurrects removed identities',()=>{
 let id=0;const grid=resizeMultiChartState(initial(),'two-columns',()=> 'new-'+(++id)),rearranged=resizeMultiChartState(grid,'two-rows',()=>{throw Error('no new IDs');});expect(rearranged.cells).toEqual(grid.cells);const removed=grid.layout.cells[1].id,shrunk=resizeMultiChartState(grid,'single');expect(shrunk.cells[removed]).toBeUndefined();const grown=resizeMultiChartState(shrunk,'two-columns',()=> 'new-'+(++id));expect(grown.cells[removed]).toBeUndefined();expect(grown.layout.cells[1].id).not.toBe(removed);
});
it('a reentrant identity supplier cannot turn validated study or chart data into an unchecked clone',()=>{
 const grid=initial(),cell=grid.cells[grid.layout.activeCellId];let reads=0,id=0;const result=resizeMultiChartState(grid,'two-columns',()=>{if(!id){Object.defineProperty(cell.indicators[0].inputs,'length',{enumerable:true,get(){reads++;return 0;}});grid.layout.cells[0].symbol='OTHER';}return 'new-'+(++id);});expect(reads).toBe(0);const added=result.cells[result.layout.cells[1].id];expect(added.indicators[0].inputs.length).toBe(7);expect(result.layout.cells[1].symbol).toBe('GME');
});
