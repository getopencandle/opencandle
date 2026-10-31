// OpenCandle 0.8.1 drawing fixes: the EXPECTED picture of each tool, written as specs (what lines, labels and positions a user
// sees), so the old behaviour cannot come back. SYNTHETIC anchors and projectors only.
import {afterEach,describe,expect,it} from 'vitest';
import {createDrawing,deserializeDrawing} from '@luxalgo/vela';
import {drawingFixStatus} from '../../src/chart/lv-drawing-types';
import '../../src/chart/fib-level-format-native';
import {registerPositionChartContext} from '../../src/chart/lv-types/position-tool';
import {formatDrawingPrice,magnitudeDecimals} from '../../src/chart/drawing-fixes/price-format';
import {directedRay} from '../../src/chart/drawing-fixes/geometry';
import {ELLIOTT_ORIGIN_FIELD,legacyOrigin} from '../../src/chart/drawing-fixes/elliott-origin';
import {trianglePatternPlan} from '../../src/chart/lv-types/chart-patterns';
import {constrainFixedRatio,gannRatio} from '../../src/chart/lv-types/gann-square-fixed';
import {planChannelLevels} from '../../src/chart/channel-levels-painter';

const make=(type:string,anchors:{time:number;price:number}[],extra:Record<string,unknown>={})=>createDrawing(type as never,{id:'d-'+type,paneId:'price',anchors,...extra}) as any;
const reload=(model:any)=>deserializeDrawing(JSON.parse(JSON.stringify(model.serialize()))) as any;

// Daily bars Monday..Friday with weekend gaps. Bar index i sits at x = 10 * i; times between bars interpolate (the native
// CoordinateSystem rule), so a calendar step that lands on a Saturday lands between two bars.
const DAY=86400000,MON=Date.UTC(2024,0,1);
const BAR_TIMES=Array.from({length:60},(_,i)=>MON+(Math.floor(i/5)*7+i%5)*DAY);
function logicalOf(ms:number){
 const t=BAR_TIMES,n=t.length;if(ms<=t[0])return (ms-t[0])/DAY;if(ms>=t[n-1])return n-1+(ms-t[n-1])/DAY;
 let lo=0;while(t[lo+1]<=ms)lo++;return lo+(ms-t[lo])/(t[lo+1]-t[lo]);
}
const timeOf=(logical:number)=>{const lo=Math.floor(logical),f=logical-lo;return BAR_TIMES[lo]+(BAR_TIMES[lo+1]-BAR_TIMES[lo])*f;};
const linearY=(price:number)=>1000-price;
const proj=(yOf:(price:number)=>number=linearY)=>({xOf:(ms:number)=>10*logicalOf(ms),yOf:(price:number)=>yOf(price),width:600,height:1000,
 pxToPoint:(x:number,y:number)=>({time:timeOf(x/10),price:1000-y}),barsBetween:(a:number,b:number)=>Math.abs(logicalOf(b)-logicalOf(a)),paneRect:()=>({top:0,height:1000})}) as any;
const bar=(i:number)=>BAR_TIMES[i];
const barAt=(x:number)=>Math.round(x/10*1000)/1000;

describe('registration',()=>{
 it('every 0.8.1 fix replaced its native registration',()=>{
  expect(drawingFixStatus().map(row=>[row.type,row.state])).toEqual(['pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork','fibfan','gannfan','fibspeedfan','fibtimezones','gannbox','gannsquare','parallelchannel','fibextension','fibextensiontrend','datepricerange','pricenote','pricelabel','fibarcs','ray','infoline','headshoulders','regressionchannel','elliottimpulse','elliottcorrection','callout','comment','note'].map(type=>[type,'registered']));
 });
});

