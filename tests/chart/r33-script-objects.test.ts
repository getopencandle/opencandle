import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {chartType,getNativeIndicator,type Vela} from '@luxalgo/vela';
import {createScriptPort,renderScriptObjects,renderScriptVisuals,scriptVisualStyles,validateScriptObjects,type ScriptObjects,type ScriptVisuals} from '../../src/chart/script-port';
import type {PaneRegistry} from '../../src/chart/pane-registry';
import {heikinAshiBars} from '../../src/chart/calculation-bars';

// Barcolor, drawing objects and logs through the script port's native output. SYNTHETIC data.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const chartBars=[10,12,11,14].map((close,index)=>({time:(1000+600*index)*1000,open:close-1,high:close+1,low:close-2,close,volume:10}));
const empty:ScriptObjects={base:null,barcolors:[],labels:[],lines:[],boxes:[],tables:[]};
const objects:ScriptObjects={base:{index:5,time:1600},barcolors:[{time:1600,color:'#00ff00'},{time:2800,color:'#ff000080'}],
 labels:[{id:7000,xloc:'index',x:6,y:12,yloc:'abovebar',text:'Hi',style:'label_down',color:null,textColor:'#ffffff',size:'normal',textAlign:'center',tooltip:''}],
 lines:[{id:5000,xloc:'index',x1:5,y1:9,x2:8,y2:13,extend:'right',color:'#6fa8ff',style:'arrowright',width:2},{id:5001,xloc:'time',x1:1000,y1:9,x2:2800,y2:9,extend:'none',color:null,style:'dotted',width:1}],
 boxes:[{id:6000,xloc:'index',left:5,top:14,right:7,bottom:9,extend:'none',borderColor:'#6fa8ff',borderWidth:1,borderStyle:'dashed',bgColor:'#6fa8ff33',text:'',textColor:null,textSize:'auto',hAlign:'center',vAlign:'center'}],
 tables:[{id:5002,position:'top_right',columns:2,rows:1,bgColor:null,frameColor:'#112233',frameWidth:1,borderColor:null,borderWidth:0,cells:[{column:1,row:0,text:'Close',textColor:'#d8e3f2',bgColor:null,hAlign:'left',vAlign:'top',textSize:'small',tooltip:'tip'}]}]};

