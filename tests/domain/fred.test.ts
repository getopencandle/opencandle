import {describe,expect,it,vi} from 'vitest';
import {FRED_POPULAR,fredBars,fredSearch,fredSearchDatasets,loadFredDataset,parseFredSymbol,fredDataset} from '../../src/domain/fred';
import {PROVIDER_REGISTRY,providerRecord,validateProviderRegistry} from '../../src/domain/provider-capabilities';
import {dataSourceRecords,DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {describeFredCache} from '../../src/ui/FredCacheSection';

// No network; the bridge is a mock.
const row=(d:string,v:number):[number,number]=>[Date.parse(d+'T00:00:00Z')/1000,v];
describe('FRED symbols and search',()=>{
  it('parses FRED:<id>, known bare ids, rejects the rest',()=>{
    expect(parseFredSymbol('FRED:dgs10')).toEqual({series:'DGS10'});
    expect(parseFredSymbol('DGS2')).toEqual({series:'DGS2'});
    expect(parseFredSymbol('FRED:ZZTOP1')).toEqual({series:'ZZTOP1'});
    expect(parseFredSymbol('AAPL')).toBeNull();expect(parseFredSymbol('FRED:')).toBeNull();expect(parseFredSymbol('FRED:A/B')).toBeNull();
  });
  it('lists popular series for the prefix and offers an exact unlisted id',()=>{
    expect(fredSearch('FRED:').map(r=>r.id)).toEqual(expect.arrayContaining(['DGS10','DGS2','T10Y2Y','CPIAUCSL','UNRATE','FEDFUNDS']));
    expect(fredSearch('FRED:DGS').every(r=>r.id.includes('DGS'))).toBe(true);
    expect(fredSearch('FRED:QQQQ1')[0].id).toBe('QQQQ1');
    expect(fredSearch('x')).toEqual([]);expect(fredSearch('unemploy').map(r=>r.id)).toContain('UNRATE');
    expect(FRED_POPULAR.every(r=>r.description.length>10)).toBe(true);
  });
  it('search datasets are empty shells and off when disabled',()=>{
    const sets=fredSearchDatasets('FRED:');expect(sets.length).toBeGreaterThan(5);
    expect(sets.every(d=>d.bars.length===0&&d.resolution==='1D'&&d.instrument.id.startsWith('FRED:'))).toBe(true);
    expect(fredSearchDatasets('FRED:',false)).toEqual([]);
  });
});
describe('FRED bars and loading',()=>{
  it('maps a value to flat OHLC with volume 0',()=>{
    expect(fredBars([row('2026-10-05',4.1),row('2026-10-06',-0.2)])).toEqual([{time:row('2026-10-05',0)[0],open:4.1,high:4.1,low:4.1,close:4.1,volume:0},{time:row('2026-10-06',0)[0],open:-0.2,high:-0.2,low:-0.2,close:-0.2,volume:0}]);
    const d=fredDataset('DGS10',fredBars([row('2026-10-05',4.1)]));expect(d.provenance).toMatchObject({providerId:'fred-public',fixture:false,state:'ready'});
  });
  it('loads on demand through the bridge; errors become plain notices; disabled makes no call',async()=>{
    const fetchFredSeries=vi.fn(async(_input:{series:string})=>({ok:true as const,value:{schemaVersion:1 as const,series:'DGS10',rows:[row('2026-10-05',4.1)],fetchedAt:1,cached:false,stale:false}}));
    const r=await loadFredDataset({fetchFredSeries},'FRED:DGS10');expect(r.ok&&r.dataset.bars).toHaveLength(1);expect(fetchFredSeries).toHaveBeenCalledWith({series:'DGS10'});
    expect((await loadFredDataset({fetchFredSeries},'FRED:DGS10',false))).toMatchObject({ok:false,code:'DISABLED'});expect(fetchFredSeries).toHaveBeenCalledTimes(1);
    const missing=await loadFredDataset({fetchFredSeries:async()=>({ok:false as const,error:{code:'FRED_NOT_FOUND',message:'x'}})},'FRED:NOPE');expect(missing).toMatchObject({ok:false,code:'FRED_NOT_FOUND'});expect(!missing.ok&&missing.notice).toMatch(/no series named NOPE/);
    const off=await loadFredDataset({fetchFredSeries:async()=>({ok:false as const,error:{code:'FRED_OFFLINE',message:'x'}})},'FRED:DGS2');expect(!off.ok&&off.notice).toMatch(/could not be reached/);
    const stale=await loadFredDataset({fetchFredSeries:async()=>({schemaVersion:1 as const,series:'DGS2',rows:[row('2026-10-05',3.9)],fetchedAt:1,cached:true,stale:true,notice:'offline'})},'DGS2');expect(stale.ok&&stale.dataset.provenance.state).toBe('stale');expect(stale.ok&&stale.notice).toMatch(/saved copy/);
    expect(await loadFredDataset(null,'FRED:DGS10')).toMatchObject({ok:false,code:'NO_BRIDGE'});
    expect(await loadFredDataset({fetchFredSeries},'AAPL')).toMatchObject({ok:false,code:'INVALID_ARGUMENT'});
  });
});
describe('FRED registry and settings',()=>{
  it('is registered as 1D only, keyless, no stream, and the registry stays valid',()=>{
    const rec=providerRecord('fred-public')!;expect(rec).toBeTruthy();
    expect(rec.capabilities).toMatchObject({resolutions:['1D'],streaming:false,requiresKey:false,redistributable:false});expect(rec.access).toBe('public-unauthenticated');
    expect(validateProviderRegistry()).toEqual([]);expect(PROVIDER_REGISTRY.length).toBeGreaterThan(7);
    expect(dataSourceRecords().some(r=>r.capabilities.id==='fred-public')).toBe(true);
  });
  it('describes the cache size; the panel accepts the fred section',()=>{
    expect(describeFredCache({schemaVersion:1,bytes:2048,entries:2,maxBytes:5*1024*1024},true)).toBe('2 KB of 5 MB used, 2 series');
    expect(describeFredCache(null,false)).toMatch(/desktop app/);expect(typeof DataSourcesPanel).toBe('function');
  });
});