describe('BUG 1: prices on drawings use the instrument tick',()=>{
 let release:(()=>void)|undefined;
 afterEach(()=>{release?.();release=undefined;});
 it('a EURUSD Fib retracement prints 5 decimals, so its levels stay distinct',()=>{
  release=registerPositionChartContext({owns:()=>false,tickSize:()=>0.00001});
  const fib=make('fibretracement',[{time:bar(0),price:1.08},{time:bar(5),price:1.09}]);
  const texts=fib.entryLines(proj()).map((row:any)=>row.numberText);
  expect(texts).toContain('0.5 (1.08500)');
  expect(new Set(texts).size).toBe(texts.length);
 });
 it('Fib extension, Trend-based fib extension and the Date and price range follow the tick too',()=>{
  release=registerPositionChartContext({owns:()=>false,tickSize:()=>0.0001});
  const ext=make('fibextension',[{time:bar(0),price:1.1},{time:bar(5),price:1.2}]);
  expect(ext.levelText(0.618,1.16183)).toBe('0.618 (1.1618)');
  const trend=make('fibextensiontrend',[{time:bar(0),price:1.1},{time:bar(2),price:1.2},{time:bar(4),price:1.15}]);
  expect(trend.entryLines(proj()).find((row:any)=>row.numberText.startsWith('1 ')).numberText).toBe('1 (1.2500)');
  const range=make('datepricerange',[{time:bar(0),price:1.1},{time:bar(3),price:1.10237}]);
  expect(range.priceLabel()).toBe('+0.0024 (+0.22%)');
 });
 it('with no tick known, decimals follow the price (5 significant digits, 2 to 8 decimals)',()=>{
  expect([4512.25,150,1.08236,0.0123456].map(p=>formatDrawingPrice(p))).toEqual(['4512.25','150.00','1.0824','0.012346']);
  expect(magnitudeDecimals(1e-9)).toBe(8);
 });
});

describe('BUG 2: rays, pitchforks and fans extend in the drawn direction',()=>{
 it('a ray segment drawn right to left runs to the left edge',()=>{
  expect(directedRay(300,500,200,400,600,1000)).toEqual([300,500,-2,198]);
  expect(directedRay(200,400,300,500,600,1000)).toEqual([200,400,602,802]);
 });
 for(const type of ['pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork']){
  it(type+': drawn right to left, the median and both tines end at the left edge; drawn left to right, at the right edge',()=>{
   const left=make(type,[{time:bar(30),price:500},{time:bar(20),price:600},{time:bar(20),price:400}]).geometry(proj());
   expect(left.segments.slice(0,3).map((s:number[])=>s[2])).toEqual([-2,-2,-2]);
   const right=make(type,[{time:bar(10),price:500},{time:bar(20),price:600},{time:bar(20),price:400}]).geometry(proj());
   expect(right.segments.slice(0,3).map((s:number[])=>s[2])).toEqual([602,602,602]);
  });
 }
 it('Fib fan and Gann fan open to the left when drawn right to left, with their labels on the left side',()=>{
  const fan=make('fibfan',[{time:bar(30),price:500},{time:bar(20),price:600}]);
  expect(fan.fanLines(proj()).every((l:any)=>l.x2===-2&&l.labelX===195)).toBe(true);
  const gann=make('gannfan',[{time:bar(30),price:500},{time:bar(20),price:600}]);
  expect(gann.entryLines(proj()).every((l:any)=>l.x2===-2&&l.numberAlign==='right')).toBe(true);
  expect(make('gannfan',[{time:bar(20),price:500},{time:bar(30),price:600}]).entryLines(proj()).every((l:any)=>l.x2===602)).toBe(true);
 });
});

describe('BUG 2 (painter): the native ray painter and the info line read the fixes',()=>{
 it('a ray drawn right to left hit-tests to the left of its first point and not to the right',()=>{
  const ray=make('ray',[{time:bar(30),price:500},{time:bar(20),price:600}]);// (300,500) -> (200,400): slope 1
  expect(ray.hitTest(100,300,proj(),2)).toBe(true);expect(ray.hitTest(400,600,proj(),2)).toBe(false);
  expect(make('ray',[{time:bar(20),price:600},{time:bar(30),price:500}]).hitTest(400,600,proj(),2)).toBe(true);
 });
 it('the installed painter extends a ray in its drawn direction (LV-VELA-DRAWING-FIXES-1)',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','utf8');
  expect(source).toContain('pts[1][0] < pts[0][0] - 1e-6 ? "left" : "right", proj.width, proj.height); /*! LarryVision LV-VELA-DRAWING-FIXES-1');
  expect(source).toContain('typeof d.lvPriceText === "function" ? d.lvPriceText(priceChange) : priceChange.toFixed(2)');
 });
 it('the info line writes its change with the instrument decimals',()=>{
  const line=make('infoline',[{time:bar(0),price:1.1},{time:bar(3),price:1.10237}]);
  expect(line.lvPriceText(0.00237)).toBe('0.0024');expect(line.lvPriceText(-0.00237)).toBe('-0.0024');
 });
});

