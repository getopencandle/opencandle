import {afterEach,describe,expect,it,vi} from 'vitest';
import {clearLiveDatasets,liveDatasetById} from '../../src/ui/live-registry';
import {persistableWorkspace,reconnectLiveCharts,openFredSymbol,reopenFredCharts} from '../../src/ui/live-workspace';
import {patchWorkspace,selectedDataset} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {fredBars,fredDataset,fredDatasetId} from '../../src/domain/fred';
import {chartHeadingLabels} from '../../src/ui/chart-heading-label';
import {datasetSourceTag,sourceContextTag} from '../../src/domain/source-tag';
import {createAlertObservationSession,observeAlertSnapshot} from '../../src/domain/alert-observation';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

// No network: the FRED bridge is a mock. WALCL is a real FRED id outside the
// built-in popular list; the values below are SYNTHETIC.
const day=(d:string)=>Date.parse(d+'T00:00:00Z')/1000;
const rows:Array<[number,number]>=[[day('2026-01-07'),6800],[day('2026-01-14'),6810],[day('2026-01-21'),6795]];
const ok=()=>({fetchFredSeries:vi.fn(async(input:{series:string})=>({ok:true as const,value:{schemaVersion:1 as const,series:input.series,rows,fetchedAt:1,cached:true,stale:false}}))});
const avail={coinbase:false,alpacaKey:false};
const WALCL=fredDatasetId('WALCL');
afterEach(()=>clearLiveDatasets());

describe('a saved FRED series outside the popular list reopens (item 1)',()=>{
 it('main chart: WALCL reloads through the bridge with its own dataset id',async()=>{
  expect((await openFredSymbol(ok(),'FRED:WALCL')).dataset).not.toBeNull();
  const ws=patchWorkspace(createInitialWorkspace(),{symbol:'WALCL',sourceId:WALCL}),saved=JSON.parse(JSON.stringify(persistableWorkspace(ws)));clearLiveDatasets();
  const r=reconnectLiveCharts(saved,avail);expect(r.fredReopen?.map(e=>e.symbol)).toEqual(['WALCL']);
  const b=ok();expect(await reopenFredCharts(b,r.fredReopen!)).toEqual([]);
  expect(b.fetchFredSeries).toHaveBeenCalledWith({series:'WALCL'});
  expect(liveDatasetById(WALCL)?.bars).toHaveLength(3);expect(selectedDataset(r.workspace).bars).toHaveLength(3);
 });
 it('Compare: a WALCL comparison reloads too',async()=>{
  await openFredSymbol(ok(),'FRED:DGS10');const main=fredDatasetId('DGS10');
  const ws=patchWorkspace(createInitialWorkspace(),{symbol:'DGS10',sourceId:main}),cell=ws.grid.layout.activeCellId;
  const cmp=await openFredSymbol(ok(),'FRED:WALCL');
  const withCmp={...ws,grid:{...ws.grid,cells:{...ws.grid.cells,[cell]:{...ws.grid.cells[cell],comparisons:[{id:'c1',datasetId:cmp.dataset!.provenance.datasetId,mode:'absolute' as const,color:'#fff',width:1,visible:true,baseline:'first-visible-match' as const}]}}}};
  const saved=JSON.parse(JSON.stringify(persistableWorkspace(withCmp)));clearLiveDatasets();
  const r=reconnectLiveCharts(saved,avail);expect(r.fredReopen?.map(e=>e.symbol)).toContain('WALCL');
  const b=ok();expect(await reopenFredCharts(b,r.fredReopen!)).toEqual([]);
  expect(b.fetchFredSeries).toHaveBeenCalledWith({series:'WALCL'});expect(liveDatasetById(WALCL)?.bars).toHaveLength(3);
 });
});
describe('FRED provenance labels (item 3)',()=>{
 const loaded=fredDataset('DGS10',fredBars(rows));
 it('heading: FRED badge and an honest status, never LOCAL IMPORT or LIVE',()=>{
  const ready=chartHeadingLabels(loaded.provenance,3);
  expect(ready.badge).toBe('FRED');expect(ready.title).toBe('FRED economic data, daily, updated on open · 3 bars · raw adjustment; all session · Updated on open');
  expect(chartHeadingLabels({...loaded.provenance,state:'stale'},3).badge).toBe('FRED · SAVED COPY');
  expect(chartHeadingLabels({...loaded.provenance,state:'loading'},0).badge).toBe('FRED · LOADING');
  expect(chartHeadingLabels({...loaded.provenance,state:'disconnected'},0).badge).toBe('FRED · NOT LOADED');
  for(const state of ['ready','stale','loading','disconnected'] as const){const text=JSON.stringify(chartHeadingLabels({...loaded.provenance,state},3));expect(text).not.toMatch(/LOCAL IMPORT|Local import|No live connection|LIVE|Live data|—/);}
 });
 it('source tag: FRED, from the provenance or the dataset id alone',()=>{
  expect(datasetSourceTag(loaded)).toBe('FRED');
  expect(sourceContextTag({datasetId:fredDatasetId('DGS10'),fixture:false,label:'DGS10'})).toBe('FRED');
  expect(sourceContextTag({datasetId:'live:coinbase-public:BTC-USD:1m',fixture:false,label:'BTC-USD'})).toBe('LIVE');
 });
});
describe('alerts on FRED (items 5 and 7)',()=>{
 it('a revised FRED history is a correction, like an import refresh',()=>{
  const first=fredDataset('CPIAUCSL',fredBars(rows)),now=Date.UTC(2026,9,28)/1000;
  const s0=createAlertObservationSession(first,{sessionId:'s',mode:'ordinary',startedAt:now});
  const a=observeAlertSnapshot(s0,{dataset:first,observedAt:now});expect(a.event?.observation?.correction).toBe(false);
  const revised=fredDataset('CPIAUCSL',fredBars([rows[0],[rows[1][0],6812],rows[2]]));revised.provenance.revision='fred-v1:revised';
  const b=observeAlertSnapshot(a.session,{dataset:revised,observedAt:now+60});
  expect(b.event?.observation?.correction).toBe(true);expect(b.diagnostics[0]).toMatch(/Source correction observed/);
 });
 it('a saved CCI without maType captures its effective smoothing (None), a new one keeps its own',()=>{
  const base=factoryIndicatorDefault('cci') as {inputs:Record<string,unknown>};
  const legacy={...base,id:'cci-old',kind:'cci',inputs:{...base.inputs}};delete legacy.inputs.maType;delete legacy.inputs.maLength;delete legacy.inputs.bbMult;
  expect(captureIndicatorAlertSource(legacy as never,'cci','standard','s').inputs.maType).toBe('None');
  const fresh={...base,id:'cci-new',kind:'cci'};
  expect(captureIndicatorAlertSource(fresh as never,'cci','standard','s').inputs.maType).toBe(base.inputs.maType);
 });
});
