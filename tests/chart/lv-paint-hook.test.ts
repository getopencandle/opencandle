import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createDrawing,deserializeDrawing,drawingTypes,getDrawingType,type DrawingTypeMeta,type SerializedDrawing} from '@luxalgo/vela';
import {LV_DRAWING_TYPE_IDS,lvDrawingTypeStatus,registerLvDrawingToolModules} from '../../src/chart/lv-drawing-types';
import {cloneStyle,lvKey,method,nativeBase,roles,fail,type Init,type NativeModel,type Projector} from '../../src/chart/lv-drawing-pin';
import {LV_PAINT_HOOK_COMPONENT,LV_PAINT_HOOK_LINE,LV_PAINT_HOOK_NODE_FILES,confirmPaintHook,installedPaintHook,painterSourceCarriesHook,paintHookStatus,type LvPaintTheme} from '../../src/chart/lv-paint-hook';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';
import {drawingCatalog} from '../../src/chart/drawing-port';
import plan from '../../src/chart/vela-compat-patch-plan.json';
import {compat5StepIds,compat6StepIds as compat6CursorStepIds,compat7StepIds,compat8StepIds,compat9StepIds,compat10StepIds,compat11StepIds,harmonicStepIds} from '../../src/chart/apply-vela-compat-patch.mjs';
// LV-VELA-COMPAT-7 appends the nav-clamp step after the COMPAT-6 steps; for this file's reversals the trailing
// group after COMPAT-5 is the COMPAT-6 cursor-kind steps plus that step.
// LV-VELA-COMPAT-8 appends the nineteen scale-left steps after those; they join the same trailing group.
// LV-VELA-COMPAT-9 appends the nine forward steps after those; they join the same trailing group.
// LV-VELA-COMPAT-10 appends the ten scale-group steps after those; they join the same trailing group.
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after those; they join the same trailing group.
const compat6StepIds=Object.freeze([...compat6CursorStepIds,...compat7StepIds,...compat8StepIds,...compat9StepIds,...compat10StepIds,...compat11StepIds]);
import {drawingCommands,drawingProjection,nativeDrawingHarness} from './drawing-native-harness';
import {annotationNativeHarness} from './trendline-annotation-native-harness';
import {realVelaChart} from '../helpers/real-vela-chart';
import {LV_DRAWING_TOOL_MODULES} from '../../src/chart/lv-types';

