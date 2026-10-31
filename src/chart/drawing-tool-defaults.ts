// Drawing "Save as default" and "Reset settings" (the drawing settings Template menu).
//
// A saved default is what the next drawing of that tool starts from: its style, its text styling (never the text itself) and its
// per-type settings (props). It is kept in the workspace as `drawingToolDefaults` (schema step 1, optional: a workspace without it
// round-trips unchanged) and is shared by every chart of the window.
//
// Delivery uses the renderer's own tool defaults (facade toolDefaults / setToolDefaults / resetToolDefaults): the native placement
// and create paths already start a new drawing from them. The renderer also remembers the last edited look of a tool on its own
// (in memory only). For a tool with a SAVED default, the saved one wins: after any native `drawing:defaults` change the saved value
// is put back. Tools without a saved default keep the renderer behaviour.
//
// The drawing Template menu:
//  * Save as default takes the applied drawing (unapplied dialog edits must be applied first, as for Save as).
//  * Reset settings forgets the saved default and puts the tool's factory settings into the dialog draft (Apply keeps them).
//  * The Emojis and Stickers tools never save their picked symbol (the picker chooses it); an Image never saves its picture.
//  * Not undoable (like favorites): it is a preference, not a chart change.
type Plain=Record<string,unknown>;
export interface DrawingToolDefault{style?:Plain;text?:Plain;props?:Plain}
export interface DrawingToolDefaults{schemaVersion:1;tools:Record<string,DrawingToolDefault>}

export const TOOL_DEFAULTS_LIMIT=500;
const TYPE=/^[A-Za-z0-9:_-]{1,100}$/;
const ENTRY_BYTES=64*1024;
/** Props a saved default never carries, per type: the picked symbol or picture is chosen elsewhere. */
const NOT_DEFAULT_PROPS:Readonly<Record<string,readonly string[]>>=Object.freeze({lvemoji:['glyph'],lvsticker:['lvSticker'],lvimage:['lvImageAsset']});

const object=(value:unknown):value is Plain=>!!value&&typeof value==='object'&&!Array.isArray(value);
function plainJSON(value:unknown,depth=0):boolean{
 if(depth>12)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.length<=1000&&value.every(item=>plainJSON(item,depth+1));
 if(object(value)&&Object.getPrototypeOf(value)===Object.prototype)return Object.keys(value).length<=500&&Object.values(value).every(item=>plainJSON(item,depth+1));
 return false;
}
function entry(value:unknown):DrawingToolDefault{
 if(!object(value)||Object.keys(value).some(key=>!['style','text','props'].includes(key)))throw Error('Unsupported drawing tool default.');
 const out:DrawingToolDefault={};
 for(const key of ['style','text','props'] as const){const part=value[key];if(part===undefined)continue;if(!object(part)||!plainJSON(part))throw Error('Unsupported drawing tool default.');out[key]=structuredClone(part);}
 if(out.text&&Object.hasOwn(out.text,'value'))throw Error('A drawing tool default never holds text.');
 if(!out.style&&!out.text&&!out.props)throw Error('Empty drawing tool default.');
 if(JSON.stringify(out).length>ENTRY_BYTES)throw Error('Drawing tool default is too large.');
 return out;
}
/** Exact restore of the workspace block; a present invalid value fails recovery (it never silently becomes empty). */
export function restoreDrawingToolDefaults(value:unknown):DrawingToolDefaults{
 if(!object(value)||value.schemaVersion!==1||!object(value.tools)||Object.keys(value).some(key=>!['schemaVersion','tools'].includes(key)))throw Error('Unsupported drawing tool defaults.');
 const types=Object.keys(value.tools);if(types.length>TOOL_DEFAULTS_LIMIT)throw Error('Too many drawing tool defaults.');
 const tools:Record<string,DrawingToolDefault>={};
 for(const type of types){if(!TYPE.test(type))throw Error('Invalid drawing tool default type.');tools[type]=entry(value.tools[type]);}
 return{schemaVersion:1,tools};
}
export const emptyDrawingToolDefaults=():DrawingToolDefaults=>({schemaVersion:1,tools:{}});
/** The saved default of one canonical drawing row: style, text styling without the text, and props minus the picked symbol. */
export function captureToolDefault(row:Readonly<Plain>):{type:string;value:DrawingToolDefault}{
 const type=row.type;if(typeof type!=='string'||!TYPE.test(type))throw Error('This drawing has no tool to save a default for.');
 const value:DrawingToolDefault={};
 if(object(row.style))value.style=structuredClone(row.style);
 if(object(row.text)){const {value:_text,...styling}=structuredClone(row.text);if(Object.keys(styling).length)value.text=styling;}
 if(object(row.props)){const props=structuredClone(row.props);for(const key of NOT_DEFAULT_PROPS[type]??[])delete props[key];if(Object.keys(props).length)value.props=props;}
 return{type,value:entry(value)};
}
/** The next workspace block with `type` saved (or, with null, forgotten). */
export function withToolDefault(current:DrawingToolDefaults|undefined,type:string,value:DrawingToolDefault|null):DrawingToolDefaults{
 const base=current?restoreDrawingToolDefaults(current):emptyDrawingToolDefaults();
 if(!TYPE.test(type))throw Error('Invalid drawing tool default type.');
 const tools={...base.tools};
 if(value===null)delete tools[type];else{if(!Object.hasOwn(tools,type)&&Object.keys(tools).length>=TOOL_DEFAULTS_LIMIT)throw Error('Too many drawing tool defaults.');tools[type]=entry(value);}
 return{schemaVersion:1,tools};
}

