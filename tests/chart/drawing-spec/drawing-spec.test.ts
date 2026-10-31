// Drawing tool specs (OpenCandle 0.8.1, lane S). For every spec in tests/fixtures/drawing-spec/specs.ts the drawing is placed
// the way the app restores a saved drawing (its serialized record loaded through DrawingStore.load, which is what
// chart.drawings.fromJSON does), projected by the renderer's own CoordinateSystem/createProjector over a bar fixture with
// weekend gaps, painted by the installed (patched) DrawingPainter on a recording canvas, and checked against the spec.
// Then every tool is checked for the invariants: finite label text, tick-precision prices, mirror symmetry of the drawn
// direction, log-scale level membership, save/reload round trip and a 1h -> 1D -> 1h interval switch.
// A spec part that fails today runs as it.fails('SPEC-<n>: ...') so the suite stays green and the failure stays visible.
// SYNTHETIC data only.
import {afterAll,describe,expect,it} from 'vitest';
import {DRAWING_SPECS,type BP,type DrawingSpec,type Invariant,type Painted,type Part,type SegSpec} from '../../fixtures/drawing-spec/specs';
import {HEIGHT,MIRROR,TICK,WIDTH,rescale,SCALES} from '../../fixtures/drawing-spec/bars';
import {fills,paintModel,restore,saveOf,savedRecord,segments,setTick,texts,toBar,toPrice,type Frame,type Op,type Pt} from './spec-harness';

const TOL=0.75,EDGE=2;
type Anchors=readonly BP[];
const frameOf=(spec:DrawingSpec,over:Partial<Frame>={}):Frame=>({interval:'1D',scale:spec.scale??'base',...over});
const xOf=(bar:number)=>100+10*bar;
function yOf(price:number,frame:Frame){const s=SCALES[frame.scale];if(frame.log){const lo=Math.log(s.min);return HEIGHT*(1-(Math.log(price)-lo)/(Math.log(s.max)-lo));}return HEIGHT*(1-(price-s.min)/(s.max-s.min));}
const px=(p:BP,frame:Frame):Pt=>[xOf(p[0]),yOf(p[1],frame)];
const d2=(a:Pt,b:Pt)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

async function paint(spec:DrawingSpec,anchors:Anchors=spec.anchors,frame:Frame=frameOf(spec),tick:number=spec.tick??TICK[frame.scale]):Promise<{ops:Op[];record:Record<string,any>;model:any}>{
 setTick(tick);
 const record=savedRecord({type:spec.type,anchors:anchors.map(([bar,price])=>({bar,price})),props:spec.props,text:spec.text},frame.interval);
 const [model]=restore([record]);
 if(!model)throw Error('the store did not restore '+spec.type);
 return{ops:await paintModel(model,frame),record,model};
}

