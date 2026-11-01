// Regression specs for six drawing fixes (OpenCandle 0.8.2): range start on the containing bar (projector), Fixed range
// volume profile end period and row distribution, Anchored VWAP without volume, screen-space Schiff origin on a log scale,
// and the directional Cypher validity check. Gann fan labels in the 1x2 form. SYNTHETIC bars and prices only.
import {describe,expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {installedRenderer,paintModel,projector,recordingCanvas,restore,saveOf,savedRecord,segments,texts,timeOfBar,toBar,type Frame} from './spec-harness';
import {DAY,HOUR,X0,PX_PER_BAR,WIDTH,HEIGHT,dailyTimes,hourlyBars} from '../../fixtures/drawing-spec/bars';
import {ANCHORED_VWAP_NO_VOLUME,FRVP_DRAWN_INTERVAL_KEY,anchoredVwapSamples,computeVolumeProfile,rangeEndTime,spreadBarVolume,type ProfileBar} from '../../../src/chart/drawing-fixes/volume-fixes';
import {cypherDirectionOk} from '../../../src/chart/drawing-fixes/pattern-fixes';
import {classicGannFanLabel} from '../../../src/chart/drawing-fixes/native-fixes';
import {drawingFixStatus} from '../../../src/chart/lv-drawing-types';

const make=(type:string,anchors:{time:number;price:number}[],props?:Record<string,unknown>):any=>{
 const init:Record<string,unknown>={id:'fix-'+type,paneId:'price',anchors};if(props)init.props=props;
 return createDrawing(type as never,init as never);
};
/** A projector over custom bars, built from the renderer's own CoordinateSystem and createProjector (as the harness does). */
async function customProjector(bars:ProfileBar[],intervalMs:number){
 const m=await installedRenderer(),coords=new m.LVSpecCoordinates();
 coords.times=bars.map(b=>b.time);coords.intervalMs=intervalMs;
 coords.logicalToX=(l:number)=>X0+l*PX_PER_BAR;coords.xToLogical=(x:number)=>(x-X0)/PX_PER_BAR;coords.widthPx=WIDTH;coords.dataHeightPx=HEIGHT;
 const pane={scale:{min:0,max:1000,log:false},bounds:{top:0,height:HEIGHT},collapsed:false};
 const p=m.LVSpecProjector(coords,(id:string)=>id==='price'||id===undefined?pane:null,()=>'price',(from:number,to:number)=>bars.filter(b=>b.time>=from&&b.time<=to).map(b=>({...b})));
 p.width=WIDTH;p.height=HEIGHT;return p;
}
const bar=(time:number,o:number,h:number,l:number,c:number,volume:number):ProfileBar=>({time,open:o,high:h,low:l,close:c,volume});
const rowTotals=(rows:{up:number;down:number}[])=>rows.map(r=>r.up+r.down);
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const D1:Frame={interval:'1D',scale:'base'},H1:Frame={interval:'1h',scale:'base'};
/** Time of hour `h` (09..16) on daily bar `i`. */
const hourOf=(i:number,h:number)=>dailyTimes()[i]+h*HOUR;

describe('registration',()=>{
 it('the Fixed range volume profile, Anchored VWAP and Cypher fixes replace their native registrations',()=>{
  const rows=drawingFixStatus().filter(row=>['fixedrangevp','anchoredvwap','cypher'].includes(row.type));
  expect(rows.map(row=>[row.type,row.state])).toEqual([['fixedrangevp','registered'],['anchoredvwap','registered'],['cypher','registered']]);
 });
});

describe('B1: a range that starts inside a coarser bar starts at that bar',()=>{
 it('probe: an Anchored VWAP anchored at 0.5 s over bars at 0, 1 and 2 s starts at the bar opening at 0',async()=>{
  const bars=[0,1,2].map(i=>bar(i*1000,100,110,90,100+i,100));
  const proj=await customProjector(bars,1000);
  expect(proj.lvContainingBarOpen(500)).toBe(0);
  const pts=make('anchoredvwap',[{time:500,price:100}]).series(proj);
  expect(pts.map((p:{time:number})=>p.time)).toEqual([0,1000,2000]);
 });
 it('a time inside the latest bar\'s period belongs to the latest bar (its open, and drawn on it); a session gap keeps the native mapping',async()=>{
  const bars=[0,1,2].map(i=>bar(i*DAY,100,110,90,100,100)),proj=await customProjector([...bars.slice(0,2),{...bars[2],time:4*DAY}],DAY);
  expect(proj.lvContainingBarOpen(4*DAY+5*HOUR)).toBe(4*DAY);
  expect(proj.xOf(4*DAY+5*HOUR)).toBeCloseTo(proj.xOf(4*DAY),9);
  expect(proj.barsBetween(DAY,4*DAY+5*HOUR)).toBeCloseTo(1,9);
  // One full interval past the latest bar is a future slot: the native extrapolation stays.
  expect(proj.xOf(5*DAY)).toBeGreaterThan(proj.xOf(4*DAY)+1);
  // 2.5 days lies after the 1-day period of the bar at day 1 and before the bar at day 4 (a gap): no bar contains it.
  expect(proj.lvContainingBarOpen(2.5*DAY)).toBe(2.5*DAY);
  expect(proj.lvIntervalMs).toBe(DAY);
 });
 it('plain barsInRange is not widened, so Long/Short Position and Bars pattern never read trading before their start time',async()=>{
  const {proj}=await projector(D1);
  expect(proj.barsInRange(hourOf(20,13),Infinity)[0].time).toBe(dailyTimes()[21]);
  for(const type of ['position','lvshortposition']){
   const pos=make(type,[{time:hourOf(20,13),price:640},{time:timeOfBar(30),price:700}]),seen:number[][]=[];
   const spy=new Proxy(proj,{get:(target:any,key)=>key==='barsInRange'?(from:number,to:number)=>{const out=target.barsInRange(from,to);seen.push(out.map((b:ProfileBar)=>b.time));return out;}:target[key]});
   pos.onPlaced(spy);pos.lvStats(spy);
   const read=seen.flat().filter(t=>t>=dailyTimes()[20]&&t<=dailyTimes()[29]);
   expect(read.length,type).toBeGreaterThan(0);
   expect(read.includes(dailyTimes()[20]),type).toBe(false);
  }
 });
 it('an Anchored VWAP anchored at 13:00 on an hourly chart, viewed on 1D, starts on that day\'s bar (bar 20)',async()=>{
  const [model]=restore([saveOf(make('anchoredvwap',[{time:hourOf(20,13),price:500}]))]);
  const mid=segments(await paintModel(model,D1)).filter(s=>!s.dashed);
  expect(Math.min(...mid.map(s=>toBar(Math.min(s.a[0],s.b[0]))))).toBeCloseTo(20,6);
  const {proj}=await projector(D1);expect(toBar(model.handlePoints(proj)[0][0])).toBeCloseTo(20,6);
 });
 it('a Fixed range volume profile and a Regression trend starting at 13:00 inside day 20, viewed on 1D, include bar 20',async()=>{
  const {proj}=await projector(D1);
  const vp=make('fixedrangevp',[{time:hourOf(20,13),price:500},{time:timeOfBar(30),price:500}]);
  expect(vp.barsInSpan(proj).map((b:ProfileBar)=>b.time)).toEqual(dailyTimes().slice(20,31));
  const reg=make('regressionchannel',[{time:hourOf(20,13),price:500},{time:timeOfBar(30),price:500}]);
  expect(reg.fit(proj).n).toBe(11);expect(reg.fit(proj).t0).toBe(dailyTimes()[20]);
 });
});

describe('B2: the end of a Fixed range volume profile is the end of the end bar\'s period',()=>{
 it('drawn on 1D (day 20 to day 22) and viewed on 1h, it counts every hour of day 22, and its right edge reaches the last one',async()=>{
  const {proj:daily}=await projector(D1),{proj:hourly}=await projector(H1);
  const drawn=make('fixedrangevp',[{time:timeOfBar(20),price:500},{time:timeOfBar(22),price:500}]);
  drawn.onPlaced(daily);
  expect(drawn.frvp[FRVP_DRAWN_INTERVAL_KEY]).toBe(DAY);
  const [model]=restore([saveOf(drawn)]);
  expect(model.frvp[FRVP_DRAWN_INTERVAL_KEY]).toBe(DAY);
  const times=model.barsInSpan(hourly).map((b:ProfileBar)=>b.time);
  expect(times).toHaveLength(24);expect(times.at(-1)).toBe(hourOf(22,16));
  const L=model.layout(hourly);expect(L.x1).toBeCloseTo(hourly.xOf(hourOf(22,16)),6);
  // On the drawn interval nothing moves: 3 daily bars, the right edge on the end anchor.
  expect(model.barsInSpan(daily)).toHaveLength(3);expect(model.layout(daily).x1).toBeCloseTo(daily.xOf(timeOfBar(22)),6);
 });
 it('a saved profile without the drawn interval loads and keeps the previous end (the end bar\'s open)',async()=>{
  const {proj:hourly}=await projector(H1);
  const record=savedRecord({type:'fixedrangevp',anchors:[{bar:20,price:500},{bar:22,price:500}]});
  expect(record.props[FRVP_DRAWN_INTERVAL_KEY]).toBeUndefined();
  const [model]=restore([record]);
  expect(model.barsInSpan(hourly)).toHaveLength(16);
 });
 it('dragging the end handle on another interval makes that interval the drawn one',async()=>{
  const {proj:daily}=await projector(D1),{proj:hourly}=await projector(H1);
  const model=make('fixedrangevp',[{time:timeOfBar(20),price:500},{time:timeOfBar(22),price:500}]);model.onPlaced(daily);
  model.anchors[1]={time:hourOf(22,12),price:500};model.constrainHandleDrag(1);
  expect(model.barsInSpan(hourly).at(-1).time).toBe(hourOf(22,12));
  expect(model.frvp[FRVP_DRAWN_INTERVAL_KEY]).toBe(HOUR);
  model.constrainHandleDrag(0);model.barsInSpan(daily);expect(model.frvp[FRVP_DRAWN_INTERVAL_KEY]).toBe(HOUR);
 });
 it('monthly and plain intervals end where the bar period ends',()=>{
  expect(rangeEndTime(Date.UTC(2024,1,1),31*DAY)).toBe(Date.UTC(2024,2,1)-1);
  expect(rangeEndTime(1000,500)).toBe(1499);
  expect(rangeEndTime(1000,undefined)).toBe(1000);
 });
});

describe('B3: a bar\'s volume is spread over the rows of its high-low range',()=>{
 const BARS=[bar(0,100,110,90,105,1),bar(1,105,120,100,115,10),bar(2,115,130,95,100,1000)];
 it('probe: three bars totalling 1,011 volume put 1,011 into the rows, with no empty row inside any bar\'s range',()=>{
  const r=computeVolumeProfile(BARS,24,0.7,true)!;
  expect(sum(rowTotals(r.profile.rows))).toBeCloseTo(1011,9);
  const {min,rowH,rows}=r.profile;
  for(const b of BARS)for(let k=0;k<rows.length;k++){const lo=min+k*rowH,hi=lo+rowH;if(hi>b.low+1e-9&&lo<b.high-1e-9)expect(rows[k].up+rows[k].down,`row ${k} inside bar ${b.time}`).toBeGreaterThan(0);}
  // Each row carries each bar's volume per unit of price: the top row (127.5..130) only holds bar 2 (1000 / 35 per unit).
  expect(rows[23].up+rows[23].down).toBeCloseTo(1000*rowH/35,9);
  // The developing series ends on the final POC.
  expect(r.developingPoc.at(-1)!.price).toBeCloseTo(rows[r.profile.poc].price+rowH/2,9);
 });
 it('a bar whose high equals its low puts all of its volume in one row; up and down split by close against open',()=>{
  const rows=Array.from({length:4},(_,k)=>({price:k,up:0,down:0}));
  spreadBarVolume(rows,0,1,bar(0,2.5,2.5,2.5,2.5,7));
  spreadBarVolume(rows,0,1,bar(1,3,4,0,1,8));
  expect(rows.map(r=>[r.up,r.down])).toEqual([[0,2],[0,2],[7,2],[0,2]]);
 });
 it('the Fixed range volume profile model on the spec fixture: row totals equal the bars\' volume',async()=>{
  const {proj}=await projector(D1);
  const model=make('fixedrangevp',[{time:timeOfBar(20),price:700},{time:timeOfBar(40),price:300}]);
  const want=sum(model.barsInSpan(proj).map((b:ProfileBar)=>b.volume));
  expect(sum(rowTotals(model.compute(proj).profile.rows))).toBeCloseTo(want,6);
 });
 it('the Anchored volume profile inherits the spread rows',async()=>{
  const {proj}=await projector(D1);
  const model=make('lvanchoredvp',[{time:timeOfBar(23),price:500}]);
  const state=model.profileState(proj);expect(state.state).toBe('ready');
  expect(sum(rowTotals(model.compute(proj).profile.rows))).toBeCloseTo(sum(state.bars.map((b:ProfileBar)=>b.volume)),6);
 });
});

describe('B4: Anchored VWAP draws no line until there is volume',()=>{
 it('a range with no volume returns no samples and paints a short note instead of a line',async()=>{
  const bars=[0,1,2].map(i=>bar(i*1000,100,110,90,100+i,0));
  expect(anchoredVwapSamples(bars,1)).toEqual([]);
  const proj=await customProjector(bars,1000),model=make('anchoredvwap',[{time:0,price:100}]);
  expect(model.series(proj)).toBeNull();expect(model.layout(proj)).toBeNull();
  const m=await installedRenderer(),canvas=recordingCanvas();
  new m.LVSpecPainter().paintAll(canvas.ctx,[model],proj,{fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'},{});
  expect(segments(canvas.ops)).toEqual([]);
  expect(texts(canvas.ops).map(t=>t.text)).toEqual([ANCHORED_VWAP_NO_VOLUME]);
  expect(model.hitTest(proj.xOf(0)+20,proj.yOf(100,'price'),proj,4)).toBe(true);
 });
 it('leading zero-volume bars are skipped: the line starts at the first bar with volume, at its typical price',()=>{
  const bars=[bar(0,100,120,90,96,0),bar(1,100,110,90,100,0),bar(2,100,112,94,103,50),bar(3,100,130,100,115,150)];
  const pts=anchoredVwapSamples(bars,1);
  expect(pts.map(p=>p.time)).toEqual([2,3]);
  expect(pts[0].mid).toBeCloseTo(103,9);expect(pts[0].upper).toBeCloseTo(103,9);
  expect(pts[1].mid).toBeCloseTo((103*50+115*150)/200,9);
 });
 it('with volume on every bar it equals the standard VWAP (the spec fixture line is unchanged)',()=>{
  const bars=hourlyBars().slice(0,10),pts=anchoredVwapSamples(bars,1);
  let pv=0,v=0;bars.forEach((b,i)=>{pv+=(b.high+b.low+b.close)/3*b.volume;v+=b.volume;expect(pts[i].mid).toBeCloseTo(pv/v,9);});
 });
});

describe('B5: Schiff origins are taken on screen',()=>{
 const LOG:Frame={interval:'1D',scale:'logbase',log:true};
 const anchors=[{time:timeOfBar(20),price:20},{time:timeOfBar(30),price:800},{time:timeOfBar(34),price:100}];
 const dist=(p:number[],a:number[],b:number[])=>Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]);
 it('on a log scale the Modified Schiff (and Inside pitchfork) origin lies on the drawn pivot-to-P1 line',async()=>{
  const {proj}=await projector(LOG);
  const P0=[proj.xOf(anchors[0].time),proj.yOf(20,'price')],P1=[proj.xOf(anchors[1].time),proj.yOf(800,'price')];
  const g=make('modifiedschiffpitchfork',anchors).geometry(proj);
  expect(dist([g.segments[0][0],g.segments[0][1]],P0,P1)).toBeLessThan(1e-6);
  const inside=make('insidepitchfork',anchors).geometry(proj),cons=inside.segments.find((s:number[])=>Math.abs(s[2]-proj.xOf(anchors[2].time))<1e-9&&Math.abs(s[3]-proj.yOf(100,'price'))<1e-9);
  expect(dist([cons[0],cons[1]],P0,P1)).toBeLessThan(1e-6);
 });
 it('on a log scale the Schiff origin is halfway up the leg as displayed, at the pivot\'s bar',async()=>{
  const {proj}=await projector(LOG);
  const g=make('schiffpitchfork',anchors).geometry(proj);
  expect(g.segments[0][0]).toBeCloseTo(proj.xOf(anchors[0].time),9);
  expect(g.segments[0][1]).toBeCloseTo((proj.yOf(20,'price')+proj.yOf(800,'price'))/2,9);
  // The arithmetic price average (410) would sit well below that on screen.
  expect(Math.abs(proj.yOf(410,'price')-g.segments[0][1])).toBeGreaterThan(50);
 });
});

describe('B6: Cypher validity follows the pattern\'s directions',()=>{
 const cypher=(prices:number[])=>make('cypher',prices.map((price,i)=>({time:timeOfBar(20+5*i),price})));
 it('probe: X 100, A 110, B 105, C 87, D 97.5 (C below X, not beyond A) is not valid, though its ratios are in band',async()=>{
  const model=cypher([100,110,105,87,97.5]);
  expect(cypherDirectionOk(model.anchors)).toBe(false);expect(model.valid()).toBe(false);
  const ops=await paintModel(restore([saveOf(model)])[0],D1);
  expect(texts(ops).map(t=>t.text)).toContain('Cypher ✗');
 });
 it('textbook bullish and bearish Cyphers stay valid; a B outside X-A or a D beyond C is not',()=>{
  expect(cypher([50,150,100,180,77.82]).valid()).toBe(true);
  expect(cypher([950,850,900,820,922.18]).valid()).toBe(true);
  expect(cypherDirectionOk(cypher([50,150,40,180,77.82]).anchors)).toBe(false);
  expect(cypherDirectionOk(cypher([50,150,100,180,190]).anchors)).toBe(false);
  expect(cypher([50,150,100,180]).valid()).toBeNull();
 });
});

describe('Gann fan labels in the 1x2 form',()=>{
 const natives=new Map([[2,'2/1'],[0.5,'1/2'],[1,'1/1']]);
 it('native and 0.8.1 stored default labels read 1x2; a typed label is kept',()=>{
  expect(classicGannFanLabel(2,'2/1',natives)).toBe('1x2');
  expect(classicGannFanLabel(2,'1/2',natives)).toBe('1x2');
  expect(classicGannFanLabel(0.5,'1/2',natives)).toBe('2x1');
  expect(classicGannFanLabel(1,'1/1',natives)).toBe('1x1');
  expect(classicGannFanLabel(2,'steep',natives)).toBe('steep');
 });
 it('new drawings store the 1x2 labels; saved drawings keep their stored labels and geometry',()=>{
  const model=make('gannfan',[{time:timeOfBar(20),price:300},{time:timeOfBar(30),price:500}]);
  expect(model.levels.find((lv:{ratio:number})=>lv.ratio===2).label).toBe('1x2');
  const saved=saveOf(model);saved.props.levels=saved.props.levels.map((lv:{ratio:number;label?:string})=>lv.ratio===2?{...lv,label:'1/2'}:lv);
  const [loaded]=restore([saved]);
  expect(loaded.levels.find((lv:{ratio:number})=>lv.ratio===2).label).toBe('1/2');
  expect(loaded.anchors).toEqual(saved.anchors);
 });
});

describe('connected segments stroke as one path',()=>{
 it('a dashed Curve is one stroke along the whole curve (the dash runs on), with round joins',async()=>{
  const curve=make('curve',[{time:timeOfBar(20),price:300},{time:timeOfBar(40),price:300},{time:timeOfBar(30),price:700}]);
  curve.style={...curve.style,lineStyle:'dashed',lineWidth:2};
  const {proj}=await projector(D1),m=await installedRenderer(),canvas=recordingCanvas();
  let joins='';const ctx=new Proxy(canvas.ctx,{set:(target:any,key,value)=>{if(key==='lineJoin'&&value==='round')joins=value;target[key]=value;return true;}});
  new m.LVSpecPainter().paintAll(ctx,[curve],proj,{fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'},{});
  const strokes=canvas.ops.filter((op:any)=>op.kind==='stroke'&&op.dash.length>0) as any[];
  expect(strokes).toHaveLength(1);expect(strokes[0].polys).toHaveLength(1);expect(strokes[0].polys[0].length).toBeGreaterThan(20);
  expect(joins).toBe('round');
 });
 it('separate lines (a pitchfork) stay separate pieces of one stroke',async()=>{
  const fork=make('pitchfork',[{time:timeOfBar(20),price:300},{time:timeOfBar(30),price:600},{time:timeOfBar(30),price:400}]);
  const ops=await paintModel(fork,D1),polys=(ops.filter((op:any)=>op.kind==='stroke') as any[]).flatMap(op=>op.polys);
  expect(polys.length).toBeGreaterThanOrEqual(4);
 });
});

describe('Regression trend alert key follows the deviation inputs',()=>{
 const base={id:'r',type:'regressionchannel',paneId:'price',anchors:[{time:1000,price:10},{time:5000,price:20}],props:{}};
 it('default deviations keep the earlier key; an edited deviation changes it',async()=>{
  const {drawingAlertKey}=await import('../../../src/chart/drawing-alert-shapes');
  expect(drawingAlertKey(base)).toBe(JSON.stringify(['regressionchannel',[1000,5000],'close',2,'population residual deviation']));
  expect(drawingAlertKey({...base,props:{upperDeviation:2,lowerDeviation:2}})).toBe(drawingAlertKey(base));
  expect(drawingAlertKey({...base,props:{upperDeviation:3}})).not.toBe(drawingAlertKey(base));
  expect(drawingAlertKey({...base,props:{upperDeviation:3,lowerDeviation:1}})).not.toBe(drawingAlertKey({...base,props:{upperDeviation:1,lowerDeviation:3}}));
 });
});

describe('catalog and dialog text',()=>{
 it('Arrow, Ray, Extended line and Info line rows say Shift snaps to 45 degree steps; Pin says how to write its note',async()=>{
  const {DRAWING_TOOL_CATALOG}=await import('../../../src/ui/drawing-tool-catalog');
  const leaves=(DRAWING_TOOL_CATALOG as any[]).flatMap(group=>group.sections.flatMap((part:any)=>part.leaves));
  for(const id of ['DW.SHAPE.ARROW','DW.TREND.RAY','DW.TREND.EXTENDED_LINE','DW.TREND.INFO_LINE'])expect(leaves.find(leaf=>leaf.id===id)?.hint,id).toMatch(/Shift/);
  const {PIN_MODULE}=await import('../../../src/chart/lv-types/pin-table');
  expect(PIN_MODULE.catalog?.[0].note).toBe('Click to place a pin. Double-click it to write its note.');
 });
 it('the Gann fan settings show a stored 1/2 label as 1x2 (display only)',async()=>{
  const {drawingEditor}=await import('../../../src/chart/drawing-port');
  const record=saveOf(make('gannfan',[{time:timeOfBar(20),price:300},{time:timeOfBar(30),price:500}]));
  record.props.levels=record.props.levels.map((lv:{ratio:number;label?:string})=>lv.ratio===2?{...lv,label:'1/2'}:lv);
  const editor=drawingEditor(record,[]) as any;
  expect(editor.levels.find((lv:{ratio:number})=>lv.ratio===2).label).toBe('1x2');
  expect(record.props.levels.find((lv:{ratio:number})=>lv.ratio===2).label).toBe('1/2');
 });
});
