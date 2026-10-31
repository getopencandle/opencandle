// OpenCandle 0.8.1, second round: drawing anchors on their containing bar after an interval change, label pills, word wrap,
// regression deviations and Pearson's R, legacy ray alerts in the drawn direction. The painter and projector specs run against
// the INSTALLED (patched) renderer chunk itself. SYNTHETIC data only.
import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createDrawing} from '@luxalgo/vela';
import '../../src/chart/lv-drawing-types';
import {wrapTextLines,DRAWING_TEXT_WRAP_WIDTH} from '../../src/chart/drawing-fixes/text-wrap';
import {pearsonLabel,regressionFit} from '../../src/chart/drawing-fixes/native-fixes';
import {prepareDrawingAlertGrid} from '../../src/chart/drawing-alert-geometry';
import {evaluateDrawingAlertShape} from '../../src/chart/drawing-alert-shapes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import {legacyDrawingDistance} from '../../src/domain/legacy-drawing-alert';

const CHUNK='node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js';
let loaded:Promise<any>|undefined;
function installed(){return loaded??=(async()=>{
 const path=resolve(CHUNK),source=readFileSync(path,'utf8'),temporary=resolve('.cache',`lv-drawing-labels-081-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { DrawingPainter as LVPainter, createDrawing as LVCreateDrawing, createProjector as LVCreateProjector, CoordinateSystem as LVCoordinates };\n');return await import(/* @vite-ignore */ pathToFileURL(temporary).href);}
 finally{try{unlinkSync(temporary);}catch{/* already gone */}}
})();}

type Cmd={op:'stroke';color:string;width:number}|{op:'fill';color:string;alpha:number}|{op:'text';text:string;x:number;y:number;color:string};
function recorder(){
 const cmds:Cmd[]=[],stack:any[]=[];
 const ctx:any={globalAlpha:1,lineWidth:1,fillStyle:'#000000',strokeStyle:'#000000',font:'11px sans-serif',textAlign:'left',textBaseline:'alphabetic'};
 ctx.save=()=>stack.push({...ctx});ctx.restore=()=>{const s=stack.pop();if(s)Object.assign(ctx,s);};
 for(const op of ['beginPath','moveTo','lineTo','closePath','arc','arcTo','quadraticCurveTo','bezierCurveTo','rect','clip','translate','rotate','fillRect','strokeRect','strokeText','setTransform','scale','ellipse','setLineDash'])ctx[op]=()=>{};
 ctx.stroke=()=>cmds.push({op:'stroke',color:ctx.strokeStyle,width:ctx.lineWidth});
 ctx.fill=()=>cmds.push({op:'fill',color:ctx.fillStyle,alpha:ctx.globalAlpha});
 ctx.fillText=(text:string,x:number,y:number)=>cmds.push({op:'text',text,x,y,color:ctx.fillStyle});
 ctx.measureText=(text:string)=>({width:text.length*6});
 return{ctx,cmds};
}
const BG='#101010',theme={fontFamily:'sans-serif',background:BG,textColor:'#ffffff'};
const proj={width:600,height:300,xOf:(t:number)=>t,yOf:(p:number)=>300-p,paneRect:()=>({top:0,height:300}),barsBetween:(a:number,b:number)=>Math.abs(b-a)/10};
async function paint(type:string,init:Record<string,unknown>,tweak?:(d:any)=>void,projection:any=proj){
 const m=await installed(),d=m.LVCreateDrawing(type,{id:'d-'+type,paneId:'price',...init});tweak?.(d);
 const rec=recorder();new m.LVPainter().paintAll(rec.ctx,[d],projection,theme);return rec.cmds;
}
/** Pills: a fill in the theme background at 0.8 alpha, then a 1 px outline. */
const pills=(cmds:Cmd[])=>cmds.filter((c,i)=>c.op==='fill'&&c.color===BG&&Math.abs(c.alpha-0.8)<1e-9&&cmds[i+1]?.op==='stroke'&&(cmds[i+1] as {width:number}).width===1);

describe('RISK 2: an anchor inside a bar period is drawn on that bar; the stored time never changes',()=>{
 const H=3600000,DAY=24*H,MON=Date.UTC(2024,0,1);
 // 1h bars 09:00..16:00 Monday to Friday; 1D bars at 00:00 Monday to Friday (two weeks).
 const hourly:number[]=[],daily:number[]=[];
 for(let d=0;d<12;d++){if(d%7>4)continue;daily.push(MON+d*DAY);for(let h=9;h<=16;h++)hourly.push(MON+d*DAY+h*H);}
 async function projector(times:number[],interval:number){
  const m=await installed(),coords=new m.LVCoordinates();coords.times=times;coords.intervalMs=interval;coords.logicalToX=(l:number)=>l*10;
  return{p:m.LVCreateProjector(coords,()=>({scale:{min:0,max:300},bounds:{top:0,height:300}}),()=>'price'),coords};
 }
 it('1h -> 1D -> 1h: a Wednesday 10:00 anchor sits on the Wednesday daily bar, then exactly back on its 1h bar',async()=>{
  const anchor={time:MON+2*DAY+10*H,price:100},stored={...anchor};
  const h1=await projector(hourly,H),d1=await projector(daily,DAY);
  const hourX=h1.p.xOf(anchor.time);expect(hourX).toBe(hourly.indexOf(anchor.time)*10);
  expect(d1.p.xOf(anchor.time)).toBe(2*10);// the daily bar index of Wednesday, not 2 + 10/24
  expect(d1.coords.timeToLogical(anchor.time)).toBeCloseTo(2+10/24,9);// the native mapping interpolates
  expect((await projector(hourly,H)).p.xOf(anchor.time)).toBe(hourX);expect(anchor).toEqual(stored);
 });
 it('Friday 15:00 is drawn on Friday, not toward Monday; a weekend time keeps the native interpolation',async()=>{
  const d1=await projector(daily,DAY);
  expect(d1.p.xOf(MON+4*DAY+15*H)).toBe(40);
  const saturday=MON+5*DAY+12*H;expect(d1.p.xOf(saturday)).toBeCloseTo(d1.coords.timeToLogical(saturday)*10,9);
 });
 it('a future-area anchor and an anchor exactly on a bar time are unchanged',async()=>{
  const d1=await projector(daily,DAY),future=daily.at(-1)!+3.5*DAY;
  expect(d1.p.xOf(future)).toBeCloseTo(d1.coords.timeToLogical(future)*10,9);
  expect(d1.p.xOf(daily[3])).toBe(30);
  expect(d1.p.barsBetween(MON+2*DAY+10*H,MON+3*DAY+20*H)).toBe(1);
 });
});

describe('label pills',()=>{
 it('the Date and price range text sits on a pill outlined in the box colour',async()=>{
  const cmds=await paint('datepricerange',{anchors:[{time:100,price:100},{time:300,price:200}]});
  const pill=pills(cmds);expect(pill).toHaveLength(1);
  const at=cmds.indexOf(pill[0]),texts=cmds.filter(c=>c.op==='text');
  expect(cmds.indexOf(texts[0])).toBeGreaterThan(at);
 });
 it('Elliott and head and shoulders labels sit on pills; a pattern that does not ask keeps plain labels',async()=>{
  const anchors=[0,1,2,3,4].map(i=>({time:60+i*100,price:100+(i%2?60:0)}));
  // The registered impulse is the 0.8.1 model (an unlabelled origin, then 1..4 here): one pill per label.
  expect(pills(await paint('elliottimpulse',{anchors}))).toHaveLength(4);
  expect(pills(await paint('elliottimpulse',{anchors},d=>{d.lvLabelPills=()=>false;}))).toHaveLength(0);
  for(const type of ['elliottimpulse','elliottcorrection','headshoulders','lvelliotttriangle'])expect((createDrawing(type as never,{id:type,paneId:'price'}) as any).lvLabelPills(),type).toBe(true);
 });
});

describe('callout, comment and note text wraps inside its box',()=>{
 const long='Breakout above the weekly range with volume confirmation';
 it('the wrap rule breaks at word boundaries, keeps line breaks and breaks a word wider than the width',()=>{
  const measure=(s:string)=>s.length*6;
  expect(wrapTextLines(['aaa bbb ccc','x'],42,measure)).toEqual(['aaa bbb','ccc','x']);
  expect(wrapTextLines(['abcdefghij'],30,measure)).toEqual(['abcde','fghij']);
  expect(DRAWING_TEXT_WRAP_WIDTH).toBe(240);
 });
 it('the installed painter wraps at the model width; with no width it keeps one line',async()=>{
  const init={anchors:[{time:100,price:100},{time:300,price:200}],text:{value:long,size:'normal'}};
  const wrapped=(await paint('callout',init,d=>{d.lvWrapWidth=()=>120;})).filter(c=>c.op==='text').map(c=>(c as {text:string}).text);
  expect(wrapped).toEqual(wrapTextLines([long],120,s=>s.length*6));expect(wrapped.length).toBeGreaterThan(2);
  expect((await paint('callout',init,d=>{d.lvWrapWidth=()=>0;})).filter(c=>c.op==='text')).toHaveLength(1);
  // The registered callout asks for the 240 px wrap: this text is wider than that, so it wraps.
  expect((await paint('callout',init)).filter(c=>c.op==='text').map(c=>(c as {text:string}).text)).toEqual(wrapTextLines([long],240,s=>s.length*6));
  const note=(await paint('note',{anchors:[{time:100,price:100}],text:{value:long,size:'normal'}},d=>{d.lvWrapWidth=()=>120;})).filter(c=>c.op==='text');
  expect(note.length).toBeGreaterThan(2);
 });
 it('the OpenCandle models ask for the wrap and their hit box follows the wrapped text',()=>{
  for(const type of ['callout','comment','note']){
   const m=createDrawing(type as never,{id:type,paneId:'price',anchors:[{time:100,price:100},{time:300,price:200}],text:{value:long,size:'normal'} as never}) as any;
   expect(m.lvWrapWidth(),type).toBe(240);
   const box=m.box(proj);expect(box.w,type).toBeLessThanOrEqual(240+16);expect(box.h,type).toBeGreaterThan(2*14);
  }
 });
});

describe('regression trend',()=>{
 const rows=[10,14,12,15,17,16].map((close,i)=>({time:(i+1)*10,close}));
 const bars=(from:number,to:number)=>rows.filter(row=>row.time>=from&&row.time<=to);
 it('upper and lower deviation inputs (default 2) set each band; the statistic is Pearson\'s R',()=>{
  const fit=regressionFit(rows,1,3)!,base=regressionFit(rows)!;
  expect(fit.up/base.up).toBeCloseTo(0.5,12);expect(fit.down/base.down).toBeCloseTo(1.5,12);
  expect(fit.r).toBeGreaterThan(0.8);expect(fit.r*fit.r).toBeCloseTo(fit.r2,12);
  const model=createDrawing('regressionchannel' as never,{id:'r',paneId:'price',anchors:[{time:10,price:0},{time:60,price:0}],props:{upperDeviation:1,lowerDeviation:3}} as never) as any;
  const L=model.layout({...proj,barsInRange:bars});
  expect(L.upperY0-L.midY0).toBeCloseTo(-fit.up,9);expect(L.lowerY0-L.midY0).toBeCloseTo(fit.down,9);
  expect(model.lvFitLabel(L)).toBe(pearsonLabel(fit.r));expect(pearsonLabel(-0.456)).toBe("Pearson's R -0.46");
  const fields=model.schema().fields;expect(fields.slice(0,2).map((f:any)=>[f.path,f.label])).toEqual([['reg.upperDeviation','Upper deviation'],['reg.lowerDeviation','Lower deviation']]);
  expect(fields.find((f:any)=>f.path==='reg.showR2').label).toBe("Show Pearson's R");
  expect(model.serialize().props).toMatchObject({upperDeviation:1,lowerDeviation:3});
 });
 it('the installed painter writes the model label instead of R squared',async()=>{
  const cmds=await paint('regressionchannel',{anchors:[{time:10,price:0},{time:60,price:0}]},d=>{d.lvFitLabel=()=>"Pearson's R 0.90";},{...proj,barsInRange:bars});
  const texts=cmds.filter(c=>c.op==='text').map(c=>(c as {text:string}).text);
  expect(texts).toContain("Pearson's R 0.90");expect(texts.some(t=>t.startsWith('R²'))).toBe(false);
 });
 it('a regression alert follows the deviation inputs',()=>{
  const day=1704153600,data=fixtureDataset('GME',6);data.bars=rows.map((row,i)=>({time:day+i*86400,open:row.close,high:row.close+1,low:row.close-1,close:row.close,volume:1}));
  const grid=prepareDrawingAlertGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'linear'} as never);if(!grid.ok)throw new Error(grid.diagnostics.join());
  const record=(props?:Record<string,unknown>)=>({id:'r',type:'regressionchannel',paneId:'price',anchors:[{time:day*1000,price:0},{time:(day+5*86400)*1000,price:0}],...props?{props}:{}});
  const band=(props?:Record<string,unknown>)=>{const c=grid.grid.captureShape(record(props));if(!c.ok)throw new Error(c.diagnostics.join());const v=evaluateDrawingAlertShape(c.snapshot,5);if(!v.ok||v.shape!=='channel')throw new Error('no channel');return v;};
  const base=band(),mid=(base.upper+base.lower)/2,skew=band({upperDeviation:1,lowerDeviation:3});
  expect(skew.upper-mid).toBeCloseTo((base.upper-mid)/2,9);expect(mid-skew.lower).toBeCloseTo((mid-base.lower)*1.5,9);
 });
});

describe('legacy drawing alerts: rays run in the drawn direction',()=>{
 const source=(anchors:{time:number;price:number}[])=>({kind:'drawing' as const,instanceId:'ray-1',snapshotId:'s',tool:'ray',anchors,settings:{},evaluation:'signed-price-distance' as const,coordinateModel:'linear-time-price' as const});
 const saved=(anchors:{time:number;price:number}[])=>[{id:'ray-1',type:'ray',paneId:'price',anchors:anchors.map(a=>({time:a.time*1000,price:a.price}))}];
 it('a ray drawn right to left has a value to the left of its first point and none to the right',()=>{
  const anchors=[{time:300,price:30},{time:200,price:20}];
  expect(legacyDrawingDistance(source(anchors),saved(anchors),100,15)).toEqual({value:5,diagnostics:[]});
  expect(legacyDrawingDistance(source(anchors),saved(anchors),400,40).value).toBeNull();
  const forward=[{time:200,price:20},{time:300,price:30}];
  expect(legacyDrawingDistance(source(forward),saved(forward),400,45)).toEqual({value:5,diagnostics:[]});
  expect(legacyDrawingDistance(source(forward),saved(forward),100,10).value).toBeNull();
 });
});

describe('round 3: what the gallery showed',()=>{
 it('(a) trend-based extension: levels project from C (C + r(B - A)) and run to the right of C, with a dashed A-B-C path',async()=>{
  const {TREND_EXTENSION_PATH_COLOR}=await import('../../src/chart/drawing-fixes/native-fixes');
  const m=createDrawing('fibextensiontrend' as never,{id:'t',paneId:'price',anchors:[{time:100,price:100},{time:200,price:150},{time:260,price:120}]} as never) as any;
  const rows=m.entryLines(proj);
  expect(rows.map((r:any)=>r.numberText)).toContain('1.618 (200.90)');expect(rows.map((r:any)=>r.numberText)).toContain('1.272 (183.60)');
  expect(rows.every((r:any)=>r.x1===260&&r.x2===360&&r.y1===r.y2)).toBe(true);
  expect(rows.find((r:any)=>r.numberText.startsWith('0 ')).y1).toBe(300-120);
  expect(m.trendPath(proj)).toEqual([[100,200],[200,150],[260,180]]);
  const rec=recorder();m.lvPaint(rec.ctx,proj,theme);
  expect(rec.cmds[0]).toMatchObject({op:'stroke',color:TREND_EXTENSION_PATH_COLOR});
  expect(m.hitTest(150,175,proj,3)).toBe(true);
 });
 it('(c) the info line readout sits beside its line, on the side the line does not cross',async()=>{
  const rising=await paint('infoline',{anchors:[{time:100,price:100},{time:300,price:200}]});
  const text=rising.find(c=>c.op==='text') as {x:number;y:number};
  // Midpoint (200, 150): the rising line passes above-right of it, so the readout goes below-right.
  expect(text.x).toBeGreaterThan(200);expect(text.y).toBeGreaterThan(150);
  const falling=await paint('infoline',{anchors:[{time:100,price:200},{time:300,price:100}]});
  const t2=falling.find(c=>c.op==='text') as {x:number;y:number};expect(t2.x).toBeGreaterThan(200);expect(t2.y).toBeLessThan(150);
 });
 it('(c) a flat date range puts its pill below the box, clear of the line',async()=>{
  const cmds=await paint('lvdaterange',{anchors:[{time:100,price:150},{time:300,price:150}]});
  const text=cmds.find(c=>c.op==='text') as {y:number};expect(text.y).toBeGreaterThan(150+9);
 });
 it('(d) placeholder text is selected when the inline editor opens',()=>{
  const source=readFileSync('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','utf8');
  expect(source).toContain('if (typeof d.defaultLabel === "function" && initial === d.defaultLabel()) ta.select();');
  expect((createDrawing('callout' as never,{id:'c',paneId:'price'}) as any).defaultLabel()).toBe('Callout');
 });
 it('(e) default line colours have contrast on a light chart: no type defaults to the pale cyan any more',async()=>{
  const {drawingTypes}=await import('@luxalgo/vela');const {CONTRAST_DEFAULT_TYPES}=await import('../../src/chart/lv-drawing-types');
  const pale=drawingTypes().filter(meta=>meta.type!=='fibretracement'&&[meta.defaultStyle?.lineColor,meta.defaultStyle?.fillColor].some(color=>typeof color==='string'&&color.toLowerCase().startsWith('#38c0fd')));
  expect(pale.map(meta=>meta.type)).toEqual([]);
  for(const type of ['pitchfork','elliottimpulse','lvelliotttriangle'])expect(CONTRAST_DEFAULT_TYPES).toContain(type);
  const lum=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
  const ratio=(a:string,b:string)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
  expect(ratio('#2962FF','#ffffff')).toBeGreaterThan(4.5);expect(ratio('#38c0fd','#ffffff')).toBeLessThan(2.3);
 });
 it('(f) an image add is not refused by a workspace update that carries the same image map',async()=>{
  const {createDrawingAssetsController,sameImageMap}=await import('../../src/chart/lv-types/image');
  expect(sameImageMap({},{})).toBe(true);expect(sameImageMap({a:{} as never},{})).toBe(false);
  const ids=new Set<string>(),store={ids:()=>[...ids],has:(id:string)=>ids.has(id),load:async()=>({ok:true}),size:()=>ids.size,toDocument:()=>Object.fromEntries([...ids].map(id=>[id,{}])),reconcile:()=>[]} as any;
  const commits:unknown[]=[],c=createDrawingAssetsController(store,doc=>{commits.push(doc);return true;},()=>{});
  c.sync(undefined);await c.settled();
  const out=await c.edit(async session=>{ids.add('picture');c.sync(undefined);c.sync({});return{ok:session.commit()};});
  expect(out).toEqual({ok:true});expect(commits).toHaveLength(1);
 });
});

describe('round 3: Bars pattern',()=>{
 it('(b) a new Bars pattern starts above the price series, so its copied bars show over their source candles',async()=>{
  const {getDrawingType}=await import('@luxalgo/vela');
  expect(getDrawingType('lvbarspattern' as never)?.coversSeries).toBe(true);
 });
});
