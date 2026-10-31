import {afterEach,describe,expect,it,vi} from 'vitest';
import {isLiveDatasetId,isFormingLiveDataset,completedBarsDataset} from '../../src/domain/live-provider';
import {clearLiveDatasets,liveDatasetById} from '../../src/ui/live-registry';
import {liveChartsOf,liveComparisonsOf,persistableWorkspace,reconnectLiveCharts,restoreLiveCharts,openFredSymbol,reopenFredCharts,liveRefOfDatasetId,liveSiblings} from '../../src/ui/live-workspace';
import {patchWorkspace,selectedDataset} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {fredBars,fredDataset} from '../../src/domain/fred';

// No network; the bridge is a mock.
const day=(d:string)=>Date.parse(d+'T00:00:00Z')/1000;
const rows:Array<[number,number]>=[[day('2026-01-02'),4.1],[day('2026-01-05'),4.2],[day('2026-01-06'),4.15]];
const ok=(over:object={})=>({fetchFredSeries:vi.fn(async(input:{series:string})=>({ok:true as const,value:{schemaVersion:1 as const,series:input.series,rows,fetchedAt:1,cached:true,stale:false,...over}}))});
const offline=()=>({fetchFredSeries:vi.fn(async()=>({ok:false as const,error:{code:'FRED_OFFLINE',message:'x'}}))});
const ID='fred:fred-public:DGS10:1D',avail={coinbase:false,alpacaKey:false};
afterEach(()=>clearLiveDatasets());

