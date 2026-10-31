// LV-VELA-DRAWING-PAINT-HOOK-1 (cumulative Vela patch LV-VELA-COMPAT-4, src/chart/vela-compat-patch-plan.json).
// The patched native painter's paintOne(ctx, d, proj, theme) starts with
//   if (typeof d.lvPaint === "function") { d.lvPaint(ctx, proj, theme); return; }
// so a OpenCandle drawing model that owns `lvPaint` paints itself, inside the same native pane clip, ghost
// (placement preview) and highlight paths. No native drawing class has that member, so native tools keep their
// own painter branch. Selection handles are still painted natively from the model's handlePoints().
//
// Fail closed: a type that needs the hook declares `requiresPaintHook` and is registered only when
// paintHookStatus() is available. The installed bytes are proven by the plan's afterSha256, which predev,
// prebuild and pretest verify (`apply-vela-compat-patch.mjs --verify`) before any renderer code runs.
// confirmPaintHook() is the behavioural probe for a live native painter.
//
// The plan JSON alone says what SHOULD be installed. Where the installed package is readable (Node:
// vitest or vite run directly, without the npm pre-hooks' --verify), paintHookStatus() also probes the INSTALLED
// painter once: the DrawingPainter class of each Node entry must open paintOne with the hook line. A missing or
// misplaced hook fails closed with a reason that the type's status row (and its unavailable toolbar row) shows.
// A browser bundle cannot read the package; it is built only after prebuild --verify, so it reports
// installed:'bundle' and relies on that build gate.
import type {Drawing} from '@luxalgo/vela';
import {components as compatComponents,id as compatPlanId} from './vela-compat-patch-plan.json';

export const LV_PAINT_HOOK_COMPONENT='LV-VELA-DRAWING-PAINT-HOOK-1';
export const LV_PAINT_HOOK_PLAN='LV-VELA-COMPAT-11';
/** Cumulative plans that carry the hook: COMPAT-4 introduced it; COMPAT-5 (scale buttons/placement, time format), COMPAT-6 (cursor kind), COMPAT-7 (navigation bounds), COMPAT-8 (main scale on the left), COMPAT-9 (forward indicator points) and COMPAT-10 (shared extra scales) and COMPAT-11 (renderer leftovers) keep it unchanged. */
export const LV_PAINT_HOOK_PLANS:readonly string[]=Object.freeze(['LV-VELA-COMPAT-4','LV-VELA-COMPAT-5','LV-VELA-COMPAT-6','LV-VELA-COMPAT-7','LV-VELA-COMPAT-8','LV-VELA-COMPAT-9','LV-VELA-COMPAT-10',LV_PAINT_HOOK_PLAN]);

export type LvPaintProjector=Parameters<Drawing['onPlaced']>[0];
/** The native painter theme handed to paintOne (font, text and background colors). */
export interface LvPaintTheme{readonly fontFamily:string;readonly textColor:string;readonly background:string;readonly [key:string]:unknown}
/** A drawing model that paints itself through the hook. */
export interface LvPaintable{lvPaint(ctx:CanvasRenderingContext2D,proj:LvPaintProjector,theme:LvPaintTheme):void}

/** The statement LV-VELA-DRAWING-PAINT-HOOK-1 puts first in paintOne (equal to the plan's drawing-paint-hook `after`). */
export const LV_PAINT_HOOK_LINE='if (typeof d.lvPaint === "function") { d.lvPaint(ctx, proj, theme); return; }';
/** Installed files that hold the DrawingPainter a Node consumer loads (ESM chunk behind dist/index.js, and the CJS entry). */
export const LV_PAINT_HOOK_NODE_FILES:readonly string[]=Object.freeze(['dist/chunk-UNUVPQFW.js','dist/index.cjs']);

export interface InstalledPaintHook{readonly verified:boolean;readonly installed:'probed'|'bundle';readonly reason?:string}
/** Reads one installed package file (path relative to the @luxalgo/vela package root); null when unreadable. */
export type InstalledFileReader=(path:string)=>string|null;

