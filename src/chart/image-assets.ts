// Local image asset store for the Image drawing tool.
//
// The image tool is created from a file, URL or paste flow, never by clicking. OpenCandle is local-only (CSP connect-src 'none', no network
// fetches), so this store accepts bytes that the host already holds: a picked local file or a clipboard image.
//
// Design decisions made here:
//   - LV accepts a local image file or a clipboard image; remote URLs are not fetched (no URL or paste-from-URL path exists).
//   - Largest accepted file: 2 MiB.
//   - Pixel cap 16,777,216 (4096 x 4096), read from the real structure of the file BEFORE any decode (decompression-bomb guard):
//              every GIF frame extent counts, not only the logical screen. Each parser walks its format (PNG chunks to the first IEND, GIF
//              blocks to the trailer, JPEG segments to EOI after the scan data, WebP chunks to the RIFF end) and refuses any byte after the
//              first real terminator. Appended data is therefore refused; whatever could hide inside a valid image is only ever decoded to a bitmap.
//   - Total cap 8 MiB of raw image bytes per workspace: the data URLs live inside the workspace JSON, which has a hard
//              32 MiB limit, and base64 adds about 33 percent.
//
// Security posture: only PNG, JPEG, GIF and WebP, decided by magic bytes (never by extension or the declared type). SVG and every
// other text format is refused, so no user-supplied markup is ever decoded. Decoding uses createImageBitmap on a Blob built from the
// stored bytes and painting uses drawImage only. Nothing here reads a network, a URL or the file system.

export const IMAGE_MAX_BYTES=2*1024*1024;
export const IMAGE_MAX_PIXELS=4096*4096;
export const IMAGE_STORE_MAX_BYTES=8*1024*1024;
export const IMAGE_MIME_TYPES=Object.freeze(['image/png','image/jpeg','image/gif','image/webp'] as const);
export type ImageMime=typeof IMAGE_MIME_TYPES[number];

export const IMAGE_MESSAGES=Object.freeze({
 format:'Only PNG, JPEG, GIF and WebP images can be added.',
 mismatch:'The file type does not match the file contents, so it was not added.',
 empty:'The image file is empty.',
 tooBig:'The image is larger than 2 MB, so it was not added.',
 pixels:'The image has more than 16 million pixels, so it was not added.',
 damaged:'The image file looks damaged or has extra data after the image, so it was not added.',
 mismatchedAsset:'A saved image does not match its checksum, so it was not used.',
 storeFull:'This workspace already holds the most image data it can save (8 MB). Remove an image first.',
 noStorage:'Images cannot be saved yet because workspace image storage is not connected, so nothing was added.',
 noDecoder:'This window cannot decode images.',
});

export interface ImageSniffOk{readonly ok:true;readonly mime:ImageMime;readonly width:number;readonly height:number}
export interface ImageSniffFail{readonly ok:false;readonly message:string}

const u16le=(b:Uint8Array,i:number)=>b[i]|(b[i+1]<<8),u16be=(b:Uint8Array,i:number)=>(b[i]<<8)|b[i+1];
const u32be=(b:Uint8Array,i:number)=>((b[i]*0x1000000)+((b[i+1]<<16)|(b[i+2]<<8)|b[i+3]))>>>0;
const u32le=(b:Uint8Array,i:number)=>(b[i]|(b[i+1]<<8)|(b[i+2]<<16)|(b[i+3]*0x1000000))>>>0;
const ascii=(b:Uint8Array,i:number,text:string)=>{for(let k=0;k<text.length;k++)if(b[i+k]!==text.charCodeAt(k))return false;return true;};

// Each parser walks the real structure of the format to its first terminator and accepts the file only when that terminator is the
// last byte (review F-1 and F-4). A parser returns the pixel extent the decoder will allocate, or null for a damaged file.
interface Extent{readonly width:number;readonly height:number;/** Largest single allocation the decoder may make, in pixels. */readonly peak:number}
const MAX_STEPS=200000;

