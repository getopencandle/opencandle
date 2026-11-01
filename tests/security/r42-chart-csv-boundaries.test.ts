import {afterEach,it,expect} from 'vitest';
import {captureChartCsvColumns,validatedChartCsvColumns,CHART_CSV_POINT_LIMIT,CHART_CSV_OMITTED_SUFFIX} from '../../src/chart/chart-csv-capture';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {chartSourceCsv} from '../../src/ui/chart-source-export';
import {csvModelFixture} from '../fixtures/r42-csv-model';
import {fixtureDataset} from '../../src/domain/fixtures';
const fixtures:Array<ReturnType<typeof csvModelFixture>>=[];afterEach(()=>{for(const value of fixtures.splice(0))value.dispose();});
const fixture=()=>{const value=csvModelFixture();fixtures.push(value);return value;};
const capture=(f:ReturnType<typeof fixture>,assert=()=>{})=>captureChartCsvColumns(f.chart,f.input,'ordinary',f.inventory(),assert);

it('refuses owner, source execution and frame replacement through the same captured proof',()=>{
 const f=fixture();f.add(0,'SMA',[f.line('SMA',[null,12,13])]);let current=true;const result=capture(f,()=>{if(!current)throw Error('Synthetic owner replaced');});current=false;expect(result.assertCurrent).toThrow('owner replaced');current=true;
 f.setExecution('another-replay');expect(result.assertCurrent).toThrow('changed');f.setExecution('ordinary');f.setRange({from:160,to:400});expect(result.assertCurrent).toThrow('geometry');
});
it('rejects numerical corrections at unchanged times/count and detached accepted native arrays',()=>{
 const f=fixture(),series=f.line('SMA',[null,12,13]),value=f.add(0,'SMA',[series]),result=capture(f);series.points[1].value=900;expect(result.assertCurrent).toThrow('changed');series.points[1].value=12;
 f.data.bars[0].close=99;expect(result.assertCurrent).toThrow('changed');f.data.bars[0].close=10;value.model.series=[series];expect(result.assertCurrent).toThrow('changed');
});
it('cannot acquire copied ports or substituted descriptors, handles, contexts or scene models',()=>{
 const f=fixture(),value=f.add(0,'SMA',[f.line('SMA',[null,12,13])]),result=capture(f),original=value.record.native.descriptor;value.record.native.descriptor={...original};expect(result.assertCurrent).toThrow('changed');value.record.native.descriptor=original;
 const ctx=value.instance.ctx;value.instance.ctx={bars:()=>f.core.bars};expect(result.assertCurrent).toThrow('changed');value.instance.ctx=ctx;value.record.renderHandle={id:'another-model'};expect(result.assertCurrent).toThrow('changed');
});
it('rejects accessor values and sparse/excessive numerical arrays without invoking behavior',()=>{
 let executed=0;const point={time:100,value:1};Object.defineProperty(point,'value',{get(){executed++;return 99;},enumerable:true});expect(()=>validatedChartCsvColumns([{label:'Synthetic',points:[point]}])).toThrow();expect(executed).toBe(0);
 expect(()=>validatedChartCsvColumns([{label:'Synthetic',points:new Array(CHART_CSV_POINT_LIMIT+1)}])).toThrow('bounded');
 const f=fixture(),series=f.line('SMA',[1,2,3]);f.add(0,'SMA',[series]);Object.defineProperty(series.points[1],'value',{get(){executed++;return 99;},enumerable:true});expect(()=>capture(f)).toThrow();expect(executed).toBe(0);
});
it('distinguishes missing or whole-hidden models from legitimate warmup nulls',()=>{
 const f=fixture(),value=f.add(0,'SMA',[f.line('SMA',[null,null,null])]);expect(capture(f).columns[0].points.every(row=>row.value===null)).toBe(true);(value.record as any).model=undefined;expect(()=>capture(f)).toThrow('no accepted current numerical model');
});
it('refuses a configured study absent from the accepted graph rather than silently omitting it',()=>{
 const f=fixture();expect(()=>captureChartCsvColumns(f.chart,f.input,'ordinary',{indicators:['not-yet-mounted'],scripts:[],comparisons:[]},()=>{})).toThrow('still loading or unavailable');
});
it('exports a live comparison on a local chart and reports its provider for the terms line',()=>{
 const f=fixture(),value=f.add(1,'SPY',[f.line('SPY',[0,10,20])]);value.row.dataset.provenance.datasetId='live:synthetic-policy-test';value.row.dataset.provenance.fixture=false;value.row.dataset.provenance.providerName='Synthetic live provider';
 const result=capture(f);expect(result.personalUse).toEqual(['Synthetic live provider']);expect(result.columns[0].label).toMatch(/^Compare SPY/);
 expect(capture(fixture()).personalUse).toBeUndefined();
});
it('refuses request-bearing script and second-symbol study values without accepted dependency permission proof',()=>{
 const f=fixture(),value=f.add(2,'Synthetic request',[f.line('Plot',[1,2,3])]);f.publishScript(value.id,[{id:'dependency',symbol:'SPY',interval:'1D'}],[{id:'plot',title:'Plot'}]);expect(()=>capture(f)).toThrow('accepted export permission');
 // A second-symbol study no longer fails the whole export; its values are still withheld.
 const other=fixture();other.add(0,'Synthetic correlation',[other.line('Correlation',[null,.5,.75])],{kind:'correlation'});const withheld=capture(other);expect(withheld.columns.map(row=>[row.label,row.points.length])).toEqual([[catalogDefinition('correlation')!.name+CHART_CSV_OMITTED_SUFFIX,0]]);expect(withheld.omitted).toEqual([catalogDefinition('correlation')!.name]);expect(chartSourceCsv(other.input,'ordinary',withheld.columns,withheld.assertCurrent)).not.toMatch(/0\.75/);
});
it('refuses a reloading script whose descriptive plots outlive its cleared accepted output',()=>{
 const f=fixture(),value=f.add(2,'Synthetic script',[]);f.publishScript(value.id,[],[{id:'previous',title:'Previous result'}]);expect(()=>capture(f)).toThrow('results are updating');
});
it('refuses an unaffordable million-row source before native access or numerical proof allocation',()=>{
 const f=fixture();f.add(0,'SMA',[f.line('SMA',[1,2,3])]);const bars=new Array(1000000);for(let i=0;i<2000;i++)bars[i]={time:i,open:1,high:2,low:0,close:1,volume:1};
 let tail=0,native=0;Object.defineProperty(bars,'2000',{get(){tail++;throw Error('Unaffordable tail visited');},enumerable:true});f.input.bars=bars;f.input.source={...f.input.source,label:'界'.repeat(4000)};f.chart.nativeRenderer=()=>{native++;throw Error('Native model touched before source admission');};
 expect(()=>capture(f)).toThrow('20 MiB');expect(tail).toBe(0);expect(native).toBe(0);
});
it('revalidates changed request permission metadata and native declarations before transport',()=>{
 const f=fixture(),value=f.add(2,'Synthetic script',[f.line('Plot',[1,2,3])]),result=capture(f);f.publishScript(value.id,[{id:'dependency',symbol:'SPY',interval:'1D'}]);expect(result.assertCurrent).toThrow('changed');
 const other=fixture(),script=other.add(2,'Synthetic script',[other.line('Plot',[1,2,3])]),captured=capture(other);script.instance.result.declarations={requests:[{id:'new-dependency',symbol:'SPY',interval:'1D'}]};expect(captured.assertCurrent).toThrow('changed');
});
it('refuses a retained model during pending native inputs or failed accepted-input recovery',()=>{
 const f=fixture(),value=f.add(0,'SMA',[f.line('SMA',[null,12,13])]),result=capture(f);Object.assign(value.record,{pendingStructural:true});expect(result.assertCurrent).toThrow('changed');Object.assign(value.record,{pendingStructural:false,loading:true});expect(()=>capture(f)).toThrow('changed');Object.assign(value.record,{loading:false});value.instance.recoveryError=Error('Synthetic input recovery failed');expect(()=>capture(f)).toThrow('changed');
});
it('refuses a prior-job result re-emitted under new native bars before script recalculation',()=>{
 const f=fixture(),value=f.add(2,'Synthetic script',[f.line('Plot',[1,2,3])]);expect(capture(f).columns[0].points[1].value).toBe(2);
 // A legitimate same-count correction changes source/frame/native bars while the old script result still paints.
 f.data.bars[1].close=13.5;f.core.bars=f.data.bars.map(row=>({...row,time:row.time*1000}));
 expect(value.instance.ctx.bars()).toBe(f.core.bars);expect(()=>capture(f)).toThrow('accepted calculation input');
});
it('refuses accepted profile, finer and daily-history values on a local primary without consumed-feed permission proof',()=>{
 const history=fixtureDataset('GME',3);history.provenance.datasetId='live:synthetic-policy-history';history.bars=history.bars.map((row,index)=>({...row,close:2000+index}));
 for(const kind of ['vrvp','updownvolume','w52hl']){
  const f=fixture();expect(f.input.source.datasetId.startsWith('live:')).toBe(false);expect(history.instrument.id).toBe(f.data.instrument.id);
  // These literal accepted native values represent an external history the chart already consumed. No feed is opened.
  f.add(0,'Synthetic history-fed study',[f.line('Accepted history values',history.bars.map(row=>row.close))],{kind});
  // The export proceeds, but the study's accepted values are withheld (empty column).
  const result=capture(f),text=chartSourceCsv(f.input,'ordinary',result.columns,result.assertCurrent);
  expect(result.columns.length,kind).toBe(1);expect(result.columns[0].label.endsWith(CHART_CSV_OMITTED_SUFFIX),kind).toBe(true);expect(result.columns[0].points,kind).toEqual([]);
  expect(text,kind).not.toMatch(/200[012]/);expect(result.omitted?.length,kind).toBe(1);
 }
 const viewport=fixture();viewport.add(0,'Visible average',[viewport.line('Accepted viewport mean',[null,12,13])],{kind:'visibleavg'});expect(capture(viewport).columns[0].points[2].value).toBe(13);
});