// ---------------------------------------------------------------- matching in pixel space
const atEdge=(p:Pt)=>p[0]<=EDGE||p[0]>=WIDTH-EDGE||p[1]<=EDGE||p[1]>=HEIGHT-EDGE;
function lineDistance(p:Pt,a:Pt,b:Pt){const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
function param(p:Pt,a:Pt,b:Pt){const dx=b[0]-a[0],dy=b[1]-a[1];return((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);}
function segMatches(spec:SegSpec,s:{a:Pt;b:Pt;dashed:boolean},frame:Frame):boolean{
 if(spec.dashed!==undefined&&spec.dashed!==s.dashed)return false;
 const P=px(spec.from,frame),Q=px(spec.to,frame),L=d2(P,Q),eps=TOL/Math.max(L,1e-9);
 const kind=spec.extend??'none';
 if(kind==='none')return(d2(s.a,P)<=TOL&&d2(s.b,Q)<=TOL)||(d2(s.a,Q)<=TOL&&d2(s.b,P)<=TOL);
 const on=(p:Pt)=>lineDistance(p,P,Q)<=Math.max(TOL,1e-3*d2(p,P));
 if(!on(s.a)||!on(s.b))return false;
 const ta=param(s.a,P,Q),tb=param(s.b,P,Q);
 if(kind==='cover')return Math.min(ta,tb)<=eps&&Math.max(ta,tb)>=1-eps;
 if(kind==='ray'){const [near,far,tf]=d2(s.a,P)<=TOL?[s.a,s.b,tb]:d2(s.b,P)<=TOL?[s.b,s.a,ta]:[null,null,0];return !!near&&tf>=1-eps&&atEdge(far!);}
 return atEdge(s.a)&&atEdge(s.b)&&Math.min(ta,tb)<=eps&&Math.max(ta,tb)>=1-eps;
}
const describeSeg=(s:SegSpec)=>`${s.extend??'none'} [${s.from.map(v=>+v.toFixed(3))}] -> [${s.to.map(v=>+v.toFixed(3))}]${s.dashed===undefined?'':s.dashed?' dashed':' solid'}`;
const textOk=(want:string|RegExp,got:string)=>typeof want==='string'?got===want:want.test(got);
const nonEmpty=(ops:Op[])=>texts(ops).filter(t=>t.text.trim()!=='');
const fmtPainted=(ops:Op[],frame:Frame)=>segments(ops).filter(s=>!s.curved).slice(0,60).map(s=>`[${+toBar(s.a[0]).toFixed(2)},${+toPrice(s.a[1],frame).toFixed(3)}>${+toBar(s.b[0]).toFixed(2)},${+toPrice(s.b[1],frame).toFixed(3)}]${s.dashed?'-':''}`).join(' ');
const fmtTexts=(ops:Op[],frame:Frame)=>texts(ops).map(t=>`${JSON.stringify(t.text)}@${+toBar(t.x).toFixed(2)},${+toPrice(t.y,frame).toFixed(3)}`).join(' | ');

function checkSegments(spec:DrawingSpec,ops:Op[],frame:Frame):string[]{
 const painted=segments(ops),out:string[]=[];
 for(const want of spec.segments??[]){
  const hit=painted.find(s=>segMatches(want,s,frame));
  if(!hit){out.push('missing '+describeSeg(want));continue;}
  if(want.label!==undefined){
   const m=px([(want.from[0]+want.to[0])/2,(want.from[1]+want.to[1])/2],frame),tol=want.labelTol??30;
   if(!texts(ops).some(t=>textOk(want.label!,t.text)&&d2([t.x,t.y],m)<=tol))out.push(`no label ${want.label} within ${tol}px of the midpoint of ${describeSeg(want)}`);
  }
 }
 return out;
}
function checkLevels(spec:DrawingSpec,ops:Op[],frame:Frame):string[]{
 const painted=segments(ops),all=texts(ops),out:string[]=[];
 for(const lv of spec.levels??[]){
  const y=yOf(lv.price,frame),x1=xOf(lv.from),x2=xOf(lv.to);
  const lineHit=painted.some(s=>Math.abs(s.a[1]-y)<=TOL&&Math.abs(s.b[1]-y)<=TOL&&Math.abs(Math.min(s.a[0],s.b[0])-Math.min(x1,x2))<=TOL&&Math.abs(Math.max(s.a[0],s.b[0])-Math.max(x1,x2))<=TOL);
  if(!lineHit)out.push(`no level line at ${lv.price} over bars ${lv.from}..${lv.to}`);
  const labelHit=all.some(t=>textOk(lv.label,t.text)&&Math.abs(t.y-y)<=14&&t.x>=Math.min(x1,x2)-80&&t.x<=Math.max(x1,x2)+80);
  if(!labelHit)out.push(`no label ${lv.label} on the level line at ${lv.price}`);
 }
 return out;
}
function checkLabels(spec:DrawingSpec,ops:Op[],frame:Frame):string[]{
 const all=texts(ops),used=new Set<number>(),out:string[]=[];
 for(const want of spec.labels??[]){
  const target=want.at??want.near,tol=want.at?1.5:(want.tol??30);
  const dist=(t:{x:number;y:number})=>{if(!target)return 0;const dx=Number.isNaN(target[0])?0:t.x-xOf(target[0]),dy=Number.isNaN(target[1])?0:t.y-yOf(target[1],frame);return Math.hypot(dx,dy);};
  const candidates=all.map((t,i)=>({t,i,d:dist(t)})).filter(c=>!used.has(c.i)&&textOk(want.text,c.t.text)&&c.d<=tol).sort((a,b)=>a.d-b.d);
  if(!candidates.length){out.push(`no label ${want.text}${target?` within ${tol}px of [${target}]`:''}`);continue;}
  used.add(candidates[0].i);
 }
 return out;
}
function toPainted(ops:Op[],frame:Frame):Painted{
 const back=(p:Pt):BP=>[toBar(p[0]),toPrice(p[1],frame)];
 return{
  segs:segments(ops).map(s=>({a:back(s.a),b:back(s.b),curved:s.curved,dashed:s.dashed})),
  curves:ops.flatMap(o=>o.kind==='stroke'?o.polys.filter(p=>p.length>=3).map(p=>p.map(back)):[]),
  fills:fills(ops).map(f=>f.polys.flat().map(back)),
  texts:texts(ops).map(t=>({text:t.text,at:back([t.x,t.y])})),
  px:(p:BP)=>px(p,frame),unpx:(x:number,y:number)=>back([x,y]),
 };
}

// ---------------------------------------------------------------- invariant helpers
const BAD_TEXT=/(^|[^A-Za-z])(NaN|undefined|-?Infinity)([^A-Za-z]|$)/;
function pointToPolyline(p:Pt,poly:Pt[]){let best=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[i+1]??a,dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L)):0;best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));}return best;}
/** Every stroke of `a` has a stroke in `b` it coincides with (point-to-polyline both ways, 1.5 px). */
function strokesCovered(a:Op[],b:Op[]):string[]{
 const pa=a.flatMap(o=>o.kind==='stroke'?o.polys:[]),pb=b.flatMap(o=>o.kind==='stroke'?o.polys:[]),out:string[]=[];
 const clip=(p:Pt):Pt=>[Math.max(-50,Math.min(WIDTH+50,p[0])),Math.max(-50,Math.min(HEIGHT+50,p[1]))];
 const same=(p:Pt[],q:Pt[])=>{const P=p.map(clip),Q=q.map(clip);return P.every(v=>pointToPolyline(v,Q)<=1.5)&&Q.every(v=>pointToPolyline(v,P)<=1.5);};
 for(const p of pa)if(!pb.some(q=>same(p,q)))out.push('no mirrored stroke for '+JSON.stringify(p.slice(0,4).map(v=>v.map(n=>+n.toFixed(1)))));
 return out;
}
/** Label frames (an axis-aligned box around a painted text) depend on text layout, not on the drawn geometry. */
function withoutLabelFrames(ops:Op[]):Op[]{
 const ts=texts(ops);
 return ops.filter(o=>{if(o.kind!=='stroke')return true;const pts=o.polys.flat();if(pts.length>12)return true;
  const axis=o.polys.every(p=>p.every((q,i)=>i===0||Math.abs(q[0]-p[i-1][0])<1e-6||Math.abs(q[1]-p[i-1][1])<1e-6));if(!axis)return true;
  const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),box=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
  return !(box[1]-box[0]>2&&box[3]-box[2]>2&&ts.some(t=>t.text.trim()!==''&&t.x>=box[0]-2&&t.x<=box[1]+2&&t.y>=box[2]-2&&t.y<=box[3]+2));});
}
const mirrorOps=(ops:Op[]):Op[]=>ops.map(o=>o.kind==='text'?{...o,x:WIDTH-o.x}:{...o,polys:o.polys.map(p=>p.map(([x,y]):Pt=>[WIDTH-x,y]))});
const textBag=(ops:Op[])=>nonEmpty(ops).map(t=>t.text).sort();
/** Anchors on the price band 140..160 (tick 0.001): every number printed inside the band is a price. */
const toBand=(spec:DrawingSpec):Anchors=>spec.anchors.map(([b,p])=>[b,spec.scale==='fx'?140+(p-1)/0.2*20:rescale(p,'band')]);
const toLogAnchors=(spec:DrawingSpec):Anchors=>spec.scale==='fx'?spec.anchors:spec.anchors.map(([b,p])=>[b,200+p/2]);
const strip=(record:Record<string,any>)=>{const {createdAt:_c,...rest}=record;return rest;};

