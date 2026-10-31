// SYNTHETIC bars and demo fixtures only.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {makeFixture,DEMO_SYMBOLS} from '../../src/domain/fixtures';
import {zigzagPivots} from '../../src/domain/indicators-ext/r23-catalog';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {rsiDivergenceLabelHeadroom,RSI_DIVERGENCE_LABEL_HEADROOM} from '../../src/chart/indicator-presentation';
import {installTrendlineStatsFold,trendlineInfoFields,trendlineInfoSummary,type TrendlineStatsFoldField} from '../../src/chart/trendline-stats-fold';
import {countText} from '../../src/ui/IndicatorTemplatesDialog';
import {stylePlotTitle,STYLE_TOGGLE_LABELS,STYLE_OPTION_LABELS} from '../../src/ui/IndicatorDialog';
import type {Bar} from '../../src/domain/types';

const DAY=86400;
const flat=(closes:number[]):Bar[]=>closes.map((c,i)=>({time:19700*DAY+i*DAY,open:c,high:c,low:c,close:c,volume:1}));

describe('zig zag depth-blocked legs (row 2)',()=>{
 it('a first leg blocked by Depth turns into the first pivot instead of freezing the zig zag',()=>{
  // 100 -> 90 is a first down swing; 95 and 101 come too soon (Depth 3) to confirm 90, then price runs to 130 and falls back.
  expect(zigzagPivots(flat([100,90,95,101,110,120,130,120,110]),5,3)).toEqual([{index:1,price:90},{index:6,price:130},{index:8,price:110}]);
 });
 it('a later blocked leg lets the previous leg continue: its starting pivot moves to the new extreme',()=>{
  // Pivots 100 (low) and 130 (high); 120 comes too soon after 130 to confirm it, and 135 extends the up leg.
  const pivots=zigzagPivots(flat([100,110,120,130,120,135,140,120,110]),5,2);
  expect(pivots.slice(0,2)).toEqual([{index:0,price:100},{index:6,price:140}]);
 });
 it('no two consecutive pivots share a bar (no vertical final segment) across a deviation/depth sweep',()=>{
  // LONG with (5,8) and (5,9) used to end ...,580,599,599 when blocked() fired on the last bar.
  const LONG:Bar[]=Array.from({length:600},(_,i)=>{const close=100+12*Math.sin(i/9)+4*Math.sin(i/2.3)+(i%7)*0.5;return {time:1600000000+i*DAY,open:close-0.6+(i%3)*0.4,high:close+1.5+(i%4)*0.3,low:close-1.4-(i%5)*0.2,close,volume:1000+(i*37)%400};});
  expect(zigzagPivots(LONG,5,8).map(p=>p.index).slice(-2)).toEqual([580,599]);
  const sets:[string,Bar[]][]=[['LONG',LONG],...DEMO_SYMBOLS.map(symbol=>[symbol,makeFixture(symbol,500)] as [string,Bar[]])];
  for(const [name,bars] of sets)for(const deviation of [1,2,3,5,7.5,10])for(let depth=1;depth<=15;depth++){
   const indices=zigzagPivots(bars,deviation,depth).map(p=>p.index);
   for(let k=1;k<indices.length;k++)expect(indices[k],`${name} ${deviation}/${depth} #${k}`).toBeGreaterThan(indices[k-1]);
  }
 });
 it('Auto pitchfork draws on every demo symbol with its defaults (Deviation 3, Depth 10)',()=>{
  for(const symbol of DEMO_SYMBOLS){
   const result=calculateIndicator('autopitchfork' as IndicatorId,makeFixture(symbol,500),{deviation:3,depth:10} as never);
   for(const id of ['median','upper','lower'])expect(Number.isFinite(result.series.find(row=>row.id===id)!.values.at(-1)),symbol+' '+id).toBe(true);
  }
 });
});

describe('legend values (row 16)',()=>{
 it('marker kinds keep their 0/1 signal plots out of the legend values; line plots keep them',()=>{
  for(const [kind,plot] of [['gaps','bullish'],['moonphases','newmoon'],['bbars','up']] as const)expect(defaultPlotStyle(kind as IndicatorId,plot,0).legend,kind).toBe(false);
  expect(defaultPlotStyle('rsi','rsi',0).legend).toBe(true);expect(defaultPlotStyle('rsi','divergenceBearish',0).legend).toBe(false);expect(defaultPlotStyle('autopitchfork' as IndicatorId,'median',0).legend).toBe(true);
 });
});

describe('RSI divergence label headroom (row 15)',()=>{
 const reference={id:'r',title:'',paneId:'',kind:'line',visible:true,points:[{time:1000,value:50},{time:2000,value:72},{time:3000,value:28}],style:{color:'#000',width:1,lineStyle:'solid'}} as never;
 const label=(x:number,y:number,style:'label_up'|'label_down')=>({id:'l'+x,paneId:'',xloc:'bar_time',x,y,yloc:'price',text:'',style,size:'small',textAlign:'center',fontFamily:'default'}) as never;
 it('a transparent scale-only series lifts the scale above Bear labels and below Bull labels',()=>{
  const series=rsiDivergenceLabelHeadroom('rsi-1',[label(2000,72,'label_down'),label(3000,28,'label_up')],reference)!;
  expect(series.points.map(point=>point.value)).toEqual([null,72+RSI_DIVERGENCE_LABEL_HEADROOM,28-RSI_DIVERGENCE_LABEL_HEADROOM]);
  expect(series.display).toEqual({pane:true,priceScale:false,legend:false,dataWindow:false});expect(series.style.color).toBe('rgba(0,0,0,0)');
 });
 it('no labels, no series',()=>{expect(rsiDivergenceLabelHeadroom('rsi-1',[],reference)).toBeNull();});
});