function parsePng(b:Uint8Array):Extent|null{
 let i=8,width=0,height=0,first=true;
 for(let step=0;step<MAX_STEPS&&i+12<=b.length;step++){
  const length=u32be(b,i);
  if(length>b.length-i-12)return null;
  if(first){if(!ascii(b,i+4,'IHDR')||length!==13)return null;width=u32be(b,i+8);height=u32be(b,i+12);first=false;}
  const next=i+12+length;
  if(ascii(b,i+4,'IEND'))return length===0&&next===b.length&&!first?{width,height,peak:width*height}:null;
  i=next;
 }
 return null;
}

/** Skips a run of data sub-blocks (length byte, data) up to and including the zero terminator; returns the next index or -1. */
function gifSubBlocks(b:Uint8Array,start:number):number{
 let i=start;
 for(let step=0;step<MAX_STEPS;step++){
  if(i>=b.length)return -1;
  const length=b[i];i++;
  if(length===0)return i;
  i+=length;
  if(i>b.length)return -1;
 }
 return -1;
}
function parseGif(b:Uint8Array):Extent|null{
 if(b.length<14)return null;
 const screenW=u16le(b,6),screenH=u16le(b,8),flags=b[10];
 let i=13,width=screenW,height=screenH,peak=screenW*screenH,frames=0;
 if(flags&0x80)i+=3*(1<<((flags&7)+1));
 for(let step=0;step<MAX_STEPS;step++){
  if(i>=b.length)return null;
  const block=b[i];
  if(block===0x3B)return frames>0&&i+1===b.length&&width>0&&height>0?{width,height,peak}:null;
  if(block===0x21){i=gifSubBlocks(b,i+2);if(i<0)return null;continue;}
  if(block!==0x2C||i+10>b.length)return null;
  const left=u16le(b,i+1),top=u16le(b,i+3),w=u16le(b,i+5),h=u16le(b,i+7),local=b[i+9];
  if(w===0||h===0)return null;
  // Decoders enlarge the image to a frame that sticks out of the logical screen, so the cap applies to the union.
  width=Math.max(width,left+w);height=Math.max(height,top+h);peak=Math.max(peak,w*h,width*height);
  i+=10;
  if(local&0x80)i+=3*(1<<((local&7)+1));
  i+=1;                                  // LZW minimum code size
  i=gifSubBlocks(b,i);if(i<0)return null;
  frames++;
 }
 return null;
}

function parseJpeg(b:Uint8Array):Extent|null{
 const n=b.length;
 let i=2,width=0,height=0,sof=false,scanned=false;
 for(let step=0;step<MAX_STEPS;step++){
  if(i+2>n||b[i]!==0xFF)return null;
  while(b[i+1]===0xFF){i++;if(i+1>=n)return null;}
  const marker=b[i+1];
  if(marker===0xD9)return sof&&scanned&&i+2===n?{width,height,peak:width*height}:null;
  if(marker===0x01||(marker>=0xD0&&marker<=0xD7)){i+=2;continue;}
  if(marker===0xD8||marker===0x00||i+4>n)return null;
  const length=u16be(b,i+2);
  if(length<2||i+2+length>n)return null;
  // A decoder sizes the image from the first SOF; a second one is an error to a decoder and a way to hide a huge size from a parser.
  if(marker>=0xC0&&marker<=0xCF&&marker!==0xC4&&marker!==0xC8&&marker!==0xCC){if(sof||length<8)return null;height=u16be(b,i+5);width=u16be(b,i+7);sof=true;}
  i+=2+length;
  if(marker===0xDA){
    scanned=true;
    // Entropy-coded data runs until the next real marker (FF 00 is a stuffed byte, FF D0..D7 a restart marker).
    while(i<n){
     if(b[i]!==0xFF){i++;continue;}
     const next=b[i+1];
     if(next===undefined)return null;
     if(next===0x00||(next>=0xD0&&next<=0xD7)){i+=2;continue;}
     if(next===0xFF){i++;continue;}
     break;
    }
    if(i>=n)return null;
  }
 }
 return null;
}

