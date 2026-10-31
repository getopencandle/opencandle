// Image on the pinned native `iconstamp` class (GlyphStamp: one anchor, a centered box), painted through
// LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint). Assets live in ../image-assets.ts.
//
// Behavior:
//  * Toolbar: section "Content", favoritable, no hotkey; shown when not an embedded widget (OpenCandle is not one).
//  * Placement: one point, created from a file / URL / paste flow and not by clicking;
//    origin points LeftTop, RightTop, LeftBottom, RightBottom and Center; corner resize handles.
//  * Defaults: transparency 0, url "", cssWidth 0, cssHeight 0, angle 0.
//  * Settings: an image picker (binds url and transparency) and a transparency slider;
//    tabs Style + Visibility.
//  * No floating toolbar while an Image is selected.
//
// LV decisions:
//  * Local file or clipboard image only (no URL is fetched, so the url is stored as an asset id in props.lvImageAsset).
//  * Size, pixel and total caps (image-assets.ts).
//  * An imported image is anchored at the visible pane centre at the latest bar, origin Center.
//  * Resize: the native iconstamp base has no resize, and a one-anchor native handle drag cannot carry a second pointer position, so the size is
//    edited through the cssWidth / cssHeight settings (free resize, aspect not locked) instead of corner drags. Rotation: the angle setting (degrees, 0..360) turns the picture about its centre; corner drags are still not built.
//  * The workspace needs a `drawingAssets` map (root-owned schema change). Until a store is connected (connectDrawingAssets) an image drawing refuses to
//    serialize with an explicit message; nothing is dropped silently, and importing is refused up front.
import {createDrawing,type DrawingTypeMeta,type SerializedDrawing,type SettingsField} from '@luxalgo/vela';
import {IMAGE_MESSAGES,decodedImage,isImageAssetId,type ImageAsset,type ImageAssetDocument,type ImageAssetStore} from '../image-assets';
import type {UnappliedDefault} from '../drawing-factory-defaults';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';

export const LV_IMAGE:string='lvimage';
export const IMAGE_TOOL_ID='LineToolImage';
export const IMAGE_ROW='DW.ANNOTATION.IMAGE';
export const IMAGE_FACT_ID='tool.LineToolImage.defaults';
export const IMAGE_ASSET_KEY='lvImageAsset';
/** static-drawing-defaults#tool.LineToolImage.defaults, transcribed. */
export const IMAGE_FACT_DEFAULTS=Object.freeze({transparency:0,url:'',cssWidth:0,cssHeight:0,angle:0});
/** static-drawing-defaults#tool.LineToolImage.anchors originPoints. LV places at Center. */
export const IMAGE_ORIGIN_POINTS=Object.freeze(['LeftTopAnchor','RightTopAnchor','LeftBottomAnchor','RightBottomAnchor','Center'] as const);
export const IMAGE_PLACEMENT_ORIGIN='Center' as const;
export const IMAGE_MAX_SIDE_PX=8192;
const PLACEHOLDER_PX=64;

// ---- the workspace `drawingAssets` host (root connects the store) ----
let activeStore:ImageAssetStore|null=null;
/** Connects (or, with null, disconnects) the workspace image store. While none is connected, image drawings refuse to serialize. */
export function connectDrawingAssets(store:ImageAssetStore|null):void{activeStore=store;}
export const drawingAssetsStore=():ImageAssetStore|null=>activeStore;