describe('BUG 3: time levels are counted in bars',()=>{
 it('Fib time zones from a Thursday and a Friday land on bars 3, 4, 5, 6, 8, 11, 16, 24, 37 (no weekend gaps)',()=>{
  const zones=make('fibtimezones',[{time:bar(3),price:100},{time:bar(4),price:100}]);
  expect(new Date(bar(3)).getUTCDay()).toBe(4);
  expect(zones.zoneLines(proj()).map((z:any)=>barAt(z.x))).toEqual([3,4,5,6,8,11,16,24,37,58,92]);
 });
 it('Trend-based fib time levels are n bar units of p1..p2 after p3',()=>{
  const model=make('trendfibtime',[{time:bar(3),price:100},{time:bar(5),price:110},{time:bar(8),price:105}]);
  const xs=model.entryLines(proj()).map((row:any)=>barAt(row.x1));
  const ratios=model.levels.filter((lv:any)=>lv.enabled).map((lv:any)=>lv.ratio);
  expect(xs).toEqual(ratios.map((r:number)=>Math.round((8+2*r)*1000)/1000));
 });
 it('Gann box and Gann square time divisions are bar fractions of the box',()=>{
  for(const type of ['gannbox','gannsquare']){
   const model=make(type,[{time:bar(3),price:100},{time:bar(7),price:200}]);
   // The vertical rows (the Gann box now labels them with their ratio, 0.8.1 SPEC-1; the square keeps them unlabelled).
   const rows=model.entryLines(proj()).filter((row:any)=>row.x1===row.x2&&row.y1!==row.y2),enabled=model.levels.filter((lv:any)=>lv.enabled);
   expect(rows.map((row:any)=>barAt(row.x1))).toEqual(enabled.map((lv:any)=>Math.round((3+4*lv.ratio)*1000)/1000));
   expect(rows.map((row:any)=>row.numberText)).toEqual(type==='gannbox'?enabled.map((lv:any)=>lv.label??String(lv.ratio)):enabled.map(()=>''));
  }
 });
 it('Modified Schiff and Inside pitchfork use the bar midpoint of the pivot leg; the channel middle handle sits at the bar midpoint',()=>{
  // Pivot on a Friday (bar 4), first tine anchor on the next Tuesday (bar 6): the bar midpoint is the Monday, bar 5.
  const mod=make('modifiedschiffpitchfork',[{time:bar(4),price:500},{time:bar(6),price:600},{time:bar(8),price:400}]).geometry(proj());
  expect(barAt(mod.segments[0][0])).toBe(5);
  const inside=make('insidepitchfork',[{time:bar(4),price:500},{time:bar(6),price:600},{time:bar(8),price:400}]).geometry(proj());
  expect(barAt(inside.segments[4][0])).toBe(5);
  const channel=make('parallelchannel',[{time:bar(4),price:100},{time:bar(6),price:120},{time:bar(5),price:130}]);
  expect(barAt(channel.handlePoints(proj())[2][0])).toBe(5);
 });
});