// ---- the window's shared copy (App loads it from the workspace; every chart adapter applies it) ----
let shared:DrawingToolDefaults=emptyDrawingToolDefaults();
const listeners=new Set<()=>void>();
/** Loads the workspace block (absent: none saved). Every connected chart re-applies it. */
export function loadSharedToolDefaults(value:DrawingToolDefaults|undefined):void{
 const next=value===undefined?emptyDrawingToolDefaults():restoreDrawingToolDefaults(value);
 if(JSON.stringify(next)===JSON.stringify(shared))return;
 shared=next;
 // One chart that cannot take the change (it is closing) never stops the others; it re-applies on its next connect.
 const failures:unknown[]=[];for(const listener of [...listeners])try{listener();}catch(error){failures.push(error);}
 if(failures.length)throw new AggregateError(failures,'Some charts could not take the saved drawing defaults.');
}
export const sharedToolDefaults=():DrawingToolDefaults=>structuredClone(shared);
export const hasSharedToolDefault=(type:string)=>Object.hasOwn(shared.tools,type);

/** The renderer facade members this uses (vela UserDrawings). */
export interface ToolDefaultsFacade{
 toolDefaults():Record<string,unknown>;
 setToolDefaults(map:Record<string,unknown>):unknown;
 resetToolDefaults(type?:string):unknown;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
/**
 * Keeps one chart's renderer tool defaults in step with the shared saved defaults. Saved tools always hold their saved value;
 * a tool whose saved default was removed is reset to its factory settings; other remembered looks are left alone.
 * Returns the disposer. `onDefaults` subscribes to the renderer `drawing:defaults` event.
 */
export function connectToolDefaults(facade:ToolDefaultsFacade,onDefaults:(callback:(event:{type?:string})=>void)=>()=>void):()=>void{
 let applied:Record<string,DrawingToolDefault>={},busy=false,live=true;
 const apply=()=>{
  if(!live||busy)return;busy=true;
  try{
   const saved=shared.tools,native=facade.toolDefaults()??{};
   for(const type of Object.keys(applied))if(!Object.hasOwn(saved,type)&&Object.hasOwn(native,type))facade.resetToolDefaults(type);
   const current=facade.toolDefaults()??{};
   if(Object.entries(saved).some(([type,value])=>!same(current[type],value)))facade.setToolDefaults({...current,...structuredClone(saved)});
   applied=structuredClone(saved);
  }finally{busy=false;}
 };
 apply();
 listeners.add(apply);
 let off:()=>void;
 try{off=onDefaults(event=>{if(typeof event?.type==='string'&&!Object.hasOwn(shared.tools,event.type))return;apply();});}
 catch(error){live=false;listeners.delete(apply);throw error;}
 return()=>{if(!live)return;live=false;listeners.delete(apply);off();};
}