describe('trend line Info fold in the drawing popover (row 5)',()=>{
 const fields:TrendlineStatsFoldField[]=[{path:'style.lineColor',label:'Color',kind:'color'},{path:'props.lvTrendlineStats.alwaysShow',label:'Always show stats',kind:'boolean'},
  {path:'props.lvTrendlineStats.position',label:'Stats position',kind:'select',options:[{value:'left',label:'Left'},{value:'right',label:'Right'}]},{path:'props.lvTrendlineStats.priceRange',label:'Price range',kind:'boolean'},
  {path:'props.lvTrendlineMarkers.middlePoint',label:'Middle point',kind:'boolean'}];
 const values:Record<string,unknown>={'props.lvTrendlineStats.alwaysShow':false,'props.lvTrendlineStats.position':'right','props.lvTrendlineStats.priceRange':true,'props.lvTrendlineMarkers.middlePoint':false};
 afterEach(()=>vi.unstubAllGlobals());
 it('lists the Info rows in reference order and summarizes the shown stats',()=>{
  expect(trendlineInfoFields(fields).map(field=>field.label)).toEqual(['Middle point','Price range','Stats position','Always show stats']);
  expect(trendlineInfoSummary(trendlineInfoFields(fields),values)).toBe('Price range');expect(trendlineInfoSummary([],{})).toBe('Off');
 });
 it('adds the fold before Points and Show on for a trend line only, writes through the host, and releases',()=>{
  type El={tag:string;children:El[];listeners:Record<string,()=>void>;attrs:Record<string,string>;dataset:Record<string,string>;style:{cssText:string};className:string;textContent:string;title:string;type:string;checked:boolean;value:string;append:(...nodes:El[])=>void;setAttribute:(k:string,v:string)=>void;addEventListener:(k:string,f:()=>void)=>void};
  const make=(tag:string):El=>{const el:El={tag,children:[],listeners:{},attrs:{},dataset:{},style:{cssText:''},className:'',textContent:'',title:'',type:'',checked:false,value:'',append:(...nodes)=>{el.children.push(...nodes);},setAttribute:(k,v)=>{el.attrs[k]=v;},addEventListener:(k,f)=>{el.listeners[k]=f;}};return el;};
  vi.stubGlobal('document',{createElement:make});
  const update=vi.fn(),host={editor:()=>({fields,values}),update};
  const folds:{title:string;summary:()=>string;body:()=>El[]}[]=[];
  class FakePanel{sections(_b:unknown):unknown{return ['style','points','show'];}fold(_b:unknown,_key:string,title:string,summary:()=>string,body:()=>El[]){folds.push({title,summary,body});return 'fold:'+title;}}
  const panel=new FakePanel();
  const release=installTrendlineStatsFold(panel,host);
  const build=(type:string)=>({live:()=>({id:'t1',type}),watch:(fn:()=>void)=>fn()});
  expect((panel as {sections:(b:unknown)=>unknown}).sections(build('trendline'))).toEqual(['style','fold:Info','points','show']);
  expect((panel as {sections:(b:unknown)=>unknown}).sections(build('ray'))).toEqual(['style','points','show']);
  const rows=folds[0].body(),labels=rows.map(row=>row.children[0].textContent);expect(labels).toEqual(['Middle point','Price range','Stats position','Always show stats']);
  const price=rows[1].children[1].children[0];expect(price.checked).toBe(true);price.checked=false;price.listeners.change();expect(update).toHaveBeenCalledWith('t1',{'props.lvTrendlineStats.priceRange':false});
  const position=rows[2].children[1].children[0];expect(position.value).toBe('right');expect(position.children.map(option=>option.textContent)).toEqual(['Left','Right']);
  position.value='left';position.listeners.change();expect(update).toHaveBeenLastCalledWith('t1',{'props.lvTrendlineStats.position':'left'});
  expect(Object.hasOwn(panel,'sections')).toBe(true);release();expect(Object.hasOwn(panel,'sections')).toBe(false);
 });
});

describe('dialog wording (rows 18, 19)',()=>{
 it('counts are singular for one',()=>{expect(countText(1,'indicator')).toBe('1 indicator');expect(countText(0,'script')).toBe('0 scripts');expect(countText(2,'indicator')).toBe('2 indicators');});
 it('Style tab names plots and toggles in words',()=>{
  expect(stylePlotTitle('rsi','rsi')).toBe('RSI');expect(stylePlotTitle('macd','histogram')).toBe('Histogram');expect(stylePlotTitle('autopitchfork' as IndicatorId,'median')).toBe('Median');
  expect(Object.values(STYLE_TOGGLE_LABELS)).not.toContain('priceScale');expect(STYLE_OPTION_LABELS.line).toBe('Line');
 });
});
