import {describe,expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {prepareWorkspaceReplacement} from '../../src/ui/workspace-transfer';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createPaperAccount} from '../../src/domain/paper';
import {IMAGE_MAX_BYTES,createImageAssetStore} from '../../src/chart/image-assets';
import {imageFixture} from '../chart/dwb2-image-fixtures';

// (root drop-in, needs the proposed workspace-state / workspace-validation diffs): the workspace `drawingAssets` map.
// SYNTHETIC byte fixtures only; nothing reads a file or the network.
const complete=():Record<string,unknown>=>({...createInitialWorkspace(),paper:createPaperAccount(),alerts:[]});
const encode=(data:unknown)=>JSON.stringify({schemaVersion:1,data});
const documentOf=async()=>{
 const store=createImageAssetStore();
 const first=await store.import(imageFixture.png(8,6)),second=await store.import(imageFixture.gif(5,5));
 if(!first.ok||!second.ok)throw Error('fixture');
 return store.toDocument();
};

describe('workspace drawingAssets ',()=>{
 it('a workspace without the map restores unchanged and reports no migration for it',()=>{
  const data=complete();const preview=prepareWorkspaceReplacement(encode(data));
  expect(Object.hasOwn(preview.workspace,'drawingAssets')).toBe(false);
  expect(preview.migrations.some(line=>line.includes('drawingAssets'))).toBe(false);
 });
 it('a valid map survives prepared export, preview and re-export exactly, and restore keeps it',async()=>{
  const assets=await documentOf(),data=complete();data.drawingAssets=assets;
  const preview=prepareWorkspaceReplacement(encode(data));
  expect(preview.workspace.drawingAssets).toEqual(assets);expect(preview.data.drawingAssets).toEqual(assets);
  expect(prepareWorkspaceReplacement(encode(prepareWorkspaceJSON(preview.data))).workspace.drawingAssets).toEqual(assets);
  expect(restoreWorkspace({...createInitialWorkspace(),drawingAssets:assets},createInitialWorkspace()).drawingAssets).toEqual(assets);
  // The map is optional: restoring a workspace that never had one keeps it absent.
  expect(Object.hasOwn(restoreWorkspace(createInitialWorkspace(),createInitialWorkspace()),'drawingAssets')).toBe(false);
 });
 it('refuses an invalid map before anything is restored: bad id, markup, mismatched type, hidden accessor, undefined',async()=>{
  const assets=await documentOf(),[id]=Object.keys(assets);
  const bad:unknown[]=[
   {notAnId:assets[id]},
   {[id]:{mime:'image/svg+xml',bytes:5,dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}},
   {[id]:{...assets[id],mime:'image/jpeg'}},
   {[id]:{...assets[id],dataUrl:'https://example.invalid/x.png'}},
   [],'text',null,
  ];
  for(const value of bad)expect(()=>restoreWorkspace({...createInitialWorkspace(),drawingAssets:value},createInitialWorkspace()),JSON.stringify(value)?.slice(0,50)).toThrow(/drawing assets/i);
  const hidden=createInitialWorkspace();Object.defineProperty(hidden,'drawingAssets',{get:()=>assets,enumerable:true});
  expect(()=>restoreWorkspace(hidden,createInitialWorkspace())).toThrow(/drawing assets/i);
  expect(()=>restoreWorkspace({...createInitialWorkspace(),drawingAssets:undefined},createInitialWorkspace())).toThrow(/drawing assets/i);
 });
 it('refuses a map above the total image cap',()=>{
  const store=createImageAssetStore(),big=imageFixture.png(10,10,IMAGE_MAX_BYTES-10);
  const entry=(index:number)=>{const copy=Uint8Array.from(big);copy[40]=index;return{mime:'image/png',bytes:copy.length,dataUrl:'data:image/png;base64,'+Buffer.from(copy).toString('base64')};};
  const map=Object.fromEntries([0,1,2,3,4].map(index=>[index.toString(16).repeat(64).slice(0,64),entry(index)]));
  expect(store.check(map).ok).toBe(false);
  expect(()=>restoreWorkspace({...createInitialWorkspace(),drawingAssets:map},createInitialWorkspace())).toThrow(/drawing assets/i);
 });
});