/** True only when `source` has exactly one hook line and it is the first statement of DrawingPainter.paintOne. */
export function painterSourceCarriesHook(source:string):boolean{
 if(source.split(LV_PAINT_HOOK_LINE).length!==2)return false;
 const painter=source.indexOf('DrawingPainter = class {');if(painter<0)return false;
 const header=/\r?\n[ \t]*paintOne\(ctx, d, proj, theme\) \{\r?\n/g;header.lastIndex=painter;
 const match=header.exec(source);if(!match)return false;
 // paintOne must belong to DrawingPainter: no other top-level `var X = class` declaration in between.
 if(/\n[ \t]*var [A-Za-z_$][\w$]* = class\b/.test(source.slice(painter,match.index)))return false;
 const next=source.slice(match.index+match[0].length).split(/\r?\n/,8).map(line=>line.trim()).filter(line=>line&&!/^\/\*!.*\*\/$/.test(line));
 return next[0]===LV_PAINT_HOOK_LINE;
}

/** Node reader for the installed package (no static node: import, so the browser bundle is unaffected); null in a browser. */
function nodeInstalledReader():InstalledFileReader|null{
 const proc=(globalThis as {process?:{getBuiltinModule?:(id:string)=>any;cwd?:()=>string;versions?:{node?:string}}}).process;
 if(!proc?.versions?.node||typeof proc.getBuiltinModule!=='function'||typeof proc.cwd!=='function')return null;
 const fs=proc.getBuiltinModule('node:fs'),path=proc.getBuiltinModule('node:path'),module=proc.getBuiltinModule('node:module');
 let root:string;
 try{root=path.dirname(path.dirname(module.createRequire(path.join(proc.cwd(),'package.json')).resolve('@luxalgo/vela')));}catch{return()=>null;}
 return file=>{try{return fs.readFileSync(path.join(root,file),'utf8');}catch{return null;}};
}

let installedCache:InstalledPaintHook|undefined;
/** One-time probe of the installed painter. Pass `read` (tests) to probe another source; pass null to model a browser bundle. */
export function installedPaintHook(read?:InstalledFileReader|null):InstalledPaintHook{
 const own=read===undefined;if(own&&installedCache)return installedCache;
 const reader=own?nodeInstalledReader():read;
 let result:InstalledPaintHook;
 if(!reader)result=Object.freeze({verified:true,installed:'bundle' as const});
 else{
  const missing=LV_PAINT_HOOK_NODE_FILES.filter(file=>{const source=reader(file);return source===null||!painterSourceCarriesHook(source);});
  result=missing.length?Object.freeze({verified:false,installed:'probed' as const,reason:'the installed chart renderer painter does not carry '+LV_PAINT_HOOK_COMPONENT+' ('+missing.join(', ')+'); run the renderer patch (npm install or apply-vela-compat-patch.mjs --apply)'}):Object.freeze({verified:true,installed:'probed' as const});
 }
 if(own)installedCache=result;
 return result;
}

export interface PaintHookStatus{readonly available:boolean;readonly reason?:string}
export function paintHookStatus(plan:{id:unknown;components:unknown}={id:compatPlanId,components:compatComponents},installed:InstalledPaintHook=installedPaintHook()):PaintHookStatus{
 if(typeof plan.id!=='string'||!LV_PAINT_HOOK_PLANS.includes(plan.id))return Object.freeze({available:false,reason:'the installed chart renderer patch is '+String(plan.id)+', not '+LV_PAINT_HOOK_PLAN});
 if(!Array.isArray(plan.components)||!plan.components.includes(LV_PAINT_HOOK_COMPONENT))return Object.freeze({available:false,reason:'the chart renderer patch does not include '+LV_PAINT_HOOK_COMPONENT});
 if(!installed.verified)return Object.freeze({available:false,reason:installed.reason??'the installed chart renderer painter is not verified'});
 return Object.freeze({available:true});
}

/** Behavioural probe of a live native painter (an object with paintOne): true only when paintOne hands a
 *  sentinel model to its own lvPaint and returns without touching the canvas. */
export function confirmPaintHook(painter:unknown):boolean{
 const paintOne=painter&&typeof painter==='object'?(painter as {paintOne?:unknown}).paintOne:undefined;
 if(typeof paintOne!=='function')return false;
 let called=0,touched=0;
 const ctx=new Proxy({},{get:()=>{touched++;return()=>undefined;},set:()=>{touched++;return true;}});
 const sentinel=Object.freeze({type:'lv-paint-hook-probe',paneId:'price',anchors:Object.freeze([]),lvPaint(){called++;}});
 try{Reflect.apply(paintOne,painter,[ctx,sentinel,{xOf:()=>0,yOf:()=>0,width:0,height:0},{fontFamily:'sans-serif',textColor:'#000000',background:'#ffffff'}]);}
 catch{return false;}
 return called===1&&touched===0;
}
