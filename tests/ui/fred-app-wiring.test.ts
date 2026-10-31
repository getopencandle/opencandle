// FRED App hookup. FRED ids are offered in Symbol search and Compare,
// a chosen series loads on demand (cache first) through the actual App openFred body and becomes the chart source, a saved
// FRED chart survives save and restore as a ref and reopens through the actual App reopenLiveEntries body (never through the
// live feed opener), Data sources gets the FRED cache section, and FRED charts stay at 1D. No network: the bridge is a mock.
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {afterEach,expect,it,vi} from 'vitest';
import {buildSymbolSearchCandidates} from '../../src/ui/symbol-search';
import {fredSearchDatasets,FRED_PROVIDER_ID,FRED_RESOLUTION} from '../../src/domain/fred';
import {openFredSymbol,reopenFredCharts,persistableWorkspace,reconnectLiveCharts} from '../../src/ui/live-workspace';
import {clearLiveDatasets,liveDatasetById} from '../../src/ui/live-registry';
import {patchWorkspace,selectedDataset} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {comparisonLoadable} from '../../src/ui/ComparisonDialog';

const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const section=(from:string,to:string)=>{const a=app.indexOf(from),b=app.indexOf(to,a+from.length);if(a<0||b<a)throw Error('App source boundary missing: '+from);return app.slice(a,b);};
const ID='fred:fred-public:DGS10:1D',day=(d:string)=>Date.parse(d+'T00:00:00Z')/1000;
const rows:Array<[number,number]>=[[day('2026-01-02'),4.1],[day('2026-01-05'),4.2],[day('2026-01-06'),4.15]];
const lv=()=>({fetchFredSeries:vi.fn(async(input:{series:string})=>({ok:true as const,value:{schemaVersion:1 as const,series:input.series,rows,fetchedAt:1,cached:false,stale:false}}))});
afterEach(()=>{clearLiveDatasets();vi.unstubAllGlobals();});

function appBodies(scope:Record<string,unknown>){
 const source=section(' function openFred(',' /** LIVE: open a feed on the active chart');
 const keys=Object.keys(scope);
 return Function('scope',stripTypeScriptTypes(`const {${keys.join(',')}}=scope;let fredOpenToken=null;${source}`,{mode:'transform'})+'\nreturn{openFred,reopenLiveEntries};')(scope) as {openFred(series:string):void;reopenLiveEntries(entries:unknown[],fred?:unknown[]):void};
}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();await new Promise(r=>setTimeout(r,0));};

it('typed FRED rows are openable in Symbol search and loadable in Compare before download',()=>{
 const raw=buildSymbolSearchCandidates(fredSearchDatasets('FRED:DGS'),[]);
 expect(raw.length).toBeGreaterThan(0);expect(raw.every(row=>row.providerId===FRED_PROVIDER_ID&&row.resolution==='1D')).toBe(true);
 const rows=Function('buildSymbolSearchCandidates','fredSearchDatasets',stripTypeScriptTypes(section('function fredCandidates(','\n/** The newest FRED open request'),{mode:'transform'})+';return fredCandidates;')(buildSymbolSearchCandidates,fredSearchDatasets)('FRED:DGS10');
 expect(rows[0]).toMatchObject({symbol:'DGS10',datasetId:ID,sourceId:ID,openable:true});expect(comparisonLoadable(rows[0])).toBe(true);
 expect(app.match(/\.\.\.fredCandidates\(query\)\]/g)).toHaveLength(2);// Symbol search and Compare
});

it('actual App openFred opens FRED:DGS10, and the saved chart restores as a ref that reopens through the cache',async()=>{
 const bridge=lv();vi.stubGlobal('window',{lv:bridge});
 let workspace=createInitialWorkspace();const messages:string[]=[],attach=vi.fn();
 const scope={current:{get current(){return workspace;}},setMessage:(m:string)=>messages.push(m),setLiveDatasets:vi.fn(),queuedSwitch:{current:null},
  switchSymbol:vi.fn((symbol:string,sourceId:string)=>{workspace=patchWorkspace(workspace,{symbol,sourceId});return true;}),rememberRecentSymbol:vi.fn(),recentStorage:()=>null,
  shortIntervalText:(value:string)=>value,openFredSymbol,reopenFredCharts,fredRemoteOk:true,FRED_PROVIDER_ID,FRED_RESOLUTION,reportFailure:(error:unknown)=>{throw error;},attachLive:attach};
 const bodies=appBodies(scope);
 bodies.openFred('DGS10');await settle();
 expect(bridge.fetchFredSeries).toHaveBeenCalledWith({series:'DGS10'});expect(scope.switchSymbol).toHaveBeenCalledWith('DGS10',ID);
 expect(workspace.sourceId).toBe(ID);expect(selectedDataset(workspace).bars).toHaveLength(3);expect(messages.at(-1)).toBe('Opened FRED:DGS10, 1D.');
 // Save, then a fresh start: the series is not in memory; the ref reopens it and the live feed opener is never used.
 const saved=JSON.parse(JSON.stringify(persistableWorkspace(workspace)));clearLiveDatasets();
 const restored=reconnectLiveCharts(saved,{coinbase:false,alpacaKey:false,fred:true});
 expect(restored.fredReopen?.map(entry=>entry.symbol)).toEqual(['DGS10']);
 bodies.reopenLiveEntries(restored.reopen,restored.fredReopen);await settle();
 expect(attach).not.toHaveBeenCalled();expect(liveDatasetById(ID)?.bars).toHaveLength(3);expect(bridge.fetchFredSeries).toHaveBeenCalledTimes(2);
});

it('App wires Compare, Data sources, startup reopen and the 1D interval guard',()=>{
 expect(app).toContain("if(request.providerId===FRED_PROVIDER_ID){openFred(request.symbol);return true;}");
 expect(app).toContain("loadSymbol={request=>{if(request.providerId===FRED_PROVIDER_ID){const id=fredDatasetId(request.symbol);void openFredSymbol(");
 // The Data sources FRED section also gets the downloads setting (fred:false saved when off).
 expect(app).toContain("fred={surfaceProps('data-sources:fred',{bridge:window.lv?.fredDataStatus&&window.lv.clearFredData?window.lv as unknown as FredCacheBridge:null,enabled:fredRemoteOk,onEnabledChange:enabled=>{const next={...liveChoices};if(enabled)delete next.fred;else next.fred=false;commit({liveData:next});}})}");
 expect(app).toContain("reopenLiveEntries(r.reopen,r.fredReopen);");expect(app).toContain("reopenLiveEntries(built.reopen);");expect(app).toContain("reopenLiveEntries(openedLive.reopen);");
 expect(app.match(/fred:fredRemoteOk\}/g)).toHaveLength(3);// The constant became the fredRemoteOk setting
 expect(app).toContain("if(dataset.provenance.providerId===FRED_PROVIDER_ID&&target!==FRED_RESOLUTION)return{ok:false,message:FRED_INTERVAL_NOTICE};");
 expect(app).toContain("if(dataset.provenance.providerId===FRED_PROVIDER_ID&&selected.resolution!==FRED_RESOLUTION){setMessage(FRED_INTERVAL_NOTICE);return false;}");
});
