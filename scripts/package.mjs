import { packager } from '@electron/packager';
import { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options } from '@electron/fuses';
import { mkdir, readFile, writeFile, readdir, cp, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {copyDistribution} from './package-copy.mjs';
import {velaModification} from './package-vela-modification.mjs';
import {packagerMetadataOptions} from './package-metadata.mjs';
// The disk-budget preflight is a dev-workstation tool and is not part of the public source tree; run it only when present.
const storageBudgetScript=new URL('./storage-budget.mjs',import.meta.url);
const hasStorageBudget=existsSync(storageBudgetScript);
if(hasStorageBudget){const {runPreflight}=await import(storageBudgetScript.href);const storage=await runPreflight('package');if(!storage.ok)throw Error(storage.errors.join('\n'));}
const root=process.cwd();
const packageJSON=JSON.parse(await readFile('package.json','utf8'));
const buildId=new Date().toISOString().replace(/[-:.]/g,'').replace('Z','Z')+'-'+createHash('sha256').update(await readFile('package-lock.json')).digest('hex').slice(0,12);
const staging=path.join(root,'.tmp','package-'+buildId);
const packageTemp=path.join(root,'.tmp','package-work-'+buildId);
const destination=path.join(root,'out',buildId);
const runtimeModules=['quickjs-emscripten-core','@jitl/quickjs-wasmfile-release-sync','@jitl/quickjs-ffi-types'];
// One brand (OpenCandle, electron/assets/opencandle-*). The pre-rename owner bitmap and its notice stay on disk
// but never ship.
const nonPublicAssets=new Set(['electron/assets/larryvision-logo.png','electron/assets/NOTICE.txt']);
const brandAssets=['opencandle.ico','opencandle-256.png','opencandle-logo-512.png','opencandle-mark-64.png','opencandle-favicon-32.png','opencandle-tray-16.png','opencandle-tray-20.png','opencandle-tray-24.png','opencandle-tray-32.png','BRANDING-NOTICE.txt'].map(name=>'electron/assets/'+name);
for(const asset of brandAssets)if(!existsSync(path.join(root,asset)))throw Error('Missing OpenCandle brand asset '+asset+'. Run scripts/generate-opencandle-icons.py.');
const portableFiles={
  'README.md':'docs/portable-quickstart.md',
  'docs/news-import.md':'docs/news-import.md',
  'docs/candlescript.md':'docs/candlescript.md',
  'docs/watchlist-import.md':'docs/watchlist-import.md',
  'docs/watchlist-advanced-import.md':'docs/watchlist-advanced-import.md',
  'docs/workspace-import.md':'docs/workspace-import.md',
  'docs/layout-library.md':'docs/layout-library.md',
  'docs/provider-sec.md':'docs/provider-sec.md',
  'docs/fundamentals.md':'docs/fundamentals.md',
  'docs/provider-sec-submissions.md':'docs/provider-sec-submissions.md',
  'examples/news-synthetic.json':'examples/news-synthetic.json',
  'examples/companyfacts-LVDEMO-synthetic.json':'examples/companyfacts-LVDEMO-synthetic.json',
  'examples/watchlist-advanced-synthetic.json':'examples/watchlist-advanced-synthetic.json',
  'examples/bars-GME-synthetic-daily.csv':'examples/bars-GME-synthetic-daily.csv',
  'examples/bars-SPY-synthetic-daily.json':'examples/bars-SPY-synthetic-daily.json',
  'examples/bars-LVDEMO-synthetic-5m.csv':'examples/bars-LVDEMO-synthetic-5m.csv',
  'examples/bars-PRACTICE-synthetic-mistakes.csv':'examples/bars-PRACTICE-synthetic-mistakes.csv',
  'modifications/vela/apply-vela-magnet-patch.mjs':'src/chart/apply-vela-magnet-patch.mjs',
  'modifications/vela/vela-magnet-patch-plan.json':'src/chart/vela-magnet-patch-plan.json',
  'docs/vela-modification.md':'docs/vela-modification.md',
  'modifications/vela/apply-vela-compat-patch.mjs':'src/chart/apply-vela-compat-patch.mjs',
  'modifications/vela/vela-compat-patch-plan.json':'src/chart/vela-compat-patch-plan.json',
  'modifications/vela-calendar/vela-future-calendar-plan.json':'src/chart/vela-future-calendar-plan.json',
  'modifications/vela-input-feel/vela-input-feel-transform.mjs':'src/chart/vela-input-feel-transform.mjs',
  'modifications/vela-input-feel/vela-input-feel-transform.d.mts':'src/chart/vela-input-feel-transform.d.mts',
  'modifications/vela-calendar/vela-future-calendar-steps.mjs':'src/chart/vela-future-calendar-steps.mjs',
  'modifications/vela-calendar/generate-vela-future-calendar-plan.mjs':'src/chart/generate-vela-future-calendar-plan.mjs',
  'modifications/vela-calendar/vela-future-calendar-transform.mjs':'src/chart/vela-future-calendar-transform.mjs',
  'modifications/vela-calendar/vela-future-calendar-transform.d.mts':'src/chart/vela-future-calendar-transform.d.mts',
  'modifications/vela-calendar/vela-future-calendar.d.ts':'src/chart/vela-future-calendar.d.ts',
  'docs/original-branding.md':'docs/original-branding.md'
};
const modifiedVela=await velaModification(root);
if(!modifiedVela)throw new Error('Current package requires the reviewed cumulative Vela compatibility modification and a rebuilt renderer.');
async function productionNotices(){
  const pending=[...Object.keys(packageJSON.dependencies),...runtimeModules];const seen=new Set();const chunks=[];const hashes={};
  while(pending.length){const module=pending.shift();if(seen.has(module))continue;seen.add(module);const directory=path.join(root,'node_modules',module);const metadata=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));if(String(metadata.license).includes('AGPL'))throw new Error('AGPL dependency requires explicit corresponding-source delivery before bundling: '+module);const entries=await readdir(directory,{withFileTypes:true});const licenseFiles=entries.filter(entry=>entry.isFile()&&/^(licen[sc]e|copying|notice)(\.|$)/i.test(entry.name)).map(entry=>entry.name);if(licenseFiles.length===0)throw new Error('Missing third-party license/notice text for '+module);let text=module+' '+metadata.version+' ('+metadata.license+')\n';for(const filename of licenseFiles){const file=path.join(directory,filename);text+='\n'+filename+'\n'+await readFile(file,'utf8');hashes[module+'/'+filename]=await hash(file);}chunks.push(text);pending.push(...Object.keys(metadata.dependencies||{}));}
  if(modifiedVela)chunks.push('OpenCandle (formerly LarryVision) modification of @luxalgo/vela0.8.4: '+modifiedVela.patchId+'\n'+modifiedVela.scope+'\nReproducibility: '+modifiedVela.reproduce+'\nOriginal/modified upstream file hashes and actual renderer bundle hashes:\n'+JSON.stringify(modifiedVela,null,2));
  return {text:chunks.join('\n\n'),hashes,modules:Array.from(seen).sort()};
}
async function hash(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function files(directory, prefix='') { const entries=await readdir(directory,{withFileTypes:true}); const result=[]; for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) { const relative=prefix?prefix+'/'+entry.name:entry.name; if(entry.isSymbolicLink()) throw new Error('Symlinks forbidden in package input.'); if(entry.isDirectory()) result.push(...await files(path.join(directory,entry.name),relative)); else result.push(relative); } return result; }
const sourceFiles=[...(await files(path.join(root,'electron'))).map(file=>'electron/'+file).filter(file=>!nonPublicAssets.has(file)),...(await files(path.join(root,'dist'))).map(file=>'dist/'+file),...(await files(path.join(root,'src'))).map(file=>'src/'+file),'package.json','package-lock.json','scripts/package.mjs','scripts/package-copy.mjs','scripts/package-verify-template.py','scripts/package-zip.py','scripts/package-vela-modification.mjs','scripts/package-metadata.mjs','vite.config.ts','tsconfig.json','research/theme-sources.json','LICENSE','NOTICE','SECURITY.md','THIRD_PARTY.md',...Object.values(portableFiles)];
sourceFiles.push(...(hasStorageBudget?['scripts/storage-budget.mjs']:[]),'scripts/generate-opencandle-icons.py','Logo-clean.png');
const sourceHashes={}; for(const file of sourceFiles) sourceHashes[file]=await hash(path.join(root,file));
const portableContent=new Map();for(const [target,source]of Object.entries(portableFiles)){const bytes=await readFile(path.join(root,source));if(createHash('sha256').update(bytes).digest('hex')!==sourceHashes[source])throw new Error('Portable user file changed while capturing source: '+source);portableContent.set(target,bytes);}
const runtimeDependencyHashes={};
for(const module of runtimeModules){for(const file of (await files(path.join(root,'node_modules',module))).filter(file=>file==='package.json'||file==='LICENSE'||file.startsWith('dist/')))runtimeDependencyHashes[module+'/'+file]=await hash(path.join(root,'node_modules',module,file));}
await mkdir(staging,{recursive:true}); await mkdir(destination,{recursive:true});await mkdir(packageTemp,{recursive:true});
try {
  await cp(path.join(root,'electron'),path.join(staging,'electron'),{recursive:true,filter:source=>!nonPublicAssets.has(path.relative(root,source).split(path.sep).join('/'))});
  await cp(path.join(root,'dist'),path.join(staging,'dist'),{recursive:true});
  for(const module of runtimeModules){const moduleDirectory=path.join(root,'node_modules',module);const target=path.join(staging,'node_modules',module);await mkdir(target,{recursive:true});for(const part of ['package.json','LICENSE','dist'])await cp(path.join(moduleDirectory,part),path.join(target,part),{recursive:true});}
  const notices=await productionNotices();
  await writeFile(path.join(staging,'THIRD-PARTY-NOTICES.txt'),notices.text);
  await cp(path.join(root,'LICENSE'),path.join(staging,'APPLICATION-LICENSE.txt'));
  for(const filename of ['NOTICE','SECURITY.md','THIRD_PARTY.md'])await cp(path.join(root,filename),path.join(staging,filename));
  const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
  const components=[];
  for(const name of [...notices.modules,'electron']){const entry=lock.packages['node_modules/'+name];if(!entry)throw new Error('Missing SBOM lock entry: '+name);const purl='pkg:npm/'+name.replace('@','%40')+'@'+entry.version;const component={type:'library','bom-ref':purl,name,version:entry.version,purl,properties:[{name:'lv:native-code-staged',value:String(runtimeModules.includes(name)||name==='electron')},{name:'lv:inventory-scope',value:'Installed production tree plus Electron; renderer inclusion depends on actual bundle imports.'}]};if(entry.license)component.licenses=/\s(OR|AND|WITH)\s/.test(entry.license)?[{expression:entry.license}]:[{license:{id:entry.license}}];if(entry.integrity?.startsWith('sha512-'))component.hashes=[{alg:'SHA-512',content:Buffer.from(entry.integrity.slice(7),'base64').toString('hex')}];if(entry.resolved){const url=new URL(entry.resolved);if(url.username||url.password)throw new Error('Credential-bearing registry URL forbidden.');component.externalReferences=[{type:'distribution',url:entry.resolved}];}components.push(component);}
  const sbom={bomFormat:'CycloneDX',specVersion:'1.6',serialNumber:'urn:uuid:'+randomUUID(),version:1,metadata:{timestamp:new Date().toISOString(),component:{type:'application',name:packageJSON.productName,version:packageJSON.version,licenses:[{license:{id:packageJSON.license}}]},properties:[{name:'lv:buildId',value:buildId},{name:'lv:release-status',value:'Development artifact; native UI and required Git review branches pending.'}]},components};
  if(modifiedVela){const vela=components.find(component=>component.name==='@luxalgo/vela');if(!vela)throw new Error('Modified Vela component missing from SBOM');vela.properties.push({name:'lv:modification',value:modifiedVela.patchId},{name:'lv:modification-metadata',value:JSON.stringify(modifiedVela)},{name:'lv:registry-integrity-scope',value:'Original upstream archive; actual modified input/bundle SHA-256 values recorded separately.'});}
  await writeFile(path.join(staging,'sbom.json'),JSON.stringify(sbom,null,2));
  await writeFile(path.join(staging,'package.json'),JSON.stringify({name:packageJSON.name,productName:packageJSON.productName,version:packageJSON.version,main:packageJSON.main,description:packageJSON.description,license:packageJSON.license,homepage:packageJSON.homepage}));
  const build={schemaVersion:1,buildId,createdAt:new Date().toISOString(),version:packageJSON.version,electron:packageJSON.devDependencies.electron,platform:'win32',arch:'x64',commit:null,gitPrerequisite:'Required branches blocked by read-only Git metadata.',sourceHashes,runtimeDependencyHashes,noticeHashes:notices.hashes,noticeModules:notices.modules,modifications:modifiedVela?[modifiedVela]:[]};
  await writeFile(path.join(staging,'build-identity.json'),JSON.stringify(build,null,2));
  const packageOptions={dir:staging,out:destination,name:'OpenCandle',icon:path.join(root,'electron','assets','opencandle.ico'),platform:'win32',arch:'x64',electronVersion:packageJSON.devDependencies.electron,asar:true,prune:false,overwrite:false,download:{cacheRoot:path.join(root,'.cache','electron')},tmpdir:packageTemp,...packagerMetadataOptions()};
  let directory;let distribution=null;
  try{directory=(await packager(packageOptions))[0];}
  catch(error){const template=path.resolve(error.path||'');const allowed=path.join(packageTemp,'electron-packager')+path.sep;if(error.code!=='EPERM'||error.syscall!=='rename'||!template.startsWith(allowed)||!/^win32-x64-template-/.test(path.basename(template)))throw error;console.log('Public template directory rename denied; using checksum-verified copy packaging.');const copied=await copyDistribution(packageOptions,template,root);directory=copied.directory;distribution=copied.distribution;}
  const executable=path.join(directory,'OpenCandle.exe');
  for(const filename of ['APPLICATION-LICENSE.txt','NOTICE','SECURITY.md','THIRD_PARTY.md','THIRD-PARTY-NOTICES.txt','sbom.json'])await cp(path.join(staging,filename),path.join(directory,filename));
  for(const [target,source]of Object.entries(portableFiles)){await mkdir(path.dirname(path.join(directory,target)),{recursive:true});await writeFile(path.join(directory,target),portableContent.get(target));if(await hash(path.join(directory,target))!==sourceHashes[source])throw new Error('Portable original documentation/example differs from captured source: '+source);}
  if (FuseV1Options.WasmTrapHandlers === undefined) throw new Error('@electron/fuses must support all nine Electron 44 fuses (2.1.2 or newer).');
  const fuseConfig={version:FuseVersion.V1,strictlyRequireAllFuses:true,[FuseV1Options.RunAsNode]:false,[FuseV1Options.EnableCookieEncryption]:true,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,[FuseV1Options.EnableNodeCliInspectArguments]:false,[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,[FuseV1Options.OnlyLoadAppFromAsar]:true,[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]:false,[FuseV1Options.GrantFileProtocolExtraPrivileges]:false,[FuseV1Options.WasmTrapHandlers]:true};
  await flipFuses(executable,fuseConfig);
  const fuses=await getCurrentFuseWire(executable);
  const manifest={...build,distribution,portableFiles,directory:path.relative(root,directory),executableSha256:await hash(executable),asarSha256:await hash(path.join(directory,'resources','app.asar')),fuses,files:{},verification:{unit:'See test evidence; unit tests do not establish executable UI behavior.',native:'pending',releaseBranches:'blocked'}};
  for(const file of await files(directory)) manifest.files[file]={bytes:(await stat(path.join(directory,file))).size,sha256:await hash(path.join(directory,file))};
  await writeFile(path.join(directory,'build-manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(destination,'build-manifest.json'),JSON.stringify(manifest,null,2));
  const zip=path.join(destination,'OpenCandle-'+buildId+'-win32-x64.zip');
  const compressed=spawnSync('python',[path.join(root,'scripts/package-zip.py'),directory,zip,root],{encoding:'utf8',windowsHide:true});
  if(compressed.status!==0) throw new Error('ZIP creation failed: '+compressed.stderr);
  await writeFile(path.join(destination,'zip-sha256.txt'),await hash(zip)+'  '+path.basename(zip)+'\n');
  await writeFile(path.join(root,'out','latest.json'),JSON.stringify({buildId,directory,manifest:path.join(destination,'build-manifest.json'),zip},null,2));
  console.log(JSON.stringify({buildId,directory,zip,executableSha256:manifest.executableSha256,asarSha256:manifest.asarSha256}));
} finally { if(staging.startsWith(path.join(root,'.tmp')+path.sep)) await rm(staging,{recursive:true,force:true});if(packageTemp.startsWith(path.join(root,'.tmp')+path.sep))await rm(packageTemp,{recursive:true,force:true}).catch(()=>console.warn('Public package work directory cleanup failed; no captures or private profiles are stored there.')); }
