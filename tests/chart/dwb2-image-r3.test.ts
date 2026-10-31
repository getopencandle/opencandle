import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createDrawingAssetsController,DRAWING_ASSETS_MESSAGES} from '../../src/chart/lv-types/image';
import {createImageAssetStore,type ImageAssetDocument} from '../../src/chart/image-assets';
import {imageFixture} from './dwb2-image-fixtures';

// Review dwb2-image-review-r3 finding R3-1 (SYNTHETIC byte fixtures; no DOM, no GUI claim).
// A paste or dialog replacement during a pending verified workspace load must never commit the old store's map over the incoming one.
const {png,gif,jpeg}=imageFixture;
const sha=async(data:Uint8Array)=>{const view=new Uint8Array(data.byteLength);view.set(data);return[...new Uint8Array(await crypto.subtle.digest('SHA-256',view))].map(x=>x.toString(16).padStart(2,'0')).join('');};
const doc=async(bytes:Uint8Array)=>{const s=createImageAssetStore();const r=await s.import(bytes);if(!r.ok)throw Error('fixture');return{id:r.asset.id,document:s.toDocument()};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
/** The App's commit loop: a commit becomes workspace.drawingAssets, whose effect calls sync after render (a macrotask later here). */
function host(digest?:(data:Uint8Array)=>Promise<string>){
 const store=createImageAssetStore(digest?{digest}:{}),commits:ImageAssetDocument[]=[],messages:string[]=[];
 let committed:ImageAssetDocument|undefined;
 const controller=createDrawingAssetsController(store,document=>{commits.push(document);committed=document;setTimeout(()=>controller.sync(document),0);return true;},message=>messages.push(message));
 const switchTo=(document:ImageAssetDocument)=>{committed=document;controller.sync(document);};
 return{store,controller,commits,messages,switchTo,committed:()=>committed};
}
/** A digest that stalls on one payload until released, so a load can be held open. */
function gate(stallOn:number){let open!:()=>void;const opened=new Promise<void>(resolve=>{open=resolve;});return{open,digest:async(data:Uint8Array)=>{if(data.length===stallOn)await opened;return sha(data);}};}
const settle=async(controller:{settled():Promise<void>})=>{for(let i=0;i<4;i++){await controller.settled();await tick();}};

describe(' Image R3-1: imports during a pending workspace load',()=>{
 it('a paste during the verified load of an incoming map keeps the incoming image in the store and the committed map',async()=>{
  const a=await doc(png(10,10)),b=await doc(gif(12,12)),pasted=jpeg(14,14),pastedId=await sha(pasted);
  const g=gate(gif(12,12).length),h=host(g.digest);
  h.switchTo(a.document);await settle(h.controller);expect(h.store.ids()).toEqual([a.id]);
  h.switchTo(b.document);                         // undo/import/restore: the verified load of b is now pending
  const edit=h.controller.edit(async session=>{const r=await h.store.import(pasted,'image/jpeg');if(!r.ok)return r;session.commit();return{ok:true as const};});
  await tick();g.open();
  const result=await edit;await settle(h.controller);
  expect(h.store.ids()).toContain(b.id);
  expect(Object.keys(h.committed()!)).toContain(b.id);
  expect(h.store.ids()).not.toContain(a.id);
  expect(Object.keys(h.committed()!)).not.toContain(a.id);
  // The paste ran after the load, onto the incoming map, so it is kept too.
  expect(result).toEqual({ok:true});
  expect(h.store.ids().sort()).toEqual([b.id,pastedId].sort());
  expect(Object.keys(h.committed()!).sort()).toEqual([b.id,pastedId].sort());
 });
 it('a workspace switch that arrives while an import is running refuses that import\'s commit and keeps the incoming map',async()=>{
  const a=await doc(png(10,10)),b=await doc(gif(12,12)),pasted=jpeg(14,14);
  const g=gate(pasted.length),h=host(g.digest);
  h.switchTo(a.document);await settle(h.controller);
  let committedFromEdit:boolean|undefined;
  const edit=h.controller.edit(async session=>{const r=await h.store.import(pasted,'image/jpeg');committedFromEdit=session.commit();return r.ok;});
  await tick();
  h.switchTo(b.document);                          // the incoming map arrives while the import is still hashing
  g.open();
  await edit;await settle(h.controller);
  expect(committedFromEdit).toBe(false);
  expect(h.commits).toEqual([]);
  expect(h.store.ids()).toEqual([b.id]);
  expect(Object.keys(h.committed()!)).toEqual([b.id]);
 });
 it('an edit that starts while a load is still queued is refused with a message, before it touches the store',async()=>{
  const a=await doc(png(10,10)),b=await doc(gif(12,12));
  const g=gate(gif(12,12).length),h=host(g.digest);
  h.switchTo(a.document);await settle(h.controller);
  let ran=false;
  const first=h.controller.edit(async()=>{ran=true;h.switchTo(b.document);return 1;});   // a load queued behind a running edit
  const second=h.controller.edit(async()=>{throw Error('must not run');});
  expect(await first).toBe(1);expect(ran).toBe(true);
  g.open();
  expect(await second).toEqual({ok:false,message:DRAWING_ASSETS_MESSAGES.busy});
  await settle(h.controller);expect(h.store.ids()).toEqual([b.id]);
 });
 it('an edit after a refused (forged) map is refused rather than overwriting it',async()=>{
  const p=await doc(png(11,7)),q=await doc(png(12,9)),h=host();
  h.switchTo({[p.id]:q.document[q.id]});await settle(h.controller);
  expect(await h.controller.edit(async()=>1)).toEqual({ok:false,message:DRAWING_ASSETS_MESSAGES.unavailable});
  expect(h.commits).toEqual([]);
 });
 it('trim reads the drawings lazily: a store without images never calls the reader (the active chart is not serialized)',async()=>{
  const h=host();let reads=0;h.controller.trim(()=>{reads++;return[];});expect(reads).toBe(0);
  const a=await doc(png(10,10));h.switchTo(a.document);await settle(h.controller);
  h.controller.trim(()=>{reads++;return[{drawings:[]}];});expect(reads).toBe(1);expect(h.store.ids()).toEqual([]);
 });
 it('App routes every drawingAssets commit through the controller (no direct store commit)',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).not.toMatch(/commit\(\{drawingAssets:imageAssets\.current\.toDocument\(\)\}\)/);
  expect(app).toMatch(/imageSync\.current!?\.edit\(/);
 });
});

// Structural: the App render harness cannot observe a passive-effect gap.
describe('App wiring of the drawing-assets sync (batch-1019)',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 it('every committed workspace syncs the asset controller synchronously, not only from a passive effect',()=>{
  expect(app).toMatch(/function setWorkspace\(next:Workspace\)\{imageSync\.current\?\.sync\(next\.drawingAssets\);setWorkspaceState\(next\);\}/);
  expect(app).toContain('useState<Workspace>(initial)');
  expect(app).not.toMatch(/\[workspace,setWorkspace\]=useState/);
 });
 it('addImageFile reports a refused session.commit() instead of dropping it',()=>{
  const body=app.slice(app.indexOf('async function addImageFile'),app.indexOf('async function pickReplacementImage'));
  expect(body).not.toMatch(/^\s*session\.commit\(\);/m);
  expect(body).toMatch(/if\(!session\.commit\(\)\)\{[^}]*DRAWING_ASSETS_MESSAGES\.changed/);
 });
});
