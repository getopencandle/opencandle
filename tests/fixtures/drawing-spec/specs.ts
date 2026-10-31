// Drawing tool specs (OpenCandle 0.8.1, lane S): what EVERY drawing tool in the catalog must show for a fixed set of anchors.
// Expectations come from each tool's standard definition (sources noted per spec), never from what the code happens to
// draw today. Content, geometry and labels only: no colours, widths or styling.
//
// Coordinates are [bar index, price] on the fixture in ./bars.ts (daily bars with weekend gaps; bar i is drawn at
// x = 100 + 10 i; the base scale maps price p to y = 1000 - p). Every element of a spec must be painted; extra painted
// elements are allowed unless the spec lists `exactTexts` (then the painted, non-empty texts must be exactly those).
// SYNTHETIC values only.
import {dailyBars,type ScaleId} from './bars';

export type BP=readonly [bar:number,price:number];
/** A straight element. `extend`: 'none' = a segment with exactly these ends; 'ray' = from `from` through `to` on to the pane
 *  edge; 'both' = the full line through both points, edge to edge; 'cover' = a collinear piece that covers from..to. */
export interface SegSpec{readonly from:BP;readonly to:BP;readonly extend?:'none'|'ray'|'both'|'cover';readonly dashed?:boolean;
 /** A label that belongs to this element: painted within `labelTol` px (default 30) of the element's midpoint (for a ray or
  *  line: of the from..to midpoint) and nearer to it than to any other spec element's midpoint. */
 readonly label?:string|RegExp;readonly labelTol?:number}
/** A horizontal level line over bars [from, to] at `price`, with its label painted on (within 14 px vertically) the line. */
export interface LevelSpec{readonly price:number;readonly from:number;readonly to:number;readonly label:string|RegExp}
export interface LabelSpec{readonly text:string|RegExp;
 /** Painted exactly here (within 1.5 px). */ readonly at?:BP;
 /** Painted within `tol` px (default 30) of this point. */ readonly near?:BP;readonly tol?:number}
/** What a custom check sees: the painted strokes, fills and texts in bar / price space. */
export interface Painted{
 readonly segs:readonly {a:BP;b:BP;curved:boolean;dashed:boolean}[];
 readonly curves:readonly (readonly BP[])[];
 readonly fills:readonly (readonly BP[])[];
 readonly texts:readonly {text:string;at:BP}[];
 /** Pixel helpers for screen-space geometry (circles, angles). */
 readonly px:(p:BP)=>[number,number];readonly unpx:(x:number,y:number)=>BP;
}
export type Part='segments'|'levels'|'labels'|'texts'|'fills'|'custom';
export type Invariant='finiteText'|'tickPrecision'|'mirror'|'logScale'|'roundTrip'|'intervalSwitch';
export interface DrawingSpec{
 /** Catalog row id (src/ui/drawing-tool-catalog.ts). */ readonly id:string;
 /** A label for a second case of the same row (e.g. the 5-decimal FX case). */ readonly variant?:string;
 readonly type:string;
 /** The tool's anchor count (min and max of its anchor schema). */ readonly anchorCount:readonly [number,number];
 readonly anchors:readonly BP[];
 readonly scale?:ScaleId;
 /** Instrument tick; defaults to the scale's tick (bars.ts TICK). */ readonly tick?:number;
 readonly props?:Record<string,unknown>;readonly text?:string;
 /** Where the convention comes from. */ readonly source:string;
 readonly segments?:readonly SegSpec[];
 readonly levels?:readonly LevelSpec[];
 readonly labels?:readonly LabelSpec[];
 readonly exactTexts?:readonly string[];
 /** Number of filled areas (count only). */ readonly fills?:number;
 /** Extra geometry checks; return one message per failure. */ readonly custom?:(p:Painted)=>string[];
 /** Invariants only, with the reason the tool has no content spec. */ readonly invariantsOnly?:string;
 /** Direction does not matter for this tool (a mirrored copy is not expected to paint the mirror image), with the reason. */
 readonly noMirror?:string;
 /** The mirrored copy legitimately prints different text (e.g. a calendar span across differently placed weekends), with the reason. */
 readonly mirrorTextsVary?:string;
 /** The text is a screen measurement that a log scale legitimately changes (e.g. an angle), with the reason; the log-scale
  *  check then compares the number of labels only. */
 readonly logTextsVary?:string;
 /** Known spec failures, per part or invariant: 'SPEC-<n>: what is wrong'. The case runs as it.fails until fixed. */
 readonly fails?:Partial<Record<Part|Invariant,string>>;
}

// ---------------------------------------------------------------- helpers
const seg=(from:BP,to:BP,o:Partial<SegSpec>={}):SegSpec=>({from,to,extend:'none',...o});
const ray=(from:BP,through:BP,o:Partial<SegSpec>={}):SegSpec=>({from,to:through,extend:'ray',...o});
const line=(a:BP,b:BP,o:Partial<SegSpec>={}):SegSpec=>({from:a,to:b,extend:'both',...o});
const vline=(bar:number,o:Partial<SegSpec>={}):SegSpec=>line([bar,100],[bar,900],o);
const hline=(price:number,o:Partial<SegSpec>={}):SegSpec=>line([10,price],[50,price],o);
/** Closed polygon edges. */
const polygon=(pts:BP[]):SegSpec[]=>pts.map((p,i)=>seg(p,pts[(i+1)%pts.length]));
const chain=(pts:readonly BP[],o:Partial<SegSpec>={}):SegSpec[]=>pts.slice(1).map((p,i)=>seg(pts[i],p,o));
const fix=(v:number,d:number)=>{const s=(Math.round(v*10**d)/10**d).toFixed(d);return s==='-0'+s.slice(2)&&Number(s)===0?s.slice(1):s;};
const mid=(a:BP,b:BP):BP=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const add=(a:BP,b:BP,k=1):BP=>[a[0]+k*b[0],a[1]+k*b[1]];
const sub=(a:BP,b:BP):BP=>[a[0]-b[0],a[1]-b[1]];
const ratioText=(v:number)=>v.toFixed(3);

/** Screen distance helpers on the base scale (x = 100 + 10 bar, y = 1000 - price). */
const pxOf=(p:BP):[number,number]=>[100+10*p[0],1000-p[1]];
const dist=(a:[number,number],b:[number,number])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function radiusCheck(p:Painted,center:BP,radii:number[],what:string,tol=1.5):string[]{
 // Every expected radius has a stroke with at least 8 points at that screen distance from the center, making up 80% of its
 // points away from the center (an arc may share its path with the radius lines).
 const c=pxOf(center),out:string[]=[];
 const curves=[...p.curves,p.segs.flatMap(s=>[s.a,s.b])].map(cv=>cv.map(pt=>dist(p.px(pt),c)).filter(d=>d>2));
 for(const r of radii){
  const hit=curves.some(ds=>{const on=ds.filter(d=>Math.abs(d-r)<=tol).length;return on>=8&&on>=0.8*ds.length;});
  if(!hit)out.push(`${what}: no curve at screen radius ${r.toFixed(2)} px around [${center}] (curve radii: ${curves.map(ds=>`${Math.min(...ds).toFixed(1)}..${Math.max(...ds).toFixed(1)}`).join(', ')})`);
 }
 return out;
}
function passesNear(p:Painted,pt:BP,tol=2):boolean{const c=pxOf(pt);return p.curves.some(cv=>cv.some(q=>dist(p.px(q),c)<=tol))||p.segs.some(s=>dist(p.px(s.a),c)<=tol||dist(p.px(s.b),c)<=tol);}
function curveFollows(p:Painted,f:(t:number)=>BP,what:string,tol=1.5):string[]{
 // A painted curve whose every sample lies on the parametric curve f (dense sampling of f, nearest distance).
 const ref:Array<[number,number]>=[];for(let i=0;i<=400;i++)ref.push(pxOf(f(i/400)));
 const near=(q:[number,number])=>Math.min(...ref.map(r=>dist(r,q)));
 const ok=p.curves.some(cv=>cv.length>4&&cv.every(q=>near(p.px(q))<=tol))||(p.segs.filter(s=>!s.dashed).length>8&&p.segs.filter(s=>!s.dashed).every(s=>near(p.px(s.a))<=tol&&near(p.px(s.b))<=tol));
 const ends=passesNear(p,f(0),tol+1)&&passesNear(p,f(1),tol+1);
 return ok&&ends?[]:[`${what}: painted curve does not follow the expected curve from [${f(0).map(v=>v.toFixed(2))}] to [${f(1).map(v=>v.toFixed(2))}]`];
}

