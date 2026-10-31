import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {renderScriptHlineAnchors,renderScriptObjects,renderScriptPlots,renderScriptVisuals,scriptPlotDefaultStyle,validateScriptVisuals,type ScriptObjects,type ScriptVisuals} from '../../src/chart/script-port';

// Script plot style options, per-bar plot and fill colours, fills between hlines, linefill and polyline.
// SYNTHETIC bars only.
const require=createRequire(import.meta.url),{ScriptJobs}=require('../../electron/script-jobs.cjs');
const closes=[0,2,1,4,2,-1,0,5,3,1];
const bars=closes.map((step,i)=>{const close=10+step;return{id:'synthetic-gaps2-'+i,revision:1,time:1700000000+i*60,open:10,high:Math.max(10,close)+2,low:Math.min(10,close)-1,close,volume:50+i};});
async function run(source:string,input=bars,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-gaps2',source,bars:input,...extra});}finally{jobs.close();}}
const HIST=`({onBar(ctx){const b=ctx.bar;
 ctx.plot('Delta',b.close-b.open,{color:b.close>=b.open?'#26a69a':'#ef5350',style:'histogram',linewidth:3});
 ctx.plot('Close',b.close,b.close>11?'#ff000080':null);ctx.plot('Open',b.open);
 ctx.hline('Upper',14);ctx.hline('Lower',8,{color:'#00ff00'});
 ctx.fill('Band','Close','Open',{color:b.close>b.open?'#00ff0033':'#ff000033'});ctx.fill('Zone','Upper','Lower',{between:'hlines',color:'#0000ff22'});}})`;

describe('SCRIPT-GAPS2 engine: plot style options and per-bar colours',{timeout:60000},()=>{
 it('records the style options and a palette index per point, keeping the public plot rows unchanged',async()=>{
  const result=await run(HIST);expect(result.ok,result.error?.message).toBe(true);const value=result.value;
  expect(Object.keys(value.plots[0]).sort()).toEqual(['color','id','title','values']);
  expect(value.plots.map((plot:any)=>[plot.title,plot.color])).toEqual([['Delta','#26a69a'],['Close','#6fa8ff'],['Open','#6fa8ff']]);
  const [delta,close]=value.visuals.plotStyles;
  expect(delta).toEqual({title:'Delta',style:'histogram',linewidth:3,offset:0,display:{pane:true,priceScale:true,legend:true,dataWindow:true},palette:['#26a69a','#ef5350'],colors:closes.map(step=>step>=0?0:1)});
  // A plain colour argument may change per bar too; null is no colour on that bar (-1).
  expect(close.style).toBe('line');expect(close.colors).toEqual(closes.map(step=>10+step>11?1:-1));expect(close.palette[1]).toBe('#ff000080');
  // Open never changed colour and declared no options: no style row.
  expect(value.visuals.plotStyles).toHaveLength(2);
 });
 it('is prefix safe: an earlier prefix gives the same leading colours, and a continuation gives the remaining ones',async()=>{
  const whole=await run(HIST),prefix=await run(HIST,bars.slice(0,6));expect(prefix.ok&&whole.ok).toBe(true);
  expect(prefix.value.visuals.plotStyles[0].colors).toEqual(whole.value.visuals.plotStyles[0].colors.slice(0,6));
  const rest=await run(HIST,bars.slice(6),{snapshot:prefix.value.state});expect(rest.ok,rest.error?.message).toBe(true);
  // A run whose bars all keep the first colour sends no colour list: every point is the plot colour.
  const tints=(value:any,title:string)=>{const plot=value.plots.find((row:any)=>row.title===title),row=value.visuals.plotStyles.find((item:any)=>item.title===title);return plot.values.map((_:unknown,i:number)=>row?.colors?row.palette[row.colors[i]]:plot.color);};
  expect(tints(rest.value,'Delta')).toEqual(tints(whole.value,'Delta').slice(6));expect(tints(rest.value,'Close')).toEqual(tints(whole.value,'Close').slice(6));
 });
 it('validates options: fixed per title, known styles and displays, bounded offset and width',async()=>{
  const bad=async(body:string,pattern:RegExp)=>{const result=await run(`({onBar(ctx){${body}}})`);expect(result.ok).toBe(false);expect(result.error.message).toMatch(pattern);};
  await bad(`ctx.plot('a',1,{style:ctx.index?'line':'histogram'});`,/same style/);
  await bad(`ctx.plot('a',1,{style:'bars'});`,/style must be one of/);
  await bad(`ctx.plot('a',1,{display:'legend'});`,/display must be one of/);
  await bad(`ctx.plot('a',1,{offset:501});`,/offset/);
  await bad(`ctx.plot('a',1,{linewidth:0});`,/linewidth/);
  await bad(`ctx.plot('a',1,{colour:'#ffffff'});`,/unsupported field/);
  await bad(`ctx.plot('a',1,'red');`,/Invalid plot/);
  const shown=await run(`({onBar(ctx){ctx.plot('a',1,{display:['data_window','status_line'],offset:-2,style:'stepline'});ctx.plot('b',2,{display:'none'});}})`);expect(shown.ok,shown.error?.message).toBe(true);
  expect(shown.value.visuals.plotStyles.map((row:any)=>[row.style,row.offset,row.display])).toEqual([['stepline',-2,{pane:false,priceScale:false,legend:true,dataWindow:true}],['line',0,{pane:false,priceScale:false,legend:false,dataWindow:false}]]);
 });
});

describe('SCRIPT-GAPS2 engine: fills with per-bar colour and between hlines',{timeout:60000},()=>{
 it('keeps the first colour as the base and lists only the bars that differ',async()=>{
  const result=await run(HIST);expect(result.ok).toBe(true);const [band,zone]=result.value.visuals.fills;
  expect(band.color).toBe('#ff000033');expect(band.colors.palette).toEqual(['#00ff0033']);
  expect(band.colors.times).toEqual(bars.filter((_,i)=>closes[i]>0).map(bar=>bar.time));
  expect(zone).toEqual({title:'Zone',from:'Upper',to:'Lower',color:'#0000ff22',between:'hlines'});
 });
 it('refuses an hline fill whose line was never drawn and a fill that changes its endpoints',async()=>{
  const missing=await run(`({onBar(ctx){ctx.hline('A',1);ctx.fill('f','A','B',{between:'hlines'});}})`);expect(missing.ok).toBe(false);expect(missing.error.message).toMatch(/horizontal line that was never drawn/);
  const moved=await run(`({onBar(ctx){ctx.plot('a',1);ctx.plot('b',2);ctx.plot('c',3);ctx.fill('f','a',ctx.index?'c':'b');}})`);expect(moved.ok).toBe(false);expect(moved.error.message).toMatch(/same endpoints/);
  const unfilled=await run(`({onBar(ctx){ctx.plot('a',1);ctx.plot('b',2);ctx.fill('f','a','b',{color:ctx.index%2?null:'#123456'});}})`);expect(unfilled.ok).toBe(true);
  expect(unfilled.value.visuals.fills[0].colors.values).toEqual([-1,-1,-1,-1,-1]);
 });
});

describe('SCRIPT-GAPS2 engine: linefill and polyline objects',{timeout:60000},()=>{
 it('fills between two live lines, drops the fill with its line, and keeps one fill per pair',async()=>{
  const result=await run(`({onBar(ctx){if(ctx.index===2){const a=ctx.line.new({x1:0,y1:9,x2:2,y2:11}),b=ctx.line.new({x1:0,y1:12,x2:2,y2:14}),c=ctx.line.new({x1:0,y1:1,x2:1,y2:1});
   ctx.linefill.new({line1:a,line2:b});ctx.state.f=ctx.linefill.new({line1:b,line2:a,color:'#00ff0040'});ctx.linefill.new({line1:a,line2:c});ctx.line.delete(c);
   ctx.state.g=ctx.linefill.get(ctx.state.f);ctx.linefill.set(ctx.state.f,{color:'#00ff0080'});}}})`);
  expect(result.ok,result.error?.message).toBe(true);const objects=result.value.objects;
  expect(objects.linefills).toEqual([{id:2004,line1:2001,line2:2000,color:'#00ff0080'}]);expect(result.value.state.state.g.color).toBe('#00ff0040');
  const dead=await run(`({onBar(ctx){const a=ctx.line.new({}),b=ctx.line.new({});ctx.line.delete(b);ctx.linefill.new({line1:a,line2:b});}})`);expect(dead.ok).toBe(false);expect(dead.error.message).toMatch(/two live lines/);
 });
 it('draws bounded immutable polylines and evicts the oldest past the declared count',async()=>{
  const result=await run(`({objectLimits:{polylines:2},onBar(ctx){if(ctx.index>=2)ctx.polyline.new({points:[{x:0,y:10},{x:ctx.index,y:ctx.bar.close},{x:1,y:12}],closed:true,fillColor:'#ff000030',lineStyle:'arrowright'});}})`);
  expect(result.ok,result.error?.message).toBe(true);const rows=result.value.objects.polylines;
  expect(rows.map((row:any)=>row.id)).toEqual([8000,9000]);expect(rows[1]).toEqual({id:9000,xloc:'index',curved:false,closed:true,lineColor:'#6fa8ff',fillColor:'#ff000030',lineWidth:1,lineStyle:'arrowright',points:[{x:0,y:10},{x:9,y:11},{x:1,y:12}]});
  const tooFew=await run(`({onBar(ctx){ctx.polyline.new({points:[{x:0,y:1}]});}})`);expect(tooFew.ok).toBe(false);expect(tooFew.error.message).toMatch(/2 to 1000/);
  const limit=await run(`({objectLimits:{polylines:101},onBar(ctx){}})`);expect(limit.ok).toBe(false);expect(limit.error.message).toMatch(/1 to 100/);
 });
});

describe('SCRIPT-GAPS2 renderer: script styles, per-bar colours and user overrides',()=>{
 const plot={id:'lvplot:Delta',title:'Delta',color:'#26a69a',values:[{time:100,value:1},{time:160,value:-1},{time:220,value:2}]};
 const visuals:ScriptVisuals={hlines:[{title:'Upper',price:14,color:'#787b86',lineStyle:'dashed',width:1},{title:'Lower',price:8,color:'#787b86',lineStyle:'dashed',width:1}],
  fills:[{title:'Zone',from:'Upper',to:'Lower',color:'#0000ff22',between:'hlines',colors:{palette:['#ff0000'],times:[160],values:[0]}}],backgrounds:[],markers:[],
  plotStyles:[{title:'Delta',style:'histogram',linewidth:3,offset:0,display:{pane:true,priceScale:true,legend:false,dataWindow:true},palette:['#26a69a','#ef5350'],colors:[0,1,-1]}]};
 it('paints the script style and per-point colours as defaults',()=>{
  const [series]=renderScriptPlots('s',[plot],{},220,undefined,undefined,visuals) as any[];
  expect(series.kind).toBe('histogram');expect(series.style).toEqual({color:'#26a69a',width:3,lineStyle:'solid',base:0});expect(series.display).toEqual({pane:true,priceScale:true,legend:false,dataWindow:true});
  expect(series.points).toEqual([{time:100000,value:1,color:'#26a69a'},{time:160000,value:-1,color:'#ef5350'},{time:220000,value:2,color:'rgba(0,0,0,0)'}]);
  expect(scriptPlotDefaultStyle(plot,0,visuals.plotStyles![0])).toMatchObject({kind:'histogram',width:3,legend:false,color:'#26a69a'});
 });
 it('lets a saved Style tab colour replace the per-bar colours, while a saved copy of the script colour keeps them',()=>{
  const own={visible:true,color:'#123456',width:1,lineStyle:'dotted' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true};
  const [changed]=renderScriptPlots('s',[plot],{[plot.id]:own},220,undefined,undefined,visuals) as any[];
  expect(changed.kind).toBe('line');expect(changed.style.color).toBe('#123456');expect(changed.points.every((point:any)=>point.color===undefined)).toBe(true);
  const [kept]=renderScriptPlots('s',[plot],{[plot.id]:{...own,color:'#26A69A',kind:'columns'}},220,undefined,undefined,visuals) as any[];
  expect(kept.kind).toBe('columns');expect(kept.points.map((point:any)=>point.color)).toEqual(['#26a69a','#ef5350','rgba(0,0,0,0)']);
 });
 it('shifts an offset plot by whole bars and never paints past the available bar before shifting',()=>{
  const shifted={...visuals,plotStyles:[{...visuals.plotStyles![0],offset:2,palette:null,colors:null}]};
  const [later]=renderScriptPlots('s',[plot],{},220,undefined,undefined,shifted) as any[];
  expect(later.points).toEqual([{time:100000,value:null},{time:160000,value:null},{time:220000,value:1},{time:280000,value:-1},{time:340000,value:2}]);
  const [earlier]=renderScriptPlots('s',[plot],{},160,undefined,undefined,{...shifted,plotStyles:[{...shifted.plotStyles[0],offset:-1}]}) as any[];
  expect(earlier.points).toEqual([{time:100000,value:-1}]);
 });
 it('fills between hidden hline anchors with per-bar colours, and a changed fill colour wins',()=>{
  const out=renderScriptVisuals('s',visuals,[plot],220,[100,160,220]),anchors=renderScriptHlineAnchors('s',visuals,220,[100,160,220]) as any[];
  expect(anchors.map(row=>[row.title,row.visible,row.display,row.points.map((point:any)=>point.value)])).toEqual([['Upper',false,{pane:false,priceScale:false,legend:false,dataWindow:false},[14,14,14]],['Lower',false,{pane:false,priceScale:false,legend:false,dataWindow:false},[8,8,8]]]);
  expect(out.fills).toEqual([{id:'s:fill:0',paneId:'',fromSeriesId:anchors[0].id,toSeriesId:anchors[1].id,color:'rgba(0,0,255,0.133)',colors:['rgba(0,0,255,0.133)','#ff0000','rgba(0,0,255,0.133)']}]);
  const flat=renderScriptVisuals('s',visuals,[plot],220,[100,160,220],{'lvfill:Zone':{visible:true,color:'#abcdef',width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true}});
  expect(flat.fills).toEqual([expect.objectContaining({color:'#abcdef'})]);expect(flat.fills![0]).not.toHaveProperty('colors');
  expect(()=>validateScriptVisuals({...visuals,plotStyles:[{...visuals.plotStyles![0],colors:[0,2,0]}]})).toThrow();
 });
 it('renders linefills from their rendered lines and polylines through the native drawing outputs',()=>{
  const objects:ScriptObjects={base:{index:0,time:100},barcolors:[],labels:[],boxes:[],tables:[],
   lines:[{id:1,xloc:'index',x1:0,y1:1,x2:2,y2:1,extend:'none',color:'#ffffff',style:'solid',width:1},{id:2,xloc:'index',x1:0,y1:3,x2:2,y2:3,extend:'none',color:null,style:'solid',width:1}],
   linefills:[{id:3,line1:1,line2:2,color:'#00ff0080'}],polylines:[{id:4,xloc:'time',curved:true,closed:false,lineColor:'#ff0000',fillColor:null,lineWidth:2,lineStyle:'arrowboth',points:[{x:100,y:1},{x:160,y:2}]}]};
  const out=renderScriptObjects('s',objects,[{time:100000,open:1,high:1,low:1,close:1},{time:160000,open:1,high:1,low:1,close:1}],'candles');
  expect(out.linefills).toEqual([{id:'s:linefill:3',paneId:'',line1:out.lines[0],line2:out.lines[1],color:'rgba(0,255,0,0.502)'}]);
  expect(out.polylines).toEqual([{id:'s:polyline:4',paneId:'',points:[{xloc:'bar_time',x:100000,price:1},{xloc:'bar_time',x:160000,price:2}],curved:true,closed:false,lineColor:'#ff0000',fillColor:undefined,lineWidth:2,lineStyle:'solid',arrowLeft:true,arrowRight:true}]);
 });
});
