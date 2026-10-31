import {NativeRenderer} from '@luxalgo/vela';

type Data=Record<string,unknown>;
interface Slot{owner:object;key:string;descriptor?:PropertyDescriptor}
const localLayouts=new WeakMap<Function,{renderer:NativeRenderer;paneId:string;source:()=>void;local:()=>void}>();
/** Resolve only the exact layout assertion minted for this renderer/pane/source frame. */
export function resolveNativeInlineLayoutOwner(full:()=>void,renderer:NativeRenderer,paneId:string,source:()=>void):()=>void{
 const proof=localLayouts.get(full);if(!proof||proof.renderer!==renderer||proof.paneId!==paneId||proof.source!==source)throw Error('Native inline layout local proof has another owner');
 proof.local();return proof.local;
}
function field(owner:object,key:string,optional=false):unknown{const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(!descriptor){if(optional)return undefined;throw Error('Native inline layout field unavailable: '+key);}if(!Object.hasOwn(descriptor,'value'))throw Error('Native inline layout requires data fields: '+key);return descriptor.value;}
function object(value:unknown,label:string):Data{if(!value||typeof value!=='object')throw Error('Native inline layout object unavailable: '+label);return value as Data;}
function method(owner:object,key:string):Slot{for(let current:object|null=owner;current;current=Object.getPrototypeOf(current)){const descriptor=Object.getOwnPropertyDescriptor(current,key);if(descriptor){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Native inline layout method unavailable: '+key);return{owner:current,key,descriptor};}}throw Error('Native inline layout method missing: '+key);}
function sameDescriptor(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined){return!a&&!b||!!a&&!!b&&a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;}

/**
 * Read-only proof for the pinned native projector's actual inputs, not an invented epoch.
 * A trusted source/input lease must reject supported source replacement and disposal.
 * Installed setBars replaces coords.times; appendBar changes its length. Arbitrary direct
 * same-length times[i] writes are outside this supported native/public-mutator boundary.
 */
export function captureNativeInlineLayoutOwner(renderer:NativeRenderer,paneId:string,assertSource:()=>void):()=>void{
 if(!(renderer instanceof NativeRenderer)||typeof paneId!=='string'||!paneId||typeof assertSource!=='function')throw Error('Native inline layout requires an owned renderer/source/pane');
 assertSource();
 const coords=object(field(renderer,'coords'),'coordinates'),scene=object(field(renderer,'scene'),'scene'),panes=field(scene,'panes');
 if(!(panes instanceof Map)||Object.getPrototypeOf(panes)!==Map.prototype||Object.hasOwn(panes,'get'))throw Error('Native inline layout requires the exact native pane map');
 const pane=object(Map.prototype.get.call(panes,paneId),'pane'),bounds=object(field(pane,'bounds'),'pane bounds'),scale=object(field(pane,'scale'),'pane scale'),theme=object(field(renderer,'theme'),'theme'),viewport=object(field(coords,'viewport'),'viewport'),times=field(coords,'times');
 if(!Array.isArray(times)||Object.getPrototypeOf(times)!==Array.prototype)throw Error('Native inline layout requires native time-array identity');
 const slots:Slot[]=[],prototypes:Array<{owner:object;prototype:object|null}>=[];
 const pin=(owner:object,keys:string[])=>{for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(descriptor&&!Object.hasOwn(descriptor,'value'))throw Error('Native inline layout accessor unavailable: '+key);slots.push({owner,key,descriptor});}};
 const coordinateOwnKeys=Reflect.ownKeys(coords);if(coordinateOwnKeys.length>32||coordinateOwnKeys.some(key=>typeof key!=='string'))throw Error('Native inline coordinate own-field bound exceeded');
 for(const key of coordinateOwnKeys as string[])if(typeof field(coords,key)==='function')throw Error('Native inline coordinate own methods unsupported');
 pin(renderer,['coords','scene','theme']);pin(scene,['panes']);pin(coords,coordinateOwnKeys as string[]);pin(viewport,['barSpacing','rightOffset']);pin(pane,['bounds','scale','collapsed']);pin(times,['length']);
 const pinPlain=(owner:Data,label:string)=>{if(![Object.prototype,null].includes(Object.getPrototypeOf(owner)))throw Error('Native inline layout plain '+label+' required');const keys=Reflect.ownKeys(owner);if(keys.length>64||keys.some(key=>typeof key!=='string'))throw Error('Native inline layout '+label+' field bound exceeded');for(const key of keys as string[]){const value=field(owner,key);if(value!==undefined&&typeof value!=='boolean'&&typeof value!=='string'&&!(typeof value==='number'&&Number.isFinite(value)))throw Error('Native inline layout '+label+' must contain primitive fields');}pin(owner,keys as string[]);return keys;};
 const boundsKeys=pinPlain(bounds,'bounds'),scaleKeys=pinPlain(scale,'scale');pin(theme,['fontFamily','background','textColor']);
 for(const value of [renderer,coords,scene,panes,pane,bounds,scale,theme,viewport,times])prototypes.push({owner:value,prototype:Object.getPrototypeOf(value)});
 const coordinatesPrototype=Object.getPrototypeOf(coords);if(!coordinatesPrototype||coordinatesPrototype===Object.prototype)throw Error('Native inline layout requires native coordinate provenance');
 const coordinateMethods=Object.getOwnPropertyDescriptors(coordinatesPrototype),coordinateKeys=Reflect.ownKeys(coordinateMethods);if(coordinateKeys.length>96)throw Error('Native inline coordinate method bound exceeded');
 for(const key of coordinateKeys){if(typeof key!=='string')throw Error('Native inline coordinate symbols unsupported');slots.push({owner:coordinatesPrototype,key,descriptor:coordinateMethods[key]});}
 const drawingProjector=method(renderer,'drawingProjector');slots.push(drawingProjector);
 for(const name of ['widthPx','dataHeightPx','devicePixelRatio','pitchScale','intervalMs']){const value=field(coords,name);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Native inline coordinate value unavailable: '+name);}
 for(const name of ['min','max'])if(typeof field(scale,name)!=='number'||!Number.isFinite(field(scale,name)))throw Error('Native inline scale value unavailable');
 for(const name of ['top','height'])if(typeof field(bounds,name)!=='number'||!Number.isFinite(field(bounds,name)))throw Error('Native inline pane bounds unavailable');
 for(const name of ['fontFamily','background','textColor'])if(typeof field(theme,name)!=='string')throw Error('Native inline text theme unavailable');
 let retired=false;
 const pure=()=>{
  if(retired)throw Error('Native inline layout lease retired');
  for(const value of prototypes)if(Object.getPrototypeOf(value.owner)!==value.prototype)throw Error('Native inline layout object/prototype changed');
  for(const slot of slots)if(!sameDescriptor(slot.descriptor,Object.getOwnPropertyDescriptor(slot.owner,slot.key)))throw Error('Native inline layout field changed: '+slot.key);
  if(Map.prototype.get.call(panes,paneId)!==pane||Object.getPrototypeOf(panes)!==Map.prototype||Object.hasOwn(panes,'get'))throw Error('Native inline pane membership changed');
  if(Reflect.ownKeys(bounds).length!==boundsKeys.length||Reflect.ownKeys(scale).length!==scaleKeys.length||Reflect.ownKeys(coordinatesPrototype).length!==coordinateKeys.length)throw Error('Native inline layout field ownership changed');
  if(Reflect.ownKeys(coords).length!==coordinateOwnKeys.length)throw Error('Native inline coordinate own-field ownership changed');
  if(method(renderer,'drawingProjector').owner!==drawingProjector.owner||Object.hasOwn(renderer,'drawingProjector')&&drawingProjector.owner!==renderer)throw Error('Native inline projector ownership changed');
 };
 const assertCurrent=()=>{try{pure();assertSource();pure();}catch(error){retired=true;throw error;}};
 assertCurrent();const local=()=>{try{pure();}catch(error){retired=true;throw error;}};localLayouts.set(assertCurrent,{renderer,paneId,source:assertSource,local});return Object.freeze(assertCurrent);
}