// ---------------------------------------------------------------- fixtures computed from the conventions
// Fib retracement (StockCharts ChartSchool "Fibonacci Retracements"; MetaTrader 4 help "Fibonacci Retracement"): drawn from
// the start of the move A to its end B; level r sits at B - r (B - A), so 0 is the end of the move, 1 its start and 0.618 the
// 61.8% retracement. Levels above 1 are the extension targets beyond the start.
const FIB_RATIOS=[0,0.236,0.382,0.5,0.618,0.786,1,1.618,2.618,3.618,4.236];
function fibRetracement(a:BP,b:BP,d:number):LevelSpec[]{return FIB_RATIOS.map(r=>{const price=b[1]-r*(b[1]-a[1]);return{price,from:a[0],to:b[0],label:`${r} (${fix(price,d)})`};});}
// Trend-based fib extension (StockCharts "Fibonacci Projections"/"Price extensions"): three points A, B, C; level r is the
// AB move projected from C: C + r (B - A), drawn from C forward over the AB width.
const EXT_RATIOS=[0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2.618,3.618,4.236];
// Harmonic fixtures (Scott Carney, Harmonic Trading vols 1-2): textbook Gartley and Cypher, as in tests/chart/harmonic-ratios.test.ts.
const GX=250,GA=650,GB=GA-0.618*(GA-GX),GC=GB+0.618*(GA-GB),GD=GA-0.786*(GA-GX);
const GARTLEY:BP[]=[[20,GX],[25,GA],[30,GB],[35,GC],[41,GD]];
const CX=250,CA=450,CB=350,CC=CX+1.3*(CA-CX),CD=CC-0.786*(CC-CX);
const CYPHER:BP[]=[[20,CX],[25,CA],[30,CB],[35,CC],[41,CD]];
const ABCD:BP[]=[[23,300],[29,500],[33,500-0.618*200],[41,500-0.618*200+1.272*0.618*200]];
// Three drives (Carney; Bulkowski "Three drives"): corrections retrace 0.618, each drive extends its correction 1.272.
const T0=250,T1=550,TA=T1-0.618*(T1-T0),T2=TA+1.272*(T1-TA),TB=T2-0.618*(T2-TA),T3=TB+1.272*(T2-TB);
const DRIVES:BP[]=[[19,T0],[24,T1],[28,TA],[33,T2],[38,TB],[42,T3]];
// Anchored VWAP (Investopedia "Anchored VWAP"): sum(typical price x volume) / sum(volume) from the anchor bar on. The fixture's
// typical price (h + l + c) / 3 equals its close.
function vwapFrom(bar:number):BP[]{const bars=dailyBars();let pv=0,v=0;const out:BP[]=[];for(let i=bar;i<bars.length;i++){const b=bars[i],tp=(b.high+b.low+b.close)/3;pv+=tp*b.volume;v+=b.volume;out.push([i,pv/v]);}return out;}
// Regression trend (StockCharts "Linear Regression"/"Standard Deviation Channel"): least squares of the close on the BAR
// NUMBER (not calendar time), channel at +-2 population standard deviations of the residuals, Pearson's R of close vs bar.
function regression(from:number,to:number){
 const bars=dailyBars().slice(from,to+1),n=bars.length,xs=bars.map((_,i)=>from+i),ys=bars.map(b=>b.close);
 const mx=xs.reduce((s,x)=>s+x,0)/n,my=ys.reduce((s,y)=>s+y,0)/n;
 let sxy=0,sxx=0,syy=0;for(let i=0;i<n;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sxx+=(xs[i]-mx)**2;syy+=(ys[i]-my)**2;}
 const slope=sxy/sxx,at=(x:number)=>my+slope*(x-mx);
 const sd=Math.sqrt(ys.reduce((s,y,i)=>s+(y-at(xs[i]))**2,0)/n);
 return{at,dev:2*sd,r:sxy/Math.sqrt(sxx*syy)};
}
const REG=regression(20,44);
// Gann (W. D. Gann; Investopedia "Gann Fan" and "Gann Angles"): angles are written TIME x PRICE: 1x1 = 45 degrees, 1x2 = one
// unit of time for two of price (63.75 degrees, steep), 2x1 = 26.25 degrees (shallow), up to 1x8 = 82.5 and 8x1 = 7.5 degrees.
const GANN_FAN:[number,string][]=[[1/8,'8/1'],[1/4,'4/1'],[1/3,'3/1'],[1/2,'2/1'],[1,'1/1'],[2,'1/2'],[3,'1/3'],[4,'1/4'],[8,'1/8']];
const GANN_RATIOS=[0,0.25,0.382,0.5,0.618,0.75,1];