describe('BUG 4: Elliott waves start at an origin point',()=>{
 it('impulse 6 points (origin, 1..5), correction 4, triangle 6, double combo 4, triple combo 6; the origin is unlabelled',()=>{
  const counts=Object.fromEntries(['elliottimpulse','elliottcorrection','lvelliotttriangle','lvelliottdoublecombo','lvelliotttriplecombo'].map(type=>{const m=make(type,[]);return[type,[m.anchorSchema().max,m.vertexLabels().join(',')]];}));
  expect(counts).toEqual({elliottimpulse:[6,',1,2,3,4,5'],elliottcorrection:[4,',A,B,C'],lvelliotttriangle:[6,',A,B,C,D,E'],lvelliottdoublecombo:[4,',W,X,Y'],lvelliotttriplecombo:[6,',W,X,Y,X,Z']});
 });
 it('a 0.8.1 wave saves its origin marker and reloads unchanged',()=>{
  const anchors=[0,1,2,3,4,5].map(i=>({time:bar(i),price:100+i*(i%2?10:-3)}));
  const wave=make('elliottimpulse',anchors),saved=wave.serialize();
  expect(saved.props).toEqual({[ELLIOTT_ORIGIN_FIELD]:1});
  expect(reload(wave).anchors).toEqual(anchors);
 });
 it('a pre-0.8.1 5-point impulse loads as a 6-point wave: old points kept, origin one leg back, wave 2 a 61.8% retracement',()=>{
  const old=[{time:bar(5),price:110},{time:bar(7),price:104},{time:bar(12),price:130},{time:bar(14),price:122},{time:bar(18),price:140}];
  const loaded=deserializeDrawing({id:'legacy',type:'elliottimpulse',paneId:'price',anchors:old,style:make('elliottimpulse',[]).style,locked:false,visible:true,zIndex:0,createdAt:1} as never) as any;
  expect(loaded.anchors).toHaveLength(6);expect(loaded.anchors.slice(1)).toEqual(old);
  expect(loaded.anchors[0]).toEqual(legacyOrigin(old[0],old[1]));
  expect(loaded.anchors[0].time).toBe(bar(5)-(bar(7)-bar(5)));
  expect((old[0].price-old[1].price)/(old[0].price-loaded.anchors[0].price)).toBeCloseTo(0.618,9);
  // Saved again, it is a 0.8.1 record and never migrates twice.
  expect(reload(loaded).anchors).toEqual(loaded.anchors);
 });
 it('legacy OpenCandle waves migrate the same way (triangle 5 -> 6)',()=>{
  const old=[1,2,3,4,5].map(i=>({time:bar(i*2),price:100+(i%2?10:-10)/i}));
  const loaded=deserializeDrawing({id:'legacy-t',type:'lvelliotttriangle',paneId:'price',anchors:old,locked:false,visible:true,zIndex:0,createdAt:1} as never) as any;
  expect(loaded.anchors).toHaveLength(6);expect(loaded.anchors.slice(1)).toEqual(old);
 });
});

describe('BUG 5: the triangle pattern draws both boundary lines to their apex',()=>{
 it('A-C and B-D extended to where they meet',()=>{
  const plan=trianglePatternPlan([[0,100],[100,300],[200,150],[300,250]])!;
  expect(plan.converging).toBe(true);
  expect(plan.apex![0]).toBeCloseTo(450,9);expect(plan.apex![1]).toBeCloseTo(212.5,9);
  expect(plan.lines.map(l=>l.map(v=>Math.round(v*10)/10))).toEqual([[0,100,450,212.5],[100,300,450,212.5]]);
 });
 it('a broadening shape draws the two lines to the last point bar instead',()=>{
  const plan=trianglePatternPlan([[0,180],[100,220],[200,150],[300,260]])!;
  expect(plan.converging).toBe(false);
  expect(plan.lines.map(l=>l[2])).toEqual([300,300]);
 });
 it('the drawing hit-tests its boundary lines',()=>{
  const model=make('lvtrianglepattern',[{time:bar(0),price:900},{time:bar(10),price:700},{time:bar(20),price:850},{time:bar(30),price:750}]);
  expect(typeof model.lvPaint).toBe('function');
  // Apex of A(0,100)-C(200,150) and B(100,300)-D(300,250) is x 450; a point on A-C beyond C:
  expect(model.hitTest(400,1000-(900-50*2),proj(),3)).toBe(true);
 });
});

