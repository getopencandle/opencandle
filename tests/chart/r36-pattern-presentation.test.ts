// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {alertDatasetWithPrefix} from '../../src/domain/alert-observation';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {selectorView} from '../../src/domain/indicator-selector-catalog';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {PATTERN_INDICATOR_IDS} from '../../src/domain/indicators-ext/patterns-catalog';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {IndicatorId} from '../../src/domain/indicators';

// Pattern markers on the chart, the "pattern appeared" alert path and the Patterns tab. SYNTHETIC bars only.
type C=[number,number,number,number];
const D0=19700*86400;
const toBars=(rows:readonly C[]):Bar[]=>rows.map(([open,high,low,close],i)=>({time:D0+i*86400,open,high,low,close,volume:100}));
const FILLER:C=[100,101.5,99.5,101];
// Bars 0..19 filler; 20-21 a bullish engulfing (signal on 21); 21-22 a bearish engulfing (signal on 22).
const bars=toBars([...Array.from({length:20},()=>FILLER),[101,101.2,99.8,100],[99.9,101.4,99.8,101.3],[101.4,101.5,99.6,99.8]]);
const settings=(kind:IndicatorId,inputs:Record<string,unknown>={},plots:IndicatorInstanceSettings['plots']={}):IndicatorInstanceSettings=>({id:'p1',kind,inputs:{...indicatorDefaults[kind],...inputs} as never,plots,offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});

describe(' pattern markers on the chart (SYNTHETIC)',()=>{
 it('signals are not stroked; each detection is a labelled marker below (bullish) or above (bearish) its bar',()=>{
  const row=settings('cdlengulfingbull',{trendRule:'No detection',patternType:'Both'}),result=calculateIndicator(row.kind,bars,row.inputs);
  const {output,diagnostics}=renderIndicatorPresentation(row,result,bars,{resolution:'1D'});
  expect(diagnostics).toEqual([]);
  expect(output.series!.map(series=>[series.title,series.visible,series.display?.pane,series.display?.priceScale])).toEqual([['Bullish',false,false,false],['Bearish',false,false,false]]);
  expect(output.labels!.map(label=>({x:label.x,yloc:label.yloc,style:label.style,text:label.text,tooltip:label.tooltip,color:label.color}))).toEqual([
   {x:bars[21].time*1000,yloc:'belowbar',style:'label_up',text:'EG',tooltip:'Bullish engulfing',color:'#089981'},
   {x:bars[22].time*1000,yloc:'abovebar',style:'label_down',text:'EG',tooltip:'Bearish engulfing',color:'#f23645'},
  ]);
  expect(output.lines).toBeUndefined();
 });
 it('the Style tab color recolors markers and a hidden plot hides them',()=>{
  const style={visible:false,color:'#123456',width:1,lineStyle:'solid' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true};
  const row=settings('cdlengulfingbull',{trendRule:'No detection',patternType:'Both'},{bullish:{...style,visible:true},bearish:style});
  const {output}=renderIndicatorPresentation(row,calculateIndicator(row.kind,bars,row.inputs),bars,{resolution:'1D'});
  expect(output.labels!.map(label=>[label.text,label.color])).toEqual([['EG','#123456']]);
 });
 it('chart patterns add their boundary lines as bar-time segments',()=>{
  const turns=[100,120,110,120.3,105],closes=[turns[0]];for(let k=1;k<turns.length;k++)for(let s=1;s<=8;s++)closes.push(turns[k-1]+(turns[k]-turns[k-1])*s/8);
  const path=closes.map((close,i)=>({time:D0+i*86400,open:close,high:close+0.5,low:close-0.5,close,volume:1}));
  const row=settings('chpdoubletop'),{output}=renderIndicatorPresentation(row,calculateIndicator(row.kind,path,row.inputs),path,{resolution:'1D'});
  expect(output.labels!.map(label=>[label.text,label.x,label.yloc])).toEqual([['Double top',path[24].time*1000,'abovebar']]);
  // Zigzag A-B and B-C, then the neckline at the low 109.5 from B to the breakout bar 30 (0.8.1: new instances require
  // breakout confirmation; the first close below 109.5 is bar 30, close 108.825).
  expect(output.lines!.map(line=>[line.x1/1000,line.y1,line.x2/1000,line.y2])).toEqual([[path[8].time,120.5,path[16].time,109.5],[path[16].time,109.5,path[24].time,120.8],[path[16].time,109.5,path[30].time,109.5]]);
  // Without confirmation (instances saved before 0.8.1) the neckline ends on the bar confirming the last pivot, 29.
  const legacy=renderIndicatorPresentation(row,calculateIndicator(row.kind,path,{...row.inputs,breakout:false}),path,{resolution:'1D'}).output;
  expect(legacy.lines!.at(-1)!.x2/1000).toBe(path[29].time);
 });
});