function parseWebp(b:Uint8Array):Extent|null{
 const n=b.length;
 if(n<30||u32le(b,4)+8!==n)return null;
 // First chunk carries the size; every chunk (with its pad byte) must fit and the chain must end exactly at the end of the file.
 let width=0,height=0;
 const size0=u32le(b,16);
 if(ascii(b,12,'VP8X')){if(size0<10)return null;width=1+(b[24]|(b[25]<<8)|(b[26]<<16));height=1+(b[27]|(b[28]<<8)|(b[29]<<16));}
 else if(ascii(b,12,'VP8L')){if(size0<5||b[20]!==0x2F)return null;const bits=u32le(b,21);width=1+(bits&0x3FFF);height=1+((bits>>>14)&0x3FFF);}
 else if(ascii(b,12,'VP8 ')){if(size0<10||b[23]!==0x9D||b[24]!==0x01||b[25]!==0x2A)return null;width=u16le(b,26)&0x3FFF;height=u16le(b,28)&0x3FFF;}
 else return null;
 let i=12;
 for(let step=0;step<MAX_STEPS&&i<n;step++){
  if(i+8>n)return null;
  const size=u32le(b,i+4),next=i+8+size+(size&1);
  if(next>n)return null;
  // The image chunk must agree with the declared VP8X canvas.
  if(i>12&&ascii(b,12,'VP8X')){
   if(ascii(b,i,'VP8L')){if(size<5||b[i+8]!==0x2F)return null;const bits=u32le(b,i+9);if(1+(bits&0x3FFF)!==width||1+((bits>>>14)&0x3FFF)!==height)return null;}
   else if(ascii(b,i,'VP8 ')){if(size<10||b[i+11]!==0x9D||b[i+12]!==0x01||b[i+13]!==0x2A)return null;if((u16le(b,i+14)&0x3FFF)!==width||(u16le(b,i+16)&0x3FFF)!==height)return null;}
  }
  i=next;
 }
 return i===n&&width>0&&height>0?{width,height,peak:width*height}:null;
}

/** Decides the format from magic bytes alone and reads the pixel extent from the real structure, before anything is decoded. */
export function sniffImage(data:Uint8Array,declaredMime?:string):ImageSniffOk|ImageSniffFail{
 const fail=(message:string):ImageSniffFail=>({ok:false,message});
 if(!(data instanceof Uint8Array)||data.length===0)return fail(IMAGE_MESSAGES.empty);
 if(data.length>IMAGE_MAX_BYTES)return fail(IMAGE_MESSAGES.tooBig);
 let mime:ImageMime|null=null;
 if(data.length>=8&&data[0]===0x89&&ascii(data,1,'PNG')&&data[4]===0x0D&&data[5]===0x0A&&data[6]===0x1A&&data[7]===0x0A)mime='image/png';
 else if(data.length>=3&&data[0]===0xFF&&data[1]===0xD8&&data[2]===0xFF)mime='image/jpeg';
 else if(data.length>=6&&(ascii(data,0,'GIF87a')||ascii(data,0,'GIF89a')))mime='image/gif';
 else if(data.length>=12&&ascii(data,0,'RIFF')&&ascii(data,8,'WEBP'))mime='image/webp';
 if(!mime)return fail(IMAGE_MESSAGES.format);
 if(declaredMime!==undefined&&declaredMime!==''){
  const declared=declaredMime.toLowerCase().split(';')[0].trim();
  if(declared!=='application/octet-stream'&&declared!==mime&&!(declared==='image/jpg'&&mime==='image/jpeg'))return fail(IMAGE_MESSAGES.mismatch);
 }
 const extent=mime==='image/png'?parsePng(data):mime==='image/gif'?parseGif(data):mime==='image/jpeg'?parseJpeg(data):parseWebp(data);
 if(!extent||!(extent.width>0)||!(extent.height>0))return fail(IMAGE_MESSAGES.damaged);
 if(extent.peak>IMAGE_MAX_PIXELS||extent.width*extent.height>IMAGE_MAX_PIXELS)return fail(IMAGE_MESSAGES.pixels);
 return{ok:true,mime,width:extent.width,height:extent.height};
}

