import {afterEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';

// Electron/profile-migration.cjs (%APPDATA%\LarryVision -> %APPDATA%\OpenCandle). Throwaway temp folders and
// fake files only; the real profile folders are never read.
const require=createRequire(import.meta.url);
const migration=require('../../electron/profile-migration.cjs');
const temps:string[]=[];
afterEach(()=>{for(const dir of temps.splice(0))rmSync(dir,{recursive:true,force:true});});
const scratch=()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'oc-profile-migration-'));temps.push(dir);return dir;};
const never=()=>false;
function fakeProfile(folder:string){
 mkdirSync(path.join(folder,'local-workspace'),{recursive:true});mkdirSync(path.join(folder,'GPUCache'),{recursive:true});mkdirSync(path.join(folder,'Crashpad','reports'),{recursive:true});
 writeFileSync(path.join(folder,'Local State'),'{"os_crypt":{"encrypted_key":"FAKE-SYNTHETIC"}}');
 writeFileSync(path.join(folder,'alpaca-market-data.key'),Buffer.from([0,1,2,250,251,252,0x0d,0x0a]));
 writeFileSync(path.join(folder,'local-workspace','workspace.json'),'{"synthetic":true}');
 writeFileSync(path.join(folder,'GPUCache','data_0'),'cache');writeFileSync(path.join(folder,'lockfile'),'');
}
function tree(folder:string):Record<string,string>{
 const out:Record<string,string>={};
 const walk=(dir:string,prefix:string)=>{for(const name of readdirSync(dir).sort()){const full=path.join(dir,name),rel=prefix+name;if(statSync(full).isDirectory()){out[rel+'/']='dir';walk(full,rel+'/');}else out[rel]=createHash('sha256').update(readFileSync(full)).digest('hex');}};
 walk(folder,'');return out;
}

