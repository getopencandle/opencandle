import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it} from 'vitest';
import {IMAGE_MAX_BYTES,IMAGE_MAX_PIXELS,IMAGE_MESSAGES,IMAGE_MIME_TYPES,IMAGE_STORE_MAX_BYTES,createImageAssetStore,decodedImage,isImageAssetId,onImageDecoded,setImageDecoder,sniffImage,verifyImageAssetIds} from '../../src/chart/image-assets';
import {imageFixture} from './dwb2-image-fixtures';

// the local image asset store. Every image below is a SYNTHETIC byte fixture built in the test (headers and trailers only)
// no real picture, no network and no file system is read.
const {png,jpeg,gif,gifFrames,pngWithSecondEnd,jpegTwoSof,webpCanvasWithInner,webpX,webpL,webpLossy,withTrailer}=imageFixture;
const hex64=(bytes:Uint8Array)=>crypto.subtle.digest('SHA-256',bytes as BufferSource).then(buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join(''));
afterEach(()=>setImageDecoder(undefined));

describe('format acceptance by magic bytes',()=>{
 it('accepts PNG, JPEG, GIF and WebP (all three WebP header forms) and reads the pixel size from the header',()=>{
  expect(IMAGE_MIME_TYPES).toEqual(['image/png','image/jpeg','image/gif','image/webp']);
  expect(sniffImage(png(40,30))).toEqual({ok:true,mime:'image/png',width:40,height:30});
  expect(sniffImage(jpeg(64,48))).toEqual({ok:true,mime:'image/jpeg',width:64,height:48});
  expect(sniffImage(gif(16,9))).toEqual({ok:true,mime:'image/gif',width:16,height:9});
  expect(sniffImage(webpX(320,200))).toEqual({ok:true,mime:'image/webp',width:320,height:200});
  expect(sniffImage(webpL(100,50))).toEqual({ok:true,mime:'image/webp',width:100,height:50});
  expect(sniffImage(webpLossy(77,33))).toEqual({ok:true,mime:'image/webp',width:77,height:33});
 });
 it('decides by contents, not by the declared type: a matching or neutral declared type passes, a different one is refused',()=>{
  expect(sniffImage(png(4,4),'image/png').ok).toBe(true);
  expect(sniffImage(png(4,4),'application/octet-stream').ok).toBe(true);
  expect(sniffImage(png(4,4),'').ok).toBe(true);
  expect(sniffImage(jpeg(4,4),'image/jpg').ok).toBe(true);
  expect(sniffImage(png(4,4),'image/jpeg')).toEqual({ok:false,message:IMAGE_MESSAGES.mismatch});
  expect(sniffImage(png(4,4),'image/svg+xml')).toEqual({ok:false,message:IMAGE_MESSAGES.mismatch});
 });
 it('refuses SVG, HTML, script text, unknown binaries and empty input without decoding anything',()=>{
  const text=(source:string)=>new TextEncoder().encode(source);
  expect(sniffImage(text('<svg xmlns="x"><script>1</script></svg>'))).toEqual({ok:false,message:IMAGE_MESSAGES.format});
  expect(sniffImage(text('<!doctype html><script>1</script>'))).toEqual({ok:false,message:IMAGE_MESSAGES.format});
  expect(sniffImage(text('GIF89')).ok).toBe(false);
  expect(sniffImage(new Uint8Array([0x42,0x4D,0,0,0,0]))).toEqual({ok:false,message:IMAGE_MESSAGES.format});
  expect(sniffImage(new Uint8Array(0))).toEqual({ok:false,message:IMAGE_MESSAGES.empty});
 });
 it('refuses a polyglot: a valid image header followed by an appended payload, and a truncated file',()=>{
  const payload=new TextEncoder().encode('<script>alert(1)</script>');
  for(const image of [png(8,8),jpeg(8,8),gif(8,8),webpX(8,8)])expect(sniffImage(withTrailer(image,payload)),'trailer').toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
  expect(sniffImage(png(8,8).subarray(0,40))).toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
  expect(sniffImage(png(8,8).subarray(0,10))).toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
 });
 it('caps every GIF frame extent, not only the logical screen (F-1)',()=>{
  // Screen 1 x 1 but the first frame is 65535 x 65535: a decoder enlarges the image to the frame.
  expect(sniffImage(gifFrames(1,1,[{left:0,top:0,width:65535,height:65535}]))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  // A later frame that is huge, and an offset frame whose left+width / top+height exceed the cap.
  expect(sniffImage(gifFrames(8,8,[{left:0,top:0,width:8,height:8},{left:0,top:0,width:60000,height:60000}]))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  expect(sniffImage(gifFrames(8,8,[{left:4000,top:4000,width:200,height:200}]))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});   // extent 4200 x 4200
  expect(sniffImage(gifFrames(100,100,[{left:0,top:0,width:100,height:100},{left:60000,top:60000,width:5,height:5}]))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  // Honest animation frames inside the cap are accepted and the reported size is the extent.
  expect(sniffImage(gifFrames(8,6,[{left:0,top:0,width:8,height:6},{left:2,top:1,width:4,height:4}]))).toEqual({ok:true,mime:'image/gif',width:8,height:6});
  expect(sniffImage(gifFrames(4,4,[{left:3,top:2,width:5,height:6}]))).toEqual({ok:true,mime:'image/gif',width:8,height:8});
 });
 it('refuses a malformed GIF block structure (F-1)',()=>{
  const damaged={ok:false,message:IMAGE_MESSAGES.damaged};
  expect(sniffImage(gifFrames(8,8,[]))).toEqual(damaged);                                            // no image descriptor
  expect(sniffImage(gifFrames(8,8,[{left:0,top:0,width:8,height:8}],{badBlock:true}))).toEqual(damaged);  // unknown block byte
  expect(sniffImage(gifFrames(8,8,[{left:0,top:0,width:8,height:8}],{overrun:true}))).toEqual(damaged);   // sub-block runs past the file
  expect(sniffImage(gifFrames(8,8,[{left:0,top:0,width:8,height:8}],{noTrailer:true}))).toEqual(damaged);
  expect(sniffImage(gifFrames(8,8,[{left:0,top:0,width:0,height:8}]))).toEqual(damaged);
 });
 it('refuses trailing data even when it ends with a valid format trailer, and a WebP stray byte (F-4)',()=>{
  const damaged={ok:false,message:IMAGE_MESSAGES.damaged},tail=(image:Uint8Array,extra:number[])=>Uint8Array.from([...image,...extra]);
  expect(sniffImage(pngWithSecondEnd(8,8))).toEqual(damaged);
  expect(sniffImage(tail(gif(8,8),[0x3B]))).toEqual(damaged);
  expect(sniffImage(tail(gif(8,8),[0x41,0x42,0x3B]))).toEqual(damaged);
  expect(sniffImage(tail(jpeg(8,8),[0xFF,0xD9]))).toEqual(damaged);
  expect(sniffImage(tail(jpeg(8,8),[0x3C,0x73,0xFF,0xD9]))).toEqual(damaged);
  for(const image of [webpX(8,8),webpL(8,8),webpLossy(8,8)]){expect(sniffImage(tail(image,[0])),'one stray byte').toEqual(damaged);expect(sniffImage(tail(image,[1,2])),'two bytes').toEqual(damaged);}
  // A PNG whose first chunk is not IHDR, or whose chunk chain runs past the file, is damaged.
  const broken=Uint8Array.from(png(8,8));broken[11]=0x58;expect(sniffImage(broken)).toEqual(damaged);
  const cut=Uint8Array.from(png(8,8,200));cut[33]=0xFF;expect(sniffImage(cut)).toEqual(damaged);
  // The honest fixtures still pass.
  for(const image of [png(8,8),gif(8,8),jpeg(8,8),webpX(8,8),webpL(8,8),webpLossy(8,8)])expect(sniffImage(image).ok).toBe(true);
 }); it('refuses a JPEG with more than one SOF marker, in either order (R2-1)',()=>{
  const damaged={ok:false,message:IMAGE_MESSAGES.damaged};
  expect(sniffImage(jpegTwoSof(65535,65535,1,1))).toEqual(damaged);   // decoder sizes from the first SOF
  expect(sniffImage(jpegTwoSof(1,1,65535,65535))).toEqual(damaged);   // reverse order
  expect(sniffImage(jpegTwoSof(8,8,8,8))).toEqual(damaged);           // even an identical second SOF
  expect(sniffImage(jpeg(8,8)).ok).toBe(true);
 });
 it('refuses a WebP whose image chunk disagrees with the declared canvas (R2-3)',()=>{
  expect(sniffImage(webpCanvasWithInner(16,16,16,16))).toEqual({ok:true,mime:'image/webp',width:16,height:16});
  expect(sniffImage(webpCanvasWithInner(16,16,4000,4000))).toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
  expect(sniffImage(webpCanvasWithInner(4000,4000,16,16))).toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
  expect(sniffImage(webpCanvasWithInner(1,1,5000,5000))).toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
 }); it('caps the file at 2 MiB and the picture at 4096 x 4096 pixels before any decode',()=>{
  expect(IMAGE_MAX_BYTES).toBe(2*1024*1024);expect(IMAGE_MAX_PIXELS).toBe(4096*4096);
  expect(sniffImage(png(4096,4096)).ok).toBe(true);
  expect(sniffImage(png(4097,4096))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  expect(sniffImage(png(65535,65535))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  expect(sniffImage(gif(65535,65535))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  expect(sniffImage(webpX(16384,16384))).toEqual({ok:false,message:IMAGE_MESSAGES.pixels});
  expect(sniffImage(png(0,10))).toEqual({ok:false,message:IMAGE_MESSAGES.damaged});
  const big=png(10,10,IMAGE_MAX_BYTES+1);
  expect(big.length).toBeGreaterThan(IMAGE_MAX_BYTES);
  expect(sniffImage(big)).toEqual({ok:false,message:IMAGE_MESSAGES.tooBig});
  expect(sniffImage(png(10,10,IMAGE_MAX_BYTES-100)).ok).toBe(true);
 });
 it('user-visible refusals carry no internal ids and no em dashes',()=>{
  for(const message of Object.values(IMAGE_MESSAGES)){expect(message).not.toMatch(/DWB2|DW\.|LineTool|lvimage|sha256|\u2014/);expect(message.endsWith('.')).toBe(true);}
 });
});

describe('asset store',()=>{
 it('imports keyed by sha256 and dedupes identical files',async()=>{
  const store=createImageAssetStore(),bytes=png(20,10);
  const first=await store.import(bytes,'image/png');
  expect(first.ok).toBe(true);if(!first.ok)return;
  expect(first.duplicate).toBe(false);expect(first.asset.id).toBe(await hex64(bytes));expect(first.asset.sha256).toBe(first.asset.id);
  expect(isImageAssetId(first.asset.id)).toBe(true);
  expect(first.asset).toMatchObject({mime:'image/png',bytes:bytes.length,width:20,height:10});
  expect(first.asset.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  const second=await store.import(Uint8Array.from(bytes));
  expect(second).toMatchObject({ok:true,duplicate:true});if(second.ok)expect(second.asset.id).toBe(first.asset.id);
  expect(store.size()).toBe(1);expect(store.totalBytes()).toBe(bytes.length);
  const other=await store.import(png(21,10));expect(other.ok).toBe(true);expect(store.size()).toBe(2);
  expect(isImageAssetId('abc')).toBe(false);expect(isImageAssetId('A'.repeat(64))).toBe(false);
 });
 it('refuses with the shared messages and stores nothing for a rejected file',async()=>{
  const store=createImageAssetStore();
  expect(await store.import(new TextEncoder().encode('<svg/>'))).toEqual({ok:false,message:IMAGE_MESSAGES.format});
  expect(await store.import(png(8,8),'image/gif')).toEqual({ok:false,message:IMAGE_MESSAGES.mismatch});
  expect(store.size()).toBe(0);expect(store.totalBytes()).toBe(0);
 });
 it('refuses an import that would pass the total cap, with a message and before anything changes ',async()=>{
  expect(IMAGE_STORE_MAX_BYTES).toBe(8*1024*1024);
  const a=png(10,10,1000),b=png(11,10,1000),c=png(12,10,1000),store=createImageAssetStore({maxTotalBytes:a.length+b.length+10});
  expect((await store.import(a)).ok).toBe(true);expect((await store.import(b)).ok).toBe(true);
  const refused=await store.import(c);
  expect(refused).toEqual({ok:false,message:IMAGE_MESSAGES.storeFull});
  expect(store.size()).toBe(2);expect(store.totalBytes()).toBe(a.length+b.length);
  // A duplicate of a stored image is not new data, so it still succeeds at the cap.
  expect(await store.import(a)).toMatchObject({ok:true,duplicate:true});
  // The total cap stays below the 32 MiB workspace limit even after base64 growth (+4/3).
  expect(Math.ceil(IMAGE_STORE_MAX_BYTES*4/3)).toBeLessThan(32*1024*1024);
 });
 it('counts references on clone and delete, keeps released assets for undo, and drops unreferenced ones on reconcile',async()=>{
  const store=createImageAssetStore(),imported=await store.import(png(9,9));
  if(!imported.ok)throw Error('fixture');const id=imported.asset.id;
  expect(store.refs(id)).toBe(0);
  expect(store.retain(id)).toBe(true);expect(store.refs(id)).toBe(1);   // placement
  expect(store.retain(id)).toBe(true);expect(store.refs(id)).toBe(2);   // clone
  store.release(id);expect(store.refs(id)).toBe(1);                      // delete of the clone
  expect(store.has(id)).toBe(true);                                      // never dropped by release alone (undo)
  store.release(id);store.release(id);expect(store.refs(id)).toBe(0);    // no negative counts
  expect(store.retain('f'.repeat(64))).toBe(false);
  // Save-time reconcile: counts come from the saved drawings.
  expect(store.reconcile([id,id])).toEqual([]);expect(store.refs(id)).toBe(2);
  expect(store.reconcile([id])).toEqual([]);expect(store.refs(id)).toBe(1);
  expect(store.reconcile([])).toEqual([id]);
  expect(store.has(id)).toBe(false);expect(store.toDocument()).toEqual({});expect(store.totalBytes()).toBe(0);
  // Undo of the delete brings the same asset back, in memory.
  expect(store.retain(id)).toBe(true);expect(store.has(id)).toBe(true);expect(store.refs(id)).toBe(1);
  expect(Object.keys(store.toDocument())).toEqual([id]);
  // Importing the same bytes again also revives it.
  store.reconcile([]);const again=await store.import(png(9,9));expect(again).toMatchObject({ok:true,duplicate:false});
 });
 it('round-trips the drawingAssets map, validates every entry, and changes nothing on a bad document',async()=>{
  const store=createImageAssetStore(),first=await store.import(png(7,5)),second=await store.import(jpeg(6,6));
  if(!first.ok||!second.ok)throw Error('fixture');
  const document=store.toDocument();
  expect(Object.keys(document).sort()).toEqual([first.asset.id,second.asset.id].sort());
  expect(document[first.asset.id]).toEqual({mime:'image/png',bytes:first.asset.bytes,dataUrl:first.asset.dataUrl});
  const copy=createImageAssetStore();
  expect(copy.check(JSON.parse(JSON.stringify(document)))).toEqual({ok:true});
  expect(await copy.load(JSON.parse(JSON.stringify(document)))).toEqual({ok:true});
  expect(copy.ids().sort()).toEqual(store.ids().sort());expect(copy.get(first.asset.id)).toMatchObject({width:7,height:5,mime:'image/png'});
  expect(await verifyImageAssetIds(copy)).toBe(true);
  // A stored entry whose bytes do not hash to its id passes the structural check but load() refuses it, and nothing is kept.
  const forged=createImageAssetStore();
  expect(forged.check({[second.asset.id]:document[first.asset.id]})).toEqual({ok:true});
  expect(await forged.load({[second.asset.id]:document[first.asset.id]})).toEqual({ok:false,message:IMAGE_MESSAGES.mismatchedAsset});
  expect(forged.size()).toBe(0);
  // Bad documents leave the store as it was.
  const keep=createImageAssetStore();await keep.import(png(3,3));const ids=keep.ids();
  for(const bad of [null,[],'x',{notAnId:document[first.asset.id]},{[first.asset.id]:{mime:'image/png',bytes:1,dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}},{[first.asset.id]:{mime:'image/jpeg',bytes:first.asset.bytes,dataUrl:first.asset.dataUrl}},{[first.asset.id]:{mime:'image/png',bytes:5,dataUrl:first.asset.dataUrl}},{[first.asset.id]:{mime:'image/png',bytes:1,dataUrl:'http://example.invalid/x.png'}}]){
   expect(keep.check(bad as never),JSON.stringify(bad)?.slice(0,60)).toMatchObject({ok:false});expect(await keep.load(bad as never)).toMatchObject({ok:false});expect(keep.ids()).toEqual(ids);
  }
  const small=createImageAssetStore({maxTotalBytes:10});
  expect(small.check(document)).toEqual({ok:false,message:IMAGE_MESSAGES.storeFull});expect(await small.load(document)).toEqual({ok:false,message:IMAGE_MESSAGES.storeFull});expect(small.size()).toBe(0);
 });
});

describe('asset ids are bound to their bytes (F-2)',()=>{
 it('a forged map cannot substitute bytes: id of P holding the bytes of Q is refused, so a later import of P never dedupes onto Q',async()=>{
  const p=png(11,7),q=png(12,9);
  const source=createImageAssetStore(),pa=await source.import(p),qa=await source.import(q);if(!pa.ok||!qa.ok)throw Error('fixture');
  const forged={[pa.asset.id]:source.toDocument()[qa.asset.id]};
  const victim=createImageAssetStore();
  expect(await victim.load(forged)).toEqual({ok:false,message:IMAGE_MESSAGES.mismatchedAsset});
  const imported=await victim.import(p);
  expect(imported).toMatchObject({ok:true,duplicate:false});if(imported.ok){expect(imported.asset.width).toBe(11);expect(victim.bytesOf(imported.asset.id)).toEqual(p);}
  // Same check through the verifier used by callers that load structurally first.
  const sloppy=createImageAssetStore();sloppy.check(forged);
  expect(await verifyImageAssetIds(victim)).toBe(true);
 });
 it('import compares bytes before it dedupes: an id that already holds different bytes is refused, never aliased',async()=>{
  const store=createImageAssetStore({digest:async()=>'a'.repeat(64)}),first=await store.import(png(5,5));if(!first.ok)throw Error('fixture');
  expect(await store.import(png(5,5))).toMatchObject({ok:true,duplicate:true});
  expect(await store.import(png(9,9))).toEqual({ok:false,message:IMAGE_MESSAGES.mismatchedAsset});
  expect(store.bytesOf('a'.repeat(64))).toEqual(png(5,5));
 });
 it('the decode cache is keyed by the verified sha and cleared when a load or a reconcile replaces assets',async()=>{
  let calls=0;setImageDecoder(async()=>{calls++;return{width:1,height:1};});
  const store=createImageAssetStore(),first=await store.import(png(6,6));if(!first.ok)throw Error('fixture');
  decodedImage(store,first.asset.id);await new Promise(resolve=>setTimeout(resolve,0));
  expect(decodedImage(store,first.asset.id).state).toBe('ready');expect(calls).toBe(1);
  expect(await store.load(store.toDocument())).toEqual({ok:true});
  expect(decodedImage(store,first.asset.id).state).toBe('pending');           // load cleared the cache
  await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toBe(2);
  store.reconcile([]);expect(decodedImage(store,first.asset.id)).toEqual({state:'failed',message:'Image unavailable'});
  expect(store.retain(first.asset.id)).toBe(true);
  expect(decodedImage(store,first.asset.id).state).toBe('pending');           // dropping forgot the old decode
 });
 it('held assets survive a reconcile (a pending import or a dialog replacement) until they are released',async()=>{
  const store=createImageAssetStore(),first=await store.import(png(6,6));if(!first.ok)throw Error('fixture');
  store.hold(first.asset.id);expect(store.reconcile([])).toEqual([]);expect(store.has(first.asset.id)).toBe(true);
  store.unhold(first.asset.id);expect(store.reconcile([])).toEqual([first.asset.id]);
 });
});
describe('decoding',()=>{
 it('decodes once through the injected decoder: pending first, then ready, and notifies listeners',async()=>{
  const store=createImageAssetStore(),imported=await store.import(png(12,6));if(!imported.ok)throw Error('fixture');
  const calls:string[]=[],seen:string[]=[];
  setImageDecoder(async(data,mime)=>{calls.push(mime+':'+data.length);return{width:12,height:6};});
  const off=onImageDecoded(id=>seen.push(id));
  expect(decodedImage(store,imported.asset.id)).toEqual({state:'pending'});
  expect(decodedImage(store,imported.asset.id)).toEqual({state:'pending'});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(decodedImage(store,imported.asset.id)).toMatchObject({state:'ready',image:{width:12,height:6}});
  expect(calls).toEqual(['image/png:'+imported.asset.bytes]);expect(seen).toEqual([imported.asset.id]);
  off();
  expect(decodedImage(store,'e'.repeat(64))).toEqual({state:'failed',message:'Image unavailable'});
 });
 it('a failed decode and a missing decoder are reported, never thrown',async()=>{
  const store=createImageAssetStore(),imported=await store.import(gif(4,4));if(!imported.ok)throw Error('fixture');
  setImageDecoder(async()=>{throw new Error('SYNTHETIC decode failure');});
  decodedImage(store,imported.asset.id);await new Promise(resolve=>setTimeout(resolve,0));
  expect(decodedImage(store,imported.asset.id)).toEqual({state:'failed',message:'Image could not be decoded'});
  setImageDecoder(undefined);
  // Node has no createImageBitmap: the shared message is reported.
  expect(decodedImage(store,imported.asset.id)).toEqual({state:'failed',message:IMAGE_MESSAGES.noDecoder});
 });
});

describe('no network, no markup',()=>{
 it('the asset, image and cursor modules reference no network API, no Image element and no SVG decoding',()=>{
  const files=['src/chart/image-assets.ts','src/chart/lv-types/image.ts','src/chart/cursor-kind.ts','src/chart/anchored-text-painter.ts','src/chart/lv-types/anchored-text.ts'];
  for(const file of files){
   const source=readFileSync(file,'utf8').split('\n').filter(line=>!line.trim().startsWith('//')&&!line.trim().startsWith('*')).join('\n');
   expect(source,file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|new\s+Image\b|new\s+Audio\b|\.src\s*=|https?:\/\/|<svg|DOMParser|innerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/);
  }
 });
});
