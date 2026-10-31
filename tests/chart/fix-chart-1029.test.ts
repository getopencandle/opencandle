import {expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createDrawingInteractionQuality,DRAWING_INTERACTION_QUALITY_KEYS,DRAG_PLACE_PX} from '../../src/chart/drawing-interaction-quality';
import {PLUS_BUTTON_PX} from '../../src/chart/price-scale-plus';

// A press-drag-release on a click-placed drawing tool places the next
// point on release; a press released in place keeps click-move-click. The pinned native interaction runs (same loader as
// drawing-interaction-quality.test.ts) behind the LV wrappers. SYNTHETIC projection and pointer coordinates, not GUI evidence.
let pinned:Promise<any>|undefined;
async function load(){const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(file,'utf8'),temporary=resolve('.cache',`lv-fix-chart-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { DrawingInteraction as LVFixInteraction };\n');return await import(/* @vite-ignore */pathToFileURL(temporary).href);}finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}}
const native=()=>pinned??=load();
// 1 px = 1 second, 1 px = 1 price unit.
const projector={width:400,height:300,xOf:(time:number)=>20+(time-1000000)/1000,yOf:(price:number)=>300-price,pxToPoint:(x:number,y:number)=>({time:1000000+(x-20)*1000,price:300-y}),paneIdAtY:()=>'price',paneRect:()=>({top:0,height:300})};
async function rig(tool:string,quality=true){
 const mod=await native(),intents:any[]=[],modes:string[]=[];
 const interaction=new mod.LVFixInteraction({projector:()=>projector,activeTool:()=>tool,drawings:()=>[],hoveredId:()=>null,selectedIds:()=>new Set(),emit:(intent:any)=>intents.push(intent),changed(){},openSettings(){},snap:(pt:any,_pane:string,mode:string)=>{modes.push(mode);return pt;},toolDefaults:()=>undefined});
 if(quality){const q=createDrawingInteractionQuality(interaction);for(const key of DRAWING_INTERACTION_QUALITY_KEYS)interaction[key]=q[key];}
 return{interaction,modes,created:()=>intents.filter(intent=>intent.kind==='create').map(intent=>intent.doc)};
}
const at=(x:number,y:number)=>({time:1000000+(x-20)*1000,price:300-y});
const drag=(i:any,x0:number,y0:number,x1:number,y1:number,mode='off')=>{i.down(x0,y0,mode);i.move((x0+x1)/2,(y0+y1)/2,mode);i.move(x1,y1,mode);i.up(x1,y1);};

for(const tool of ['trendline','ray','extendedline','box','fibretracement']){
 it(`${tool}: press, drag, release places the second point at the release`,async()=>{
  const r=await rig(tool);drag(r.interaction,40,180,160,120);
  expect(r.interaction.isPlacing()).toBe(false);
  expect(r.created()).toHaveLength(1);expect(r.created()[0].anchors).toEqual([at(40,180),at(160,120)]);
 });
}
it('without the wrapper the native release leaves the tool placing (the defect)',async()=>{
 const r=await rig('trendline',false);drag(r.interaction,40,180,160,120);
 expect(r.interaction.isPlacing()).toBe(true);expect(r.created()).toEqual([]);
});
it('click-move-click still works, including a click with sub-threshold jitter',async()=>{
 const r=await rig('trendline');
 r.interaction.down(40,180);r.interaction.move(40+DRAG_PLACE_PX,180);r.interaction.up(40+DRAG_PLACE_PX,180);
 expect(r.interaction.isPlacing()).toBe(true);
 r.interaction.move(120,150);r.interaction.move(200,100);expect(r.created()).toEqual([]);
 r.interaction.down(200,100);r.interaction.up(200,100);
 expect(r.interaction.isPlacing()).toBe(false);expect(r.created()[0].anchors).toEqual([at(40,180),at(200,100)]);
});
it('only the press that started the placement places on release: a dragged second click of a 3-point tool does not add a third',async()=>{
 const r=await rig('triangle');
 drag(r.interaction,40,180,120,120);expect(r.interaction.isPlacing()).toBe(true);// 2 of 3 points
 r.interaction.down(200,180);r.interaction.move(240,200);r.interaction.up(240,200);
 expect(r.created()).toHaveLength(1);expect(r.created()[0].anchors).toEqual([at(40,180),at(120,120),at(200,180)]);
});
it('the release point goes through the magnet with the mode of the drag',async()=>{
 const r=await rig('trendline');drag(r.interaction,40,180,160,120,'strong');
 expect(r.created()).toHaveLength(1);expect(r.modes.filter(mode=>mode==='strong').length).toBeGreaterThanOrEqual(2);
});
it('item 3: the price scale + is a small button',()=>{expect(PLUS_BUTTON_PX).toBe(14);});