describe('BUG 6: a parallel channel stays parallel on a log scale',()=>{
 const logY=(price:number)=>1000-200*Math.log(price);
 it('both lines are one screen offset apart at both ends',()=>{
  const model=make('parallelchannel',[{time:bar(0),price:10},{time:bar(10),price:100},{time:bar(5),price:60}]);
  const [base,top]=model.geometry(proj(logY)).segments;
  expect(top[1]-base[1]).toBeCloseTo(top[3]-base[3],9);
  // The offset handle lies on the parallel line at the bar midpoint.
  const h=model.handlePoints(proj(logY))[2];expect(h[1]).toBeCloseTo((top[1]+top[3])/2,9);
 });
 it('channel levels are equally spaced at both ends on a log scale',()=>{
  const levels={schemaVersion:1,levels:[0.5,2].map(ratio=>({enabled:true,ratio,color:'#fff',opacity:100,width:1,style:'solid' as const})),extendLeft:false,extendRight:false} as any;
  const ops=planChannelLevels(levels,[{time:bar(0),price:10},{time:bar(10),price:100},{time:bar(5),price:60}],{xOf:t=>10*logicalOf(t),yOf:logY},{left:0,right:600,top:0,bottom:1000},{color:'#fff',width:1,style:'solid'});
  const ya=logY(10),yb=logY(100),dy=logY(60)-(ya+yb)/2;
  expect(ops.map(op=>[op.y1,op.y2])).toEqual([[ya+0.5*dy,yb+0.5*dy],[ya+2*dy,yb+2*dy]]);
 });
 it('on a linear scale nothing changes: the offset is the native price offset',()=>{
  const model=make('parallelchannel',[{time:bar(0),price:100},{time:bar(4),price:120},{time:bar(2),price:115}]);
  expect(model.geometry(proj()).segments[1]).toEqual([0,1000-105,40,1000-125]);
 });
});

describe('RISK 1: a partial props patch keeps the Fib retracement direction',()=>{
 it('reverse survives a patch without it, and a new drawing starts unreversed (0 at the end of the move)',()=>{
  const fib=make('fibretracement',[{time:bar(0),price:100},{time:bar(5),price:200}]);
  expect(fib.reverse).toBe(false);expect(fib.levelPrice(0,100,200)).toBe(200);
  fib.applyProps({showPrices:false});expect(fib.reverse).toBe(false);
  fib.applyProps({reverse:true});fib.applyProps({labelSide:'right'});expect(fib.reverse).toBe(true);
  expect(make('fibretracement',[],{props:{showRatios:true}}).reverse).toBe(false);
  // A saved legacy record without `reverse` keeps the meaning it always had (reversed), so no saved drawing flips.
  const legacy=deserializeDrawing({...fib.serialize(),props:{showRatios:true}} as never) as any;expect(legacy.reverse).toBe(true);
  legacy.applyProps({showPrices:true});expect(legacy.reverse).toBe(true);
 });
});

describe('RISK 3: Gann square fixed holds price per bar',()=>{
 it('a box spanning a weekend keeps its proportion in bars',()=>{
  const bars=(a:number,b:number)=>Math.abs(logicalOf(b)-logicalOf(a));
  const anchors=[{time:bar(3),price:100},{time:bar(5),price:110}];// Thursday to Monday: 2 bars, 4 calendar days
  expect(gannRatio(anchors,bars)).toBe(5);
  const moved=[{...anchors[0]},{time:bar(7),price:150}];constrainFixedRatio(moved,1,5,1,bars);
  expect(moved[1].price).toBe(120);
 });
});

describe('Fib arcs and default levels',()=>{
 it('Fib arcs are centred on the second point and open back toward the first',()=>{
  const arcs=make('fibarcs',[{time:bar(0),price:500},{time:bar(10),price:500}]);
  const r=arcs.radial(proj());expect([r.cx,r.cy,r.R0]).toEqual([100,500,100]);
  expect(Math.cos((r.a0+r.a1)/2)).toBeCloseTo(-1,9);
 });
 it('new drawings add the standard levels; saved levels are kept as they are',()=>{
  expect(make('fibextensiontrend',[]).levels.map((lv:any)=>lv.ratio)).toEqual([0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2.618,3.618,4.236]);
  expect(make('fibtimezones',[]).levels.map((lv:any)=>lv.ratio)).toEqual([0,1,2,3,5,8,13,21,34,55,89]);
  const saved=make('fibtimezones',[{time:bar(0),price:1},{time:bar(1),price:1}]),props=saved.serialize().props;props.levels=props.levels.slice(0,3);
  expect(((deserializeDrawing({...saved.serialize(),props} as never) as any).serialize().props.levels as any[]).map((lv:any)=>lv.ratio)).toEqual([0,1,2]);
 });
});
