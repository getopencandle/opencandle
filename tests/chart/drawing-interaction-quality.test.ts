import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {NativeRenderer} from '@luxalgo/vela';
import {createDrawingInteractionQuality,constrainBodyDrag,DRAWING_INTERACTION_QUALITY_KEYS} from '../../src/chart/drawing-interaction-quality';
import {drawingRouterHarness} from './drawing-command-router-harness';

// The pinned native interaction module, with its private interaction class exported for the test (same loader pattern as
// drawing-native-harness.ts). Every gesture below runs the real native bodies.
let pinned:Promise<any>|undefined;
async function load(){const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(file,'utf8'),temporary=resolve('.cache',`lv-interaction-quality-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { DrawingInteraction as LVQualityInteraction, createDrawing as LVQualityCreate, HIT_TOLERANCE as LVQualityHitTolerance, effectiveSnapMode as LVQualitySnapMode, WEAK_SNAP_PX as LVQualityWeakPx };\n');return await import(/* @vite-ignore */pathToFileURL(temporary).href);}finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}}
const native=()=>pinned??=load();

// SYNTHETIC projection: 1 px = 1 second, 1 px = 1 price unit.
const projector={width:400,height:300,xOf:(time:number)=>20+(time-1000000)/1000,yOf:(price:number)=>300-price,pxToPoint:(x:number,y:number)=>({time:1000000+(x-20)*1000,price:300-y}),paneIdAtY:()=>'price',paneRect:()=>({top:0,height:300})};
const line=(mod:any,id='synthetic-line')=>mod.LVQualityCreate('trendline',{id,paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}]});// pixels (20,200) to (260,100)

async function rig(options:{quality?:boolean;selected?:string[];snap?:(pt:any,paneId:string,mode:string,px:any)=>any}={}){
 const mod=await native(),intents:any[]=[];let drawings=[line(mod)],tool:string|null=null;const selected=new Set(options.selected??[]);
 const interaction=new mod.LVQualityInteraction({projector:()=>projector,activeTool:()=>tool,drawings:()=>drawings,hoveredId:()=>null,selectedIds:()=>selected,emit:(intent:any)=>intents.push(intent),changed(){},openSettings:(id:string)=>intents.push({kind:'settings',id}),snap:options.snap??((pt:any)=>pt),toolDefaults:()=>undefined});
 if(options.quality!==false){const quality=createDrawingInteractionQuality(interaction);for(const key of DRAWING_INTERACTION_QUALITY_KEYS)interaction[key]=quality[key];}
 return{mod,interaction,intents,get drawing(){return drawings[0];},replaceDrawings(next:any[]){drawings=next;},arm(type:string|null){tool=type;}};
}
const edits=(intents:any[])=>intents.filter(intent=>intent.kind==='edit');

describe('DRAW-QUALITY drawing interaction (real pinned native bodies)',()=>{
 it('Shift held at the press on an endpoint drags it on one axis (SHIFT-AXIS-1029) instead of toggling selection',async()=>{
  const r=await rig({selected:['synthetic-line']});
  r.interaction.down(260,100,'off',true);
  r.interaction.move(300,103,'off',true);// 40 right, 3 down from the press: horizontal
  r.interaction.move(400,198,'off',true);// the axis stays horizontal past AXIS_PICK_PX
  r.interaction.up(400,198);
  expect(r.intents.some(intent=>intent.kind==='select')).toBe(false);
  const [edit]=edits(r.intents);expect(edit).toBeDefined();
  expect(edit.doc.anchors[0]).toEqual({time:1000000,price:100});
  expect(edit.doc.anchors[1]).toEqual({time:1380000,price:200});// the handle keeps its own price exactly
 });
 it('Shift held at the press on the body moves it on one axis only',async()=>{
  const r=await rig();
  r.interaction.down(140,150,'off',true);// mid-line body
  r.interaction.move(200,157,'off',true);// 60 right, 7 down: horizontal wins
  r.interaction.up(200,157);
  const [edit]=edits(r.intents);expect(edit).toBeDefined();
  expect(edit.doc.anchors.map((a:any)=>a.price)).toEqual([100,200]);
  expect(edit.doc.anchors.map((a:any)=>a.time)).toEqual([1060000,1300000]);
 });
 it('Shift pressed during a body drag constrains it vertically when the move is mostly vertical',async()=>{
  const r=await rig();
  r.interaction.down(140,150,'off',false);
  r.interaction.move(145,120,'off',true);
  r.interaction.up(145,120);
  const [edit]=edits(r.intents);
  expect(edit.doc.anchors.map((a:any)=>a.time)).toEqual([1000000,1240000]);
  expect(edit.doc.anchors.map((a:any)=>a.price)).toEqual([130,230]);
 });
 it('a Shift click with no move still toggles the drawing in the selection and opens nothing',async()=>{
  const r=await rig();
  r.interaction.down(140,150,'off',true);r.interaction.up(140,150);
  expect(r.intents).toEqual([{kind:'select',ids:['synthetic-line'],additive:true}]);
  expect(r.interaction.state.kind).toBe('idle');
 });
 it('without the wrappers the native press toggles selection and Shift cannot lock an endpoint (the defect)',async()=>{
  const r=await rig({quality:false,selected:['synthetic-line']});
  r.interaction.down(260,100,'off',true);r.interaction.move(400,198,'off',true);r.interaction.up(400,198);
  expect(edits(r.intents)).toEqual([]);expect(r.intents[0]).toMatchObject({kind:'select',additive:true});
 });
 it('constrainBodyDrag keeps the dominant axis',()=>{
  expect(constrainBodyDrag(10,10,30,15)).toEqual({x:30,y:10});
  expect(constrainBodyDrag(10,10,12,40)).toEqual({x:10,y:40});
 });
 it('a drag is one edit intent (one undo step) and Escape mid-drag restores the anchors',async()=>{
  const r=await rig();
  r.interaction.down(140,150);r.interaction.move(150,150);r.interaction.move(170,140);r.interaction.up(170,140);
  expect(edits(r.intents)).toHaveLength(1);
  const s=await rig();
  s.interaction.down(140,150);s.interaction.move(170,140);
  expect(s.drawing.anchors[0]).not.toEqual({time:1000000,price:100});
  expect(s.interaction.cancel()).toBe(true);
  expect(s.drawing.anchors).toEqual([{time:1000000,price:100},{time:1240000,price:200}]);
  expect(edits(s.intents)).toEqual([]);
 });
 it('hit tolerance: body 6 px, handles 9 px; the hover cursor is the pointer on a body, move on a shown handle (LV-VELA-NAV-1) and nothing off them',async()=>{
  const r=await rig({selected:['synthetic-line']});
  expect(r.mod.LVQualityHitTolerance).toBe(6);
  // Body: the segment from (20,200) to (260,100). (140,150) is on it; 6 px of perpendicular offset still hits.
  const nx=100/260,ny=240/260;
  expect(r.interaction.cursorAt(140+nx*5.5,150+ny*5.5)).toBe('pointer');
  expect(r.interaction.cursorAt(140+nx*8,150+ny*8)).toBeNull();
  // Handle at (260,100): 9 px reaches it even past the end of the line.
  expect(r.drawing.hitHandle(268,100,projector,6)).toBe(1);
  expect(r.drawing.hitHandle(270,100,projector,6)).toBe(-1);
  expect(r.interaction.cursorAt(268,100)).toBe('move');
 });
 it('magnet: Ctrl toggles the saved mode, weak snaps within 8 px only, strong always snaps to the nearest OHLC',async()=>{
  const r=await rig();
  expect([r.mod.LVQualitySnapMode(false,'weak'),r.mod.LVQualitySnapMode(true,'off'),r.mod.LVQualitySnapMode(true,'strong')]).toEqual(['weak','strong','off']);
  expect(r.mod.LVQualityWeakPx).toBe(8);
  const bars=[{time:1000000,open:100,high:120,low:90,close:110},{time:1060000,open:110,high:130,low:105,close:125}];
  const fake={bars,coords:{timeToLogical:(time:number)=>(time-1000000)/60000},drawingProjector:()=>projector};
  const snap=(pt:any,mode:string,px:any)=>(NativeRenderer.prototype as any).snapToCandle.call(fake,pt,'price',mode as any,px);
  expect(snap({time:1058000,price:128},'strong',{x:1098,y:172})).toEqual({time:1060000,price:130});
  expect(snap({time:1058000,price:128},'weak',{x:78,y:172})).toEqual({time:1060000,price:130});// 2 px from (80,170)
  expect(snap({time:1040000,price:120},'weak',{x:60,y:180})).toEqual({time:1040000,price:120});// 20 px away: unchanged
  expect(snap({time:1040000,price:120},'off',{x:60,y:180})).toEqual({time:1040000,price:120});
  // Placement and handle drags go through the magnet; the mode reaches the snap host.
  const modes:string[]=[];const m=await rig({selected:['synthetic-line'],snap:(pt,_pane,mode)=>{modes.push(mode);return{time:1300000,price:250};}});
  m.interaction.down(260,100,'strong');m.interaction.move(290,60,'strong');m.interaction.up(290,60);
  expect(modes).toContain('strong');expect(edits(m.intents)[0].doc.anchors[1]).toEqual({time:1300000,price:250});
 });
 it('an in-progress placement survives the renderer replacing its drawing list (a live bar or reload)',async()=>{
  const r=await rig();r.arm('trendline');
  r.interaction.down(40,180);expect(r.interaction.isPlacing()).toBe(true);
  r.replaceDrawings([line(r.mod,'synthetic-line'),line(r.mod,'synthetic-other')]);// fresh models, as syncDrawings builds
  r.interaction.move(90,150);expect(r.interaction.ghost()?.anchors).toHaveLength(2);
  r.interaction.down(90,150);
  const created=r.intents.find(intent=>intent.kind==='create');
  expect(created.doc.anchors).toEqual([{time:1020000,price:120},{time:1070000,price:150}]);
 });
 it('the drawing command router installs the wrappers on the native interaction and removes them on dispose',async()=>{
  const f=await drawingRouterHarness(),interaction=f.paint.controller.interaction;
  try{for(const key of DRAWING_INTERACTION_QUALITY_KEYS)expect(Object.hasOwn(interaction,key)).toBe(true);}
  finally{f.dispose();}
  for(const key of DRAWING_INTERACTION_QUALITY_KEYS)expect(Object.hasOwn(interaction,key)).toBe(false);
 });
});