// ---------------------------------------------------------------- the suite
const failures:string[]=[];
afterAll(()=>{setTick(undefined);});
/** DRAWING_SPEC_STRICT=1 runs the known failures as plain tests, to read their actual diffs. */
const STRICT=!!process.env.DRAWING_SPEC_STRICT;
const runner=(spec:DrawingSpec,part:Part|Invariant)=>{const known=STRICT?undefined:spec.fails?.[part];return known?(name:string,fn:()=>Promise<void>)=>it.fails(`${known} (${name})`,fn):(name:string,fn:()=>Promise<void>)=>it(name,fn);};
const title=(spec:DrawingSpec)=>`${spec.id} ${spec.type}${spec.variant?' ['+spec.variant+']':''}`;

for(const spec of DRAWING_SPECS){
 describe(title(spec),()=>{
  const frame=frameOf(spec);
  let cached:Promise<{ops:Op[];record:Record<string,any>;model:any}>|undefined;
  const base=()=>cached??=paint(spec);
  const report=(what:string,errors:string[],ops:Op[])=>{if(errors.length){failures.push(`${title(spec)} ${what}`);expect(errors,`${errors.join('\n')}\npainted: ${fmtPainted(ops,frame)}\ntexts: ${fmtTexts(ops,frame)}`).toEqual([]);}};

  it('anchor count matches the tool',async()=>{
   const {model}=await base(),schema=model.anchorSchema();
   expect([schema.min,schema.max]).toEqual([...spec.anchorCount]);
   expect(spec.anchors.length).toBeGreaterThanOrEqual(schema.min);expect(spec.anchors.length).toBeLessThanOrEqual(schema.max);
  });

  if(!spec.invariantsOnly){
   if(spec.segments?.length)runner(spec,'segments')('lines and segments',async()=>{const {ops}=await base();report('segments',checkSegments(spec,ops,frame),ops);});
   if(spec.levels?.length)runner(spec,'levels')('levels: line and label at each computed price',async()=>{const {ops}=await base();report('levels',checkLevels(spec,ops,frame),ops);});
   if(spec.labels?.length)runner(spec,'labels')('labels on their elements',async()=>{const {ops}=await base();report('labels',checkLabels(spec,ops,frame),ops);});
   if(spec.exactTexts)runner(spec,'texts')('exactly these texts',async()=>{const {ops}=await base();expect(textBag(ops),fmtTexts(ops,frame)).toEqual([...spec.exactTexts!].sort());});
   if(spec.fills!==undefined)runner(spec,'fills')('filled areas (count)',async()=>{const {ops}=await base();expect(fills(ops).length).toBe(spec.fills);});
   if(spec.custom)runner(spec,'custom')('geometry',async()=>{const {ops}=await base();report('custom',spec.custom!(toPainted(ops,frame)),ops);});
  }

  // ---- invariants, every tool
  runner(spec,'finiteText')('invariant: no label shows NaN, undefined or Infinity',async()=>{
   // The spec placement, the price band, a log scale, and two degenerate placements: every anchor on one point, and a flat
   // (zero price range) drawing, where a ratio or percentage would divide by zero.
   const first=spec.anchors[0];
   const runs=[await base(),await paint(spec,toBand(spec),frameOf(spec,{scale:'band'})),await paint(spec,toLogAnchors(spec),frameOf(spec,{scale:spec.scale==='fx'?'fx':'logbase',log:true})),
    await paint(spec,spec.anchors.map(()=>first)),await paint(spec,spec.anchors.map(([b])=>[b,first[1]]))];
   for(const {ops} of runs)for(const t of texts(ops))expect(t.text,t.text).not.toMatch(BAD_TEXT);
  });
  runner(spec,'tickPrecision')('invariant: prices are written with the instrument tick (band 140..160, tick 0.001)',async()=>{
   const {ops}=await paint(spec,toBand(spec),frameOf(spec,{scale:'band'}),0.001),bad:string[]=[];
   for(const t of texts(ops))for(const m of t.text.matchAll(/[-+]?\d[\d,]*(?:\.\d+)?/g)){const v=Number(m[0].replace(/,/g,''));if(Math.abs(v)>=140&&Math.abs(v)<=160&&(m[0].split('.')[1]?.length??0)!==3)bad.push(`${JSON.stringify(t.text)} prints ${m[0]}`);}
   expect(bad).toEqual([]);
  });
  if(!spec.noMirror)runner(spec,'mirror')('invariant: drawn right to left mirrors drawn left to right',async()=>{
   const left=await base(),right=await paint(spec,spec.anchors.map(([b,p])=>[MIRROR-b,p]));
   const mirrored=withoutLabelFrames(mirrorOps(right.ops)),straight=withoutLabelFrames(left.ops);
   const errors=[...strokesCovered(straight,mirrored),...strokesCovered(mirrored,straight).map(e=>'extra: '+e)];
   if(errors.length)expect(errors.slice(0,6),`left: ${fmtPainted(left.ops,frame)}\nright (mirrored back): ${fmtPainted(mirrored,frame)}`).toEqual([]);
   expect(fills(right.ops).length,'fill count').toBe(fills(left.ops).length);
   if(spec.mirrorTextsVary)expect(textBag(right.ops).length).toBe(textBag(left.ops).length);else expect(textBag(right.ops)).toEqual(textBag(left.ops));
  });
  runner(spec,'logScale')('invariant: a log scale does not change which levels and labels are shown',async()=>{
   const scale=spec.scale==='fx'?'fx':'logbase',anchors=toLogAnchors(spec);
   const lin=await paint(spec,anchors,frameOf(spec,{scale})),log=await paint(spec,anchors,frameOf(spec,{scale,log:true}));
   if(spec.logTextsVary)expect(textBag(log.ops).length).toBe(textBag(lin.ops).length);else expect(textBag(log.ops)).toEqual(textBag(lin.ops));
  });
  runner(spec,'roundTrip')('invariant: save then reload keeps the anchors, options and text exactly, and paints the same',async()=>{
   // Restored and saved before any paint: exactly the record.
   const fresh=await paint(spec);setTick(spec.tick??TICK[frame.scale]);
   const [unpainted]=restore([fresh.record]);expect(strip(saveOf(unpainted))).toEqual(strip(fresh.record));
   // Saved after painting, reloaded and saved again: unchanged, and it paints the same.
   const saved=saveOf(fresh.model);for(const key of Object.keys(fresh.record))if(key!=='props')expect(saved[key],key).toEqual(fresh.record[key]);
   const [again]=restore([saved]);expect(strip(saveOf(again))).toEqual(strip(saved));
   expect(await paintModel(again,frame)).toEqual(await paintModel(fresh.model,frame));
  });
  runner(spec,'intervalSwitch')('invariant: 1h -> 1D -> 1h returns to identical geometry',async()=>{
   const h1=frameOf(spec,{interval:'1h'}),d1=frameOf(spec,{interval:'1D'});
   const first=await paint(spec,spec.anchors,h1);
   const [onDaily]=restore([saveOf(first.model)]);await paintModel(onDaily,d1);
   const [back]=restore([saveOf(onDaily)]);
   expect(strip(saveOf(back)).anchors).toEqual(first.record.anchors);
   expect(await paintModel(back,h1)).toEqual(first.ops);
  });
 });
}