describe(' drawing objects render as native indicator output',()=>{
 it('maps index x values through the run base, time x values to milliseconds, arrows and na colours',()=>{
  const out=renderScriptObjects('script-a',objects,chartBars,'candles');
  // base.index 5 is chart bar 1 (time 1600), so index x moves by -4.
  expect(out.lines[0]).toEqual({id:'script-a:line:5000',paneId:'',xloc:'bar_index',x1:1,y1:9,x2:4,y2:13,extend:'right',color:'#6fa8ff',invisible:false,width:2,style:'solid',arrowLeft:false,arrowRight:true});
  expect(out.lines[1]).toMatchObject({xloc:'bar_time',x1:1000000,x2:2800000,color:undefined,invisible:true,style:'dotted'});
  expect(out.labels[0]).toMatchObject({id:'script-a:label:7000',xloc:'bar_index',x:2,y:12,yloc:'abovebar',text:'Hi',style:'label_down',color:undefined,noFill:true,fontFamily:'default'});
  expect(out.boxes[0]).toMatchObject({xloc:'bar_index',left:1,right:3,top:14,bottom:9,borderStyle:'dashed',bgColor:'rgba(111,168,255,0.2)',textColor:undefined,wrap:false});
  expect(out.tables[0]).toMatchObject({id:'script-a:table:5002',position:'top_right',columns:2,rows:1,frameColor:'#112233',merges:[]});
  expect(out.tables[0].cells).toEqual([[null,{text:'Close',textColor:'#d8e3f2',bgColor:undefined,hAlign:'left',vAlign:'top',textSize:'small',fontFamily:'default',tooltip:'tip',bold:false,italic:false}]]);
  expect(renderScriptObjects('script-a',undefined,chartBars,'candles')).toEqual({lines:[],boxes:[],labels:[],tables:[],polylines:[],linefills:[],barSeries:null,barColors:null});/* Native bar colours field */
  // An index-based object whose run base is no longer on the chart is not drawn at a guessed place.
  const lost=renderScriptObjects('script-a',{...objects,base:{index:5,time:99999}},chartBars,'candles');expect(lost.lines.map(row=>row.xloc)).toEqual(['bar_time']);expect(lost.labels).toEqual([]);
  expect(()=>validateScriptObjects({...empty,labels:objects.labels})).toThrow();
  expect(()=>validateScriptObjects({...empty,barcolors:[{time:5,color:'green'}]})).toThrow();
 });
 it('barcolor draws a transparent candle series with per-bar colours, only for bar-type price styles',()=>{
  const out=renderScriptObjects('script-a',objects,chartBars,'candles'),series=out.barSeries as any;
  expect(series).toMatchObject({kind:'candle',display:{pane:true,priceScale:false,legend:false,dataWindow:false},style:{up:'rgba(0,0,0,0)',down:'rgba(0,0,0,0)'}});
  expect(series.bars.map((bar:any)=>bar.close)).toEqual([10,12,11,14]);
  expect(series.barColors).toEqual([null,{color:'#00ff00',wickColor:'#00ff00',borderColor:'#00ff00'},null,{color:'rgba(255,0,0,0.502)',wickColor:'rgba(255,0,0,0.502)',borderColor:'rgba(255,0,0,0.502)'}]);
  expect((renderScriptObjects('script-a',objects,chartBars,'bars').barSeries as any).kind).toBe('bar');
  for(const style of ['line','area','renko','volumecandles'])expect(renderScriptObjects('script-a',objects,chartBars,style).barSeries,style).toBeNull();
  const heikin=(chartType('heikinashi')?.barTransform?.full(chartBars.map(bar=>({...bar})))??heikinAshiBars(chartBars)) as Array<{open:number;close:number}>,drawn=(renderScriptObjects('script-a',objects,chartBars,'heikinashi').barSeries as any).bars;
  expect(drawn.map((bar:any)=>[bar.open,bar.close])).toEqual(heikin.map(bar=>[bar.open,bar.close]));
 });
 it('Style tab overrides recolour, restyle or hide hlines and fills',()=>{
  const plots=[{id:'lvplot:A',title:'A',color:'#6fa8ff',values:[{time:1000,value:1}]},{id:'lvplot:B',title:'B',color:'#6fa8ff',values:[{time:1000,value:2}]}];
  const visuals:ScriptVisuals={hlines:[{title:'Upper',price:70,color:'#787b86',lineStyle:'dashed',width:1},{title:'Lower',price:30,color:'#787b86',lineStyle:'dashed',width:1}],fills:[{title:'Band',from:'A',to:'B',color:'#6fa8ff33'}],backgrounds:[],markers:[]};
  expect(scriptVisualStyles(visuals)).toEqual({'lvhline:Upper':{visible:true,color:'#787b86',width:1,lineStyle:'dashed',kind:'line',priceScale:true,legend:true,dataWindow:true},'lvhline:Lower':expect.objectContaining({color:'#787b86'}),'lvfill:Band':expect.objectContaining({color:'rgba(111,168,255,0.2)'})});
  const styles={'lvhline:Upper':{visible:true,color:'#ff0000',width:3,lineStyle:'solid' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true},'lvhline:Lower':{visible:false,color:'#787b86',width:1,lineStyle:'dashed' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true},'lvfill:Band':{visible:true,color:'rgba(0,0,255,0.5)',width:1,lineStyle:'solid' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true}};
  const out=renderScriptVisuals('script-a',visuals,plots,1000,[1000],styles);
  expect(out.priceLines).toEqual([{id:'script-a:hline:0',paneId:'',price:70,color:'#ff0000',lineStyle:'solid',width:3,title:'Upper'}]);
  expect(out.fills!.map(row=>row.color)).toEqual(['rgba(0,0,255,0.5)']);
  expect(renderScriptVisuals('script-a',visuals,plots,1000,[1000],{...styles,'lvfill:Band':{...styles['lvfill:Band'],visible:false}}).fills).toEqual([]);
 });
 it('runs end to end: worker objects and logs reach the native emit, the port lists logs and styles, and removal clears them',async()=>{
  const bars=[10,12,11,14,12,15].map((close,index)=>({id:'synthetic-r33-obj-'+index,revision:1,time:600*(index+1),open:close-1,high:close+1,low:close-2,close,volume:10}));
  const jobs=new ScriptJobs();let result:any;
  try{result=await jobs.run({requestId:'synthetic-r33-objects',bars,source:`({ onBar(ctx) {
   ctx.barcolor(ctx.bar.close > 12 ? '#00ff00' : null); ctx.hline('Mid', 12, { color: '#888888' });
   if (ctx.index === 0) { ctx.state.l = ctx.line.new({ x1: 0, y1: ctx.bar.low, x2: 0, y2: ctx.bar.low }); ctx.state.t = ctx.table.new({ columns: 1, rows: 1 }); }
   else ctx.line.set(ctx.state.l, { x2: ctx.index, y2: ctx.bar.low });
   ctx.label.new({ text: String(ctx.index) }); ctx.table.cell(ctx.state.t, 0, 0, { text: 'Last ' + ctx.bar.close });
   ctx.log.info('bar', ctx.index); if (ctx.bar.close > 14) ctx.log.warn('high close', ctx.bar.close);
  } })`});}finally{jobs.close();}
  expect(result.ok,result.error?.message).toBe(true);
  const emitted:any[]=[],shown=bars.map(bar=>({time:bar.time*1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}));let removed=0;
  const chart={renderer:{get:(key:string)=>key==='priceStyle'?'candles':undefined},addNativeIndicator(type:string){const model=getNativeIndicator(type)!.create() as any;model.start({id:'synthetic-handle',bars:()=>shown,emit:(out:unknown)=>emitted.push(out)});return {id:'synthetic-handle',setVisible(){},remove(){removed++;},moveTo(){}};}} as unknown as Vela;
  const panes={info:()=>undefined,bind(){},renderer:()=>undefined,logical:()=>undefined} as unknown as PaneRegistry;
  const port=createScriptPort(chart,panes);port.add(result.value,{id:'synthetic-object-script',title:'Object script',plots:{'lvhline:Mid':{visible:true,color:'#123456',width:2,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true}}});
  const last=emitted.at(-1);
  expect(last.labels.map((row:any)=>row.text)).toEqual(['0','1','2','3','4','5']);
  expect(last.lines).toEqual([expect.objectContaining({xloc:'bar_index',x1:0,x2:5,y2:13})]);
  expect(last.tables[0].cells[0][0].text).toBe('Last 15');
  expect(last.series.at(-1).barColors.map((row:any)=>row?.color??null)).toEqual([null,null,null,'#00ff00',null,'#00ff00']);
  expect(last.priceLines).toEqual([expect.objectContaining({price:12,color:'#123456',width:2,lineStyle:'solid'})]);
  expect(port.list()[0].visualStyles['lvhline:Mid']).toMatchObject({color:'#123456',width:2});
  const logs=port.logs();expect(logs).toHaveLength(1);expect(logs[0]).toMatchObject({id:'synthetic-object-script',title:'Object script',dropped:0});
  expect(logs[0].entries.map(row=>[row.level,row.message])).toEqual([['info','bar 0'],['info','bar 1'],['info','bar 2'],['info','bar 3'],['info','bar 4'],['info','bar 5'],['warn','high close 15']]);
  port.invalidateResults();expect(emitted.at(-1).labels).toEqual([]);expect(port.logs()[0].entries).toEqual([]);
  port.update('synthetic-object-script',result.value);port.remove('synthetic-object-script');expect(removed).toBe(1);expect(port.logs()).toEqual([]);
  port.dispose();
 },30000);
});