/** Paint alpha of a transparency setting (0 opaque .. 100 invisible). */
export const imagePaintAlpha=(transparency:number)=>Math.min(1,Math.max(0,(100-transparency)/100));
/** Natural size fitted into the pane box: never enlarged, aspect kept, whole pixels, at least 1 px. */
export function fitImageSize(width:number,height:number,maxWidth:number,maxHeight:number):{width:number;height:number}{
 const scale=Math.min(1,maxWidth>0?maxWidth/width:1,maxHeight>0?maxHeight/height:1);
 return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

interface State{asset:string;transparency:number;cssWidth:number;cssHeight:number;angle:number;raw:Record<string,unknown>|null}
const fresh=():State=>({asset:'',transparency:IMAGE_FACT_DEFAULTS.transparency,cssWidth:IMAGE_FACT_DEFAULTS.cssWidth,cssHeight:IMAGE_FACT_DEFAULTS.cssHeight,angle:IMAGE_FACT_DEFAULTS.angle,raw:null});
const states=new WeakMap<object,State>();
const st=(model:object)=>{let state=states.get(model);if(!state){state=fresh();states.set(model,state);}return state;};
const side=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=IMAGE_MAX_SIDE_PX;

interface ImageModel extends NativeModel{
 center(proj:Projector):[number,number]|null;
 lvImageAsset:string;transparency:number;cssWidth:number;cssHeight:number;angle:number;
}

function sizeOf(model:ImageModel){
 const s=st(model);
 if(s.cssWidth>0&&s.cssHeight>0)return{w:s.cssWidth,h:s.cssHeight};
 const asset=activeStore&&s.asset?activeStore.get(s.asset):undefined;
 return asset?{w:asset.width,h:asset.height}:{w:PLACEHOLDER_PX,h:PLACEHOLDER_PX};
}
const angleOk=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=360;
/** Axis-aligned bounds of a w*h box turned by `angle` degrees about its centre (the box itself at 0). */
export function rotatedBounds(box:{x:number;y:number;w:number;h:number},angle:number){
 if(angle%360===0)return box;
 const r=angle*Math.PI/180,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r)),w=box.w*c+box.h*s,h=box.w*s+box.h*c;
 return{x:box.x+box.w/2-w/2,y:box.y+box.h/2-h/2,w,h};
}
function boxOf(model:ImageModel,proj:Projector){
 const c=model.center(proj);if(!c)return null;
 const {w,h}=sizeOf(model);
 return{x:c[0]-w/2,y:c[1]-h/2,w,h};
}

