import {afterEach,expect,it} from 'vitest';
import {datasetSourceTag,sourceContextTag,syntheticSuffix,sourceCoverageNote} from '../../src/domain/source-tag';
import {sourceOptionLabel} from '../../src/domain/data-setup';
import {SymbolMathProvider,symbolMathDatasetId,symbolMathPlaceholder} from '../../src/domain/symbol-math-live';
import {selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {comparisonSourceTag} from '../../src/chart/compare-port';
import type {LiveHandle} from '../../src/domain/live-provider';
import type {BarDataset} from '../../src/domain/types';

// The shared short source tag. Mock feeds, SYNTHETIC bars, no network, no key.
function feed(symbol:string,providerId='alpaca-iex',providerName='Alpaca Market Data (owner key, Basic plan)'):LiveHandle{
 const dataset={instrument:{id:'US:'+symbol,symbol,name:symbol,exchange:'US',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:[{time:86400,open:2,high:2,low:2,close:2,volume:1}],resolution:'1D',
  provenance:{providerId,providerName,datasetId:`live:${providerId}:${symbol}:1D`,fixture:false,coverage:'c',asOf:1,delaySeconds:0,adjustment:'split-adjusted',session:'unknown',timezone:'America/New_York',state:'ready',license:'L',revision:'r',notes:[]}} as BarDataset;
 return{datasetId:dataset.provenance.datasetId,dataset:()=>dataset,formingTime:()=>null,onChange:()=>()=>{},close:()=>{}};
}
afterEach(()=>selectAlpacaSyntheticStub(false));

it('derived feeds are DERIVED (real key) or SYNTHETIC DERIVED (stub), from the provider, a stand-in, or an export context',()=>{
 const real=new SymbolMathProvider(symbol=>feed(symbol)).open('GME/SPY','1D');
 expect(datasetSourceTag(real.dataset())).toBe('DERIVED');
 expect(sourceOptionLabel(real.dataset())).toBe('GME/SPY |  1D |  DERIVED');
 expect(syntheticSuffix(real.dataset().provenance,' · SYNTHETIC DEMO')).toBe('');
 expect(sourceCoverageNote(real.dataset().provenance)).toBe(real.dataset().provenance.coverage);
 real.close();
 selectAlpacaSyntheticStub(true);
 const stub=new SymbolMathProvider(symbol=>feed(symbol,'alpaca-stub','SYNTHETIC Alpaca stub (invented prices)')).open('GME/SPY','1D');
 const p=stub.dataset().provenance;
 expect(datasetSourceTag(stub.dataset())).toBe('SYNTHETIC DERIVED');
 expect(sourceOptionLabel(stub.dataset())).toBe('GME/SPY |  1D |  SYNTHETIC DERIVED');
 expect(syntheticSuffix(p,' · SYNTHETIC DEMO')).toBe(' · SYNTHETIC DERIVED');
 expect(sourceCoverageNote(p)).not.toContain('fixture');
 expect(sourceContextTag({datasetId:p.datasetId,fixture:p.fixture,label:p.providerName})).toBe('SYNTHETIC DERIVED');
 // The comparison tag still says SYNTHETIC for it (unchanged; AGENTS.md labelling).
 expect(comparisonSourceTag(stub.dataset())).toBe('SYNTHETIC');
 stub.close();
 expect(datasetSourceTag(symbolMathPlaceholder('GME/SPY','1D','loading'))).toBe('DERIVED');
 expect(sourceContextTag({datasetId:symbolMathDatasetId('GME/SPY','1D'),fixture:false,label:'Derived: GME/SPY from Alpaca'})).toBe('DERIVED');
});
it('every other source keeps the comparison words: SYNTHETIC, DELAYED, LIVE, LOCAL IMPORT; fixture suffixes unchanged',()=>{
 const base=feed('GME').dataset();
 const cases:Array<[Partial<BarDataset['provenance']>,string]>=[
  [{},'LIVE'],[{providerId:'alpaca-stub',datasetId:'live:alpaca-stub:GME:1D',providerName:'SYNTHETIC Alpaca stub (invented prices)'},'SYNTHETIC'],
  [{providerId:'alpaca-sip-delayed',datasetId:'alpaca-sip-delayed:GME:1D'},'DELAYED'],[{providerId:'coinbase-public',datasetId:'live:coinbase-public:BTC-USD:5m'},'LIVE'],
  [{providerId:'local-import',providerName:'Local import',datasetId:'import:GME'},'LOCAL IMPORT'],[{providerId:'lv-fixture',datasetId:'lv-fixture:GME',fixture:true},'SYNTHETIC'],
 ];
 for(const [patch,tag] of cases){const dataset={...base,provenance:{...base.provenance,...patch}} as BarDataset;expect(datasetSourceTag(dataset),JSON.stringify(patch)).toBe(tag);expect(datasetSourceTag(dataset)).toBe(comparisonSourceTag(dataset));}
 const fixture={...base.provenance,providerId:'lv-fixture',datasetId:'lv-fixture:GME',fixture:true};
 expect(syntheticSuffix(fixture,' · SYNTHETIC DEMO')).toBe(' · SYNTHETIC DEMO');expect(syntheticSuffix(base.provenance,' · SYNTHETIC DEMO')).toBe('');
 expect(sourceCoverageNote(fixture)).toBe('synthetic fixture');expect(sourceCoverageNote(base.provenance)).toBe('c');
 // An import row keeps importSourceLabel (range and provider name).
 const imported={...base,provenance:{...base.provenance,providerId:'local-import',providerName:'Local import',datasetId:'import:GME'}} as BarDataset;
 expect(sourceOptionLabel(imported)).toMatch(/^GME \| 1D \| LOCAL IMPORT \| .* \| Local import$/);
});