describe(' "pattern appeared" alerts (SYNTHETIC)',()=>{
 it('the frozen indicator source reads 1 on the bar a pattern appears and 0 otherwise',async()=>{
  const source=captureIndicatorAlertSource(settings('cdlengulfingbull',{trendRule:'No detection'}),'bullish','standard','snap-1'),key=technicalSourceKey(source);
  const at=async(end:number)=>(await evaluateTechnicalAlertSources(bars.slice(0,end),[source],'USD')).results.get(key)!.sample.value;
  expect([await at(21),await at(22),await at(23)]).toEqual([0,1,0]);
 });
 it('the alert dialog offers each signal plot as "pattern appeared", preset to Greater than 0',()=>{
  const dataset:BarDataset={instrument:{id:'inst-synth',symbol:'SYN',name:'Synthetic',exchange:'LV',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'} as BarDataset['instrument'],bars,resolution:'1D',
   provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:'synthetic:SYN:1D',fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
  const pattern={...settings('cdlhammer'),id:'pat-1',paneId:'price'},sma={...settings('sma'),id:'sma-1',paneId:'price'};
  const chart={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[pattern,sma]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:{}} as any;
  const rows=new TechnicalAlertCatalog((()=>{let n=0;return()=>'snapshot-'+(++n);})()).capture(chart,dataset,bars,[]).filter(row=>row.id.startsWith('indicator:'));
  const hammer=rows.filter(row=>row.id.startsWith('indicator:pat-1:'));
  expect(hammer.map(row=>[row.id,row.scriptSignal])).toEqual([['indicator:pat-1:bullish',true],['indicator:pat-1:bearish',true]]);
  expect(hammer[0].label).toBe('Hammer (bullish): pattern appeared');expect(hammer[0].source).toMatchObject({kind:'indicator',indicator:'cdlhammer',plotId:'bullish',inputs:{trendRule:'SMA50',patternType:'Bullish'}});
  expect(rows.find(row=>row.id==='indicator:sma-1:sma')!.scriptSignal).toBeUndefined();
 });
});

describe(' Patterns tab (SYNTHETIC)',()=>{
 const source={indicators:INDICATOR_KINDS.map(kind=>({id:kind,name:indicatorNames[kind],acronym:kind})),scripts:[]};
 it('lists chart patterns then candlestick patterns under the captured section titles',()=>{
  const view=selectorView(source,{item:'built-ins',tab:'patterns',query:''});
  expect(view.empty).toBeNull();expect(view.columnHeaders).toEqual([]);
  const sections=[...new Set(view.entries.map(row=>row.section))];expect(sections).toEqual(['Chart patterns','Candlestick patterns']);
  const chart=view.entries.filter(row=>row.section==='Chart patterns').map(row=>row.label),candles=view.entries.filter(row=>row.section==='Candlestick patterns').map(row=>row.label);
  // the recorded facts, without the entries OpenCandle does not detect (Elliott wave, Auto trend detector). added flags, pennants and cups.
  expect(chart).toEqual(['All chart patterns','Bearish flag chart pattern','Bullish flag chart pattern','Cup and handle chart pattern','Inverted cup and handle chart pattern','Double bottom chart pattern','Double top chart pattern','Head and shoulders chart pattern','Inverted head and shoulders chart pattern','Bearish pennant chart pattern','Bullish pennant chart pattern','Rectangle chart pattern','Triangle chart pattern','Triple bottom chart pattern','Triple top chart pattern','Falling wedge chart pattern','Rising wedge chart pattern']);
  // The captured candlestick rows, in captured order, are the first 14 of OpenCandle's alphabetical list.
  expect(candles.slice(0,14)).toEqual(['Abandoned baby (bearish)','Abandoned baby (bullish)','All candlestick patterns','Dark cloud cover (bearish)','Doji (neutral)','Doji star (bearish)','Doji star (bullish)','Downside Tasuki gap (bearish)','Dragonfly Doji (bullish)','Engulfing (bearish)','Engulfing (bullish)','Evening Doji star (bearish)','Evening star (bearish)','Falling three methods (bearish)']);
  expect(candles).toHaveLength(45);
 });
 it('search filters within both sections; pattern kinds leave the Indicators tab',()=>{
  expect(selectorView(source,{item:'built-ins',tab:'patterns',query:'engulfing'}).entries.map(row=>row.id)).toEqual(['cdlengulfingbear','cdlengulfingbull']);
  expect(selectorView(source,{item:'built-ins',tab:'patterns',query:'zzzz'}).empty).toEqual({kind:'no-match'});
  const indicators=selectorView(source,{item:'built-ins',tab:'indicators',query:''}).entries.map(row=>row.id);
  for(const id of PATTERN_INDICATOR_IDS)expect(indicators).not.toContain(id);
  expect(selectorView({indicators:[],scripts:[]},{item:'built-ins',tab:'patterns',query:''}).empty).toEqual({kind:'empty',text:'OpenCandle has no pattern indicators yet.'});
 });
});