it('none: no old profile, a folder without a profile, or the same folder',()=>{
 const root=scratch(),to=path.join(root,'OpenCandle');
 expect(migration.migrateProfile({from:path.join(root,'LarryVision'),to,inUse:never})).toBe('none');expect(existsSync(to)).toBe(false);
 const junk=path.join(root,'junk');mkdirSync(junk);writeFileSync(path.join(junk,'lockfile'),'');
 expect(migration.migrateProfile({from:junk,to,inUse:never})).toBe('none');expect(existsSync(to)).toBe(false);
 fakeProfile(junk);expect(migration.migrateProfile({from:junk,to:junk.toUpperCase(),inUse:never})).toBe('none');
});
it('copied: the whole profile byte-identical (Local State and key file), Chromium caches and the lock skipped, the old folder untouched',()=>{
 const root=scratch(),from=path.join(root,'LarryVision'),to=path.join(root,'OpenCandle');fakeProfile(from);
 const before=tree(from);
 expect(migration.migrateProfile({from,to,inUse:never})).toBe('copied');
 expect(tree(from)).toEqual(before);
 expect(readFileSync(path.join(to,'Local State'))).toEqual(readFileSync(path.join(from,'Local State')));
 expect(readFileSync(path.join(to,'alpaca-market-data.key'))).toEqual(readFileSync(path.join(from,'alpaca-market-data.key')));
 expect(readFileSync(path.join(to,'local-workspace','workspace.json'),'utf8')).toBe('{"synthetic":true}');
 for(const skipped of ['GPUCache','Crashpad','lockfile'])expect(existsSync(path.join(to,skipped))).toBe(false);
 expect(readFileSync(path.join(to,migration.MIGRATION_NOTE),'utf8')).toContain(from);
 expect(readdirSync(root).sort()).toEqual(['LarryVision','OpenCandle']);// no .migrating-* leftovers
});
it('kept: a second start never copies again and never overwrites a real profile, even after the old one changes',()=>{
 const root=scratch(),from=path.join(root,'LarryVision'),to=path.join(root,'OpenCandle');fakeProfile(from);
 expect(migration.migrateProfile({from,to,inUse:never})).toBe('copied');
 const note=readFileSync(path.join(to,migration.MIGRATION_NOTE),'utf8');
 writeFileSync(path.join(from,'alpaca-market-data.key'),'CHANGED');
 expect(migration.migrateProfile({from,to,inUse:never})).toBe('kept');
 expect(readFileSync(path.join(to,'alpaca-market-data.key'))).toEqual(Buffer.from([0,1,2,250,251,252,0x0d,0x0a]));
 expect(readFileSync(path.join(to,migration.MIGRATION_NOTE),'utf8')).toBe(note);
 // A destination with only a Local State (a used OpenCandle profile) is also kept.
 const other=path.join(root,'Other');mkdirSync(other);writeFileSync(path.join(other,'Local State'),'NEW');
 expect(migration.migrateProfile({from,to:other,inUse:never})).toBe('kept');expect(readdirSync(other)).toEqual(['Local State']);
});
it('a pre-created empty or lockfile/Crashpad-only destination still migrates, keeping its leftovers',()=>{
 const root=scratch(),from=path.join(root,'LarryVision');fakeProfile(from);
 const empty=path.join(root,'Empty');mkdirSync(empty);
 expect(migration.migrateProfile({from,to:empty,inUse:never})).toBe('copied');expect(existsSync(path.join(empty,'Local State'))).toBe(true);
 const leftovers=path.join(root,'Leftovers');mkdirSync(path.join(leftovers,'Crashpad'),{recursive:true});writeFileSync(path.join(leftovers,'lockfile'),'L');
 expect(migration.migrateProfile({from,to:leftovers,inUse:never})).toBe('copied');
 expect(readFileSync(path.join(leftovers,'lockfile'),'utf8')).toBe('L');expect(existsSync(path.join(leftovers,'local-workspace','workspace.json'))).toBe(true);
 expect(readdirSync(root).filter(name=>name.includes('.migrating-'))).toEqual([]);
});
it('refuses while the old app holds its profile: nothing is created or changed',()=>{
 const root=scratch(),from=path.join(root,'LarryVision'),to=path.join(root,'OpenCandle');fakeProfile(from);const before=tree(from);
 const inUse=vi.fn(()=>true);
 let error:any;try{migration.migrateProfile({from,to,inUse});}catch(caught){error=caught;}
 expect(error?.code).toBe('PROFILE_IN_USE');expect(inUse).toHaveBeenCalledWith(from);
 expect(existsSync(to)).toBe(false);expect(tree(from)).toEqual(before);expect(readdirSync(root)).toEqual(['LarryVision']);
 // The real lock probe: an unheld lockfile is not "in use".
 expect(migration.profileInUse(from)).toBe(false);
});
it('a failed copy leaves the destination as it was and removes its temp folder; stale temps of dead processes are cleared',()=>{
 const root=scratch(),from=path.join(root,'LarryVision'),to=path.join(root,'OpenCandle');fakeProfile(from);
 // A leftover temp folder from a crashed earlier start (a pid that cannot be running) is removed before the copy.
 mkdirSync(path.join(root,'OpenCandle.migrating-2147483646','half'),{recursive:true});
 // A leftover with this process's own pid is cleared too, so the copy succeeds.
 const own=path.join(root,'OpenCandle.migrating-77');writeFileSync(own,'');
 expect(migration.migrateProfile({from,to,inUse:never,pid:77})).toBe('copied');
 expect(existsSync(own)).toBe(false);expect(existsSync(path.join(root,'OpenCandle.migrating-2147483646'))).toBe(false);
 // A copy that fails part-way (synthetic EIO after the files landed in the temp folder).
 const broken=path.join(root,'Broken');fakeProfile(broken);
 const to2=path.join(root,'Dest');
 const fs=require('node:fs'),original=fs.cpSync;
 fs.cpSync=(...args:any[])=>{original(...args);throw Object.assign(Error('synthetic copy failure'),{code:'EIO'});};
 try{expect(()=>migration.migrateProfile({from:broken,to:to2,inUse:never,pid:78})).toThrow('synthetic copy failure');}finally{fs.cpSync=original;}
 expect(existsSync(to2)).toBe(false);expect(existsSync(to2+'.migrating-78')).toBe(false);
});
it('main.cjs migrates only without --lv-profile, before the single-instance lock, and refuses with the plain message',()=>{
 const source=readFileSync('electron/main.cjs','utf8');
 const hook=source.indexOf("if(!profile&&process.platform==='win32'){"),lock=source.indexOf('app.requestSingleInstanceLock()');
 expect(hook).toBeGreaterThan(0);expect(hook).toBeLessThan(lock);
 const block=source.slice(hook,lock);
 expect(block).toContain("path.join(app.getPath('appData'),'LarryVision')");expect(block).toContain("to:app.getPath('userData')");
 expect(block).toContain("dialog.showErrorBox('OpenCandle','LarryVision is still open. Close it (including its tray icon) and start OpenCandle again. Your data was not changed.');");
 expect(block).toContain('app.exit(0);');
});
it('main.cjs boot: copied, refused (no lock taken, exits) and failed (tells the user, keeps starting)',()=>{
 const source=readFileSync('electron/main.cjs','utf8');
 const start=source.indexOf('const profile = process.argv.find'),end=source.indexOf('let startupDiagnostics=null;');
 const run=(migrate:()=>any,argv:string[]=[])=>{
  const app={setPath:vi.fn(),setAppUserModelId:vi.fn(),getPath:(name:string)=>name==='appData'?'C:\\Synthetic\\Roaming':'C:\\Synthetic\\Roaming\\OpenCandle',exit:vi.fn(),quit:vi.fn(),requestSingleInstanceLock:vi.fn(()=>true)};
  const dialog={showErrorBox:vi.fn()},calls:any[]=[];
  const value=runInNewContext(source.slice(start,end)+';({ownsProfile,profileMigration})',{app,dialog,path:path.win32,APP_USER_MODEL_ID:'com.getopencandle.app',console:{error:vi.fn()},process:{argv,platform:'win32'},require:(name:string)=>{if(name!=='./profile-migration.cjs')throw Error(name);return{migrateProfile:(input:any)=>{calls.push(input);return migrate();}};}});
  return{app,dialog,calls,value};
 };
 const copied=run(()=>'copied');
 expect(copied.calls).toEqual([{from:'C:\\Synthetic\\Roaming\\LarryVision',to:'C:\\Synthetic\\Roaming\\OpenCandle'}]);
 expect(copied.value.ownsProfile).toBe(true);expect(copied.dialog.showErrorBox).not.toHaveBeenCalled();expect(copied.app.setAppUserModelId).toHaveBeenCalledWith('com.getopencandle.app');
 const refused=run(()=>{throw Object.assign(Error('in use'),{code:'PROFILE_IN_USE'});});
 expect(refused.value.ownsProfile).toBe(false);expect(refused.app.requestSingleInstanceLock).not.toHaveBeenCalled();expect(refused.app.exit).toHaveBeenCalledWith(0);
 expect(refused.dialog.showErrorBox.mock.calls[0][1]).toContain('LarryVision is still open');
 const failed=run(()=>{throw Object.assign(Error('disk'),{code:'ENOSPC'});});
 expect(failed.value.ownsProfile).toBe(true);expect(failed.value.profileMigration).toEqual({result:'failed',code:'ENOSPC'});expect(failed.dialog.showErrorBox.mock.calls[0][1]).toContain('starts with an empty profile');
 const flagged=run(()=>'copied',['OpenCandle.exe','--lv-profile=C:\\Temp\\p']);
 expect(flagged.calls).toEqual([]);expect(flagged.app.setPath).toHaveBeenCalledWith('userData','C:\\Temp\\p');
});
