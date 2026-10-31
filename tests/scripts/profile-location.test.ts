import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {devMigrationSource,devProfileLocation,isInside,legacyDevProfileLocation,migrateProfile,MIGRATION_NOTE} from '../../scripts/profile-location.mjs';

// The development launcher's profile moves out of the project folder. Throwaway folders and fake files only.
const temps:string[]=[];
afterEach(()=>{for(const dir of temps.splice(0))rmSync(dir,{recursive:true,force:true});});
const scratch=()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'lv-profile-move-'));temps.push(dir);return dir;};

it('puts the development profile under %APPDATA%, outside the project folder',()=>{
  expect(devProfileLocation({APPDATA:'C:\\Users\\A\\AppData\\Roaming'})).toBe(path.join('C:\\Users\\A\\AppData\\Roaming','OpenCandle-dev'));
  expect(legacyDevProfileLocation({APPDATA:'C:\\Users\\A\\AppData\\Roaming'})).toBe(path.join('C:\\Users\\A\\AppData\\Roaming','LarryVision-dev'));
  expect(devProfileLocation({})).toBeNull();expect(devProfileLocation({APPDATA:'relative'})).toBeNull();
  expect(isInside('C:\\work\\OpenCandle\\local-data\\owner-preview','C:\\work\\opencandle')).toBe(true);
  expect(isInside(path.join('C:\\Users\\A\\AppData\\Roaming','OpenCandle-dev'),'C:\\work\\OpenCandle')).toBe(false);
});
it('copies the whole old profile once (Local State with it, Chromium caches skipped) and never touches the old folder',()=>{
  const root=scratch(),from=path.join(root,'old'),to=path.join(root,'new');
  mkdirSync(path.join(from,'local-workspace'),{recursive:true});mkdirSync(path.join(from,'Code Cache','js'),{recursive:true});mkdirSync(path.join(from,'market-data-cache'),{recursive:true});
  writeFileSync(path.join(from,'Local State'),'{"os_crypt":{"encrypted_key":"FAKE"}}');
  writeFileSync(path.join(from,'alpaca-market-data.key'),'FAKE-SEALED-KEY');
  writeFileSync(path.join(from,'local-workspace','workspace.json'),'{}');
  writeFileSync(path.join(from,'Code Cache','js','index'),'x');writeFileSync(path.join(from,'market-data-cache','a.json'),'[]');
  const before=readdirSync(from).sort();
  expect(migrateProfile({from,to})).toBe('copied');
  expect(readFileSync(path.join(to,'alpaca-market-data.key'),'utf8')).toBe('FAKE-SEALED-KEY');
  expect(readFileSync(path.join(to,'Local State'),'utf8')).toContain('encrypted_key');
  expect(existsSync(path.join(to,'local-workspace','workspace.json'))).toBe(true);
  expect(existsSync(path.join(to,'market-data-cache','a.json'))).toBe(true);
  expect(existsSync(path.join(to,'Code Cache'))).toBe(false);
  expect(readFileSync(path.join(to,MIGRATION_NOTE),'utf8')).toContain(from);
  expect(readdirSync(from).sort()).toEqual(before);
  expect(readFileSync(path.join(from,'alpaca-market-data.key'),'utf8')).toBe('FAKE-SEALED-KEY');
  // A second start keeps the new profile as it is, even after the old one changes.
  writeFileSync(path.join(from,'alpaca-market-data.key'),'CHANGED');
  expect(migrateProfile({from,to})).toBe('kept');
  expect(readFileSync(path.join(to,'alpaca-market-data.key'),'utf8')).toBe('FAKE-SEALED-KEY');
});
it('does nothing without an old profile and never overwrites an existing new one',()=>{
  const root=scratch(),to=path.join(root,'new');
  expect(migrateProfile({from:path.join(root,'missing'),to})).toBe('none');expect(existsSync(to)).toBe(false);
  const from=path.join(root,'old');mkdirSync(from);writeFileSync(path.join(from,'alpaca-market-data.key'),'OLD');
  // A folder counts as a profile only with Local State or local-workspace (a bare key file is not one).
  expect(migrateProfile({from,to})).toBe('none');writeFileSync(path.join(from,'Local State'),'{}');
  mkdirSync(to);writeFileSync(path.join(to,'alpaca-market-data.key'),'NEW');writeFileSync(path.join(to,'Local State'),'{}');
  expect(migrateProfile({from,to})).toBe('kept');expect(readFileSync(path.join(to,'alpaca-market-data.key'),'utf8')).toBe('NEW');
  expect(migrateProfile({from,to:from})).toBe('none');
});
it('REBRAND-A: the dev launcher copies LarryVision-dev when it holds a profile, else the older in-project folder',()=>{
  const root=scratch(),env={APPDATA:root},project=path.join(root,'project');
  expect(devMigrationSource({env,project})).toBe(path.join(project,'local-data','owner-preview'));
  mkdirSync(path.join(root,'LarryVision-dev'));writeFileSync(path.join(root,'LarryVision-dev','lockfile'),'');
  expect(devMigrationSource({env,project})).toBe(path.join(project,'local-data','owner-preview'));
  mkdirSync(path.join(root,'LarryVision-dev','local-workspace'));
  expect(devMigrationSource({env,project})).toBe(path.join(root,'LarryVision-dev'));
  expect(migrateProfile({from:devMigrationSource({env,project}),to:devProfileLocation(env)!})).toBe('copied');
  expect(existsSync(path.join(root,'OpenCandle-dev','local-workspace'))).toBe(true);expect(existsSync(path.join(root,'LarryVision-dev','local-workspace'))).toBe(true);
});