async function opened(){
 const r=await openFredSymbol(ok(),'FRED:DGS10');
 return{r,ws:patchWorkspace(createInitialWorkspace(),{symbol:'DGS10',sourceId:ID})};
}
describe('FRED ids are live-registry ids',()=>{
 it('accepts fred ids, keeps FRED out of forming-bar logic',()=>{
  expect(isLiveDatasetId(ID)).toBe(true);expect(isLiveDatasetId('fred')).toBe(false);
  const d=fredDataset('DGS10',fredBars(rows));
  expect(isFormingLiveDataset(d)).toBe(false);expect(completedBarsDataset(d)).toBe(d);
  expect(liveRefOfDatasetId(ID)).toEqual({providerId:'fred-public',symbol:'DGS10',interval:'1D'});
  expect(liveRefOfDatasetId('live:fred-public:DGS10:1D')).toBeNull();
  expect(liveRefOfDatasetId('fred:coinbase-public:BTC-USD:5m')).toBeNull();
  expect(liveRefOfDatasetId('fred:fred-public:DGS10:5m')).toBeNull();
  expect(liveSiblings(d)).toEqual([]);
 });
});
describe('openFredSymbol',()=>{
 it('registers the dataset and returns it',async()=>{
  const {r}=await opened();
  expect(r.dataset?.bars).toHaveLength(3);expect(r.notice).toBeNull();expect(liveDatasetById(ID)).toBe(r.dataset);
 });
 it('returns a stale notice with the saved copy',async()=>{
  const r=await openFredSymbol(ok({stale:true,notice:'offline'}),'DGS10');
  expect(r.dataset?.provenance.state).toBe('stale');expect(r.notice).toMatch(/saved copy/);
 });
 it('returns a notice and no dataset on failure or when requests are off',async()=>{
  const b=ok();
  expect((await openFredSymbol(offline(),'FRED:DGS10')).dataset).toBeNull();
  const off=await openFredSymbol(b,'FRED:DGS10',{enabled:false});
  expect(off.dataset).toBeNull();expect(off.notice).toMatch(/turned off/);expect(b.fetchFredSeries).not.toHaveBeenCalled();
  expect(liveDatasetById(ID)).toBeUndefined();
 });
});
describe('saved FRED chart',()=>{
 it('persists as a ref without bars and passes the real save path and strict restore',async()=>{
  const {ws}=await opened(),cell=ws.grid.layout.activeCellId,safe=persistableWorkspace(ws) as Record<string,unknown>;
  expect(safe.liveCharts).toEqual({[cell]:{providerId:'fred-public',symbol:'DGS10',interval:'1D'}});
  expect(JSON.stringify(safe)).not.toContain('fred:');expect(JSON.stringify(safe)).not.toContain('4.15');
  const data=prepareWorkspaceData({...persistableWorkspace(ws),paper:createPaperAccount({initialBalance:500}),alerts:[]});
  expect(liveChartsOf(data.workspace)[cell]).toEqual({providerId:'fred-public',symbol:'DGS10',interval:'1D'});
  expect(()=>restoreLiveCharts({a:{providerId:'fred-public',symbol:'DGS10',interval:'5m'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{providerId:'fred-public',symbol:'bad id',interval:'1D'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{providerId:'fred-public',symbol:'DGS10',interval:'1D',session:'rth'}})).toThrow();
 });
 it('reopens through the cache: stand-in first, then the loaded series',async()=>{
  const {ws}=await opened(),cell=ws.grid.layout.activeCellId,saved=JSON.parse(JSON.stringify(persistableWorkspace(ws)));
  clearLiveDatasets();
  const r=reconnectLiveCharts(saved,avail);
  expect(r.reopen).toEqual([]);expect(r.fredReopen).toEqual([{cellId:cell,providerId:'fred-public',symbol:'DGS10',interval:'1D'}]);
  const stand=selectedDataset(r.workspace);expect(stand.provenance.datasetId).toBe(ID);expect(stand.bars).toHaveLength(0);expect(stand.provenance.state).toBe('loading');
  const b=ok();expect(await reopenFredCharts(b,r.fredReopen!)).toEqual([]);
  expect(b.fetchFredSeries).toHaveBeenCalledTimes(1);
  expect(selectedDataset(r.workspace).bars).toHaveLength(3);
 });
 it('offline with no cache shows a placeholder notice and a later reconnect retries it',async()=>{
  const {ws}=await opened(),saved=JSON.parse(JSON.stringify(persistableWorkspace(ws)));clearLiveDatasets();
  const r=reconnectLiveCharts(saved,avail),notices=await reopenFredCharts(offline(),r.fredReopen!);
  expect(notices[0]).toMatch(/could not be reached/);
  const holder=selectedDataset(r.workspace);expect(holder.bars).toHaveLength(0);expect(holder.provenance.state).toBe('disconnected');expect(holder.provenance.notes[0]).toMatch(/could not be reached/);
  expect(reconnectLiveCharts(r.workspace as typeof saved,avail).fredReopen).toHaveLength(1);
 });
 it('a failed refresh never replaces a loaded series',async()=>{
  const {r}=await opened();
  await reopenFredCharts(offline(),[{cellId:'c',providerId:'fred-public',symbol:'DGS10',interval:'1D'}]);
  expect(liveDatasetById(ID)).toBe(r.dataset);
 });
 it('remote requests off: a disconnected stand-in with a plain message and no call',async()=>{
  const {ws}=await opened(),saved=JSON.parse(JSON.stringify(persistableWorkspace(ws)));clearLiveDatasets();
  const r=reconnectLiveCharts(saved,{...avail,fred:false});
  expect(r.fredReopen).toBeUndefined();expect(r.disconnected[0].message).toMatch(/remote data requests are turned off/);
 });
 it('a Compare series is saved as a ref and comes back',async()=>{
  const {ws}=await opened();clearLiveDatasets();
  const r2=await openFredSymbol(ok(),'FRED:DGS2');
  const cell=ws.grid.layout.activeCellId;
  const withCmp={...ws,grid:{...ws.grid,cells:{...ws.grid.cells,[cell]:{...ws.grid.cells[cell],comparisons:[{id:'c1',datasetId:r2.dataset!.provenance.datasetId,mode:'absolute' as const,color:'#fff',width:1,visible:true,baseline:'first-visible-match' as const}]}}}};
  const safe=persistableWorkspace(withCmp) as Record<string,unknown>;
  expect(liveComparisonsOf(safe)[cell][0]).toMatchObject({providerId:'fred-public',symbol:'DGS2',interval:'1D',position:0});
  const back=reconnectLiveCharts(JSON.parse(JSON.stringify(safe)),avail);
  expect(back.fredReopen?.map(e=>e.symbol)).toContain('DGS2');
 });
});
