import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createDrawingInteractionQuality,createAxisLock,pickAxis,AXIS_PICK_PX,DRAWING_INTERACTION_QUALITY_KEYS} from '../../src/chart/drawing-interaction-quality';

// Shift locks a drag to the axis it moved further along. The pinned native
// interaction runs behind the LV wrappers (same loader as drawing-interaction-quality.test.ts). SYNTHETIC projection.
let pinned:Promise<any>|undefined;
async function load(){const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(file,'utf8'),temporary=resolve('.cache',`lv-shift-axis-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { DrawingInteraction as LVAxisInteraction, createDrawing as LVAxisCreate };\n');return await import(/* @vite-ignore */pathToFileURL(temporary).href);}finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}}
const native=()=>pinned??=load();
// 1 px = 1 second, 1 px = 1 price unit.
const projector={width:400,height:300,xOf:(time:number)=>20+(time-1000000)/1000,yOf:(price:number)=>300-price,pxToPoint:(x:number,y:number)=>({time:1000000+(x-20)*1000,price:300-y}),paneIdAtY:()=>'price',paneRect:()=>({top:0,height:300})};
const at=(x:number,y:number)=>({time:1000000+(x-20)*1000,price:300-y});
async function rig(type:string,options:{tool?:string;snap?:(pt:any,paneId:string,mode:string,px:any)=>any}={}){
 const mod=await native(),intents:any[]=[];
 const drawings=[mod.LVAxisCreate(type,{id:'d',paneId:'price',anchors:[at(60,200),at(160,120)]})];
 const interaction=new mod.LVAxisInteraction({projector:()=>projector,activeTool:()=>options.tool??null,drawings:()=>drawings,hoveredId:()=>null,selectedIds:()=>new Set(['d']),emit:(intent:any)=>intents.push(intent),changed(){},openSettings(){},snap:options.snap??((pt:any)=>pt),toolDefaults:()=>undefined});
 const quality=createDrawingInteractionQuality(interaction);for(const key of DRAWING_INTERACTION_QUALITY_KEYS)interaction[key]=quality[key];
 return{interaction,quality,get drawing(){return drawings[0];},edit:()=>intents.filter(intent=>intent.kind==='edit').at(-1)?.doc,created:()=>intents.filter(intent=>intent.kind==='create').map(intent=>intent.doc)};
}

it('the axis is the larger movement (ties horizontal) and is re-picked only under AXIS_PICK_PX',()=>{
 expect([pickAxis(5,5),pickAxis(5,-6),pickAxis(-9,2)]).toEqual(['x','y','x']);
 const lock=createAxisLock();
 expect(lock.at(true,2,1)).toBe('x');expect(lock.at(true,1,3)).toBe('y');// both under 6 px: re-picked
 expect(lock.at(true,3,AXIS_PICK_PX+20)).toBe('y');expect(lock.at(true,60,AXIS_PICK_PX+20)).toBe('y');// sticky
 expect(lock.at(false,60,0)).toBeNull();expect(lock.at(true,60,26)).toBe('x');// released, then re-picked from the drag so far
});

for(const type of ['fibretracement','box','trendline']){
 describe(`${type} handle drag`,()=>{
  it('Shift pressed after 20 px, mostly right: the handle keeps its price exactly, time follows',async()=>{
   const r=await rig(type);
   r.interaction.down(160,120);r.interaction.move(180,123);// 20 px free
   r.interaction.move(240,135,'off',true);r.interaction.up(240,135);
   expect(r.edit().anchors).toEqual([at(60,200),{time:at(240,0).time,price:180}]);
  });
  it('Shift, mostly down: the handle keeps its time exactly, price follows',async()=>{
   const r=await rig(type);
   r.interaction.down(160,120);r.interaction.move(164,140);
   r.interaction.move(170,200,'off',true);r.interaction.up(170,200);
   expect(r.edit().anchors).toEqual([at(60,200),{time:at(160,0).time,price:100}]);
  });
  it('Shift released mid-drag frees it again',async()=>{
   const r=await rig(type);
   r.interaction.down(160,120);r.interaction.move(200,122,'off',true);
   expect(r.drawing.anchors[1]).toEqual({time:at(200,0).time,price:180});
   r.interaction.move(230,240,'off',false);r.interaction.up(230,240);
   expect(r.edit().anchors[1]).toEqual(at(230,240));
  });
  it('a Shift key press with the pointer still re-applies the move locked',async()=>{
   const r=await rig(type);
   r.interaction.down(160,120);r.interaction.move(220,130);
   expect(r.quality.shiftKey.call(r.interaction,true)).toBe(true);
   expect(r.drawing.anchors[1]).toEqual({time:at(220,0).time,price:180});
   expect(r.quality.shiftKey.call(r.interaction,false)).toBe(true);
   expect(r.drawing.anchors[1]).toEqual(at(220,130));
  });
 });
}

it('magnet: the lock runs first and only the free axis takes the snapped value',async()=>{
 const seen:any[]=[];
 const snap=(pt:any,_pane:string,_mode:string,px:any)=>{seen.push(px);return{time:Math.round(pt.time/60000)*60000,price:111};};
 const h=await rig('fibretracement',{snap});
 h.interaction.down(160,120,'strong');h.interaction.move(250,130,'strong',true);h.interaction.up(250,130);
 const a=h.edit().anchors[1];expect(a.price).toBe(180);expect(a.time%60000).toBe(0);
 expect(seen.at(-1)).toEqual({x:250,y:120});// resolved on the locked price row
 const v=await rig('fibretracement',{snap});
 v.interaction.down(160,120,'strong');v.interaction.move(165,250,'strong',true);v.interaction.up(165,250);
 expect(v.edit().anchors[1]).toEqual({time:at(160,0).time,price:111});
 expect(seen.at(-1)).toEqual({x:160,y:250});// resolved on the locked time column
});

it('whole-drawing move: one axis, picked once past AXIS_PICK_PX, exact on the other axis',async()=>{
 const r=await rig('fibretracement');
 r.interaction.down(110,160);// mid body of the 0 to 1 diagonal
 r.interaction.move(122,163,'off',true);r.interaction.move(140,200,'off',true);r.interaction.up(140,200);// stays horizontal
 expect(r.edit().anchors).toEqual([at(90,200),at(190,120)]);
});

describe('placement of the second point',()=>{
 it('fib click-move-click with Shift locks to the first point price; drag-place locks too',async()=>{
  const r=await rig('fibretracement',{tool:'fibretracement'});
  r.interaction.down(40,180);r.interaction.up(40,180);
  r.interaction.move(200,170,'off',true);r.interaction.down(200,170,'off',true);r.interaction.up(200,170);
  expect(r.created()[0].anchors).toEqual([at(40,180),{time:at(200,0).time,price:120}]);
  const d=await rig('box',{tool:'box'});
  d.interaction.down(40,180);d.interaction.move(45,220,'off',true);d.interaction.move(50,260,'off',true);d.interaction.up(50,260);
  expect(d.created()[0].anchors).toEqual([at(40,180),{time:at(40,0).time,price:40}]);
 });
 it('trendline placement keeps the native 45 degree angle lock',async()=>{
  const r=await rig('trendline',{tool:'trendline'});
  r.interaction.down(40,180);r.interaction.up(40,180);
  r.interaction.move(140,85,'off',true);r.interaction.down(140,85,'off',true);r.interaction.up(140,85);
  const [p0,p1]=r.created()[0].anchors;
  expect(p1.price-p0.price).toBeCloseTo((p1.time-p0.time)/1000,6);// exactly 45 degrees in pixels
  expect(p1.price).not.toBe(p0.price);
 });
});