// LV-VELA-DRAWING-PAINT-HOOK-1 against the real installed library (SYNTHETIC records; native controller,
// painter, UserDrawingController render and the genuine Vela/DrawingsControl shape execute; no DOM, canvas
// or GUI claim). A trivial LV type registered through the production registration path paints itself,
// hit-tests, serializes, undoes/redoes and survives a toJSON/fromJSON reload. Every native type paints
// byte-identically with the patched painter and with the prior COMPAT-3 painter.
const PROBE:string='lvdwgap0probe',T0=1_000_000;
/** Production LV types registered on the hook route (they own lvPaint by design, so they are not native types). */
const LV_HOOK_TYPES:ReadonlySet<string>=new Set(LV_DRAWING_TOOL_MODULES.flatMap(module=>(module.types??[]).filter(type=>type.requiresPaintHook).map(type=>type.type)));
const theme:LvPaintTheme={fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'};

function defineProbe():DrawingTypeMeta{
 const base=nativeBase('trendline');
 for(const key of ['anchorSchema','serialize','readProps','writeProps'])method(base.prototype,key);
 const shape=roles(base.sample);if(shape.min!==2||shape.max!==2)fail('trendline anchor schema changed');
 const Base=base.ctor as unknown as new(init:Init)=>NativeModel;
 class LvProbe extends Base{
  label='SYNTHETIC OpenCandle PAINT';
  constructor(init:Init){super(init);(this as {type:string}).type=PROBE;if(init.props)this.readProps(init.props);}
  rect(proj:Projector){
   const [a,b]=this.anchors;if(!a||!b)return null;
   const ya=proj.yOf(a.price,this.paneId),yb=proj.yOf(b.price,this.paneId);if(ya==null||yb==null)return null;
   const xa=proj.xOf(a.time),xb=proj.xOf(b.time);
   return{x:Math.min(xa,xb),y:Math.min(ya,yb),w:Math.abs(xb-xa),h:Math.abs(yb-ya)};
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,paintTheme:LvPaintTheme){
   const r=this.rect(proj);if(!r)return;
   ctx.save();ctx.fillStyle=String(this.style.lineColor);ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle=paintTheme.textColor;ctx.fillText(this.label,r.x,r.y);ctx.restore();
  }
  hitTest(px:number,py:number,proj:Projector,tol:number){const r=this.rect(proj);return !!r&&px>=r.x-tol&&px<=r.x+r.w+tol&&py>=r.y-tol&&py<=r.y+r.h+tol;}
  bounds(proj:Projector){return this.rect(proj);}
  protected writeProps(){return{...(super.writeProps()??{}),lvProbe:{schemaVersion:1,label:this.label}};}
  protected readProps(props:Record<string,unknown>){super.readProps(props);const value=props.lvProbe as {label?:unknown}|undefined;if(typeof value?.label==='string')this.label=value.label;}
 }
 return{type:lvKey(PROBE),group:base.meta.group,label:'SYNTHETIC probe',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvProbe(init)};
}
const PROBE_MODULE={id:'dwgap0-probe',types:[{type:PROBE,base:'trendline',define:defineProbe,requiresPaintHook:true}]};
const record=(label='SYNTHETIC OpenCandle PAINT'):SerializedDrawing=>createDrawing(PROBE as never,{id:'dw-91',paneId:'price',createdAt:5,anchors:[{time:T0+20_000,price:100},{time:T0+120_000,price:160}],props:{lvProbe:{schemaVersion:1,label}}} as never)!.serialize();
const painted=(commands:any[])=>commands.filter(command=>command.op==='fillText').map(command=>String(command.values[0]));

/** The prior COMPAT-3 painter: the installed chunk with only the hook step reversed (hash-proven), loaded under .tmp. */
async function compat3Painter(){
 const row=plan.files.find(item=>item.path==='dist/chunk-UNUVPQFW.js')! as typeof plan.files[number]&{compat3Sha256:string};
 const step=row.transformations.find(item=>item.id==='drawing-paint-hook')!;
 const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),installed=readFileSync(file,'utf8');
 // LV-VELA-COMPAT-5 and COMPAT-6 steps follow the hook; reverse them first (COMPAT-6 first) so the result is the hash-proven COMPAT-3 chunk.
 let current=installed;for(const later of (row.transformations as Array<{id:string;before:string;after:string}>).filter(item=>[...compat5StepIds,...compat6StepIds].includes(item.id)).reverse()){expect(current.split(later.after)).toHaveLength(2);current=current.replace(later.after,later.before);}
 expect(current.split(step.after)).toHaveLength(2);
 const source=current.replace(step.after,step.before);
 expect(createHash('sha256').update(source).digest('hex')).toBe(row.compat3Sha256);
 // LV-VELA-HARMONIC-RATIOS-1 deliberately repaints pattern ratios; the prior painter keeps it so this comparison isolates the paint hook.
 let prior=source;for(const id of harmonicStepIds){const later=(row.transformations as Array<{id:string;before:string;after:string}>).find(item=>item.id===id)!;expect(prior.split(later.before)).toHaveLength(2);prior=prior.replace(later.before,()=>later.after);}
 const temporary=resolve('.tmp',`lv-dwgap0-compat3-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,prior.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { DrawingPainter as LVPriorDrawingPainter };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return new module.LVPriorDrawingPainter();
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}

afterEach(()=>{vi.doUnmock('../../src/chart/lv-paint-hook');vi.resetModules();});

describe('LV-VELA-DRAWING-PAINT-HOOK-1 on the installed library',()=>{
 it('registers a hook type through the production path and the live native painter honours lvPaint',async()=>{
  expect(paintHookStatus()).toEqual({available:true});
  expect(registerLvDrawingToolModules([PROBE_MODULE])).toEqual([{type:PROBE,base:'trendline',state:'registered'}]);
  expect(lvDrawingTypeStatus().map(row=>row.type)).toEqual([...LV_DRAWING_TYPE_IDS,PROBE]);
  expect(getDrawingType(PROBE as never)!.label).toBe('SYNTHETIC probe');
  expect(drawingCatalog().find(row=>row.type===PROBE)).toMatchObject({anchorSchema:{min:2,max:2}});
  const t=await nativeDrawingHarness();try{
   expect(confirmPaintHook(t.painter)).toBe(true);
   // An unpatched painter shape (no hook line) is refused by the behavioural probe.
   expect(confirmPaintHook({paintOne(ctx:any){ctx.beginPath();}})).toBe(false);expect(confirmPaintHook({})).toBe(false);
  }finally{t.dispose();}
  // Every native type lacks the hook member, so none can take the hook branch.
  for(const meta of drawingTypes()){if(meta.type===PROBE||LV_HOOK_TYPES.has(String(meta.type)))continue;const sample=createDrawing(meta.type,{paneId:'price'});expect(typeof (sample as any)?.lvPaint,String(meta.type)).not.toBe('function');}
  // The production hook types are registered (hook installed) and each owns lvPaint.
  for(const type of LV_HOOK_TYPES){expect(getDrawingType(type as never),type).toBeDefined();expect(typeof (createDrawing(type as never,{paneId:'price'}) as any)?.lvPaint,type).toBe('function');}
 });
 it('fails closed: no hook in the plan, or a hook type without lvPaint, is not registered',async()=>{
  expect(paintHookStatus({id:'LV-VELA-COMPAT-3',components:['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1']})).toMatchObject({available:false});
  expect(paintHookStatus({id:'LV-VELA-COMPAT-4',components:[]})).toMatchObject({available:false,reason:expect.stringContaining(LV_PAINT_HOOK_COMPONENT)});
  const noPaint=registerLvDrawingToolModules([{id:'dwgap0-nopaint',types:[{type:'lvdwgap0nopaint',base:'trendline',define:()=>({...getDrawingType('trendline')!,type:lvKey('lvdwgap0nopaint'),create:(init:any)=>{const d:any=createDrawing('trendline',init)!;d.type='lvdwgap0nopaint';return d;}}),requiresPaintHook:true}]}]);
  expect(noPaint[0]).toMatchObject({state:'unavailable',reason:expect.stringContaining('no lvPaint')});expect(getDrawingType('lvdwgap0nopaint' as never)).toBeUndefined();
  vi.resetModules();
  vi.doMock('../../src/chart/lv-paint-hook',async()=>({...(await vi.importActual<object>('../../src/chart/lv-paint-hook')),paintHookStatus:()=>({available:false,reason:'SYNTHETIC patch absent'})}));
  const fresh=await import('../../src/chart/lv-drawing-types');
  const status=fresh.registerLvDrawingToolModules([{...PROBE_MODULE,types:[{...PROBE_MODULE.types[0],type:'lvdwgap0nohook'}]}]);
  expect(status[0]).toMatchObject({type:'lvdwgap0nohook',state:'unavailable',reason:expect.stringContaining('no drawing paint hook: SYNTHETIC patch absent')});
  expect(getDrawingType('lvdwgap0nohook' as never)).toBeUndefined();
 });
 // The gate also probes the INSTALLED painter, not only the plan JSON. The fake unpatched painter is the
 // installed file with only the drawing-paint-hook step reversed (the hash-proven COMPAT-3 bytes, see compat3Painter).
 const hookStep=(path:string)=>(plan.files.find(item=>item.path===path)!.transformations as Array<{id:string;before:string;after:string}>).find(item=>item.id==='drawing-paint-hook')!;
 const installedFile=(path:string)=>readFileSync(resolve('node_modules/@luxalgo/vela',path),'utf8');
 const unpatched=(path:string)=>{const step=hookStep(path),source=installedFile(path);expect(source.split(step.after)).toHaveLength(2);return source.replace(step.after,step.before);};
 it('the probe line and node files are the plan\'s own drawing-paint-hook step, and the installed painter carries it',()=>{
  for(const path of LV_PAINT_HOOK_NODE_FILES){const step=hookStep(path);expect(step.after).toContain(LV_PAINT_HOOK_LINE);expect(step.before).not.toContain(LV_PAINT_HOOK_LINE);expect(painterSourceCarriesHook(installedFile(path)),path).toBe(true);}
  expect(installedPaintHook()).toEqual({verified:true,installed:'probed'});
  expect(paintHookStatus()).toEqual({available:true});
 });
 it('fails closed on a fake unpatched installed painter even when the plan JSON lists the hook',()=>{
  for(const path of LV_PAINT_HOOK_NODE_FILES)expect(painterSourceCarriesHook(unpatched(path)),path).toBe(false);
  const probe=installedPaintHook(path=>unpatched(path));
  expect(probe).toMatchObject({verified:false,installed:'probed',reason:expect.stringContaining(LV_PAINT_HOOK_COMPONENT)});
  expect(probe.reason).toContain('dist/chunk-UNUVPQFW.js');
  const status=paintHookStatus(undefined,probe);
  expect(status).toMatchObject({available:false,reason:expect.stringContaining('does not carry '+LV_PAINT_HOOK_COMPONENT)});
  // Only one entry unpatched still fails; an unreadable install fails; a hook line moved out of first place fails.
  expect(installedPaintHook(path=>path==='dist/index.cjs'?unpatched(path):installedFile(path))).toMatchObject({verified:false,reason:expect.stringContaining('dist/index.cjs')});
  expect(installedPaintHook(()=>null)).toMatchObject({verified:false});
  const step=hookStep('dist/chunk-UNUVPQFW.js'),moved=unpatched('dist/chunk-UNUVPQFW.js').replace('  paintAll(ctx, drawings, proj, theme, targets = {}) {\n','  paintAll(ctx, drawings, proj, theme, targets = {}) {\n    '+LV_PAINT_HOOK_LINE+'\n');
  expect(moved.split(LV_PAINT_HOOK_LINE)).toHaveLength(2);expect(step.before).not.toContain(LV_PAINT_HOOK_LINE);expect(painterSourceCarriesHook(moved)).toBe(false);
  // A browser bundle cannot read the package and relies on prebuild --verify.
  expect(installedPaintHook(null)).toEqual({verified:true,installed:'bundle'});
 });
 it('registration through the production path refuses a hook type when the installed painter is unpatched',async()=>{
  vi.resetModules();
  const proc=process as unknown as {getBuiltinModule:(id:string)=>any},real=proc.getBuiltinModule.bind(process);
  const spy=vi.spyOn(proc,'getBuiltinModule').mockImplementation((id:string)=>{
   const module=real(id);if(id!=='node:fs')return module;
   return{...module,readFileSync:(file:string,encoding:string)=>{const rel=String(file).replace(/\\/g,'/').split('/@luxalgo/vela/')[1];return rel&&(LV_PAINT_HOOK_NODE_FILES as readonly string[]).includes(rel)?unpatched(rel):module.readFileSync(file,encoding);}};
  });
  try{
   const hook=await import('../../src/chart/lv-paint-hook');
   expect(hook.paintHookStatus()).toMatchObject({available:false,reason:expect.stringContaining('does not carry '+LV_PAINT_HOOK_COMPONENT)});
   const fresh=await import('../../src/chart/lv-drawing-types');
   const status=fresh.registerLvDrawingToolModules([{...PROBE_MODULE,types:[{...PROBE_MODULE.types[0],type:'lvdwgap0unpatched'}]}]);
   expect(status[0]).toMatchObject({type:'lvdwgap0unpatched',state:'unavailable',reason:expect.stringContaining('no drawing paint hook: the installed chart renderer painter does not carry')});
   expect(getDrawingType('lvdwgap0unpatched' as never)).toBeUndefined();
  }finally{spy.mockRestore();}
 });
 it('paints, hit-tests, serializes, undoes and reloads through the real Vela chart shape',async()=>{
  registerLvDrawingToolModules([PROBE_MODULE]);
  const native=await nativeDrawingHarness(),paint=await annotationNativeHarness(),real=await realVelaChart({renderer:paint.renderer,core:native.controller});
  try{
   native.controller.port.syncDrawings=(rows:SerializedDrawing[])=>paint.sync(rows);
   paint.controller.intentCb=(intent:unknown)=>native.controller.onIntent(intent);
   const doc=record();
   // Create through the native controller (arm, create, finish), exactly as placement does.
   native.controller.setTool(PROBE);native.controller.onIntent({kind:'create',doc});native.controller.onIntent({kind:'tool-finished',type:PROBE});
   const created=native.controller.all().find((row:any)=>row.type===PROBE)!;
   // The store assigns id, createdAt and the next draw-order key; everything else is the placed record.
   expect(created).toEqual({...doc,id:created.id,createdAt:created.createdAt,zIndex:created.zIndex});expect(created.props).toEqual({lvProbe:{schemaVersion:1,label:'SYNTHETIC OpenCandle PAINT'}});
   // Native painter: the hook branch draws the model's own commands and nothing from the trendline branch.
   const commands=native.paint(created.id);
   expect(painted(commands)).toEqual(['SYNTHETIC OpenCandle PAINT']);
   expect(commands.map((command:any)=>command.op)).toEqual(['fillRect','fillText']);
   expect(commands[0].values).toEqual([drawingProjection.xOf(T0+20_000),drawingProjection.yOf(160),100,60]);
   // UserDrawingController render on the real chart shape: the synced row paints through the hook.
   paint.top.commands.length=0;paint.render();expect(painted(paint.top.commands)).toContain('SYNTHETIC OpenCandle PAINT');
   // Ghost (placement preview) also goes through the hook.
   const ghost=drawingCommands();native.painter.paintGhost(ghost.ctx,native.controller.store.get(created.id),drawingProjection,theme);expect(painted(ghost.commands)).toEqual(['SYNTHETIC OpenCandle PAINT']);
   // Hit testing: the model's own hitTest drives native hover, then native handles paint from handlePoints().
   const synced=paint.controller.drawings.find((row:any)=>row.type===PROBE);
   expect(synced.hitTest(drawingProjection.xOf(T0+70_000),drawingProjection.yOf(130),drawingProjection,4)).toBe(true);
   expect(synced.hitTest(drawingProjection.xOf(T0+300_000),drawingProjection.yOf(130),drawingProjection,4)).toBe(false);
   paint.top.commands.length=0;paint.controller.updateHover(drawingProjection.xOf(T0+70_000),drawingProjection.yOf(130));
   expect(paint.controller.hoveredId).toBe(synced.id);expect(paint.top.commands.filter((command:any)=>command.op==='arc').length).toBeGreaterThan(0);
   paint.controller.updateHover(drawingProjection.xOf(T0+300_000),drawingProjection.yOf(130));expect(paint.controller.hoveredId).toBeNull();
   // Serialization: native/canonical agreement and a lossless retained document.
   const saved=structuredClone(created) as SerializedDrawing,document=new LosslessDrawingDocument();document.load({version:1,drawings:[saved]});
   expect(()=>assertNativeDrawingMatchesCanonical(document.all()[0] as unknown as SerializedDrawing,deserializeDrawing(structuredClone(saved))!.serialize())).not.toThrow();
   expect((deserializeDrawing(structuredClone(saved)) as any).label).toBe('SYNTHETIC OpenCandle PAINT');
   // Undo / redo through the genuine DrawingsControl facade (chart.drawings).
   expect(real.chart.drawings).toBe(real.facade);expect(real.facade.canUndo()).toBe(true);
   real.facade.undo();expect(native.controller.all().some((row:any)=>row.type===PROBE)).toBe(false);
   real.facade.redo();const redone=native.controller.all().find((row:any)=>row.type===PROBE)!;
   expect(redone).toEqual(saved);expect(painted(native.paint(redone.id))).toEqual(['SYNTHETIC OpenCandle PAINT']);
   // Relaunch-style reload: a fresh native controller loads the saved JSON and paints the same way.
   const json=JSON.parse(JSON.stringify(native.controller.toJSON()));
   const relaunched=await nativeDrawingHarness();try{
    relaunched.controller.fromJSON(json);
    const back=relaunched.controller.all().find((row:any)=>row.type===PROBE)!;
    expect(back).toEqual(saved);expect(relaunched.paint(back.id).map((command:any)=>command.op)).toEqual(['fillRect','fillText']);
   }finally{relaunched.dispose();}
  }finally{native.dispose();paint.dispose();}
 });
 it('every native drawing type paints and ghosts byte-identically with the patched and the prior COMPAT-3 painter',async()=>{
  const t=await nativeDrawingHarness();
  try{
   const prior=await compat3Painter(),patched=t.painter;
   expect(confirmPaintHook(prior)).toBe(false);
   const outcome=(painter:any,model:any,ghost:boolean)=>{const record=drawingCommands();try{if(ghost)painter.paintGhost(record.ctx,model,drawingProjection,theme);else painter.paintAll(record.ctx,[model],drawingProjection,theme);return{commands:record.commands};}catch(error){return{commands:record.commands,error:String(error)};}};
   let compared=0;
   for(const meta of drawingTypes()){
    const type=String(meta.type);if(type===PROBE||type.startsWith('lvdwgap0')||LV_HOOK_TYPES.has(type))continue;
    const schema=createDrawing(meta.type,{paneId:'price'})!.anchorSchema(),count=Math.max(schema.min,2);
    const anchors=Array.from({length:Math.min(count,Math.max(schema.max,2))},(_,i)=>({time:T0+(20+40*i)*1000,price:100+(i%2?40:0)+5*i}));
    const make=()=>createDrawing(meta.type,{id:'dwgap0-native',paneId:'price',createdAt:0,anchors,text:{value:'SYNTHETIC',size:'normal',hAlign:'center',vAlign:'bottom'}} as never)!;
    for(const ghost of [false,true]){
     const left=outcome(patched,make(),ghost),right=outcome(prior,make(),ghost);
     expect(left,type+(ghost?' ghost':'')).toEqual(right);expect(left.commands.length+(left.error?1:0),type).toBeGreaterThan(0);
    }
    compared++;
   }
   expect(compared).toBe(drawingTypes().filter(meta=>!String(meta.type).startsWith('lvdwgap0')&&!LV_HOOK_TYPES.has(String(meta.type))).length);
   expect(compared).toBeGreaterThanOrEqual(82);
  }finally{t.dispose();}
 });
});
