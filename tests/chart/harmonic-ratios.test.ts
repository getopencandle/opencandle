// LV-VELA-HARMONIC-RATIOS-1 guardrail. Paints harmonic and leg-ratio patterns through the installed (patched) Vela
// DrawingPainter on a recording canvas and asserts the exact ratio labels, the diagonals they sit on, and the pill
// paint order. Ratio definitions follow Scott Carney (Harmonic Trading, Vols 1-2). All fixtures are hand computed below.
import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {runPatch,patchPlan,harmonicStepIds} from '../../src/chart/apply-vela-compat-patch.mjs';
import {CHART_PATTERN_SPECS,LV_THREE_DRIVES} from '../../src/chart/lv-types/chart-patterns';

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

async function paint(type:string,prices:number[],tweak?:(d:any)=>void){
 const {module}=await installed();
 const d=module.LVHarmonicCreateDrawing(type,{id:'harmonic-'+type,paneId:'price',style:{lineColor:LINE,lineWidth:1,lineStyle:'solid'},anchors:prices.map((price,i)=>({time:XS[i],price}))});
 expect(d,type).toBeTruthy();tweak?.(d);
 const rec=recorder();new module.LVHarmonicPainter().paintAll(rec.ctx,[d],proj,theme);return{d,cmds:rec.cmds};
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
   expect(row.transformations.slice(-2).map((s:any)=>s.id)).toEqual([...harmonicStepIds]);
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

 it('ABCD: A-C BC/AB and B-D CD/BC',async()=>{
  // A 100, B 200 (AB 100), C 138.2 (BC/AB 0.618), D = 138.2 + 1.272 * 61.8 = 216.8096 (CD/BC 1.272).
  const prices=[100,200,138.2,216.8096];
  const {cmds}=await paint('abcd',prices);
  expectLabels(prices,cmds,[[0,2,'0.618',TEXT],[1,3,'1.272',TEXT]]);
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