// ---------------------------------------------------------------- the specs
export const DRAWING_SPECS:readonly DrawingSpec[]=[
 // ===== Lines
 {id:'DW.TREND.TRENDLINE',type:'trendline',anchorCount:[2,2],anchors:[[26,320],[41,620]],source:'A trend line joins its two points and stops there (StockCharts "Trend Lines").',
  segments:[seg([26,320],[41,620])],exactTexts:[],fills:0},
 {id:'DW.TREND.RAY',type:'ray',anchorCount:[2,2],anchors:[[26,320],[36,520]],source:'A ray starts at its first point and runs through the second to the chart edge, in the drawn direction.',
  segments:[ray([26,320],[36,520])],exactTexts:[],fills:0},
 {id:'DW.TREND.INFO_LINE',type:'infoline',anchorCount:[2,2],anchors:[[26,320],[41,620]],source:'Info line: a trend segment with its price change, percent change and bar count (MetaTrader "Trendline" tooltip; common practice).',
  segments:[seg([26,320],[41,620],{label:/^\+300\.00 \(\+93\.75%\)\s+15 bars$/,labelTol:40})],exactTexts:['+300.00 (+93.75%)  15 bars']},
 {id:'DW.TREND.INFO_LINE',variant:'fx tick 0.00001',type:'infoline',anchorCount:[2,2],anchors:[[26,1.08],[41,1.08237]],scale:'fx',source:'Price change written with the instrument tick (5 decimals for EURUSD).',
  segments:[seg([26,1.08],[41,1.08237])],labels:[{text:/^\+0\.00237 \(\+0\.22%\)\s+15 bars$/}]},
 {id:'DW.TREND.EXTENDED_LINE',type:'extendedline',anchorCount:[2,2],anchors:[[28,380],[36,550]],source:'An extended line runs through both points to both chart edges.',
  segments:[line([28,380],[36,550])],exactTexts:[],fills:0},
 {id:'DW.TREND.TREND_ANGLE',type:'trendangle',anchorCount:[2,2],anchors:[[28,380],[40,580]],source:'Trend angle: the segment, a horizontal reference from the first point and the screen angle between them (atan(200 px / 120 px) = 59.0 degrees).',
  segments:[seg([28,380],[40,580]),seg([28,380],[40,380],{dashed:true})],exactTexts:['59.0°'],
  custom:p=>p.curves.length>=1?[]:['no angle arc painted'],logTextsVary:'the angle is measured on screen, so a log scale changes it',
  noMirror:'the angle is measured counter-clockwise from the forward (right-pointing) horizontal, so a mirrored line reads its supplement (see the right-to-left case)'},
 {id:'DW.TREND.TREND_ANGLE',variant:'drawn right to left',type:'trendangle',anchorCount:[2,2],anchors:[[32,380],[20,580]],source:'Angle counter-clockwise from the forward horizontal (the unit-circle convention): a line rising to the left reads 180 - 59.0 = 121.0 degrees, measured from a reference that points right.',
  segments:[seg([32,380],[20,580]),seg([32,380],[44,380],{dashed:true})],exactTexts:['121.0°'],logTextsVary:'the angle is measured on screen, so a log scale changes it',
  noMirror:'see the left-to-right case'},
 {id:'DW.TREND.HORIZONTAL_LINE',type:'hline',anchorCount:[1,1],anchors:[[35,550]],source:'A horizontal line at the price, across the whole chart.',
  segments:[hline(550)],fills:0,noMirror:'one point; the mirror is the same line'},
 {id:'DW.TREND.HORIZONTAL_RAY',type:'hray',anchorCount:[1,1],anchors:[[28,550]],source:'A horizontal ray at the price from the point to the right edge (MetaTrader/TradingView horizontal ray, forward in time).',
  segments:[ray([28,550],[40,550])],fills:0,noMirror:'always extends forward in time from its point'},
 {id:'DW.TREND.VERTICAL_LINE',type:'vline',anchorCount:[1,1],anchors:[[35,500]],source:'A vertical line at the bar, full height.',
  segments:[vline(35)],fills:0},
 {id:'DW.TREND.CROSSLINE',type:'crossline',anchorCount:[1,1],anchors:[[35,550]],source:'A horizontal and a vertical line through the point.',
  segments:[hline(550),vline(35)],fills:0},
 // ===== Channels
 {id:'DW.CHANNEL.PARALLEL_CHANNEL',type:'parallelchannel',anchorCount:[3,3],anchors:[[22,320],[40,550],[31,650]],source:'Parallel channel: the A-B line and a parallel copy through the third point (placed at the bar midpoint, where the app puts the width handle); StockCharts "Price Channels".',
  segments:[seg([22,320],[40,550]),seg([22,535],[40,765])],fills:1},
 {id:'DW.CHANNEL.REGRESSION_TREND',type:'regressionchannel',anchorCount:[2,2],anchors:[[20,500],[44,500]],source:'Linear regression of the close on the bar number over the two anchors, +-2 standard deviations, Pearson\'s R (StockCharts "Linear Regression", "Standard Deviation Channel").',
  segments:[seg([20,REG.at(20)],[44,REG.at(44)]),seg([20,REG.at(20)+REG.dev],[44,REG.at(44)+REG.dev]),seg([20,REG.at(20)-REG.dev],[44,REG.at(44)-REG.dev])],
  exactTexts:[`Pearson's R ${REG.r.toFixed(2)}`],noMirror:'computed from the loaded bars, which are not symmetric'},
 {id:'DW.CHANNEL.FLAT_TOP_BOTTOM',type:'flattopbottom',anchorCount:[3,3],anchors:[[23,350],[40,550],[30,700]],source:'Flat top/bottom channel: the A-B trend line and a horizontal line at the third point\'s price over the same bars.',
  segments:[seg([23,350],[40,550]),seg([23,700],[40,700])],fills:1},
 {id:'DW.CHANNEL.DISJOINT_CHANNEL',type:'disjointchannel',anchorCount:[4,4],anchors:[[23,400],[40,600],[40,350],[23,250]],source:'Disjoint channel: two independent lines A-B and C-D bounding one area.',
  segments:[seg([23,400],[40,600]),seg([40,350],[23,250])],fills:1},
 // ===== Pitchforks (Alan Andrews; Jerome Schiff; StockCharts "Andrews' Pitchfork", Investopedia "Schiff Pitchfork")
 ...(()=>{
  const A:BP=[21,320],B:BP=[29,700],C:BP=[35,400],M=mid(B,C);
  const fork=(o:BP)=>{const d=sub(M,o);return[ray(o,M),ray(B,add(B,d)),ray(C,add(C,d)),seg(B,C)];};
  const schiff:BP=[21,(A[1]+B[1])/2],modified=mid(A,B);
  const insideDir=sub(C,modified);
  return[
   {id:'DW.PITCHFORK.PITCHFORK',type:'pitchfork',anchorCount:[3,3] as const,anchors:[A,B,C],source:'Andrews pitchfork: median line from the pivot A through the midpoint of B-C; tines from B and C parallel to it; extended forward in the drawn direction.',
    segments:fork(A)},
   {id:'DW.PITCHFORK.SCHIFF_PITCHFORK',type:'schiffpitchfork',anchorCount:[3,3] as const,anchors:[A,B,C],source:'Schiff pitchfork: the median starts at A\'s bar, halfway between A and B in price.',
    segments:[...fork(schiff),seg(A,B)]},
   {id:'DW.PITCHFORK.MODIFIED_SCHIFF_PITCHFORK',type:'modifiedschiffpitchfork',anchorCount:[3,3] as const,anchors:[A,B,C],source:'Modified Schiff pitchfork: the median starts at the midpoint of A-B in both time (bars) and price.',
    segments:[...fork(modified),seg(A,B)]},
   {id:'DW.PITCHFORK.INSIDE_PITCHFORK',type:'insidepitchfork',anchorCount:[3,3] as const,anchors:[A,B,C],source:'Inside pitchfork (no external standard; the tool\'s definition): median from the midpoint of B-C parallel to the line from the A-B midpoint to C; tines from B and C parallel.',
    segments:[ray(M,add(M,insideDir)),ray(B,add(B,insideDir)),ray(C,add(C,insideDir)),seg(B,C),seg(modified,C),seg(A,B)]},
  ] as DrawingSpec[];
 })(),
 // ===== Fibonacci
 {id:'DW.FIB.FIBONACCI_RETRACEMENT',type:'fibretracement',anchorCount:[2,2],anchors:[[25,250],[40,700]],source:'StockCharts "Fibonacci Retracements"; MetaTrader 4 "Fibonacci Retracement": 0 at the end of the move, 1 at its start.',
  levels:fibRetracement([25,250],[40,700],2),exactTexts:fibRetracement([25,250],[40,700],2).map(l=>String(l.label)),fills:10},
 {id:'DW.FIB.FIBONACCI_RETRACEMENT',variant:'fx tick 0.00001',type:'fibretracement',anchorCount:[2,2],anchors:[[25,1.08],[40,1.09]],scale:'fx',source:'EURUSD levels printed with the 5-decimal tick so 0.5 reads 1.08500 and no two levels collide.',
  levels:fibRetracement([25,1.08],[40,1.09],5),exactTexts:fibRetracement([25,1.08],[40,1.09],5).map(l=>String(l.label))},
 (()=>{const A:BP=[23,250],B:BP=[30,650],C:BP=[36,400],levels=EXT_RATIOS.map(r=>{const price=C[1]+r*(B[1]-A[1]);return{price,from:C[0],to:C[0]+(B[0]-A[0]),label:`${r} (${fix(price,2)})`};});
  return{id:'DW.FIB.TREND_BASED_FIB_EXTENSION',type:'fibextensiontrend',anchorCount:[3,3],anchors:[A,B,C],source:'Trend-based fib extension: level r = C + r (B - A), drawn from C forward over the A-B width (StockCharts "Fibonacci Projections").',
   segments:[seg(A,B,{dashed:true}),seg(B,C,{dashed:true})],levels,exactTexts:levels.map(l=>String(l.label)),
   fails:{mirror:'SPEC-5: Trend-based fib extension drawn right to left still runs its level lines to the right of C (back across the drawn legs) instead of in the drawn direction, unlike rays, pitchforks and fans (0.8.1 BUG 2 rule).'}} as DrawingSpec;})(),
 (()=>{const A:BP=[23,300],B:BP=[38,550],C:BP=[28,600],R=[0,0.236,0.382,0.5,0.618,0.786,1,1.618,2.618],off=sub(C,A);
  return{id:'DW.FIB.FIB_CHANNEL',type:'fibchannel',anchorCount:[3,3],anchors:[A,B,C],source:'Fib channel: lines parallel to A-B at Fibonacci multiples of the channel width set by the third point (0 = A-B, 1 = through C).',
   segments:R.map(r=>seg(add(A,off,r),add(B,off,r))),labels:R.map(r=>({text:String(r),near:add(B,off,r),tol:12})),exactTexts:R.map(String),fills:R.length-1} as DrawingSpec;})(),
 (()=>{const F=[0,1,2,3,5,8,13,21,34,55,89];
  return{id:'DW.FIB.FIB_TIME_ZONE',type:'fibtimezones',anchorCount:[2,2],anchors:[[20,500],[23,500]],source:'Fib time zones: vertical lines at Fibonacci multiples (0, 1, 2, 3, 5, 8, 13 ...) of the first-to-second-point interval, COUNTED IN BARS (StockCharts "Fibonacci Time Zones").',
   segments:F.map(f=>vline(20+3*f,{dashed:true})),labels:F.map(f=>({text:String(f),near:[20+3*f,NaN] as BP,tol:4})),exactTexts:F.map(String)} as DrawingSpec;})(),
 (()=>{const A:BP=[25,250],B:BP=[35,650],R=[0,0.236,0.382,0.5,0.618,0.786,1];
  return{id:'DW.FIB.FIB_SPEED_RESISTANCE_FAN',type:'fibspeedfan',anchorCount:[2,2],anchors:[A,B],source:'Fib speed resistance fan: rays from A through the Fibonacci fractions of the advance on B\'s bar, and through the same fractions of the time span on B\'s price (StockCharts "Speed Resistance Lines": the 2/3 line passes 2/3 of the way up the advance).',
   segments:[...R.map(r=>ray(A,[B[0],A[1]+r*(B[1]-A[1])])),...R.filter(r=>r!==1).map(r=>r===0?ray(A,[A[0],B[1]]):ray(A,[A[0]+r*(B[0]-A[0]),B[1]]))],
   labels:[...R.map(r=>({text:String(r),near:[B[0],A[1]+r*(B[1]-A[1])] as BP,tol:12})),...R.filter(r=>r!==1).map(r=>({text:String(r),near:[A[0]+r*(B[0]-A[0]),B[1]] as BP,tol:16}))],
   fails:{mirror:'SPEC-6: Fib speed resistance fan drawn right to left paints its 0 time line from the bottom edge up to the second point\'s price instead of from the first point toward (and past) it.'}} as DrawingSpec;})(),
 {id:'DW.FIB.FIB_SPEED_RESISTANCE_FAN',variant:'drawn right to left',type:'fibspeedfan',anchorCount:[2,2],anchors:[[35,250],[25,650]],source:'Drawn right to left, every fan ray (including the vertical 0 time line) starts at the first point and runs toward the second.',
  segments:[ray([35,250],[35,650]),ray([35,250],[25,650]),ray([35,250],[25,250])],
  fails:{segments:'SPEC-6: the vertical 0 time line of a right-to-left fan runs from the bottom edge to the second point\'s price, not from the first point up through it.',mirror:'SPEC-6: see the segments case.'}},
 (()=>{const A:BP=[20,300],B:BP=[25,650],C:BP=[29,400],R=[0,0.382,0.618,1,1.382,1.618,2,2.382,2.618,3];
  return{id:'DW.FIB.TREND_BASED_FIB_TIME',type:'trendfibtime',anchorCount:[3,3],anchors:[A,B,C],source:'Trend-based fib time: vertical lines at C + r x (bars from A to B), counted in bars.',
   segments:[seg(A,B,{dashed:true}),seg(B,C,{dashed:true}),...R.map(r=>vline(C[0]+r*(B[0]-A[0])))],labels:R.map(r=>({text:String(r),near:[C[0]+r*(B[0]-A[0]),NaN] as BP,tol:4})),exactTexts:R.map(String)} as DrawingSpec;})(),
 (()=>{const A:BP=[30,450],B:BP=[34,600],R=[0.236,0.382,0.5,0.618,0.786,1,1.618,2.618],d=dist(pxOf(A),pxOf(B));
  return{id:'DW.FIB.FIB_CIRCLES',type:'fibcircles',anchorCount:[2,2],anchors:[A,B],source:'Fib circles: circles centred on the first point with radii at Fibonacci multiples of the first-to-second-point distance.',
   exactTexts:R.map(String),custom:p=>radiusCheck(p,A,R.map(r=>r*d),'fib circle')} as DrawingSpec;})(),
 {id:'DW.FIB.FIB_SPIRAL',type:'fibspiral',anchorCount:[2,2],anchors:[[33,500],[36,600]],source:'Fib spiral: a golden (logarithmic) spiral around the first point through the second; growth phi per quarter turn.',
  custom:p=>{
   const c=pxOf([33,500]),r0=dist(c,pxOf([36,600])),pts=p.segs.map(s=>p.px(s.a));if(pts.length<20)return['no spiral painted'];
   const out:string[]=[];if(!passesNear(p,[36,600],2.5))out.push('the spiral does not pass through the second point');
   // A golden spiral: r(theta) = r0 phi^(2 theta / pi). Its radius grows by phi^4 = 6.854 per full turn.
   const radii=pts.map(q=>dist(q,c)),max=Math.max(...radii);if(!(max>r0*1.5))out.push('the spiral does not grow beyond the second point');
   return out;},exactTexts:[],noMirror:'the spiral turns one way (its handedness is the tool\'s convention, not the drawn direction)'},
 (()=>{const A:BP=[25,250],B:BP=[35,650],R=[0.236,0.382,0.5,0.618,0.786,1,1.618,2.618],d=dist(pxOf(A),pxOf(B));
  return{id:'DW.FIB.FIB_SPEED_RESISTANCE_ARCS',type:'fibarcs',anchorCount:[2,2],anchors:[A,B],source:'Fib speed resistance arcs: arcs centred on the second point at Fibonacci fractions of the trend length, opening back toward the first point (StockCharts "Fibonacci Arcs").',
   exactTexts:R.map(String),custom:p=>{const out=radiusCheck(p,B,R.map(r=>r*d),'fib arc');
    // Each arc lies on A's side of B (the arcs face back toward the trend's start).
    const b=pxOf(B),a=pxOf(A);for(const cv of p.curves){const m=cv[Math.floor(cv.length/2)],q=p.px(m);if((q[0]-b[0])*(a[0]-b[0])+(q[1]-b[1])*(a[1]-b[1])<0)out.push('an arc opens away from the first point');}return out;}} as DrawingSpec;})(),
 (()=>{const A:BP=[25,500],B:BP=[40,700],C:BP=[40,300],R=[0.236,0.382,0.5,0.618,0.786,1],d=dist(pxOf(A),pxOf(B));
  return{id:'DW.FIB.FIB_WEDGE',type:'fibwedge',anchorCount:[3,3],anchors:[A,B,C],source:'Fib wedge: arcs centred on the apex A at Fibonacci fractions of A-B, between the wedge lines A-B and A-C.',
   segments:[seg(A,B,{extend:'cover'}),seg(A,C,{extend:'cover'})],exactTexts:R.map(String),custom:p=>radiusCheck(p,A,R.map(r=>r*d),'fib wedge arc')} as DrawingSpec;})(),
 (()=>{const A:BP=[21,320],B:BP=[29,700],C:BP=[35,400],M=mid(B,C);
  return{id:'DW.FIB.PITCHFAN',type:'lvpitchfan',anchorCount:[3,3],anchors:[A,B,C],source:'Pitchfan: rays from the pivot A through B, through the midpoint of B-C (the pitchfork median) and through C.',
   segments:[ray(A,B),ray(A,M),ray(A,C),seg(B,C)],exactTexts:[]} as DrawingSpec;})(),
 // ===== Gann
 (()=>{const A:BP=[25,280],B:BP=[40,680],dp=B[1]-A[1],dt=B[0]-A[0];
  return{id:'DW.GANN.GANN_BOX',type:'gannbox',anchorCount:[2,2],anchors:[A,B],source:'Gann box: price and time divided at 0, 0.25, 0.382, 0.5, 0.618, 0.75, 1 of the box, with both diagonals; time divisions counted in bars and labelled with their ratio like the price divisions.',
   segments:[...GANN_RATIOS.map(r=>seg([A[0],A[1]+r*dp],[B[0],A[1]+r*dp])),...GANN_RATIOS.map(r=>seg([A[0]+r*dt,B[1]],[A[0]+r*dt,A[1]])),seg(A,B),seg([A[0],B[1]],[B[0],A[1]])],
   labels:[...GANN_RATIOS.map(r=>({text:String(r),near:[A[0],A[1]+r*dp] as BP,tol:14}))],
   custom:p=>{const out:string[]=[];for(const r of GANN_RATIOS){const x=A[0]+r*dt;if(!p.texts.some(t=>t.text===String(r)&&Math.abs(t.at[0]-x)<0.8&&(Math.abs(t.at[1]-A[1])<30||Math.abs(t.at[1]-B[1])<30)))out.push(`no "${r}" label on the time division at bar ${x}`);}return out;},
   fails:{custom:'SPEC-1: Gann box time divisions are painted with an empty label ("") instead of their ratio; only the price divisions are labelled.'}} as DrawingSpec;})(),
 ...(['DW.GANN.GANN_SQUARE','DW.GANN.GANN_SQUARE_FIXED'] as const).map(id=>{const type=id==='DW.GANN.GANN_SQUARE'?'gannsquare':'lvgannsquarefixed',A:BP=[25,280],B:BP=[35,580],dp=300,dt=10;
  return{id,type,anchorCount:[2,2],anchors:[A,B],source:'Gann square: the Gann box grid plus the Gann angles from the pivot, written time x price (Investopedia "Gann Angles"): 1x1 to the opposite corner, 2x1/3x1 shallow to 1/2 and 1/3 of the price side, 1x2/1x3 steep to 1/2 and 1/3 of the time side; arcs at the grid fractions.',
   segments:[...GANN_RATIOS.map(r=>seg([A[0],A[1]+r*dp],[B[0],A[1]+r*dp])),...GANN_RATIOS.map(r=>seg([A[0]+r*dt,B[1]],[A[0]+r*dt,A[1]])),
    seg(A,B),seg(A,[B[0],A[1]+dp/3]),seg(A,[B[0],A[1]+dp/2]),seg(A,[A[0]+dt/2,B[1]]),seg(A,[A[0]+dt/3,B[1]])],
   labels:[...GANN_RATIOS.map(r=>({text:String(r),near:[A[0],A[1]+r*dp] as BP,tol:14})),{text:'1x1',near:B,tol:12},{text:'3x1',near:[B[0],A[1]+dp/3],tol:12},{text:'2x1',near:[B[0],A[1]+dp/2],tol:12},{text:'1x2',near:[A[0]+dt/2,B[1]],tol:12},{text:'1x3',near:[A[0]+dt/3,B[1]],tol:12}],
   custom:p=>p.curves.length>=1?[]:['no Gann arcs painted']} as DrawingSpec;}),
 (()=>{const A:BP=[25,250],B:BP=[33,550],slope=(B[1]-A[1])/(B[0]-A[0]);
  return{id:'DW.GANN.GANN_FAN',type:'gannfan',anchorCount:[2,2],anchors:[A,B],source:'Gann fan (Investopedia "Gann Fan"): nine rays from the pivot; 1x1 through the second point; angles written time x price, so 1x2 (63.75 degrees) is twice as steep as 1x1 and 2x1 (26.25 degrees) half as steep, out to 1x8 (82.5) and 8x1 (7.5).',
   segments:GANN_FAN.map(([k])=>ray(A,[B[0],A[1]+k*slope*(B[0]-A[0])])),
   labels:GANN_FAN.map(([k,text])=>({text,near:[B[0],A[1]+k*slope*(B[0]-A[0])] as BP,tol:14})),
   fails:{labels:'SPEC-2: Gann fan angle labels are inverted against the Gann time x price notation the Gann square in the same app uses: the ray twice as steep as 1x1 reads "2/1" (should be 1/2, 63.75 degrees) and the half-slope ray reads "1/2" (should be 2/1); 1/8 and 8/1, 1/4 and 4/1, 1/3 and 3/1 are swapped the same way.'}} as DrawingSpec;})(),
 // ===== Patterns (Carney harmonics; Bulkowski chart patterns)
 {id:'DW.PATTERN.XABCD_PATTERN',type:'xabcd',anchorCount:[5,5],anchors:GARTLEY,source:'Carney XABCD: legs X-A-B-C-D; AB/XA on X-B, BC/AB on A-C, CD/BC on B-D, AD/XA on X-D, each printed at its diagonal\'s midpoint (textbook Gartley 0.618 / 0.618 / 1.440 / 0.786).',
  segments:[...chain(GARTLEY),seg(GARTLEY[0],GARTLEY[2],{dashed:true}),seg(GARTLEY[1],GARTLEY[3],{dashed:true}),seg(GARTLEY[2],GARTLEY[4],{dashed:true}),seg(GARTLEY[0],GARTLEY[4],{dashed:true})],
  labels:[{text:'0.618',at:mid(GARTLEY[0],GARTLEY[2])},{text:'0.618',at:mid(GARTLEY[1],GARTLEY[3])},{text:ratioText((GC-GD)/(GC-GB)),at:mid(GARTLEY[2],GARTLEY[4])},{text:'0.786',at:mid(GARTLEY[0],GARTLEY[4])}],
  exactTexts:['X','A','B','C','D','0.618','0.618','1.440','0.786']},
 {id:'DW.PATTERN.CYPHER_PATTERN',type:'cypher',anchorCount:[5,5],anchors:CYPHER,source:'Carney/Oglesbee Cypher: AB/XA on X-B, XC/XA on X-C, CD/XC on X-D (never the generic BC/AB or CD/BC); a validity mark.',
  segments:[...chain(CYPHER),seg(CYPHER[0],CYPHER[2],{dashed:true}),seg(CYPHER[0],CYPHER[3],{dashed:true}),seg(CYPHER[0],CYPHER[4],{dashed:true})],
  labels:[{text:'0.500',at:mid(CYPHER[0],CYPHER[2])},{text:'1.300',at:mid(CYPHER[0],CYPHER[3])},{text:'0.786',at:mid(CYPHER[0],CYPHER[4])},{text:/^Cypher ✓$/}],
  exactTexts:['X','A','B','C','D','0.500','1.300','0.786','Cypher ✓']},
 {id:'DW.PATTERN.HEAD_AND_SHOULDERS_PATTERN',type:'headshoulders',anchorCount:[7,7],anchors:[[18,300],[21,550],[25,380],[30,750],[35,380],[39,550],[43,300]],source:'Bulkowski "Head-and-Shoulders Tops": left shoulder, head, right shoulder; the neckline joins the two armpits (troughs) and runs across the pattern.',
  segments:[...chain([[18,300],[21,550],[25,380],[30,750],[35,380],[39,550],[43,300]]),seg([25,380],[35,380],{extend:'cover',dashed:true})],
  labels:[{text:'LS',near:[21,550],tol:12},{text:'H',near:[30,750],tol:12},{text:'RS',near:[39,550],tol:12}],exactTexts:['LS','H','RS']},
 {id:'DW.PATTERN.ABCD_PATTERN',type:'abcd',anchorCount:[4,4],anchors:ABCD,source:'Carney AB=CD: BC/AB on A-C and CD/BC on B-D at their midpoints (0.618 / 1.272).',
  segments:[...chain(ABCD),seg(ABCD[0],ABCD[2],{dashed:true}),seg(ABCD[1],ABCD[3],{dashed:true})],
  labels:[{text:'0.618',at:mid(ABCD[0],ABCD[2])},{text:'1.272',at:mid(ABCD[1],ABCD[3])}],exactTexts:['A','B','C','D','0.618','1.272']},
 {id:'DW.PATTERN.TRIANGLE_PATTERN',type:'lvtrianglepattern',anchorCount:[4,4],anchors:[[23,700],[28,300],[33,600],[38,400]],source:'Bulkowski "Symmetrical Triangles": the zigzag A-B-C-D and both boundary lines A-C and B-D drawn to their apex (here bar 45.5, price 475).',
  segments:[...chain([[23,700],[28,300],[33,600],[38,400]]),seg([23,700],[45.5,475]),seg([28,300],[45.5,475])],exactTexts:['A','B','C','D'],fills:2},
 {id:'DW.PATTERN.THREE_DRIVES_PATTERN',type:'lvthreedrives',anchorCount:[6,6],anchors:DRIVES,source:'Three drives (Carney; Bulkowski): drives 1-2-3 with corrections A and B; correction ratios on start-A and 2-B diagonals, drive ratios on 1-2 and A-3 (0.618 / 1.272).',
  segments:[...chain(DRIVES),...[[0,2],[1,3],[2,4],[3,5]].map(([i,j])=>seg(DRIVES[i],DRIVES[j],{dashed:true}))],
  labels:[{text:'0.618',at:mid(DRIVES[0],DRIVES[2])},{text:'1.272',at:mid(DRIVES[1],DRIVES[3])},{text:'0.618',at:mid(DRIVES[2],DRIVES[4])},{text:'1.272',at:mid(DRIVES[3],DRIVES[5])}],
  exactTexts:['1','A','2','B','3','0.618','1.272','0.618','1.272']},
 // ===== Elliott waves (Frost and Prechter, Elliott Wave Principle): each wave starts at an unlabelled origin point.
 ...([['DW.ELLIOTT.ELLIOTT_IMPULSE_WAVE','elliottimpulse',[[20,280],[25,500],[29,400],[35,720],[39,580],[44,800]],['1','2','3','4','5'],'impulse 0-1-2-3-4-5'],
  ['DW.ELLIOTT.ELLIOTT_CORRECTION_WAVE','elliottcorrection',[[25,700],[31,400],[35,550],[41,250]],['A','B','C'],'zigzag correction A-B-C'],
  ['DW.ELLIOTT.ELLIOTT_TRIANGLE_WAVE','lvelliotttriangle',[[20,700],[25,300],[30,620],[35,380],[39,550],[43,450]],['A','B','C','D','E'],'triangle A-B-C-D-E'],
  ['DW.ELLIOTT.ELLIOTT_DOUBLE_COMBO_WAVE','lvelliottdoublecombo',[[23,700],[29,400],[34,550],[41,280]],['W','X','Y'],'double three W-X-Y'],
  ['DW.ELLIOTT.ELLIOTT_TRIPLE_COMBO_WAVE','lvelliotttriplecombo',[[20,700],[25,450],[30,580],[35,350],[39,500],[44,250]],['W','X','Y','X','Z'],'triple three W-X-Y-X-Z']] as const)
  .map(([id,type,pts,names,what])=>({id,type,anchorCount:[pts.length,pts.length] as const,anchors:pts as unknown as BP[],source:`Frost and Prechter: ${what}, starting at the origin point (unlabelled); each label on its wave end.`,
   segments:chain(pts as unknown as BP[]),labels:(names as readonly string[]).map((text,i)=>({text,near:pts[i+1] as unknown as BP,tol:12})),exactTexts:[...names]} as DrawingSpec)),
 // ===== Cycles
 {id:'DW.CYCLE.CYCLIC_LINES',type:'lvcycliclines',anchorCount:[2,2],anchors:[[20,500],[24,500]],source:'Cyclic lines: vertical lines repeating the first-to-second-point interval (4 bars) to the right edge.',
  segments:[20,24,28,32,36,40,44,48,52,56,60,64,68].map(b=>vline(b)),exactTexts:[]},
 {id:'DW.CYCLE.TIME_CYCLES',type:'lvtimecycles',anchorCount:[2,2],anchors:[[20,400],[25,400]],source:'Time cycles: half circles of the first-to-second-point diameter repeated along the baseline to the right edge.',
  custom:p=>{const out:string[]=[],pts=p.segs.flatMap(s=>[s.a,s.b]);for(let k=0;20+5*k<=65;k++){const c=pxOf([22.5+5*k,400]),own=pts.filter(q=>q[0]>=20+5*k&&q[0]<=25+5*k);
    if(own.length<6||own.some(q=>Math.abs(dist(p.px(q),c)-25)>1.5)||!own.some(q=>q[1]>424))out.push(`no half circle from bar ${20+5*k} to ${25+5*k} (radius 25 px around bar ${22.5+5*k})`);}return out;},exactTexts:[]},
 {id:'DW.CYCLE.SINE_LINE',type:'lvsineline',anchorCount:[2,2],anchors:[[25,500],[29,650]],source:'Sine line: a sine wave with a trough at the first point and the next peak at the second (half period 4 bars), across the chart.',
  custom:p=>{const pts=p.segs.flatMap(s=>[s.a,s.b]);if(pts.length<20)return['no sine painted'];const bad=pts.filter(q=>Math.abs(q[1]-(575-75*Math.cos(Math.PI*(q[0]-25)/4)))>1.5);
   const span=[Math.min(...pts.map(q=>q[0])),Math.max(...pts.map(q=>q[0]))];
   return [...(bad.length?[`${bad.length} sine samples off the curve, e.g. [${bad[0].map(v=>v.toFixed(2))}]`]:[]),...(span[0]<=0&&span[1]>=60?[]:[`the sine spans bars ${span} instead of the chart width`])];}},
 // ===== Forecasting
 {id:'DW.FORECAST.LONG_POSITION',type:'position',anchorCount:[2,2],anchors:[[35,450],[44,650]],source:'Long position (risk/reward tool): entry, target, a default stop half the target distance below; offsets in price and %, ticks, amounts; R/R = reward / risk = 2.',
  segments:[seg([35,450],[44,450])],exactTexts:['Target: 200.00 (44.44%) 20000, Amount: 500.00','Open P&L: 0.00, Qty: 2.50','Risk/reward ratio: 2','Stop: 100.00 (22.22%) 10000, Amount: 250.00'],noMirror:'the position box always runs forward in time from the entry'},
 {id:'DW.FORECAST.LONG_POSITION',variant:'filled, target hit',type:'position',anchorCount:[2,2],anchors:[[35,645],[50,700]],source:'The fixture bars trade through the entry 645 on bar 35 and reach the target 700 on bar 47 (high 706) without touching the stop 617.50: a closed trade. The quantity is the 250.00 risk over the 27.50 stop distance, rounded to the 2-decimal quantity precision (9.09), and the amounts use that rounded quantity: 9.09 x 55 = 499.95, 9.09 x 27.5 = 249.97.',
  exactTexts:['Target: 55.00 (8.53%) 5500, Amount: 499.95','Closed P&L: 499.95, Qty: 9.09','Risk/reward ratio: 2','Stop: 27.50 (4.26%) 2750, Amount: 249.97'],noMirror:'the position box always runs forward in time from the entry'},
 {id:'DW.FORECAST.LONG_POSITION',variant:'fx tick 0.00001',type:'position',anchorCount:[2,2],anchors:[[35,1.08],[44,1.082]],scale:'fx',source:'Offsets in the instrument tick (5 decimals) and tick counts of 0.00001.',
  exactTexts:['Target: 0.00200 (0.19%) 200, Amount: 500.00','Open P&L: 0.00, Qty: 250000.00','Risk/reward ratio: 2','Stop: 0.00100 (0.09%) 100, Amount: 250.00'],noMirror:'the position box always runs forward in time from the entry'},
 {id:'DW.FORECAST.SHORT_POSITION',type:'lvshortposition',anchorCount:[2,2],anchors:[[35,550],[44,350]],source:'Short position: target below the entry, default stop above; percentages of the entry price.',
  segments:[seg([35,550],[44,550])],exactTexts:['Target: 200.00 (36.36%) 20000, Amount: 500.00','Open P&L: 0.00, Qty: 2.50','Risk/reward ratio: 2','Stop: 100.00 (18.18%) 10000, Amount: 250.00'],noMirror:'the position box always runs forward in time from the entry'},
 {id:'DW.FORECAST.POSITION_FORECAST',type:'lvpositionforecast',anchorCount:[2,2],anchors:[[36,450],[45,650]],source:'Position forecast: a line from the start price to the forecast with the start price, the change (price and %) and the bar count.',
  segments:[seg([36,450],[45,650])],exactTexts:['450.00','+200.00 (+44.44%)','9 bars'],
  fails:{tickPrecision:'SPEC-7: Position forecast writes its start price with a fixed 2 decimals (149.00 for tick 0.001) instead of the instrument tick.'}},
 {id:'DW.FORECAST.POSITION_FORECAST',variant:'fx tick 0.00001',type:'lvpositionforecast',anchorCount:[2,2],anchors:[[36,1.08],[45,1.0823]],scale:'fx',source:'EURUSD start price and change with 5 decimals.',
  exactTexts:['1.08000','+0.00230 (+0.21%)','9 bars'],fails:{texts:'SPEC-7: Position forecast prints EURUSD as "1.08" and "+0.0023" (2 decimals, or 4 significant digits under 1) instead of 1.08000 and +0.00230.',tickPrecision:'SPEC-7: see the base case.'}},
 {id:'DW.FORECAST.BARS_PATTERN',type:'lvbarspattern',anchorCount:[2,2],anchors:[[20,500],[28,500]],source:'Bars pattern copies the chart\'s own bars between the anchors.',
  invariantsOnly:'Copies real bars from the chart-owned bar source service, which a paint harness cannot supply; only the invariants are checked.'},
 {id:'DW.FORECAST.GHOST_FEED',type:'lvghostfeed',anchorCount:[2,512],anchors:[[43,500],[46,650],[49,450]],source:'Ghost feed (OpenCandle definition, no external standard): one synthetic candle per bar along the drawn path, each opening at the previous close and closing on the path.',
  custom:p=>{const bodies=p.fills.length,hollow=p.segs.filter(s=>!s.dashed&&Math.abs(s.a[0]-s.b[0])>0.3&&Math.abs(s.a[1]-s.b[1])<1e-6).length/2;const total=Math.round(bodies+hollow);return total===6?[]:[`expected 6 candles (3 bars rising, 3 falling), found ${total}`];}},
 (()=>{const A:BP=[30,450],B:BP=[40,650],C:BP=[40,300],r=dist(pxOf(A),pxOf(B));
  return{id:'DW.FORECAST.SECTOR',type:'lvsector',anchorCount:[3,3],anchors:[A,B,C],source:'Sector (projection): a circular sector centred on A from the radius A-B, turning toward C.',
   segments:[seg(A,B)],fills:1,custom:p=>radiusCheck(p,A,[r],'sector arc',2)} as DrawingSpec;})(),
 // ===== Volume-based
 {id:'DW.VOLUME.ANCHORED_VWAP',type:'anchoredvwap',anchorCount:[1,1],anchors:[[20,500]],source:'Anchored VWAP: sum(typical price x volume) / sum(volume) from the anchor bar to the last bar (Investopedia "Anchored VWAP").',
  segments:chain(vwapFrom(20)),noMirror:'computed from the loaded bars, which are not symmetric'},
 {id:'DW.VOLUME.FIXED_RANGE_VOLUME_PROFILE',type:'fixedrangevp',anchorCount:[2,2],anchors:[[20,700],[40,300]],source:'Fixed range volume profile: 24 price rows of the bars between the anchors, with POC, VAH and VAL across the range (70% value area).',
  fills:24,custom:p=>{const lo=Math.min(...dailyBars().slice(20,41).map(b=>b.low)),hi=Math.max(...dailyBars().slice(20,41).map(b=>b.high));
   const lines=p.segs.filter(s=>Math.abs(s.a[1]-s.b[1])<1e-6&&Math.abs(Math.min(s.a[0],s.b[0])-20)<0.01&&Math.abs(Math.max(s.a[0],s.b[0])-40)<0.01).map(s=>s.a[1]).sort((x,y)=>x-y);
   return lines.length===3&&lines.every(v=>v>=lo&&v<=hi)?[]:[`expected VAL, POC, VAH over bars 20..40 inside ${lo}..${hi}, found ${JSON.stringify(lines)}`];},
  noMirror:'computed from the loaded bars, which are not symmetric'},
 {id:'DW.VOLUME.ANCHORED_VOLUME_PROFILE',type:'lvanchoredvp',anchorCount:[1,1],anchors:[[23,500]],source:'Anchored volume profile: 24 price rows of the bars from the anchor to the last bar, with the POC across that range.',
  fills:24,custom:p=>{const lo=Math.min(...dailyBars().slice(23).map(b=>b.low)),hi=Math.max(...dailyBars().slice(23).map(b=>b.high));
   const poc=p.segs.filter(s=>Math.abs(s.a[1]-s.b[1])<1e-6&&Math.abs(Math.min(s.a[0],s.b[0])-23)<0.01&&Math.abs(Math.max(s.a[0],s.b[0])-59)<0.01);
   return poc.length===1&&poc[0].a[1]>=lo&&poc[0].a[1]<=hi?[]:[`expected one POC over bars 23..59 inside ${lo}..${hi}, found ${poc.length}`];},
  noMirror:'computed from the loaded bars, which are not symmetric'},
 // ===== Measurers
 {id:'DW.MEASURE.PRICE_RANGE',type:'lvpricerange',anchorCount:[2,2],anchors:[[36,300],[38,650]],source:'Price range: the box between the two prices with the change in price and percent of the first price.',
  segments:polygon([[36,650],[38,650],[38,300],[36,300]]),exactTexts:['+350.00 (+116.67%)']},
 {id:'DW.MEASURE.DATE_RANGE',type:'lvdaterange',anchorCount:[2,2],anchors:[[28,450],[40,450]],source:'Date range: bar count and calendar span between the two times (12 bars, 18 days across weekends).',
  segments:[seg([28,450],[40,450])],exactTexts:['12 bars, 18d'],mirrorTextsVary:'the mirrored span crosses the weekends differently, so its calendar days differ (16d)'},
 {id:'DW.MEASURE.DATE_AND_PRICE_RANGE',type:'datepricerange',anchorCount:[2,2],anchors:[[28,300],[40,650]],source:'Date and price range: the box with both measurements.',
  segments:polygon([[28,650],[40,650],[40,300],[28,300]]),exactTexts:['+350.00 (+116.67%)','12 bars, 18d'],mirrorTextsVary:'the mirrored span crosses the weekends differently, so its calendar days differ (16d)'},
 {id:'DW.MEASURE.DATE_AND_PRICE_RANGE',variant:'fx tick 0.00001',type:'datepricerange',anchorCount:[2,2],anchors:[[28,1.08],[40,1.08237]],scale:'fx',source:'The price change uses the instrument tick (5 decimals).',
  exactTexts:['+0.00237 (+0.22%)','12 bars, 18d'],mirrorTextsVary:'the mirrored span crosses the weekends differently, so its calendar days differ (16d)'},
 // ===== Shapes
 {id:'DW.SHAPE.BRUSH',type:'freehand',anchorCount:[2,512],anchors:[[20,500],[24,560],[28,520],[35,600]],source:'Free-hand stroke through the recorded points.',
  invariantsOnly:'Pure free-hand stroke: no defined content beyond its recorded points, so only the round trip and invariants are checked.'},
 {id:'DW.SHAPE.HIGHLIGHTER',type:'highlighter',anchorCount:[2,512],anchors:[[20,500],[24,560],[28,520],[35,600]],source:'Free-hand highlighter stroke.',
  invariantsOnly:'Pure free-hand stroke: no defined content beyond its recorded points, so only the round trip and invariants are checked.'},
 {id:'DW.SHAPE.ARROW_MARKER',type:'lvarrowmarker',anchorCount:[2,2],anchors:[[30,700],[35,500]],source:'Arrow marker: a filled arrow from the first point with its tip on the second.',
  fills:1,custom:p=>p.fills.some(f=>f.some(q=>Math.abs(q[0]-35)<0.05&&Math.abs(q[1]-500)<0.5))?[]:['the arrow tip is not on the second point']},
 {id:'DW.SHAPE.ARROW',type:'arrow',anchorCount:[2,2],anchors:[[28,350],[38,600]],source:'Arrow: a line from the first point with an arrowhead on the second.',
  segments:[seg([28,350],[38,600])],fills:1,custom:p=>p.fills.some(f=>f.some(q=>Math.abs(q[0]-38)<0.05&&Math.abs(q[1]-600)<0.5))?[]:['the arrowhead is not on the second point']},
 {id:'DW.SHAPE.ARROW_UP',type:'arrowmarkup',anchorCount:[1,1],anchors:[[35,300]],source:'Arrow mark up: an up arrow whose tip is the point (placed under a low).',
  fills:1,custom:p=>{const f=p.fills[0]??[];const tip=f.some(q=>Math.abs(q[0]-35)<0.05&&Math.abs(q[1]-300)<0.5),below=f.every(q=>q[1]<=300+1e-6);return tip&&below?[]:['the up arrow does not point up to its point'];},noMirror:'one point'},
 {id:'DW.SHAPE.ARROW_DOWN',type:'arrowmarkdown',anchorCount:[1,1],anchors:[[35,700]],source:'Arrow mark down: a down arrow whose tip is the point (placed over a high).',
  fills:1,custom:p=>{const f=p.fills[0]??[];const tip=f.some(q=>Math.abs(q[0]-35)<0.05&&Math.abs(q[1]-700)<0.5),above=f.every(q=>q[1]>=700-1e-6);return tip&&above?[]:['the down arrow does not point down to its point'];},noMirror:'one point'},
 {id:'DW.SHAPE.RECTANGLE',type:'box',anchorCount:[2,2],anchors:[[25,650],[38,350]],source:'Rectangle with opposite corners at the two points.',
  segments:polygon([[25,650],[38,650],[38,350],[25,350]]),fills:1,exactTexts:[]},
 (()=>{const A:BP=[25,400],B:BP=[38,600],C:BP=[35,700];const a=pxOf(A),b=pxOf(B),c=pxOf(C),ux=b[0]-a[0],uy=b[1]-a[1],L=Math.hypot(ux,uy),nx=-uy/L,ny=ux/L,k=(c[0]-a[0])*nx+(c[1]-a[1])*ny;
  const un=(x:number,y:number):BP=>[(x-100)/10,1000-y],D=un(b[0]+k*nx,b[1]+k*ny),E=un(a[0]+k*nx,a[1]+k*ny);
  return{id:'DW.SHAPE.ROTATED_RECTANGLE',type:'rotatedrect',anchorCount:[3,3],anchors:[A,B,C],source:'Rotated rectangle: one side A-B, the opposite side through the third point\'s perpendicular distance (screen space).',
   segments:polygon([A,B,D,E]),fills:1} as DrawingSpec;})(),
 {id:'DW.SHAPE.PATH',type:'path',anchorCount:[2,512],anchors:[[23,350],[28,600],[34,450],[40,700]],source:'Path: segments through the points with an arrowhead at the last point.',
  segments:chain([[23,350],[28,600],[34,450],[40,700]]),fills:1,custom:p=>p.fills.some(f=>f.some(q=>Math.abs(q[0]-40)<0.05&&Math.abs(q[1]-700)<0.5))?[]:['no arrowhead at the last point']},
 {id:'DW.SHAPE.CIRCLE',type:'circle',anchorCount:[2,2],anchors:[[33,500],[36,600]],source:'Circle centred on the first point through the second (screen space).',
  fills:1,custom:p=>radiusCheck(p,[33,500],[dist(pxOf([33,500]),pxOf([36,600]))],'circle')},
 {id:'DW.SHAPE.ELLIPSE',type:'ellipse',anchorCount:[2,2],anchors:[[28,650],[38,400]],source:'Ellipse inscribed in the box with corners at the two points.',
  fills:1,custom:p=>curveFollows(p,t=>[33+5*Math.cos(2*Math.PI*t),525+125*Math.sin(2*Math.PI*t)],'ellipse')},
 {id:'DW.SHAPE.POLYLINE',type:'polyline',anchorCount:[2,512],anchors:[[23,350],[28,600],[34,450],[40,700]],source:'Polyline: straight segments through the points.',
  segments:chain([[23,350],[28,600],[34,450],[40,700]]),fills:0,exactTexts:[]},
 {id:'DW.SHAPE.TRIANGLE',type:'triangle',anchorCount:[3,3],anchors:[[25,300],[31,650],[38,350]],source:'Triangle through the three points.',
  segments:polygon([[25,300],[31,650],[38,350]]),fills:1},
 {id:'DW.SHAPE.ARC',type:'arc',anchorCount:[3,3],anchors:[[25,400],[41,400],[33,650]],source:'Arc: from the first point to the second, bulging to the third point\'s height (the third point is pinned to the time midpoint on placement).',
  custom:p=>{const out:string[]=[];for(const q of [[25,400],[41,400],[33,650]] as BP[])if(!passesNear(p,q,2.5))out.push(`the arc does not pass through [${q}]`);return out;}},
 {id:'DW.SHAPE.CURVE',type:'curve',anchorCount:[3,3],anchors:[[25,400],[40,400],[33,700]],source:'Curve: quadratic Bezier from the first to the second point with the third as its control point.',
  custom:p=>curveFollows({...p,curves:[p.segs.flatMap(s=>[s.a,s.b])]},t=>{const u=1-t;return[u*u*25+2*u*t*33+t*t*40,u*u*400+2*u*t*700+t*t*400];},'quadratic curve')},
 {id:'DW.SHAPE.DOUBLE_CURVE',type:'lvdoublecurve',anchorCount:[4,4],anchors:[[23,450],[43,500],[30,650],[35,300]],source:'Double curve: cubic Bezier from the first to the second point with the third and fourth as control points.',
  custom:p=>curveFollows({...p,curves:[p.segs.flatMap(s=>[s.a,s.b])]},t=>{const u=1-t;return[u*u*u*23+3*u*u*t*30+3*u*t*t*35+t*t*t*43,u*u*u*450+3*u*u*t*650+3*u*t*t*300+t*t*t*500];},'cubic curve')},
 // ===== Annotation
 {id:'DW.ANNOTATION.TEXT',type:'text',anchorCount:[1,1],anchors:[[33,700]],text:'Spec text',source:'Text: the typed text at its point.',
  labels:[{text:'Spec text',near:[33,700],tol:15}],exactTexts:['Spec text'],noMirror:'text reads left to right from its point'},
 {id:'DW.ANNOTATION.ANCHORED_TEXT',type:'lvanchoredtext',anchorCount:[1,1],anchors:[[33,700]],text:'Spec text',source:'Anchored text: the typed text at its point.',
  labels:[{text:'Spec text',near:[33,700],tol:20}],exactTexts:['Spec text'],noMirror:'text reads left to right from its point'},
 {id:'DW.ANNOTATION.NOTE',type:'note',anchorCount:[1,1],anchors:[[33,700]],text:'Spec text',source:'Note: the text in a box at its point.',
  labels:[{text:'Spec text',near:[33,700],tol:20}],exactTexts:['Spec text'],fills:1,noMirror:'text reads left to right from its point'},
 {id:'DW.ANNOTATION.PRICE_NOTE',type:'pricenote',anchorCount:[2,2],anchors:[[30,450],[36,650]],source:'Price note: a pointer from the price point to a label that shows that price in the instrument precision (MetaTrader "Price label": symbol digits).',
  segments:[seg([30,450],[36,650])],labels:[{text:'450.00',near:[36,650],tol:20}],exactTexts:['450.00'],noMirror:'text reads left to right from its point',
  fails:{labels:'SPEC-3: Price note prints its price without the instrument decimals ("450" for tick 0.01).',texts:'SPEC-3: Price note prints its price without the instrument decimals ("450" for tick 0.01).',tickPrecision:'SPEC-3: Price note ignores the instrument tick.'}},
 {id:'DW.ANNOTATION.PIN',type:'lvpin',anchorCount:[1,1],anchors:[[33,600]],text:'Spec text',source:'Pin: a marker on the point with its note text.',
  segments:[seg([33,600],[33,619],{extend:'cover'})],labels:[{text:'Spec text',near:[33,645],tol:20}],exactTexts:['Spec text'],noMirror:'one point; the note reads left to right'},
 {id:'DW.ANNOTATION.TABLE',type:'lvtable',anchorCount:[1,1],anchors:[[28,750]],source:'Table: a grid of cells whose top-left corner is the point (default 2 x 2 content).',
  exactTexts:['Item','Value','Entry','Target'],labels:[{text:'Item',near:[28.6,737],tol:3},{text:'Target',near:[32.8,711],tol:8}],noMirror:'the table reads left to right from its point'},
 {id:'DW.ANNOTATION.CALLOUT',type:'callout',anchorCount:[2,2],anchors:[[30,450],[36,700]],text:'Spec text',source:'Callout: a text box at the second point with a pointer to the first.',
  labels:[{text:'Spec text',near:[36,700],tol:40}],exactTexts:['Spec text'],fills:1,custom:p=>passesNear(p,[30,450],1)?[]:['the pointer does not reach the first point'],noMirror:'text reads left to right'},
 {id:'DW.ANNOTATION.COMMENT',type:'comment',anchorCount:[2,2],anchors:[[30,450],[36,700]],text:'Spec text',source:'Comment: a speech bubble at the second point pointing to the first.',
  labels:[{text:'Spec text',near:[36,700],tol:40}],exactTexts:['Spec text'],fills:1,custom:p=>passesNear(p,[30,450],1)?[]:['the pointer does not reach the first point'],noMirror:'text reads left to right'},
 {id:'DW.ANNOTATION.PRICE_LABEL',type:'pricelabel',anchorCount:[1,1],anchors:[[35,550]],source:'Price label: the point\'s price in the instrument precision (MetaTrader "Price label": symbol digits).',
  labels:[{text:'550.00',near:[35,550],tol:20}],exactTexts:['550.00'],noMirror:'one point',
  fails:{labels:'SPEC-4: Price label prints its price without the instrument decimals ("550" for tick 0.01).',texts:'SPEC-4: Price label prints its price without the instrument decimals ("550" for tick 0.01).',tickPrecision:'SPEC-4: Price label ignores the instrument tick.'}},
 {id:'DW.ANNOTATION.PRICE_LABEL',variant:'fx tick 0.00001',type:'pricelabel',anchorCount:[1,1],anchors:[[35,1.08235]],scale:'fx',source:'A EURUSD price label shows all 5 decimals.',
  exactTexts:['1.08235'],noMirror:'one point',fails:{texts:'SPEC-4: Price label ignores the instrument tick (EURUSD 1.08235 is cut to fewer decimals).',tickPrecision:'SPEC-4: Price label ignores the instrument tick.'}},
 {id:'DW.ANNOTATION.SIGNPOST',type:'signpost',anchorCount:[2,2],anchors:[[35,550],[35,700]],text:'Spec text',source:'Signpost: a pole from the bar\'s price up to a sign with the text.',
  segments:[seg([35,550],[35,700])],labels:[{text:'Spec text',near:[35,700],tol:40}],exactTexts:['Spec text'],noMirror:'one bar; the sign reads left to right'},
 {id:'LV.ROW.FLAG_MARK',type:'flagmark',anchorCount:[1,1],anchors:[[35,600]],source:'Flag mark: a flag glyph on the point.',
  labels:[{text:'⚑',at:[35,600]}],exactTexts:['⚑'],noMirror:'one point'},
 {id:'DW.ANNOTATION.IMAGE',type:'lvimage',anchorCount:[1,1],anchors:[[33,650]],source:'Image: the picked picture centred on the point; with no stored picture a dashed placeholder frame and a notice.',
  segments:polygon([[29.8,682],[36.2,682],[36.2,618],[29.8,618]]).map(s=>({...s,dashed:true})),exactTexts:['Image unavailable'],noMirror:'one point'},
 {id:'DW.ANNOTATION.EMOJI',type:'lvemoji',anchorCount:[1,1],anchors:[[35,650]],source:'Emoji stamp: the chosen emoji on the point.',
  labels:[{text:'😀',at:[35,650]}],exactTexts:['😀'],noMirror:'one point'},
 {id:'DW.ANNOTATION.STICKERS',type:'lvsticker',anchorCount:[1,2],anchors:[[33,700],[38,550]],source:'Sticker: the chosen sticker (default BUY badge) inside the box between the points.',
  labels:[{text:'BUY',near:[35.5,625],tol:15}],exactTexts:['BUY'],noMirror:'the sticker is upright whichever way it is dragged'},
 {id:'DW.ANNOTATION.ICONS',type:'iconstamp',anchorCount:[1,1],anchors:[[35,650]],source:'Icon stamp: the chosen icon (default star) on the point.',
  labels:[{text:'★',at:[35,650]}],exactTexts:['★'],noMirror:'one point'},
];
