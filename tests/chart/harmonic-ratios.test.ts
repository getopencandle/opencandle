// LV-VELA-HARMONIC-RATIOS-1 guardrail. Paints harmonic and leg-ratio patterns through the installed (patched) Vela
// DrawingPainter on a recording canvas and asserts the exact ratio labels, the diagonals they sit on, and the pill
// paint order. Ratio definitions follow Scott Carney (Harmonic Trading, Vols 1-2). All fixtures are hand computed below.
import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {runPatch,patchPlan,harmonicStepIds,drawingFixStepIds} from '../../src/chart/apply-vela-compat-patch.mjs';
import {CHART_PATTERN_SPECS,LV_THREE_DRIVES} from '../../src/chart/lv-types/chart-patterns';
import {createDrawing} from '@luxalgo/vela';
import '../../src/chart/lv-drawing-types';

const CHUNK='node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js';
let loaded:Promise<{module:any;sourceHash:string}>|undefined;
/** Loads the installed renderer chunk itself (no build transforms) so the asserted painter is the patched SDK. */
function installed(){return loaded??=(async()=>{const path=resolve(CHUNK),source=readFileSync(path,'utf8'),temporary=resolve('.cache',`lv-harmonic-ratios-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { DrawingPainter as LVHarmonicPainter, createDrawing as LVHarmonicCreateDrawing };\n');return{module:await import(/* @vite-ignore */ pathToFileURL(temporary).href),sourceHash:createHash('sha256').update(source).digest('hex')};}finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}})();}

type Seg=[number,number,number,number];
type Cmd={op:'stroke';segs:Seg[];dash:number[];color:string;width:number}|{op:'fill';color:string;alpha:number}|{op:'text';text:string;x:number;y:number;color:string;font:string};
function recorder(){
 const cmds:Cmd[]=[],stack:any[]=[];let segs:Seg[]=[],at:[number,number]|null=null,dash:number[]=[];
 const ctx:any={globalAlpha:1,lineWidth:1,fillStyle:'#000000',strokeStyle:'#000000',font:'11px sans-serif',textAlign:'left',textBaseline:'alphabetic'};
 ctx.save=()=>stack.push({...ctx,dash});ctx.restore=()=>{const s=stack.pop();if(s){dash=s.dash;delete s.dash;Object.assign(ctx,s);}};
 ctx.beginPath=()=>{segs=[];at=null;};ctx.moveTo=(x:number,y:number)=>{at=[x,y];};ctx.lineTo=(x:number,y:number)=>{if(at)segs.push([at[0],at[1],x,y]);at=[x,y];};
 for(const op of ['closePath','arc','arcTo','rect','clip','translate','rotate','fillRect','strokeText','setTransform','scale'])ctx[op]=()=>{};
 ctx.setLineDash=(d:number[])=>{dash=[...d];};
 ctx.stroke=()=>cmds.push({op:'stroke',segs:[...segs],dash:[...dash],color:ctx.strokeStyle,width:ctx.lineWidth});
 ctx.fill=()=>cmds.push({op:'fill',color:ctx.fillStyle,alpha:ctx.globalAlpha});
 ctx.fillText=(text:string,x:number,y:number)=>cmds.push({op:'text',text,x,y,color:ctx.fillStyle,font:ctx.font});
 ctx.measureText=(text:string)=>({width:text.length*6});
 return{ctx,cmds};
}
const BG='#101010',TEXT='#ffffff',LINE='#2962ff',VALID='#0ecb81',INVALID='#f6465d';
const theme={fontFamily:'sans-serif',background:BG,textColor:TEXT};
// x = time (px), y = 300 - price; one 600 x 300 pane.
const proj={width:600,height:300,xOf:(t:number)=>t,yOf:(p:number)=>300-p,paneRect:()=>({top:0,height:300})};
const XS=[60,160,260,360,460,560];

async function paint(type:string,prices:number[],tweak?:(d:any)=>void,projection:typeof proj=proj){
 const {module}=await installed();
 const d=module.LVHarmonicCreateDrawing(type,{id:'harmonic-'+type,paneId:'price',style:{lineColor:LINE,lineWidth:1,lineStyle:'solid'},anchors:prices.map((price,i)=>({time:XS[i],price}))});
 expect(d,type).toBeTruthy();tweak?.(d);
 const rec=recorder();new module.LVHarmonicPainter().paintAll(rec.ctx,[d],projection,theme);return{d,cmds:rec.cmds};
}
const pt=(prices:number[],i:number)=>[XS[i],300-prices[i]] as const;
/** Ratio pills: a text with a 3-decimal value painted in 11 px. */
const ratioTexts=(cmds:Cmd[])=>cmds.filter((c):c is Extract<Cmd,{op:'text'}>=>c.op==='text'&&/^\d+\.\d{3}$/.test(c.text)&&c.font.startsWith('11px'));
function expectLabels(prices:number[],cmds:Cmd[],want:[number,number,string,string][]){
 const texts=ratioTexts(cmds);
 expect(texts.map(t=>t.text)).toEqual(want.map(w=>w[2]));
 want.forEach(([from,to,value,color],k)=>{
  const a=pt(prices,from),b=pt(prices,to),text=texts[k];
  // The pill is centered on the diagonal's midpoint (fixtures stay clear of the pane edges, so no clamping).
  expect([text.x,text.y],value).toEqual([(a[0]+b[0])/2,(a[1]+b[1])/2]);
  expect(text.color,value).toBe(color);
  // A dashed segment joins exactly the two points the ratio measures.
  const seg=cmds.find(c=>c.op==='stroke'&&c.dash.length>0&&c.segs.length===1&&c.segs[0].join()===[a[0],a[1],b[0],b[1]].join());
  expect(seg,'dashed diagonal '+from+'-'+to).toBeTruthy();
  // The pill background (theme background at 0.8 alpha) is filled, and outlined in the line color, before the text.
  const at=cmds.indexOf(text),before=cmds.slice(0,at);
  const fill=before.map((c,i)=>[c,i] as const).filter(([c])=>c.op==='fill'&&c.color===BG).at(-1);
  expect(fill,'pill fill before '+value).toBeTruthy();expect((fill![0] as any).alpha).toBeCloseTo(0.8,9);
  const outline=before.slice(fill![1]).find(c=>c.op==='stroke'&&c.color===LINE&&c.dash.length===0&&c.width===1);
  expect(outline,'pill outline before '+value).toBeTruthy();
 });
 // No other dashed lines than the ratio diagonals.
 expect(cmds.filter(c=>c.op==='stroke'&&c.dash.length>0)).toHaveLength(want.length);
}

// Textbook Gartley, bullish. X 50, A 250 (XA 200). B retraces 0.618 of XA: B = 250 - 123.6 = 126.4.
// C retraces 0.618 of AB: C = 126.4 + 76.3848 = 202.7848. D at the 0.786 XA retracement: D = 250 - 157.2 = 92.8.
// (Carney's four Gartley figures cannot all be exact at once: with B, C and AD fixed, CD/BC = 109.9848 / 76.3848 = 1.43988,
// inside the Gartley CD band 1.13 to 1.618; with CD/BC 1.272 instead, AD/XA would be 0.722, outside 0.74 to 0.83.)
const GARTLEY=[50,250,126.4,202.7848,92.8];
// Textbook Cypher, bullish. X 50, A 150 (XA 100). B = AB/XA 0.5: B = 100. C = XC/XA 1.3 beyond A: C = 180 (XC 130).
// D = CD/XC 0.786 retracement of XC: D = 180 - 102.18 = 77.82. (Generic BC/AB = 1.6 and CD/BC = 1.277 must not show.)
const CYPHER=[50,150,100,180,77.82];

describe('LV-VELA-HARMONIC-RATIOS-1 pattern ratio labels',()=>{
 it('the cumulative Vela patch carries and verifies the harmonic ratio steps (a Vela upgrade that drops them fails here)',async()=>{
  expect(()=>runPatch('--verify')).not.toThrow();
  const {sourceHash}=await installed(),plan=patchPlan as any;
  const chunk=plan.files.find((row:any)=>row.path==='dist/chunk-UNUVPQFW.js');expect(sourceHash).toBe(chunk.afterSha256);
  for(const row of plan.files.filter((r:any)=>/\.(c?js)$/.test(r.path))){
   // The slice bounds follow drawingFixStepIds.length: a new drawing-fix round appends steps, so no hard-coded count (was 19/17) is kept here.
   const fixes=drawingFixStepIds.length;expect(row.transformations.slice(-fixes-2,-fixes).map((s:any)=>s.id)).toEqual([...harmonicStepIds]);expect(row.transformations.slice(-fixes).map((s:any)=>s.id)).toEqual([...drawingFixStepIds]);
   const source=readFileSync(resolve('node_modules/@luxalgo/vela',row.path),'utf8');
   expect(source).toContain('/*! LarryVision LV-VELA-HARMONIC-RATIOS-1');expect(source).not.toContain('ctx.fillText(r.toFixed(3), (a[0] + b[0]) / 2 + 6');
  }
 });

 it('Gartley: X-B AB/XA, A-C BC/AB, B-D CD/BC and X-D AD/XA, each checked against the Gartley bands',async()=>{
  const {d,cmds}=await paint('gartley',GARTLEY);
  expect(d.valid()).toBe(true);
  expectLabels(GARTLEY,cmds,[[0,2,'0.618',VALID],[1,3,'0.618',VALID],[2,4,'1.440',VALID],[0,4,'0.786',VALID]]);
 });

 it('Gartley out of band colours only the failing ratio',async()=>{
  const off=[...GARTLEY];off[4]=250-0.9*200; // D = 70: AD/XA 0.900 (outside 0.74 to 0.83); CD = 202.7848 - 70 = 132.7848, CD/BC = 1.738 (outside 1.13 to 1.618)
  const {cmds}=await paint('gartley',off);
  expectLabels(off,cmds,[[0,2,'0.618',VALID],[1,3,'0.618',VALID],[2,4,'1.738',INVALID],[0,4,'0.900',INVALID]]);
 });

 it('plain XABCD shows the same four ratios including AD/XA, uncoloured',async()=>{
  const {cmds}=await paint('xabcd',GARTLEY);
  expectLabels(GARTLEY,cmds,[[0,2,'0.618',TEXT],[1,3,'0.618',TEXT],[2,4,'1.440',TEXT],[0,4,'0.786',TEXT]]);
 });

 it('Cypher: X-B AB/XA, X-C XC/XA and X-D CD/XC, never the generic BC/AB or CD/BC',async()=>{
  const {d,cmds}=await paint('cypher',CYPHER);
  expect(d.valid()).toBe(true);
  expectLabels(CYPHER,cmds,[[0,2,'0.500',VALID],[0,3,'1.300',VALID],[0,4,'0.786',VALID]]);
  expect(ratioTexts(cmds).map(t=>t.text)).not.toContain('1.600');expect(ratioTexts(cmds).map(t=>t.text)).not.toContain('1.277');
 });

 it('Cypher colours each check on its own label (XC/XA 1.500 out of 1.272 to 1.414)',async()=>{
  // C = 50 + 150 = 200 (XC 150). D keeps CD/XC 0.786: D = 200 - 117.9 = 82.1.
  const off=[50,150,100,200,82.1];
  const {d,cmds}=await paint('cypher',off);
  expect(d.valid()).toBe(false);
  expectLabels(off,cmds,[[0,2,'0.500',VALID],[0,3,'1.500',INVALID],[0,4,'0.786',VALID]]);
 });

 it('ABCD: A-C BC/AB and B-D CD/BC against their bands, then the A-D CD/AB pill against its 0.9 to 1.1 band',async()=>{
  // A 100, B 200 (AB 100), C 138.2 (BC/AB 0.618), D = 138.2 + 1.272 * 61.8 = 216.8096 (CD/BC 1.272).
  // CD = 78.6096, so the added A-D pill reads CD/AB 0.786: outside 0.9 to 1.1, red (the earlier two expectations are unchanged).
  const prices=[100,200,138.2,216.8096];
  const {cmds}=await paint('abcd',prices);
  // BC/AB 0.618 and CD/BC 1.272 now colour against their bands (green here); the pills were uncoloured before the ABCD badge existed.
  expectLabels(prices,cmds,[[0,2,'0.618',VALID],[1,3,'1.272',VALID],[0,3,'0.786',INVALID]]);
 });

 it('Three drives: each correction and drive ratio on the diagonal spanning its two swings',async()=>{
  const spec=CHART_PATTERN_SPECS.find(s=>s.type===LV_THREE_DRIVES)!;expect(spec.legRatios).toBe(true);
  // Start 50, drive 1 150 (100). A retraces 0.618: 88.2. Drive 2 extends A by 1.272: 88.2 + 78.6096 = 166.8096.
  // B retraces 0.618 of 78.6096: 166.8096 - 48.58073 = 118.22887. Drive 3 extends B by 1.272: 118.22887 + 61.79469 = 180.02356.
  const prices=[50,150,88.2,166.8096,118.22887,180.02356];
  // The OpenCandle three drives class is the native pattern class with these labels and leg ratios.
  const {cmds}=await paint('elliottcorrection',prices,d=>{d.vertexLabels=()=>[...spec.labels];d.legRatios=()=>spec.legRatios;});
  expectLabels(prices,cmds,[[0,2,'0.618',TEXT],[1,3,'1.272',TEXT],[2,4,'0.618',TEXT],[3,5,'1.272',TEXT]]);
 });

 it('shows nothing for a diagonal whose points are not placed yet',async()=>{
  const three=GARTLEY.slice(0,3);
  const {cmds}=await paint('gartley',three);
  expectLabels(three,cmds,[[0,2,'0.618',VALID]]);
  const cypher=CYPHER.slice(0,4);
  const c=await paint('cypher',cypher);
  expectLabels(cypher,c.cmds,[[0,2,'0.500',VALID],[0,3,'1.300',VALID]]);
 });

 it('a flat leg gives no label instead of dividing by zero',async()=>{
  const flat=[150,150,126.4,202.7848,92.8]; // XA = 0: no AB/XA, no AD/XA. BC/AB = 76.3848 / 23.6 = 3.237 (outside 0.382 to 0.886)
  const {cmds}=await paint('gartley',flat);
  expectLabels(flat,cmds,[[1,3,'3.237',INVALID],[2,4,'1.440',VALID]]);
  for(const t of ratioTexts(cmds))expect(Number.isFinite(Number(t.text))).toBe(true);
 });
});

// ---- Display fixes: pills only where their leg is on screen, Cypher pills agree with the badge, small patterns stay clean,
// no badge while a pattern is still being placed. The view helpers below keep the 600 x 300 pane and change only the mapping.
const view=(xOf:(t:number)=>number,yOf:(p:number)=>number)=>({...proj,xOf,yOf});
/** The same view as proj, moved dx / dy px (the user panned the chart). */
const panned=(dx:number,dy:number)=>view(t=>t+dx,p=>300-p+dy);
/** Maps the price range of a pattern onto pane rows 20..280 (and keeps x = time), so any price scale gives a roomy pattern. */
const fitted=(prices:number[])=>{const lo=Math.min(...prices),hi=Math.max(...prices);return view(t=>t,p=>20+(hi-p)/(hi-lo)*260);};
const allText=(cmds:Cmd[])=>cmds.filter((c):c is Extract<Cmd,{op:'text'}>=>c.op==='text');
const badgeOf=(cmds:Cmd[])=>allText(cmds).filter(t=>/^(Gartley|Cypher|Bat|Crab|Butterfly|Shark|ABCD|Three drives) [✓✗]$/.test(t.text));
/** The OpenCandle Cypher as the app builds it (direction-checked), not the bare native class the other tests paint. */
function realCypher(prices:number[]){
 const d:any=createDrawing('cypher' as never,{id:'harmonic-real-cypher',paneId:'price',style:{lineColor:LINE,lineWidth:1,lineStyle:'solid'},anchors:prices.map((price,i)=>({time:XS[i],price}))} as never);
 expect(d).toBeTruthy();return d;
}
async function paintModel(d:any,projection:typeof proj){
 const {module}=await installed(),rec=recorder();new module.LVHarmonicPainter().paintAll(rec.ctx,[d],projection,theme);return rec.cmds;
}
const colours=(cmds:Cmd[])=>ratioTexts(cmds).map(t=>[t.text,t.color]);

describe('harmonic ratio pills stay on screen',()=>{
 it('paints no pill for a pattern panned entirely off to the left (they used to hang on the pane edge at x = 21)',async()=>{
  const {cmds}=await paint('gartley',GARTLEY,undefined,panned(-2000,0));
  expect(ratioTexts(cmds).map(t=>[t.text,t.x,t.y])).toEqual([]);
 });

 it('paints no pill for a pattern panned out of view above or below (they used to pile up at y = 9)',async()=>{
  const above=await paint('gartley',GARTLEY,undefined,panned(0,-2000));
  const below=await paint('gartley',GARTLEY,undefined,panned(0,2000));
  expect(ratioTexts(above.cmds).map(t=>[t.text,t.x,t.y])).toEqual([]);
  expect(ratioTexts(below.cmds).map(t=>[t.text,t.x,t.y])).toEqual([]);
 });

 it('draws only the pills whose leg midpoint is inside the pane, each exactly on that midpoint with no clamping',async()=>{
  // View moved 250 px left: the points sit at x -190, -90, 10, 110, 210.
  // X-B midpoint x = -90 is outside; A-C (x = 10), B-D (x = 110) and X-D (x = 10) are inside, the first and last half off the edge.
  const {cmds}=await paint('gartley',GARTLEY,undefined,panned(-250,0));
  const xs=[-190,-90,10,110,210],ys=GARTLEY.map(p=>300-p);
  const mid=(a:number,b:number)=>[(xs[a]+xs[b])/2,(ys[a]+ys[b])/2];
  expect(ratioTexts(cmds).map(t=>[t.text,t.x,t.y])).toEqual([['0.618',...mid(1,3)],['1.440',...mid(2,4)],['0.786',...mid(0,4)]]);
 });

 it('a midpoint exactly on the pane edge counts as inside, one pixel beyond it does not',async()=>{
  const abcd=[100,200,138.2,216.8096];
  // X-B (AB ratio 0.618) is drawn at the mid of times 60 and 260 = 160; moving the view 160 px left puts it at 0, 161 px left at -1.
  const edge=await paint('abcd',abcd,undefined,panned(-160,0));
  expect(ratioTexts(edge.cmds).find(t=>t.text==='0.618')!.x).toBe(0);
  const beyond=await paint('abcd',abcd,undefined,panned(-161,0));
  expect(ratioTexts(beyond.cmds).map(t=>t.text)).not.toContain('0.618');
 });
});

describe('Cypher pills agree with the validity badge',()=>{
 it('the wrong-direction Cypher [100, 110, 105, 87, 97.5] shows XC/XA and CD/XC red beside the red badge, AB/XA stays green',async()=>{
  const prices=[100,110,105,87,97.5],d=realCypher(prices);
  expect(d.valid()).toBe(false);
  const cmds=await paintModel(d,fitted(prices));
  expect(colours(cmds)).toEqual([['0.500',VALID],['1.300',INVALID],['0.808',INVALID]]);
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['Cypher ✗',INVALID]]);
 });

 it('B beyond A reddens AB/XA although its ratio is in band; the other two stay green',async()=>{
  const prices=[50,150,200,180,77.82],d=realCypher(prices); // AB = 50, AB/XA = 0.500; XC/XA 1.300; CD/XC 0.786
  expect(d.valid()).toBe(false);
  expect(colours(await paintModel(d,fitted(prices)))).toEqual([['0.500',INVALID],['1.300',VALID],['0.786',VALID]]);
 });

 it('D beyond C reddens CD/XC although its ratio is in band; the other two stay green',async()=>{
  const prices=[50,150,100,180,281.4],d=realCypher(prices); // CD = 101.4, CD/XC = 0.780
  expect(d.valid()).toBe(false);
  expect(colours(await paintModel(d,fitted(prices)))).toEqual([['0.500',VALID],['1.300',VALID],['0.780',INVALID]]);
 });

 it('the textbook Cypher keeps three green pills and a green badge, bullish and bearish',async()=>{
  const bear=[950,850,900,820,922.18],bull=realCypher(CYPHER),down=realCypher(bear);
  expect(bull.valid()).toBe(true);expect(down.valid()).toBe(true);
  const up=await paintModel(bull,fitted(CYPHER));
  expect(colours(up)).toEqual([['0.500',VALID],['1.300',VALID],['0.786',VALID]]);
  expect(badgeOf(up).map(t=>[t.text,t.color])).toEqual([['Cypher ✓',VALID]]);
  const dn=await paintModel(down,fitted(bear));
  expect(colours(dn)).toEqual([['0.500',VALID],['1.300',VALID],['0.786',VALID]]);
  expect(badgeOf(dn).map(t=>[t.text,t.color])).toEqual([['Cypher ✓',VALID]]);
 });

 it('while placing (X, A, B, C only) the pills keep their band colours',async()=>{
  const prices=CYPHER.slice(0,4),d=realCypher(prices);
  expect(d.valid()).toBeNull();
  expect(colours(await paintModel(d,fitted(prices)))).toEqual([['0.500',VALID],['1.300',VALID]]);
 });
});

describe('small patterns hide their ratio pills',()=>{
 it('a Gartley with legs of about 2 px (8 px wide) shows no pills instead of overlapping ones',async()=>{
  const {cmds}=await paint('gartley',GARTLEY,undefined,view(t=>60+(t-60)/50,p=>300-p/50));
  expect(ratioTexts(cmds)).toEqual([]);
 });

 it('hides the pills when the box is too narrow or too short, shows them at exactly 60 x 40 px',async()=>{
  // The Gartley spans times 60..460 (400 px) and prices 50..250 (200 px) on proj.
  const narrow=await paint('gartley',GARTLEY,undefined,view(t=>(t*3)/20-0.1*t/460,p=>300-p));
  expect(ratioTexts(narrow.cmds)).toEqual([]); // a little under 60 px wide
  const exact=await paint('gartley',GARTLEY,undefined,view(t=>(t*3)/20,p=>300-p/5));
  expect(ratioTexts(exact.cmds).map(t=>t.text)).toEqual(['0.618','0.618','1.440','0.786']); // 60 px wide, 40 px tall
  const short=await paint('gartley',GARTLEY,undefined,view(t=>(t*3)/20,p=>300-p/5.01));
  expect(ratioTexts(short.cmds)).toEqual([]); // 60 px wide, just under 40 px tall
 });

 it('the dashed diagonals and the vertex labels are still drawn on a small pattern',async()=>{
  const {cmds}=await paint('gartley',GARTLEY,undefined,view(t=>60+(t-60)/50,p=>300-p/50));
  expect(cmds.filter(c=>c.op==='stroke'&&c.dash.length>0)).toHaveLength(4);
  expect(allText(cmds).map(t=>t.text)).toEqual(expect.arrayContaining(['X','A','B','C','D']));
 });
});

describe('no name badge while the pattern has no validity yet',()=>{
 it('shows no Gartley badge with four of five points placed, and the badge once the fifth is placed',async()=>{
  const four=await paint('gartley',GARTLEY.slice(0,4));
  expect(four.d.valid()).toBeNull();expect(badgeOf(four.cmds)).toEqual([]);
  const five=await paint('gartley',GARTLEY);
  expect(badgeOf(five.cmds).map(t=>[t.text,t.color])).toEqual([['Gartley ✓',VALID]]);
 });

 it('shows no Cypher badge with two, three or four points placed (it used to read a green Cypher ✗)',async()=>{
  for(const n of [2,3,4]){
   const {d,cmds}=await paint('cypher',CYPHER.slice(0,n));
   expect(d.valid(),'points '+n).toBeNull();expect(badgeOf(cmds),'points '+n).toEqual([]);
  }
 });

 it('a complete wrong-direction Cypher still shows its red badge',async()=>{
  const prices=[100,110,105,87,97.5];
  expect(badgeOf(await paintModel(realCypher(prices),fitted(prices))).map(t=>[t.text,t.color])).toEqual([['Cypher ✗',INVALID]]);
 });
});

// ---- ABCD: the CD/AB pill and the valid / invalid badge (Carney, Harmonic Trading Vol. 1: AB=CD).
// Bands: BC/AB 0.618 to 0.786, CD/BC 1.272 to 1.618, CD/AB 0.9 to 1.1 (OpenCandle tolerance around 1.0), and the points alternate.
describe('ABCD CD/AB pill and badge',()=>{
 // A 100, B 200 (AB 100). C = 130 (BC 70, BC/AB 0.700). D = C + CD; CD 100 gives CD/AB 1.000 and CD/BC 1.429.
 const abcd=(cd:number)=>[100,200,130,130+cd];
 it('a textbook AB=CD shows a green CD/AB 1.000 pill on the A-D diagonal and a green ABCD badge',async()=>{
  const prices=abcd(100),{cmds}=await paint('abcd',prices);
  // All three ABCD pills colour against their bands now (BC/AB and CD/BC were uncoloured before the badge).
  expectLabels(prices,cmds,[[0,2,'0.700',VALID],[1,3,'1.429',VALID],[0,3,'1.000',VALID]]);
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['ABCD ✓',VALID]]);
 });
 it('the CD/AB pill is green inside 0.9 to 1.1 and red outside it',async()=>{
  const colourOf=async(cd:number)=>{const {cmds}=await paint('abcd',abcd(cd));return ratioTexts(cmds).at(-1)!;};
  expect(await colourOf(91)).toMatchObject({text:'0.910',color:VALID});
  expect(await colourOf(109)).toMatchObject({text:'1.090',color:VALID});
  expect(await colourOf(89)).toMatchObject({text:'0.890',color:INVALID});
  expect(await colourOf(111)).toMatchObject({text:'1.110',color:INVALID});
 });
 it('a bearish AB=CD (mirror image) is valid too',async()=>{
  const prices=abcd(100).map(p=>400-p),{cmds}=await paint('abcd',prices,undefined,view(t=>t,p=>400-p));
  expect(ratioTexts(cmds).at(-1)).toMatchObject({text:'1.000',color:VALID});
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['ABCD ✓',VALID]]);
 });
 it('the badge is red when BC/AB, CD/BC or CD/AB is out of band',async()=>{
  const bad=(prices:number[])=>paint('abcd',prices).then(r=>badgeOf(r.cmds).map(t=>[t.text,t.color]));
  expect(await bad([100,200,140,240])).toEqual([['ABCD ✗',INVALID]]); // BC/AB 0.600 (below 0.618), CD/BC 1.667 (above 1.618), CD/AB 1.000
  expect(await bad(abcd(120))).toEqual([['ABCD ✗',INVALID]]);          // CD/AB 1.200 (and CD/BC 1.714)
  expect(await bad([100,200,130,185])).toEqual([['ABCD ✗',INVALID]]); // CD/BC 0.786 (below 1.272)
 });
 it('the badge is red when the points do not alternate, even if every ratio is in band',async()=>{
  // A 100, B 200, C 130, D 30: BC/AB 0.700, CD/BC 1.429 and CD/AB 1.000 are all in band, but D is below C (no zigzag).
  const prices=[100,200,130,30],{cmds}=await paint('abcd',prices);
  expect(ratioTexts(cmds).map(t=>t.text)).toEqual(['0.700','1.429','1.000']);
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['ABCD ✗',INVALID]]);
 });
 it('shows no badge and no CD/AB pill until the fourth point is placed',async()=>{
  const three=await paint('abcd',abcd(100).slice(0,3));
  expect(badgeOf(three.cmds)).toEqual([]);expect(ratioTexts(three.cmds).map(t=>t.text)).toEqual(['0.700']);
 });
});

// ---- Three drives: a valid / invalid badge and a symmetry note (Carney, Harmonic Trading Vol. 1, and Bulkowski, Encyclopedia of
// Chart Patterns). Corrections A and B retrace 0.618 to 0.786 of the drive before them; drives 2 and 3 extend those corrections by
// 1.272 to 1.618; the points alternate. The symmetry note shows when the two drive extensions are within 0.1 of each other.
describe('Three drives badge and symmetry note',()=>{
 const realDrives=(prices:number[])=>{
  const d:any=createDrawing('lvthreedrives' as never,{id:'harmonic-real-drives',paneId:'price',style:{lineColor:LINE,lineWidth:1,lineStyle:'solid'},anchors:prices.map((price,i)=>({time:XS[i],price}))} as never);
  expect(d).toBeTruthy();return d;
 };
 // Start 50, drive 1 to 150 (100). A retraces 0.700: 80. Drive 2 extends A by `e2`: 80 + 70 * e2. B retraces 0.700 of drive 2.
 // Drive 3 extends B by `e3`.
 const drives=(e2:number,e3:number)=>{const p3=80+70*e2,l3=70*e2,p4=p3-0.7*l3,p5=p4+(0.7*l3)*e3;return[50,150,80,p3,p4,p5];};
 const run=async(prices:number[])=>{const d=realDrives(prices);return{d,cmds:await paintModel(d,fitted(prices))};};
 const note=(cmds:Cmd[])=>allText(cmds).filter(t=>/ymmetr/.test(t.text));

 it('a textbook three drives (corrections 0.700, drives 1.400 and 1.400) is valid with a symmetry note',async()=>{
  const {d,cmds}=await run(drives(1.4,1.4));
  expect(d.valid()).toBe(true);
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['Three drives ✓',VALID]]);
  expect(note(cmds).map(t=>t.text)).toEqual(['Symmetric drives']);
 });
 it('drive extensions 0.08 apart are symmetric, 0.15 apart are not (the badge stays valid, only the note goes)',async()=>{
  const near=await run(drives(1.4,1.48)),far=await run(drives(1.4,1.55));
  expect(near.d.valid()).toBe(true);expect(far.d.valid()).toBe(true);
  expect(note(near.cmds).map(t=>t.text)).toEqual(['Symmetric drives']);
  expect(note(far.cmds)).toEqual([]);
  expect(badgeOf(far.cmds).map(t=>t.text)).toEqual(['Three drives ✓']);
 });
 it('a drive extension outside 1.272 to 1.618 makes the badge red',async()=>{
  const {d,cmds}=await run(drives(1.7,1.4)); // drive 2 extends 1.700
  expect(d.valid()).toBe(false);
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['Three drives ✗',INVALID]]);
  const low=await run(drives(1.4,1.2)); // drive 3 extends 1.200
  expect(badgeOf(low.cmds).map(t=>t.color)).toEqual([INVALID]);
 });
 it('a correction outside 0.618 to 0.786 makes the badge red',async()=>{
  // Correction A retraces 0.500 of drive 1 (50 of 100): A = 100. Drive 2 extends A by 1.400 (to 170), B retraces 0.700, drive 3 1.400.
  const prices=[50,150,100,170,121,121+49*1.4]; // l3 = 70 (1.400 of 50), B = 170 - 49 = 121 (0.700 of 70), drive 3 = 49 * 1.4 = 68.6
  const {d,cmds}=await run(prices);
  expect(d.valid()).toBe(false);expect(badgeOf(cmds).map(t=>t.color)).toEqual([INVALID]);
 });
 it('a bearish three drives (mirror image) is valid too',async()=>{
  const prices=drives(1.4,1.4).map(p=>300-p);
  const {d,cmds}=await run(prices);
  expect(d.valid()).toBe(true);expect(badgeOf(cmds).map(t=>t.text)).toEqual(['Three drives ✓']);
 });
 it('the badge is red when the points do not alternate, even if every ratio is in band',async()=>{
  // Drive 1 up 100, A up 70 (not a correction), drive 2 down 98, B up 68.6, drive 3 down 96.04: every |ratio| in band, no zigzag.
  const prices=[50,150,220,122,190.6,94.56];
  const {d,cmds}=await run(prices);
  expect(d.valid()).toBe(false);expect(badgeOf(cmds).map(t=>t.color)).toEqual([INVALID]);
 });
 it('shows no badge and no note until all six points are placed',async()=>{
  const prices=drives(1.4,1.4).slice(0,5);
  const {d,cmds}=await run(prices);
  expect(d.valid()).toBeNull();expect(badgeOf(cmds)).toEqual([]);expect(note(cmds)).toEqual([]);
 });
 it('the four leg ratio pills colour against the bands the badge uses (corrections 0.618 to 0.786, drives 1.272 to 1.618)',async()=>{
  const prices=drives(1.4,1.4),{cmds}=await run(prices);
  // Colouring the previously uncoloured pills: all four are in band here.
  expect(ratioTexts(cmds).map(t=>[t.text,t.color])).toEqual([['0.700',VALID],['1.400',VALID],['0.700',VALID],['1.400',VALID]]);
  const wide=await run(drives(1.7,1.4)); // drive 2 extends 1.700: only that pill is red
  expect(colours(wide.cmds)).toEqual([['0.700',VALID],['1.700',INVALID],['0.700',VALID],['1.400',VALID]]);
 });
 it('every three drives pill is red when the points do not alternate, even with every ratio in band',async()=>{
  const {cmds}=await run([50,150,220,122,190.6,94.56]);
  expect(ratioTexts(cmds).map(t=>t.color)).toEqual([INVALID,INVALID,INVALID,INVALID]);
 });
 it('shows the symmetry note only when the badge is valid (symmetric drives with a bad correction get no note)',async()=>{
  const prices=[50,150,100,170,121,121+49*1.4]; // correction A 0.500; drive extensions 1.400 and 1.400 are symmetric
  const {d,cmds}=await run(prices);
  expect(d.valid()).toBe(false);expect(note(cmds)).toEqual([]);
 });
});

describe('ABCD pills share the badge band check and colour against their bands',()=>{
 const run=async(prices:number[])=>{const {cmds}=await paint('abcd',prices,undefined,fitted(prices));return cmds;};
 it('CD/AB at the top edge of its band (float noise: 1.1000000000000003) agrees with the badge: [47.82, 59.82, 51.42, 64.62]',async()=>{
  const cmds=await run([47.82,59.82,51.42,64.62]);
  expect(ratioTexts(cmds).at(-1)).toMatchObject({text:'1.100',color:VALID});
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['ABCD ✓',VALID]]);
 });
 it('the bottom edge agrees too (0.8999999999999999): [4.15, 15.95, 7.69, 18.31]',async()=>{
  const cmds=await run([4.15,15.95,7.69,18.31]);
  expect(ratioTexts(cmds).at(-1)).toMatchObject({text:'0.900',color:VALID});
  expect(badgeOf(cmds).map(t=>[t.text,t.color])).toEqual([['ABCD ✓',VALID]]);
 });
 it('BC/AB and CD/BC out of band are red beside a red badge: [100, 200, 150, 250]',async()=>{
  const cmds=await run([100,200,150,250]); // BC/AB 0.500, CD/BC 2.000, CD/AB 1.000
  expect(colours(cmds)).toEqual([['0.500',INVALID],['2.000',INVALID],['1.000',VALID]]);
  expect(badgeOf(cmds).map(t=>t.color)).toEqual([INVALID]);
 });
 it('every ABCD pill is red when the points do not zigzag: [100, 200, 130, 30]',async()=>{
  const cmds=await run([100,200,130,30]);
  expect(colours(cmds)).toEqual([['0.700',INVALID],['1.429',INVALID],['1.000',INVALID]]);
  expect(badgeOf(cmds).map(t=>t.color)).toEqual([INVALID]);
 });
 it('with three points placed BC/AB is coloured against its band',async()=>{
  const cmds=await run([100,200,150]);
  expect(colours(cmds)).toEqual([['0.500',INVALID]]);
 });
});