export interface ImageAsset{
 /** The sha256 of the bytes, lowercase hex. It is the asset id, so identical files dedupe to one asset. */
 readonly id:string;
 readonly sha256:string;
 readonly mime:ImageMime;
 readonly bytes:number;
 readonly width:number;
 readonly height:number;
 /** `data:<mime>;base64,...` of the stored bytes (built once, on first use). */
 readonly dataUrl:string;
}
export interface ImageAssetDocumentEntry{readonly mime:ImageMime;readonly bytes:number;readonly dataUrl:string}
export type ImageAssetDocument=Readonly<Record<string,ImageAssetDocumentEntry>>;
export type ImageImportResult={readonly ok:true;readonly asset:ImageAsset;readonly duplicate:boolean}|{readonly ok:false;readonly message:string};

const HEX64=/^[a-f0-9]{64}$/;
export const isImageAssetId=(value:unknown):value is string=>typeof value==='string'&&HEX64.test(value);

function toBase64(data:Uint8Array):string{
 let text='';
 for(let i=0;i<data.length;i+=0x8000)text+=String.fromCharCode(...data.subarray(i,i+0x8000));
 return btoa(text);
}
function fromBase64(text:string):Uint8Array{
 const raw=atob(text),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}
async function defaultDigest(data:Uint8Array):Promise<string>{
 const subtle=(globalThis as {crypto?:{subtle?:SubtleCrypto}}).crypto?.subtle;
 if(!subtle)throw Error('SHA-256 is unavailable in this window.');
 const view=new Uint8Array(data.byteLength);view.set(data);
 return[...new Uint8Array(await subtle.digest('SHA-256',view))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export interface ImageAssetStore{
 import(data:Uint8Array,declaredMime?:string):Promise<ImageImportResult>;
 get(id:string):ImageAsset|undefined;
 has(id:string):boolean;
 /** Bytes of an asset, for decoding. */
 bytesOf(id:string):Uint8Array|undefined;
 refs(id:string):number;
 /** One more drawing uses the asset (a placement or a clone). Revives an asset released earlier in this session (undo). */
 retain(id:string):boolean;
 /** One drawing fewer uses it. The asset stays until reconcile, so an undo can still bring the drawing back. */
 release(id:string):void;
 /** Protects an asset from reconcile while it is waiting to be used (an import not yet placed, a dialog replacement). */
 hold(id:string):void;
 unhold(id:string):void;
 /** Sets every count from the ids the saved drawings reference; unreferenced, unheld assets leave the saved set (kept in memory for undo). Returns the ids that left. */
 reconcile(referenced:Iterable<string>):string[];
 totalBytes():number;
 size():number;
 ids():string[];
 /** The `drawingAssets` workspace map (live assets only). */
 toDocument():ImageAssetDocument;
 /** Structural validation of a saved map (id shape, data URL form, declared type, byte count, caps). Does not hash. */
 check(document:unknown):{readonly ok:true}|{readonly ok:false;readonly message:string};
 /** Validates, then hashes every entry: an entry whose bytes do not hash to its id refuses the whole map. Nothing changes on a refusal. */
 load(document:unknown):Promise<{readonly ok:true}|{readonly ok:false;readonly message:string}>;
}

export interface ImageAssetStoreOptions{readonly maxTotalBytes?:number;readonly digest?:(data:Uint8Array)=>Promise<string>}

const sameBytes=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};

export function createImageAssetStore(options:ImageAssetStoreOptions={}):ImageAssetStore{
 const cap=options.maxTotalBytes??IMAGE_STORE_MAX_BYTES,digest=options.digest??defaultDigest;
 interface Entry{asset:Omit<ImageAsset,'dataUrl'>;data:Uint8Array;url?:string;refs:number}
 const live=new Map<string,Entry>(),limbo=new Map<string,Entry>(),held=new Set<string>();
 const view=(entry:Entry):ImageAsset=>{
  const asset=entry.asset;
  return Object.freeze({...asset,get dataUrl(){return entry.url??=`data:${asset.mime};base64,${toBase64(entry.data)}`;}}) as ImageAsset;
 };
 const total=()=>{let sum=0;for(const entry of live.values())sum+=entry.data.length;return sum;};
 const trimLimbo=()=>{let sum=0;for(const entry of limbo.values())sum+=entry.data.length;for(const key of [...limbo.keys()]){if(sum<=cap)break;sum-=limbo.get(key)!.data.length;limbo.delete(key);}};
 const parse=(document:unknown):{ok:true;entries:Map<string,Entry>}|{ok:false;message:string}=>{
  const bad={ok:false as const,message:'Saved images are not valid.'};
  if(document===null||typeof document!=='object'||Array.isArray(document))return bad;
  const entries=new Map<string,Entry>();let sum=0;
  for(const [id,raw] of Object.entries(document as Record<string,unknown>)){
   const entry=raw as Partial<ImageAssetDocumentEntry>|null;
   if(!isImageAssetId(id)||!entry||typeof entry!=='object'||typeof entry.dataUrl!=='string')return bad;
   const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(entry.dataUrl);
   if(!match||match[1]!==entry.mime)return bad;
   let data:Uint8Array;try{data=fromBase64(match[2]);}catch{return bad;}
   const sniffed=sniffImage(data,match[1]);
   if(!sniffed.ok||data.length!==entry.bytes)return bad;
   sum+=data.length;if(sum>cap)return{ok:false,message:IMAGE_MESSAGES.storeFull};
   entries.set(id,{asset:{id,sha256:id,mime:sniffed.mime,bytes:data.length,width:sniffed.width,height:sniffed.height},data,refs:0});
  }
  return{ok:true,entries};
 };
 return{
  async import(data,declaredMime){
   const sniffed=sniffImage(data,declaredMime);
   if(!sniffed.ok)return{ok:false,message:sniffed.message};
   const sha=await digest(data);
   const known=live.get(sha);
   // An id is only ever reused for the very same bytes; anything else is refused, never aliased.
   if(known)return sameBytes(known.data,data)?{ok:true,asset:view(known),duplicate:true}:{ok:false,message:IMAGE_MESSAGES.mismatchedAsset};
   if(total()+data.length>cap)return{ok:false,message:IMAGE_MESSAGES.storeFull};
   const revived=limbo.get(sha);
   const entry:Entry=revived&&sameBytes(revived.data,data)?revived:{asset:{id:sha,sha256:sha,mime:sniffed.mime,bytes:data.length,width:sniffed.width,height:sniffed.height},data:Uint8Array.from(data),refs:0};
   limbo.delete(sha);live.set(sha,entry);
   return{ok:true,asset:view(entry),duplicate:false};
  },
  get:id=>{const entry=live.get(id);return entry?view(entry):undefined;},
  has:id=>live.has(id),
  bytesOf:id=>live.get(id)?.data,
  refs:id=>live.get(id)?.refs??0,
  retain(id){
   const revived=limbo.get(id);
   if(revived&&!live.has(id)){if(total()+revived.data.length>cap)return false;limbo.delete(id);live.set(id,revived);}
   const entry=live.get(id);if(!entry)return false;
   entry.refs++;return true;
  },
  release(id){const entry=live.get(id);if(entry&&entry.refs>0)entry.refs--;},
  hold(id){if(live.has(id))held.add(id);},
  unhold(id){held.delete(id);},
  reconcile(referenced){
   const counts=new Map<string,number>();
   for(const id of referenced)counts.set(id,(counts.get(id)??0)+1);
   const dropped:string[]=[];
   for(const [id,entry] of [...live]){
    const count=counts.get(id)??0;
    if(count>0)entry.refs=count;
    else if(held.has(id))continue;
    else{entry.refs=0;live.delete(id);limbo.set(id,entry);dropped.push(id);forgetDecodedImage(id);}
   }
   trimLimbo();
   return dropped;
  },
  totalBytes:total,
  size:()=>live.size,
  ids:()=>[...live.keys()],
  toDocument(){
   const out:Record<string,ImageAssetDocumentEntry>={};
   for(const [id,entry] of live)out[id]={mime:entry.asset.mime,bytes:entry.data.length,dataUrl:view(entry).dataUrl};
   return out;
  },
  check(document){const parsed=parse(document);return parsed.ok?{ok:true}:parsed;},
  async load(document){
   const parsed=parse(document);
   if(!parsed.ok)return parsed;
   for(const [id,entry] of parsed.entries)if(await digest(entry.data)!==id)return{ok:false,message:IMAGE_MESSAGES.mismatchedAsset};
   live.clear();limbo.clear();held.clear();for(const [id,entry] of parsed.entries)live.set(id,entry);
   clearDecodedImages();
   return{ok:true};
  },
 };
}

/** Recomputes sha256 for every live asset (a second line of defense for callers that loaded structurally with check). */
export async function verifyImageAssetIds(store:ImageAssetStore,digest:(data:Uint8Array)=>Promise<string>=defaultDigest):Promise<boolean>{
 for(const id of store.ids()){const data=store.bytesOf(id);if(!data||await digest(data)!==id)return false;}
 return true;
}

// ---- decoding (createImageBitmap only; the decoder is injectable for tests and other hosts) ----
export type DecodedImage={readonly width:number;readonly height:number;close?():void};
export type ImageDecoder=(data:Uint8Array,mime:ImageMime)=>Promise<DecodedImage>;
let decoderOverride:ImageDecoder|null|undefined,cacheGeneration=0;
export function setImageDecoder(decoder:ImageDecoder|null|undefined):void{decoderOverride=decoder;clearDecodedImages();}
function activeDecoder():ImageDecoder|null{
 if(decoderOverride)return decoderOverride;
 const create=(globalThis as {createImageBitmap?:(blob:Blob)=>Promise<DecodedImage>}).createImageBitmap;
 if(typeof create!=='function'||typeof Blob==='undefined')return null;
 return(data,mime)=>{const copy=new Uint8Array(data.byteLength);copy.set(data);return create.call(globalThis,new Blob([copy],{type:mime}));};
}
export type DecodeState={readonly state:'ready';readonly image:DecodedImage}|{readonly state:'pending'}|{readonly state:'failed';readonly message:string};
const decodeCache=new Map<string,DecodeState>(),readyListeners=new Set<(id:string)=>void>();
/** Forgets every decode (a workspace load replaces the assets). A decode still in flight is discarded when it finishes. */
export function clearDecodedImages():void{for(const cached of decodeCache.values())if(cached.state==='ready')cached.image.close?.();decodeCache.clear();cacheGeneration++;}
/** Called when an asynchronous decode finishes, so the host can repaint. Returns the unsubscribe function. */
export function onImageDecoded(listener:(id:string)=>void):()=>void{readyListeners.add(listener);return()=>readyListeners.delete(listener);}
/** The decoded image of an asset, or its pending/failed state. A first request starts one decode; paint never waits. */
export function decodedImage(store:ImageAssetStore,id:string):DecodeState{
 const cached=decodeCache.get(id);if(cached)return cached;
 const data=store.bytesOf(id),asset=store.get(id);
 if(!data||!asset)return{state:'failed',message:'Image unavailable'};
 const decoder=activeDecoder();
 if(!decoder){const failed:DecodeState={state:'failed',message:IMAGE_MESSAGES.noDecoder};decodeCache.set(id,failed);return failed;}
 const pending:DecodeState={state:'pending'},generation=cacheGeneration;decodeCache.set(id,pending);
 const settle=(state:DecodeState)=>{if(generation!==cacheGeneration||decodeCache.get(id)!==pending){if(state.state==='ready')state.image.close?.();return;}decodeCache.set(id,state);for(const listener of readyListeners)listener(id);};
 decoder(data,asset.mime).then(image=>settle({state:'ready',image}),()=>settle({state:'failed',message:'Image could not be decoded'}));
 return pending;
}
export function forgetDecodedImage(id:string):void{const cached=decodeCache.get(id);if(cached?.state==='ready')cached.image.close?.();decodeCache.delete(id);}
