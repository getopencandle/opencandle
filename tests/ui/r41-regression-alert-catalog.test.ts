import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {alertDatasetWithPrefix,alertDatasetKey} from '../../src/domain/alert-observation';
import {technicalSourceKey,evaluateTechnicalAlertSources} from '../../src/domain/technical-alerts';

// SYNTHETIC catalog-handler evidence, not packaged UI. No renderer hooks or fixture state are injected into an app.
const T=1767225600,D=86400;
const data=(values=[10,14,12])=>({...fixtureDataset('GME',3),bars:values.map((close,i)=>({time:T+i*D,open:close,high:close+1,low:close-1,close,volume:1}))});
const drawing=(id='hidden-internal-key',first=0)=>({id,type:'regressionchannel',paneId:'price',anchors:[{time:(T+first*D)*1000,price:1},{time:(T+10*D)*1000,price:1}]});
function choices(catalog:TechnicalAlertCatalog,dataset=data(),drawings=[drawing()]){
 const bars=dataset.bars,chart={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[]},saveDrawings:()=>({drawings}),getChartOptions:()=>({scale:'linear'}),scripts:{}} as any;
 return catalog.capture(chart,dataset,bars,[]).filter(row=>row.id.startsWith('drawing:'));
}
const catalog=()=>{let counter=0;return new TechnicalAlertCatalog(()=> 'synthetic-capture-'+ ++counter);};
describe(' regression drawing source labels and identity',()=>{
 it('offers channel conditions with readable duplicate names, never the internal drawing keys',()=>{
  const rows=choices(catalog(),data(),[drawing('hidden-a'),drawing('hidden-b')]);
  expect(rows.map(row=>row.label)).toEqual(['Regression trend 1: close in the channel','Regression trend 2: close in the channel']);
  for(const row of rows){expect(row.source).not.toBeNull();expect(row.drawingShape).toBe('channel');expect(row.label).not.toMatch(/hidden-[ab]/);}
 });
 it('keeps the followed source identity as fitting bars arrive while evaluation refits current prices',async()=>{
  const owner=catalog(),first=choices(owner)[0].source!,grown=data([10,14,12,15]),next=choices(owner,grown)[0].source!;
  expect(technicalSourceKey(next)).toBe(technicalSourceKey(first));
  const batch=await evaluateTechnicalAlertSources(grown.bars,[next],'USD',{sourceBasis:alertDatasetKey(grown,2),sourceRevision:grown.provenance.revision,drawings:[drawing()]});
  expect(batch.results.get(technicalSourceKey(next))!.sample.value).toBeCloseTo(.5+.3/(2*Math.sqrt(6.3)),12);
 });
 it('remove/move/undo and fresh catalog restoration use current fitting data rather than old cached coefficients',async()=>{
  const owner=catalog(),grown=data([10,14,12,15]),initial=choices(owner)[0].source!;
  expect(choices(owner,grown,[])).toEqual([]);
  const moved=choices(owner,grown,[drawing('hidden-internal-key',1)])[0].source!;
  expect(technicalSourceKey(moved)).not.toBe(technicalSourceKey(initial));
  const restored=choices(owner,grown)[0].source!,fresh=choices(catalog(),grown)[0].source!;
  for(const source of [restored,fresh]){
   const batch=await evaluateTechnicalAlertSources(grown.bars,[source],'USD',{sourceBasis:alertDatasetKey(grown,2),sourceRevision:grown.provenance.revision,drawings:[drawing()]});
   expect(batch.results.get(technicalSourceKey(source))!.sample.value).toBeCloseTo(.5+.3/(2*Math.sqrt(6.3)),12);
  }
 });
 it('a renamed drawing keeps its readable label, and a zero-height fit stays explicitly unavailable',()=>{
  const owner=catalog(),named=choices(owner,data(),[{...drawing(),lvName:'Measured channel'} as any])[0];
  expect(named.label).toBe('Measured channel: close in the channel');
  const zero=choices(owner,data([10,11,12]))[0];expect(zero.source).toBeNull();expect(zero.disabledReason).toMatch(/no residual channel height/);expect(zero.label).toBe('Regression trend');
 });
});
