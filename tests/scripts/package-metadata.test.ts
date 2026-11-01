import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {APP_COPYRIGHT,EXE_VERSION_STRINGS,WIN32_METADATA,exeVersionStringProblems,packagerMetadataOptions} from '../../scripts/package-metadata.mjs';
import {WindowsApp} from '../../node_modules/@electron/packager/dist/win32.js';

describe('OpenCandle.exe file properties',()=>{
 it('use the project copyright notice from LICENSE and NOTICE, with no personal name',()=>{
  expect(APP_COPYRIGHT).toBe('Copyright 2026 the OpenCandle contributors');
  for(const file of ['LICENSE','NOTICE'])expect(readFileSync(file,'utf8')).toContain('Required Notice: '+APP_COPYRIGHT);
  expect(JSON.parse(readFileSync('package.json','utf8')).author).toBe('OpenCandle contributors');
  expect(EXE_VERSION_STRINGS).toEqual({CompanyName:'OpenCandle',FileDescription:'OpenCandle',ProductName:'OpenCandle',InternalName:'OpenCandle',OriginalFilename:'OpenCandle.exe',LegalCopyright:APP_COPYRIGHT});
  expect(Object.values(EXE_VERSION_STRINGS).join(' ')).not.toMatch(/electron|github|@/i);
 });
 it('reach the packager resource options for every string, LegalCopyright included',()=>{
  const options=packagerMetadataOptions();expect(options).toEqual({appCopyright:APP_COPYRIGHT,win32metadata:{...WIN32_METADATA}});expect(options.win32metadata).not.toBe(WIN32_METADATA);
  const resources=new WindowsApp({name:'OpenCandle',appVersion:'0.8.2',...options} as never,'template').generateReseditOptionsSansIcon();
  expect(resources.legalCopyright).toBe(APP_COPYRIGHT);expect(resources.productName).toBe('OpenCandle');
  expect(exeVersionStringProblems({...resources.win32Metadata,LegalCopyright:resources.legalCopyright})).toEqual([]);
 });
 it('package.mjs passes the shared options and hashes the module; package:verify reads them back from the exe',()=>{
  const pack=readFileSync('scripts/package.mjs','utf8'),verify=readFileSync('scripts/security-package.mjs','utf8');
  expect(pack).toContain("import {packagerMetadataOptions} from './package-metadata.mjs';");expect(pack).toContain('tmpdir:packageTemp,...packagerMetadataOptions()};');
  expect(pack).toContain("'scripts/package-metadata.mjs',");expect(pack).not.toMatch(/win32metadata:\{/);
  expect(verify).toContain('Resource.VersionInfo.fromEntries(resources.entries)');expect(verify).toContain('exeVersionStringProblems(versionInfo[0].getStringValues(versionLanguages[0]))');
 });
 it('lists each wrong string, as Electron defaults would show',()=>{
  const electron={CompanyName:'GitHub, Inc.',FileDescription:'Electron',InternalName:'electron.exe',LegalCopyright:'Copyright (C) 2015 GitHub, Inc. All rights reserved.',OriginalFilename:'electron.exe',ProductName:'Electron'};
  expect(exeVersionStringProblems(electron)).toHaveLength(6);
  expect(exeVersionStringProblems({...EXE_VERSION_STRINGS,LegalCopyright:electron.LegalCopyright})).toEqual(['LegalCopyright is "Copyright (C) 2015 GitHub, Inc. All rights reserved.", expected "Copyright 2026 the OpenCandle contributors"']);
  expect(exeVersionStringProblems(undefined)).toHaveLength(6);
 });
});