function pinImage(){
 const base=nativeBase('iconstamp');
 for(const key of ['center','hitHandle','handlePoints','priceRange','schema','serialize','readProps','writeProps','anchorSchema'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==1||shape.max!==1||shape.roles!=='p')fail('icon stamp anchor schema changed: '+JSON.stringify(shape));
 return base;
}

function defineImage():DrawingTypeMeta{
 const base=pinImage();
 const Base=base.ctor as unknown as new(init:Init)=>ImageModel;
 class LvImage extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_IMAGE;}
  get lvImageAsset():string{return st(this).asset;}
  set lvImageAsset(value:string){
   if(value!==''&&!isImageAssetId(value))throw Error('Choose an image from this workspace.');
   if(value!==''&&activeStore&&!activeStore.has(value))throw Error('That image is not in this workspace.');
   st(this).asset=value;
  }
  get transparency():number{return st(this).transparency;}
  set transparency(value:number){
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw Error('Transparency must be between 0 and 100.');
   st(this).transparency=value;
  }
  get cssWidth():number{return st(this).cssWidth;}
  set cssWidth(value:number){if(!side(value))throw Error('Width must be between 0 and '+IMAGE_MAX_SIDE_PX+'.');st(this).cssWidth=value;}
  get cssHeight():number{return st(this).cssHeight;}
  set cssHeight(value:number){if(!side(value))throw Error('Height must be between 0 and '+IMAGE_MAX_SIDE_PX+'.');st(this).cssHeight=value;}
  get angle():number{return st(this).angle;}
  set angle(value:number){if(!angleOk(value))throw Error('Rotation must be between 0 and 360 degrees.');st(this).angle=value;}
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const box=boxOf(this,proj);
   if(box&&st(this).angle%360!==0){
    // Undo the rotation about the centre, then test the upright box.
    const r=-st(this).angle*Math.PI/180,cx=box.x+box.w/2,cy=box.y+box.h/2,dx=px-cx,dy=py-cy;
    px=cx+dx*Math.cos(r)-dy*Math.sin(r);py=cy+dx*Math.sin(r)+dy*Math.cos(r);
   }
   return !!box&&px>=box.x-tol&&px<=box.x+box.w+tol&&py>=box.y-tol&&py<=box.y+box.h+tol;
  }
  bounds(proj:Projector){const box=boxOf(this,proj);return box&&rotatedBounds(box,st(this).angle);}
  schema(){
   const fields:SettingsField[]=[
    {path:IMAGE_ASSET_KEY,label:'Image',kind:'text',group:'line'},
    {path:'transparency',label:'Transparency',kind:'number',min:0,max:100,step:1,group:'line'},
    {path:'cssWidth',label:'Width',kind:'number',min:0,max:IMAGE_MAX_SIDE_PX,step:1,group:'line'},
    {path:'cssHeight',label:'Height',kind:'number',min:0,max:IMAGE_MAX_SIDE_PX,step:1,group:'line'},
    {path:'angle',label:'Rotation',kind:'number',min:0,max:360,step:1,group:'line'},
   ];
   return{fields} as ReturnType<NativeModel['schema']>;
  }
  serialize():SerializedDrawing{
   // Only a drawing that refers to an asset needs the workspace store: an empty sample serializes without it.
   if(st(this).asset&&!activeStore)throw Error(IMAGE_MESSAGES.noStorage);
   return super.serialize();
  }
  protected readProps(props:Record<string,unknown>):void{
   const s=st(this),next=fresh();
   next.raw=props&&typeof props==='object'?structuredClone(props):null;
   if(props&&typeof props==='object'){
    if(isImageAssetId(props[IMAGE_ASSET_KEY]))next.asset=props[IMAGE_ASSET_KEY] as string;
    if(typeof props.transparency==='number'&&props.transparency>=0&&props.transparency<=100)next.transparency=props.transparency;
    if(side(props.cssWidth))next.cssWidth=props.cssWidth as number;
    if(side(props.cssHeight))next.cssHeight=props.cssHeight as number;
    if(angleOk(props.angle))next.angle=props.angle as number;
   }
   Object.assign(s,next);
  }
  protected writeProps():Record<string,unknown>{
   const s=st(this),out:Record<string,unknown>=s.raw?structuredClone(s.raw):{};
   if(s.asset)out[IMAGE_ASSET_KEY]=s.asset;else delete out[IMAGE_ASSET_KEY];
   out.transparency=s.transparency;out.cssWidth=s.cssWidth;out.cssHeight=s.cssHeight;out.angle=s.angle;
   return out;
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const box=boxOf(this,proj);if(!box)return;
   const s=st(this),decoded=activeStore&&s.asset?decodedImage(activeStore,s.asset):{state:'failed' as const,message:'Image unavailable'};
   ctx.save();
   if(s.angle%360!==0){const cx=box.x+box.w/2,cy=box.y+box.h/2;ctx.translate(cx,cy);ctx.rotate(s.angle*Math.PI/180);ctx.translate(-cx,-cy);}
   if(decoded.state==='ready'){
    ctx.globalAlpha=imagePaintAlpha(s.transparency);
    ctx.drawImage(decoded.image as unknown as CanvasImageSource,box.x,box.y,box.w,box.h);
   }else{
    // Not decoded yet (or missing): a dashed outline and a short label, never a blank box.
    ctx.strokeStyle=theme.textColor;ctx.lineWidth=1;ctx.setLineDash?.([4,3]);
    ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.stroke();ctx.setLineDash?.([]);
    ctx.fillStyle=theme.textColor;ctx.font='12px '+theme.fontFamily;ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillText(decoded.state==='pending'?'Loading image':'Image unavailable',box.x+4,box.y+4);
   }
   ctx.restore();
  }
 }
 const probe=new LvImage({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(probe.type!==LV_IMAGE||probe.transparency!==IMAGE_FACT_DEFAULTS.transparency)fail('icon stamp subclass did not adopt its defaults');
 return{type:lvKey(LV_IMAGE),group:base.meta.group,label:'Image',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvImage(init)};
}

// ---- adding an image (the click-free creation flow) ----
export interface ImagePlacement{
 readonly paneId:string;
 /** The visible pane centre at the latest bar. The host reads them from the live view. */
 readonly time:number;
 readonly price:number;
 /** Largest drawn size: the pane box. */
 readonly maxWidth:number;
 readonly maxHeight:number;
}
export type ImageDrawingResult={readonly ok:true;readonly record:SerializedDrawing;readonly asset:ImageAsset;readonly duplicate:boolean}|{readonly ok:false;readonly message:string};

/** Validates the bytes, stores them (deduplicated by sha256, capped), retains the asset for the new drawing and returns the record to create.
 *  Refuses with a user-readable message and creates nothing when the file is not an acceptable image or no store is connected. */
export async function createImageDrawingRecord(data:Uint8Array,declaredMime:string|undefined,placement:ImagePlacement):Promise<ImageDrawingResult>{
 const store=activeStore;
 if(!store)return{ok:false,message:IMAGE_MESSAGES.noStorage};
 if(![placement.time,placement.price,placement.maxWidth,placement.maxHeight].every(Number.isFinite)||typeof placement.paneId!=='string'||!placement.paneId)return{ok:false,message:'The image could not be placed.'};
 const imported=await store.import(data,declaredMime);
 if(!imported.ok)return{ok:false,message:imported.message};
 const {asset}=imported,fitted=fitImageSize(asset.width,asset.height,placement.maxWidth,placement.maxHeight);
 const draft=createDrawing(lvKey(LV_IMAGE),{paneId:placement.paneId,anchors:[{time:placement.time,price:placement.price}],props:{[IMAGE_ASSET_KEY]:asset.id,transparency:IMAGE_FACT_DEFAULTS.transparency,cssWidth:fitted.width,cssHeight:fitted.height,angle:IMAGE_FACT_DEFAULTS.angle}});
 if(!draft)return{ok:false,message:'Images are not available in this build.'};
 store.retain(asset.id);
 return{ok:true,record:draft.serialize(),asset,duplicate:imported.duplicate};
}

/** The asset ids that saved drawing records reference (one entry per drawing, so clones count twice). */
export function imageAssetIdsOf(records:readonly {type?:unknown;props?:unknown}[]):string[]{
 const ids:string[]=[];
 for(const record of records){
  if(record.type!==LV_IMAGE)continue;
  const id=(record.props as Record<string,unknown>|undefined)?.[IMAGE_ASSET_KEY];
  if(isImageAssetId(id))ids.push(id);
 }
 return ids;
}
/** Save-time garbage collection: sets every count from the saved records and drops the unreferenced assets (kept in memory for undo). */
export function reconcileImageAssets(store:ImageAssetStore,records:readonly {type?:unknown;props?:unknown}[]):string[]{return store.reconcile(imageAssetIdsOf(records));}

/** Every image id that saved drawing records refer to, one entry per drawing (clones count twice). Walks the values directly, with no string
 *  building. Only records of type lvimage count; the drawingAssets map is never walked; cycles and depth are bounded. */
export function imageAssetIdsIn(root:unknown):string[]{
 const ids:string[]=[],seen=new Set<object>();
 const visit=(value:unknown,depth:number)=>{
  if(!value||typeof value!=='object'||depth>40||seen.has(value as object))return;
  seen.add(value as object);
  if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
  const record=value as Record<string,unknown>;
  if(record.type===LV_IMAGE){const id=(record.props as Record<string,unknown>|undefined)?.[IMAGE_ASSET_KEY];if(isImageAssetId(id))ids.push(id);}
  for(const key of Object.keys(record))if(key!=='drawingAssets')visit(record[key],depth+1);
 };
 visit(root,0);
 return ids;
}
/** Save-time trimming: sets every count from the saved drawing values and drops what no drawing uses, so a removed picture
 *  leaves the committed map and stops counting toward the total cap. Held assets (an import or a dialog replacement still in progress) stay. */
export function trimDrawingAssets(store:ImageAssetStore,savedDrawings:readonly unknown[]):{dropped:string[];document:ReturnType<ImageAssetStore['toDocument']>}{
 const dropped=store.reconcile(savedDrawings.flatMap(imageAssetIdsIn));
 return{dropped,document:store.toDocument()};
}

export interface DrawingAssetsController{
 /** Called with workspace.drawingAssets on every workspace change: a different map starts a verified load (queued, newest wins). */
 sync(document:ImageAssetDocument|undefined):void;
 /** Save-time trim. Does nothing while a load is pending, while the store does not hold every image of the current map, or when no image is stored. */
 trim(savedDrawings:readonly unknown[]|(()=>readonly unknown[])):void;
 /** Runs an import that ends in a commit of the store's map (a paste, a file pick, a dialog replacement) on the same queue as the loads
  * . It starts only after every queued load, and only when no load is still waiting and the store is the loaded copy of the
  *  current map (it holds every image of that map); otherwise it is refused before it touches the store. session.commit() commits the store's map only while no newer map has
  *  arrived since the edit started, and returns false otherwise (the incoming load then replaces the store, so the import is dropped). */
 edit<T>(work:(session:DrawingAssetsEditSession)=>Promise<T>):Promise<T|{readonly ok:false;readonly message:string}>;
 /** Resolves when every queued load and edit has finished. */
 settled():Promise<void>;
}
export interface DrawingAssetsEditSession{
 /** True while no newer workspace map has arrived since the edit started. */
 current():boolean;
 /** Commits the store's map when current(); returns whether it did. */
 commit():boolean;
}
export const DRAWING_ASSETS_MESSAGES=Object.freeze({
 busy:'The workspace images are still loading, so the image was not added. Try again.',
 unavailable:'The saved workspace images could not be loaded, so no image can be added to this workspace.',
 changed:'The workspace changed while the image was being added, so it was not added. Try again.',
});
/** Keeps the in-memory store and the committed workspace map consistent: loads are serialized with a generation token so a stale load
 *  never replaces a newer one, and a trim can never commit while the store is not the loaded copy of the current map. */
export function createDrawingAssetsController(store:ImageAssetStore,commit:(document:ImageAssetDocument)=>unknown,report:(message:string)=>void):DrawingAssetsController{
 let generation=0,pending=0,target:ImageAssetDocument|undefined,queue:Promise<void>=Promise.resolve();
 const sameIds=(document:ImageAssetDocument)=>{const keys=Object.keys(document).sort(),ids=store.ids().sort();return keys.length===ids.length&&keys.every((key,index)=>key===ids[index]);};
 // The store holds every image of the map (ids are sha256 of the bytes, verified on load and import, so the same id is the same picture).
 // Extra ids are an import that was not committed, or a picture already committed and trimmed later; committing never loses the map's own.
 const holds=(document:ImageAssetDocument)=>Object.keys(document).every(id=>store.has(id));
 return{
  sync(document){
   const next=document??{};
   if(next===target)return;
   target=next;
   if(pending===0&&sameIds(next))return;
   const mine=++generation;pending++;
   queue=queue.then(async()=>{
    if(mine!==generation)return;                       // superseded before it started
    const result=await store.load(next);
    if(mine===generation&&!result.ok){await store.load({});report(result.message);}
   }).catch(error=>{if(mine===generation)report(String(error));}).finally(()=>{pending--;});
  },
  trim(savedDrawings){
   if(pending>0||target===undefined||!holds(target)||store.size()===0)return;
   // A reader is called only when there is something to trim, so a workspace without images never serializes the chart.
   const result=trimDrawingAssets(store,typeof savedDrawings==='function'?savedDrawings():savedDrawings);
   if(result.dropped.length)commit(result.document);
  },
  edit<T>(work:(session:DrawingAssetsEditSession)=>Promise<T>){
   type Out=T|{readonly ok:false;readonly message:string};
   const run=async():Promise<Out>=>{
    if(pending>0)return{ok:false,message:DRAWING_ASSETS_MESSAGES.busy};
    if(target!==undefined&&!holds(target))return{ok:false,message:DRAWING_ASSETS_MESSAGES.unavailable};
    const mine=generation,session:DrawingAssetsEditSession={
     current:()=>generation===mine,
     commit(){if(generation!==mine)return false;const document=store.toDocument();return commit(document)!==false;},
    };
    return work(session);
   };
   const result=queue.then(run);
   queue=result.then(()=>undefined,()=>undefined);
   return result;
  },
  settled:()=>queue,
 };
}/** Size for a replacement picture: its own aspect ratio, fitted inside the box the drawing already has (natural size when it had none). */
export function fitReplacementImage(natural:{width:number;height:number},current:{cssWidth:number;cssHeight:number}):{width:number;height:number}{
 return fitImageSize(natural.width,natural.height,current.cssWidth>0?current.cssWidth:natural.width,current.cssHeight>0?current.cssHeight:natural.height);
}
const u=(property:string,value:unknown,reason:UnappliedDefault['reason'],note:string):UnappliedDefault=>Object.freeze({toolId:IMAGE_TOOL_ID,factId:IMAGE_FACT_ID,property,value,reason,note});

export const IMAGE_MODULE=defineLvDrawingToolModule({
 id:'image',
 types:[{type:LV_IMAGE,base:'iconstamp',define:defineImage,requiresPaintHook:true}],
 // static-drawing-defaults#tool.LineToolImage.defaults: transparency 0 is the model's fresh state, verified by the probe.
 factoryDefaults:[{type:LV_IMAGE,toolId:IMAGE_TOOL_ID,factId:IMAGE_FACT_ID,style:{},
  probe:sample=>{const model=sample as unknown as ImageModel;return model.transparency===IMAGE_FACT_DEFAULTS.transparency&&model.cssWidth===IMAGE_FACT_DEFAULTS.cssWidth&&model.cssHeight===IMAGE_FACT_DEFAULTS.cssHeight?undefined:'image defaults changed';}}],
 retiresUnapplied:[{toolId:IMAGE_TOOL_ID,reason:'no-type'}],
 unappliedDefaults:[
  u('url','','renderer','OpenCandle never stores or fetches a URL: the picture is kept as a local asset and the drawing refers to it by its sha256 (DWB2-DD-1).'),
  u('cssWidth/cssHeight',[0,0],'intrinsic','The size is set from the natural image size when the image is added, fitted into the pane (DWB2-DD-3); 0 means natural size.'),
 ],
 catalog:[{rowId:IMAGE_ROW,type:LV_IMAGE,note:'Choose a local PNG, JPEG, GIF or WebP image (up to 2 MB) or paste one from the clipboard.'}],
 dialog:[{toolId:IMAGE_TOOL_ID,types:[LV_IMAGE],paths:{
  'dialog.LineToolImage.style.1':{'absolute user image url':IMAGE_ASSET_KEY,transparency:'transparency'},
  'dialog.LineToolImage.style.2':{transparency:'transparency'},
 }}],
});
