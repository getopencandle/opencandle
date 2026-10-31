import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

// The committed OpenCandle icon set (scripts/generate-opencandle-icons.py from Logo-clean.png).
const assets='electron/assets';
const png=name=>{const bytes=readFileSync(path.join(assets,name));assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),colorType:bytes[25],bytes:bytes.length};};

test('every PNG has its exact square size and an alpha channel',()=>{
 for(const [name,size] of [['opencandle-256.png',256],['opencandle-logo-512.png',512],['opencandle-mark-64.png',64],['opencandle-favicon-32.png',32],['opencandle-tray-16.png',16],['opencandle-tray-20.png',20],['opencandle-tray-24.png',24],['opencandle-tray-32.png',32]]){
  const info=png(name);assert.equal(info.width,size,name);assert.equal(info.height,size,name);assert.equal(info.colorType,6,name);
 }
 assert.ok(png('opencandle-mark-64.png').bytes<20000,'the menu mark replaces a 1.4 MB bitmap');
});

test('the exe icon directory lists the nine Windows sizes',()=>{
 const ico=readFileSync(path.join(assets,'opencandle.ico'));assert.equal(ico.readUInt16LE(2),1);
 const sizes=[];for(let i=0;i<ico.readUInt16LE(4);i++)sizes.push(ico[6+i*16]||256);
 assert.deepEqual(sizes.sort((a,b)=>a-b),[16,20,24,32,40,48,64,128,256]);
});

test('the committed icons are current with the recipe (when the workstation Python with Pillow is present)',t=>{
 const python=path.join(process.env.LOCALAPPDATA??'','Programs','Python','Python312','python.exe');
 if(!existsSync(python)){t.skip('no workstation Python');return;}
 const run=spawnSync(python,['-I','scripts/generate-opencandle-icons.py','--check'],{encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(run.status,0,run.stdout+run.stderr);
});

test('the retired LV mark and its recipe are gone; the earlier owner bitmap stays on disk but is unreferenced',()=>{
 for(const name of ['electron/assets/larryvision-mark.png','electron/assets/larryvision-mark.svg','electron/assets/ORIGINAL-BRANDING-NOTICE.txt','scripts/generate-brand-assets.mjs'])assert.equal(existsSync(name),false,name);
 // The earlier owner bitmap is a dev-tree-only file (never packaged or exported); when present it must stay unreferenced.
 if(existsSync('electron/assets/larryvision-logo.png'))assert.equal(readFileSync('scripts/package.mjs','utf8').includes("nonPublicAssets=new Set(['electron/assets/larryvision-logo.png'"),true);
 assert.match(readFileSync('electron/assets/BRANDING-NOTICE.txt','utf8'),/not covered by the software license/);
});
