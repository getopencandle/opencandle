import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {spawnSync} from 'node:child_process';
import { listPackage, extractFile, getRawHeader } from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'resedit';
import { getCurrentFuseWire, FuseV1Options, FuseState } from '@electron/fuses';
import {retainedVelaNotice} from './package-vela-modification.mjs';
const latest=JSON.parse(await readFile('out/latest.json','utf8'));
const manifest=JSON.parse(await readFile(latest.manifest,'utf8'));
const exe=path.join(latest.directory,'OpenCandle.exe');
const asar=path.join(latest.directory,'resources','app.asar');
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const checks=[];
function check(name, passed) { checks.push({name,passed}); if(!passed) throw new Error('Package security check failed: '+name); }
check('executable SHA-256 matches manifest',await hash(exe)===manifest.executableSha256);
check('ASAR SHA-256 matches manifest',await hash(asar)===manifest.asarSha256);
const pe=NtExecutable.from(await readFile(exe));
const resources=NtExecutableResource.from(pe);
const integrityEntries=resources.entries.filter(entry=>entry.type==='INTEGRITY'&&entry.id==='ELECTRONASAR');
check('one embedded Electron ASAR integrity resource',integrityEntries.length===1);
const integrity=JSON.parse(Buffer.from(integrityEntries[0].bin).toString('utf8'));
const headerSha256=createHash('sha256').update(getRawHeader(asar).headerString).digest('hex');
check('embedded ASAR header integrity matches actual archive',integrity.length===1&&integrity[0].file.replaceAll('\\','/')==='resources/app.asar'&&integrity[0].alg==='SHA256'&&integrity[0].value===headerSha256);
const entries=listPackage(asar,{isPack:false}).map(value=>value.replaceAll('\\','/').replace(/^\//,''));
const runtimeModules=['quickjs-emscripten-core','@jitl/quickjs-wasmfile-release-sync','@jitl/quickjs-ffi-types'];
check('ASAR contains only whitelisted paths',entries.every(value=>['package.json','build-identity.json','THIRD-PARTY-NOTICES.txt','APPLICATION-LICENSE.txt','NOTICE','SECURITY.md','THIRD_PARTY.md','sbom.json','electron','dist','node_modules','node_modules/@jitl'].includes(value)||value.startsWith('electron/')||value.startsWith('dist/')||runtimeModules.some(module=>value==='node_modules/'+module||value.startsWith('node_modules/'+module+'/'))));
for(const filename of ['electron/main.cjs','electron/preload.cjs','dist/index.html']) check('ASAR includes '+filename,entries.includes(filename));
// The keyless synthetic Alpaca stub ships for the exe harness only. Prove the shipped bytes, its gates, and that
// nothing outside the main process can name or select it.
{
 const stubName='electron/alpaca-stub.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+stubName,entries.includes(stubName));
 check('Alpaca stub matches the manifest source hash',typeof manifest.sourceHashes[stubName]==='string'&&createHash('sha256').update(extractFile(asar,path.normalize(stubName))).digest('hex')===manifest.sourceHashes[stubName]);
 const mainText=archiveText('electron/main.cjs'),stubText=archiveText(stubName);
 check('main.cjs requires the Alpaca stub exactly once',(mainText.match(/require\(['"]\.\/alpaca-stub\.cjs['"]\)/g)??[]).length===1);
 check('main.cjs requires the Alpaca stub only inside the LV_ALPACA_STUB branch and passes packaged: app.isPackaged',/if\(env\.LV_ALPACA_STUB\)\{[^\n]*?require\('\.\/alpaca-stub\.cjs'\)\.alpacaStubTransport\(\{env,packaged:app\.isPackaged===true,/.test(mainText));
 check('Alpaca stub keeps the packaged harness gate',stubText.includes("HARNESS_FLAG='LV_EXE_HARNESS',HARNESS_VALUE='alpaca-stub'")&&stubText.includes('if(packaged&&env[HARNESS_FLAG]!==HARNESS_VALUE)return {mode:\'blocked\''));
 check('Alpaca stub keeps the throwaway-profile gate',stubText.includes('if(!profileUnderTemp(profile,tmpdir))return {mode:\'blocked\''));
 const stubRequires=[...stubText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]);
 check('Alpaca stub requires only ./validation.cjs and ./public-alpaca.cjs',stubRequires.length===2&&stubRequires.includes('./validation.cjs')&&stubRequires.includes('./public-alpaca.cjs')&&!/\bimport\s*\(/.test(stubText));
 check('Alpaca stub has no network, Electron or global fetch access',!/globalThis\.fetch|require\(\s*['"`](?:node:)?(?:electron|http|https|net|tls|dgram|child_process)['"`]|https:\/\/|wss:\/\//.test(stubText));
 for(const name of ['electron/preload.cjs',...Object.keys(manifest.sourceHashes).filter(file=>file.startsWith('dist/')&&file.endsWith('.js'))])check('no Alpaca stub selector or credential in '+name,!/LV_ALPACA_STUB|LV_EXE_HARNESS|STUB_KEYS/.test(archiveText(name)));
}

// Notification-area mode. The tray module ships with the manifest hash, needs only ./validation.cjs, has no
// network, process or shell access, and main.cjs loads it only where Electron offers a Tray. Its two IPC channels sit in the
// owner-approved 2026-10-29: cache compiled code on first launch (v8CacheOptions bypassHeatCheck).
// trusted handler table, and the main window keeps the hardened web preferences (only backgroundThrottling is added).
// Older manifests without the module keep their historical scope.
if(Object.hasOwn(manifest.sourceHashes,'electron/tray.cjs')){
 const trayName='electron/tray.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+trayName,entries.includes(trayName));
 check('tray module matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(trayName))).digest('hex')===manifest.sourceHashes[trayName]);
 const trayText=archiveText(trayName),mainText=archiveText('electron/main.cjs');
 const trayRequires=[...trayText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]);
 check('tray module requires only ./validation.cjs',trayRequires.length===1&&trayRequires[0]==='./validation.cjs'&&!/\bimport\s*\(/.test(trayText));
 check('tray module has no network, process or shell access',!/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|child_process|openExternal/.test(trayText));
 check('main.cjs loads the tray module once, only behind the Tray capability',(mainText.match(/require\(['"]\.\/tray\.cjs['"]\)/g)??[]).length===1&&mainText.includes("const trayModule = typeof Tray === 'function' && !automationSession ? require('./tray.cjs') : null;"));
 check('main.cjs registers lv:tray:set and lv:app:quit in the trusted handler table',mainText.includes("'lv:tray:set': async value =>")&&mainText.includes("'lv:app:quit': async value =>"));
 check('main window keeps the hardened web preferences',mainText.includes("webPreferences:{ preload:path.join(__dirname, 'preload.cjs'), contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true, allowRunningInsecureContent:false, devTools:false, backgroundThrottling:false, v8CacheOptions:'bypassHeatCheck' }"));
}

// Layout windows ("Open layout in new window"). The registry ships with the manifest hash, needs only
// ./validation.cjs, has no network, process, shell or window-creation access, and main.cjs loads it once, lazily. Every
// window is built by one function with the hardened web preferences and denies window.open, navigation and webviews. A
// layout window is trusted only for a fixed channel subset that excludes every workspace write, the key, notifications,
// the tray, quitting and opening windows. Older manifests without the module keep their historical scope.
if(Object.hasOwn(manifest.sourceHashes,'electron/windows.cjs')){
 const windowsName='electron/windows.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+windowsName,entries.includes(windowsName));
 check('window registry matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(windowsName))).digest('hex')===manifest.sourceHashes[windowsName]);
 const windowsText=archiveText(windowsName),mainText=archiveText('electron/main.cjs'),preloadText=archiveText('electron/preload.cjs');
 const windowsRequires=[...windowsText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]);
 check('window registry requires only ./validation.cjs',windowsRequires.length===1&&windowsRequires[0]==='./validation.cjs'&&!/\bimport\s*\(/.test(windowsText));
 check('window registry has no network, process, shell or window-creation access',!/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|require\(\s*['"`]electron['"`]\s*\)|new BrowserWindow/.test(windowsText));
 check('main.cjs loads the window registry once, lazily',(mainText.match(/require\(['"]\.\/windows\.cjs['"]\)/g)??[]).length===1&&/function windows\(\)\{\s*if\(!windowRegistry\)\{\s*const \{createWindowRegistry\}=require\('\.\/windows\.cjs'\);/.test(mainText));
 check('main.cjs builds every window in one place with the hardened web preferences',(mainText.match(/new BrowserWindow\(/g)??[]).length===1&&mainText.includes("function createAppWindow(options){return new BrowserWindow({...options, webPreferences:{ preload:path.join(__dirname, 'preload.cjs'), contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true, allowRunningInsecureContent:false, devTools:false, backgroundThrottling:false, v8CacheOptions:'bypassHeatCheck' } });}"));
 check('every window denies window.open, navigation and webviews',mainText.includes("window.webContents.setWindowOpenHandler(() => ({action:'deny'}));")&&mainText.includes("window.webContents.on('will-navigate', event => event.preventDefault());")&&mainText.includes("window.webContents.on('will-attach-webview', event => event.preventDefault());")&&mainText.includes('hardenWindow(mainWindow);')&&mainText.includes('const window=hardenWindow(createAppWindow({'));
 check('a layout window is trusted only for its fixed channel subset, by sender, main frame and app origin',mainText.includes("if (!trusted(event)) { if (!windowRegistry?.trustedSecondary(event, channel)) throw new validation.BoundaryError('DENIED', 'Untrusted sender.'); }")&&windowsText.includes('event.senderFrame !== entry.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url)'));
 const secondaryList=windowsText.match(/const SECONDARY_CHANNELS = Object\.freeze\(\[([\s\S]*?)\]\);/),secondaryChannels=secondaryList?[...secondaryList[1].matchAll(/'([^']+)'/g)].map(match=>match[1]):[];
 check('layout windows cannot write the workspace, touch the key, notify, use the tray, quit or open windows',secondaryChannels.length>0&&['lv:workspace:save','lv:workspace:reset','lv:workspace:export','lv:bars:import','lv:data:import','lv:alpaca:key-save','lv:alpaca:key-clear','lv:alpaca:test','lv:barcache:clear','lv:alert:notify','lv:alert:webhook','lv:tray:set','lv:app:quit','lv:window:open-layout','lv:window:list','lv:window:layout-saved','lv:startup:open-symbol','lv:startup:open-symbols'].every(channel=>!secondaryChannels.includes(channel)));
 for(const channel of ['lv:window:open-layout','lv:window:list','lv:window:layout-save','lv:window:layout-saved']){
  check('main.cjs registers '+channel+' in the trusted handler table',mainText.includes("'"+channel+"': async"));
  check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
 }
 // A layout window may relay a paper action to the main window, but never answer one or reload windows, and
 // its workspace-wide save fields never include layouts, watchlists, alerts, paper trading or imports.
 if(windowsText.includes("'lv:window:paper-action'")){
  check('layout windows cannot answer paper actions or reload windows',secondaryChannels.includes('lv:window:paper-action')&&!secondaryChannels.includes('lv:window:paper-done')&&!secondaryChannels.includes('lv:window:refresh'));
  for(const channel of ['lv:window:paper-action','lv:window:paper-done','lv:window:refresh']){
   check('main.cjs registers '+channel+' in the trusted handler table',mainText.includes("'"+channel+"': async"));
   check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
  }
  const sharedList=windowsText.match(/const SHARED_WORKSPACE_KEYS = Object\.freeze\(\[([^\]]*)\]\);/),sharedKeys=sharedList?[...sharedList[1].matchAll(/'([^']+)'/g)].map(match=>match[1]):[];
  check('layout window saves carry no layouts, watchlists, alerts, paper or imports',sharedKeys.length>0&&['layoutLibrary','grid','watchBook','watchAdvanced','listAlerts','alerts','paper','paperBook','imports'].every(key=>!sharedKeys.includes(key)));
 }
 // The toolbar Fullscreen button's one new channel. HTML requestFullscreen stays refused by the deny-all permission
 // handler; instead lv:window:fullscreen takes no input and toggles only the sender's own window (the main window or a registered
 // layout window), answering just the resulting state. Preload passes no renderer argument.
 if(mainText.includes("'lv:window:fullscreen'")){
  check('lv:window:fullscreen takes no input and toggles only the sender window',mainText.includes("'lv:window:fullscreen': async (value,event) => { noInput(value); const window = (event && windowRegistry?.windowOf(event)) || mainWindow; if (!window || window.isDestroyed()) throw new validation.BoundaryError('UNAVAILABLE', 'There is no window to put in full screen.'); window.setFullScreen(!window.isFullScreen()); return { fullScreen:window.isFullScreen() }; },"));
  check('preload invokes lv:window:fullscreen as a fixed channel with no input',preloadText.includes("toggleFullScreen: () => invoke('lv:window:fullscreen'),"));
  check('a layout window may toggle its own full screen',secondaryChannels.includes('lv:window:fullscreen'));
  check('every web permission request and check is still denied',mainText.includes("session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));")&&mainText.includes('session.defaultSession.setPermissionCheckHandler(() => false);'));
 }
}

// Wick mode, the always-on-top strip of layout tabs. The controller ships with the manifest hash, needs only
// ./validation.cjs, has no network, process, shell or window-creation access (main.cjs builds the strip window with
// createAppWindow and hardenWindow, so it keeps the hardened web preferences), and main.cjs loads it once, lazily. The strip
// window is trusted only for its own four channels, by sender, main frame and app origin, in a handler loop of its own; the
// main window's channels stay in the trusted table, which layout windows cannot use. Older manifests keep their scope.
if(Object.hasOwn(manifest.sourceHashes,'electron/wick.cjs')){
 const wickName='electron/wick.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+wickName,entries.includes(wickName));
 check('Wick mode controller matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(wickName))).digest('hex')===manifest.sourceHashes[wickName]);
 const wickText=archiveText(wickName),mainText=archiveText('electron/main.cjs'),preloadText=archiveText('electron/preload.cjs');
 const wickRequires=[...wickText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]);
 check('Wick mode controller requires only ./validation.cjs',wickRequires.length===1&&wickRequires[0]==='./validation.cjs'&&!/\bimport\s*\(/.test(wickText));
 check('Wick mode controller has no network, process, shell or window-creation access',!/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|require\(\s*['"`]electron['"`]\s*\)|new BrowserWindow/.test(wickText));
 check('main.cjs loads the Wick mode controller once, lazily',(mainText.match(/require\(['"]\.\/wick\.cjs['"]\)/g)??[]).length===1&&/function wick\(\)\{\s*if\(!wickMode\)\{\s*const \{createWickMode,WICK_STATE_FILE\}=require\('\.\/wick\.cjs'\);/.test(mainText));
 check('the Wick mode strip window is built by createAppWindow and hardenWindow',mainText.includes('createWindow:options=>{const window=hardenWindow(createAppWindow({...options,')&&(mainText.match(/new BrowserWindow\(/g)??[]).length===1);
 check('the strip window is trusted only for its own channels, by sender, main frame and app origin',mainText.includes("try { if (!wickMode?.trustedStrip(event, channel)) throw new validation.BoundaryError('DENIED', 'Untrusted sender.');")&&wickText.includes('event.sender !== strip.webContents || event.senderFrame !== strip.webContents.mainFrame')&&wickText.includes('isAppURL(event.senderFrame?.url) && STRIP_CHANNELS.includes(channel)'));
 const stripList=wickText.match(/const STRIP_CHANNELS = Object\.freeze\(\[([^\]]*)\]\);/),stripChannels=stripList?[...stripList[1].matchAll(/'([^']+)'/g)].map(match=>match[1]):[];
 check('the strip window channels are exactly ready, restore, select-tab and menu',stripChannels.length===4&&['lv:wick:ready','lv:wick:restore','lv:wick:select-tab','lv:wick:menu'].every(channel=>stripChannels.includes(channel)));
 for(const channel of ['lv:wick:enter','lv:wick:exit','lv:wick:configure','lv:wick:publish']){
  check('main.cjs registers '+channel+' in the trusted handler table',mainText.includes("'"+channel+"': async"));
  check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
 }
 for(const channel of ['lv:wick:ready','lv:wick:restore','lv:wick:select-tab','lv:wick:menu'])check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
 if(Object.hasOwn(manifest.sourceHashes,'electron/windows.cjs')){
  const secondaryList=archiveText('electron/windows.cjs').match(/const SECONDARY_CHANNELS = Object\.freeze\(\[([\s\S]*?)\]\);/),secondaryChannels=secondaryList?[...secondaryList[1].matchAll(/'([^']+)'/g)].map(match=>match[1]):[];
  check('layout windows cannot use Wick mode channels',!secondaryChannels.some(channel=>channel.startsWith('lv:wick:')));
 }
}

// Data sources > Where your settings are saved. The helper module ships with the manifest hash, needs only
// node:path and ./validation.cjs, has no network, process, shell or Electron access, and holds no key. Its four channels sit in
// the trusted handler table, take no path from the renderer, and are refused to layout windows. Older manifests keep their scope.
if(Object.hasOwn(manifest.sourceHashes,'electron/data-sources.cjs')){
 const sourcesName='electron/data-sources.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+sourcesName,entries.includes(sourcesName));
 check('data sources module matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(sourcesName))).digest('hex')===manifest.sourceHashes[sourcesName]);
 const sourcesText=archiveText(sourcesName),mainText=archiveText('electron/main.cjs'),preloadText=archiveText('electron/preload.cjs'),windowsText=archiveText('electron/windows.cjs');
 const sourcesRequires=[...sourcesText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]).sort();
 check('data sources module requires only node:path and ./validation.cjs',JSON.stringify(sourcesRequires)===JSON.stringify(['./validation.cjs','node:path'])&&!/\bimport\s*\(/.test(sourcesText));
 check('data sources module has no network, process, shell or Electron access',!/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|safeStorage/.test(sourcesText));
 const channels=['lv:datasources:info','lv:datasources:open-folder','lv:datasources:export','lv:datasources:import'];
 for(const channel of channels){
  check('main.cjs registers '+channel+' in the trusted handler table',mainText.includes("'"+channel+"': async"));
  check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
 }
 check('Open folder opens only the profile folder, never a renderer path',mainText.includes("const directory=app.getPath('userData');await fs.mkdir(directory,{recursive:true});const failure=await require('electron').shell.openPath(directory);"));
 const sourcesSecondary=windowsText.match(/const SECONDARY_CHANNELS = Object\.freeze\(\[([\s\S]*?)\]\);/),sourcesChannels=sourcesSecondary?[...sourcesSecondary[1].matchAll(/'([^']+)'/g)].map(match=>match[1]):[];
 check('layout windows cannot use the data sources channels',sourcesSecondary!==null&&channels.every(channel=>!sourcesChannels.includes(channel)));
}

// Keyless FRED economic data. The module ships with the manifest hash, needs only Node's fs, path and crypto plus
// ./validation.cjs, talks only to fred.stlouisfed.org with no key, caps ids, bodies and the cache, and its channels sit in the
// trusted handler table. A layout window may read a series but never the cache status or clear. Older manifests keep their scope.
if(Object.hasOwn(manifest.sourceHashes,'electron/public-fred.cjs')){
 const fredName='electron/public-fred.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+fredName,entries.includes(fredName));
 check('FRED module matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(fredName))).digest('hex')===manifest.sourceHashes[fredName]);
 const fredText=archiveText(fredName),mainText=archiveText('electron/main.cjs'),preloadText=archiveText('electron/preload.cjs'),windowsText=archiveText('electron/windows.cjs');
 const fredRequires=[...fredText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]).sort();
 check('FRED module requires only node:crypto, node:fs/promises, node:path and ./validation.cjs',JSON.stringify(fredRequires)===JSON.stringify(['./validation.cjs','node:crypto','node:fs/promises','node:path'])&&!/\bimport\s*\(/.test(fredText)&&!/child_process|openExternal|WebSocket/.test(fredText));
 const fredOrigins=[...fredText.matchAll(/https?:\/\/[^\/'"`\s)]+/g)].map(match=>match[0]);
 check('FRED module reaches only https://fred.stlouisfed.org',fredOrigins.length>0&&fredOrigins.every(origin=>origin==='https://fred.stlouisfed.org'));
 check('FRED requests carry no key, token, cookie or credentials and refuse redirects',!/api_key|apikey|authorization|x-api-key|cookie|bearer/i.test(fredText)&&fredText.includes("redirect:'manual'")&&fredText.includes("credentials:'omit'"));
 check('FRED series ids are validated strictly and bodies and the cache are capped',fredText.includes('const SERIES_ID=/^[A-Z0-9_]{1,25}$/;')&&fredText.includes('const MAX_RESPONSE_BYTES=4*1024*1024;')&&fredText.includes('const MAX_CACHE_BYTES=5*1024*1024;')&&fredText.includes('const TIMEOUT_MS=15000;'));
 check('FRED cache writes are atomic (temp file then rename)',fredText.includes('fs.rename(temp,file)'));
 for(const channel of ['lv:fred:series','lv:fred:status','lv:fred:clear'])check('main.cjs registers '+channel+' in the trusted handler table',mainText.includes("'"+channel+"': async"));
 for(const channel of ['lv:fred:series','lv:fred:status','lv:fred:clear'])check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
 if(windowsText.includes("'lv:fred:series'")){
  const fredSecondary=windowsText.match(/const SECONDARY_CHANNELS = Object\.freeze\(\[([\s\S]*?)\]\);/),fredChannels=fredSecondary?[...fredSecondary[1].matchAll(/'([^']+)'/g)].map(match=>match[1]):[];
  check('layout windows may read a FRED series but never its cache status or clear',fredChannels.includes('lv:fred:series')&&!fredChannels.includes('lv:fred:status')&&!fredChannels.includes('lv:fred:clear'));
 }
}

// The local bar cache. The module ships with the manifest hash, needs only Node's fs, path and crypto plus
// ./validation.cjs, has no network, process or shell access, and main.cjs loads it once, lazily, with the stub namespace
// gate. Its five channels sit in the trusted handler table; preload exposes them as fixed data-only calls. Older manifests
// without the module keep their historical scope.
if(Object.hasOwn(manifest.sourceHashes,'electron/bar-cache.cjs')){
 const cacheName='electron/bar-cache.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+cacheName,entries.includes(cacheName));
 check('bar cache module matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(cacheName))).digest('hex')===manifest.sourceHashes[cacheName]);
 const cacheText=archiveText(cacheName),mainText=archiveText('electron/main.cjs'),preloadText=archiveText('electron/preload.cjs');
 const cacheRequires=[...cacheText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]).sort();
 check('bar cache module requires only node:crypto, node:fs/promises, node:path and ./validation.cjs',JSON.stringify(cacheRequires)===JSON.stringify(['./validation.cjs','node:crypto','node:fs/promises','node:path'])&&!/\bimport\s*\(/.test(cacheText));
 check('bar cache module has no network, process or shell access',!/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|require\(\s*['"`]electron['"`]\s*\)/.test(cacheText));
 check('main.cjs loads the bar cache once, lazily, with the stub namespace gate',(mainText.match(/require\(['"]\.\/bar-cache\.cjs['"]\)/g)??[]).length===1&&mainText.includes("allowedProviders:stub?(stub.mode==='synthetic'?['alpaca-stub']:[]):['alpaca-iex']"));
 for(const channel of ['lv:barcache:read','lv:barcache:write','lv:barcache:discard','lv:barcache:status','lv:barcache:clear']){
  check('main.cjs registers '+channel+' in the trusted handler table',mainText.includes("'"+channel+"': async value =>"));
  check('preload invokes '+channel+' as a fixed channel',preloadText.includes("invoke('"+channel+"'"));
 }
 // The Coinbase namespace rides only on the real Alpaca namespace, never on the stub namespace.
 check('bar cache admits coinbase-public only beside the real alpaca-iex namespace',cacheText.includes("const REAL_COMPANIONS=Object.freeze({'alpaca-iex':Object.freeze(['coinbase-public'])});")&&!/['"]alpaca-stub['"]\s*:/.test(cacheText));
}

// The exe-harness image (Image tool sweep). The module ships with the manifest hash, has no require at all (no
// file, network, process or shell access), keeps the env, throwaway-profile and packaged LV_EXE_HARNESS gates, and main.cjs
// loads it only inside the LV_IMAGE_HARNESS branch of one fixed trusted channel. No renderer bundle or preload names the gate.
if(Object.hasOwn(manifest.sourceHashes,'electron/image-harness.cjs')){
 const harnessName='electron/image-harness.cjs',archiveText=name=>extractFile(asar,path.normalize(name)).toString('utf8');
 check('ASAR includes '+harnessName,entries.includes(harnessName));
 check('image harness module matches the manifest source hash',createHash('sha256').update(extractFile(asar,path.normalize(harnessName))).digest('hex')===manifest.sourceHashes[harnessName]);
 const harnessText=archiveText(harnessName),mainText=archiveText('electron/main.cjs'),preloadText=archiveText('electron/preload.cjs');
 check('image harness module requires nothing',![...harnessText.matchAll(/require\(/g)].length&&!/\bimport\s*\(/.test(harnessText));
 check('image harness module has no network, process or shell access',!/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal/.test(harnessText));
 check('image harness keeps the packaged LV_EXE_HARNESS gate',harnessText.includes("HARNESS_FLAG='LV_EXE_HARNESS',HARNESS_VALUE='image-inject'")&&harnessText.includes("if(packaged&&env[HARNESS_FLAG]!==HARNESS_VALUE)return {mode:'blocked'"));
 check('image harness keeps the env and throwaway-profile gates',harnessText.includes("HARNESS_IMAGE_FLAG='LV_IMAGE_HARNESS',HARNESS_IMAGE_VALUE='synthetic-png'")&&harnessText.includes("if(!requested)return {mode:'off'")&&harnessText.includes("if(!profileUnderTemp(profile,tmpdir))return {mode:'blocked'")&&harnessText.includes("if(!decision||decision.mode!=='synthetic')return null;"));
 check('main.cjs requires the image harness exactly once, only inside the LV_IMAGE_HARNESS branch, with packaged: app.isPackaged',(mainText.match(/require\(['"]\.\/image-harness\.cjs['"]\)/g)??[]).length===1&&/'lv:harness:image': async value => \{ noInput\(value\); const env=[^\n]*?if\(!env\.LV_IMAGE_HARNESS\)return null; const harness=require\('\.\/image-harness\.cjs'\)[^\n]*?packaged:app\.isPackaged===true,/.test(mainText));
 check('preload invokes lv:harness:image as a fixed channel with no input',preloadText.includes("harnessImage: () => invoke('lv:harness:image'),"));
 for(const name of ['electron/preload.cjs',...Object.keys(manifest.sourceHashes).filter(file=>file.startsWith('dist/')&&file.endsWith('.js'))])check('no image harness selector in '+name,!/LV_IMAGE_HARNESS|image-inject|synthetic-png/.test(archiveText(name)));
}

// One brand. The OpenCandle icon set (generated by scripts/generate-opencandle-icons.py from Logo-clean.png) and
// its notice ship in the ASAR; the pre-rename bitmaps never do. Audits captured package bytes only; this does not claim
// native icon or About execution.
{
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),archiveBytes=name=>extractFile(asar,path.normalize(name));
 const brandAssets=['opencandle.ico','opencandle-256.png','opencandle-logo-512.png','opencandle-mark-64.png','opencandle-favicon-32.png','opencandle-tray-16.png','opencandle-tray-20.png','opencandle-tray-24.png','opencandle-tray-32.png','BRANDING-NOTICE.txt'].map(name=>'electron/assets/'+name);
 check('OpenCandle icon recipe and source logo are captured',['scripts/generate-opencandle-icons.py','Logo-clean.png'].every(file=>typeof manifest.sourceHashes[file]==='string'));
 check('OpenCandle brand assets are in ASAR and match captured source',brandAssets.every(name=>entries.includes(name)&&typeof manifest.sourceHashes[name]==='string'&&digest(archiveBytes(name))===manifest.sourceHashes[name]));
 check('branding notice reserves the OpenCandle name and logo outside the code license',archiveBytes('electron/assets/BRANDING-NOTICE.txt').toString('utf8').includes('not covered by the software license'));
 const legacy=['electron/assets/larryvision-logo.png','electron/assets/NOTICE.txt','electron/assets/larryvision-mark.png','electron/assets/larryvision-mark.svg','electron/assets/ORIGINAL-BRANDING-NOTICE.txt'];
 check('package excludes the pre-rename brand files',legacy.every(name=>!entries.includes(name)&&!Object.hasOwn(manifest.sourceHashes,name)));
 check('renderer excludes the legacy owner bitmap bytes',!Object.entries(manifest.sourceHashes).some(([name,sha256])=>name.startsWith('dist/')&&sha256==='5da167b4bbae9f4c6b361bd2c2813167e1e7d0a8e2759e8a2660556b583927ca'));
 const bundles=Object.keys(manifest.sourceHashes).filter(name=>name.startsWith('dist/')&&name.endsWith('.js'));
 for(const asset of ['electron/assets/opencandle-logo-512.png','electron/assets/opencandle-mark-64.png']){
  const emitted=Object.keys(manifest.sourceHashes).filter(name=>name.startsWith('dist/')&&name.endsWith('.png')&&manifest.sourceHashes[name]===manifest.sourceHashes[asset]);
  check('renderer emits '+asset,emitted.length>0&&emitted.every(name=>entries.includes(name)&&digest(archiveBytes(name))===manifest.sourceHashes[asset]));
  const referenced=emitted.some(file=>bundles.some(bundle=>{
   const text=archiveBytes(bundle).toString('utf8'),relative=file.slice('dist/'.length),fromBundle=path.posix.relative(path.posix.dirname(bundle),file);
   return ['/'+relative,'./'+relative,relative,fromBundle,'./'+fromBundle].some(value=>['"',"'",'`'].some(quote=>text.includes(quote+value+quote)));
  }));
  check('compiled renderer references the emitted '+asset,referenced);
 }
}

const wire=await getCurrentFuseWire(exe);
for(const option of [FuseV1Options.RunAsNode,FuseV1Options.EnableNodeOptionsEnvironmentVariable,FuseV1Options.EnableNodeCliInspectArguments,FuseV1Options.GrantFileProtocolExtraPrivileges,FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]) check('fuse disabled: '+FuseV1Options[option],wire[option]===FuseState.DISABLE);
for(const option of [FuseV1Options.EnableCookieEncryption,FuseV1Options.EnableEmbeddedAsarIntegrityValidation,FuseV1Options.OnlyLoadAppFromAsar,FuseV1Options.WasmTrapHandlers]) check('fuse enabled: '+FuseV1Options[option],wire[option]===FuseState.ENABLE);
const identity=JSON.parse(extractFile(asar,'build-identity.json').toString('utf8'));
check('archive identity matches build',identity.buildId===manifest.buildId);
check('blocked commit is explicit',identity.commit===null);
for(const [name,item] of Object.entries(manifest.files))check('packaged file hash: '+name,await hash(path.join(latest.directory,name))===item.sha256);
async function actualFiles(directory,prefix=''){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){check('no portable symlink: '+prefix+entry.name,!entry.isSymbolicLink());const relative=prefix+entry.name;if(entry.isDirectory())result.push(...await actualFiles(path.join(directory,entry.name),relative+'/'));else result.push(relative);}return result;}
const inventory=await actualFiles(latest.directory);
check('portable folder exactly matches manifest inventory',JSON.stringify(inventory.sort())===JSON.stringify([...Object.keys(manifest.files),'build-manifest.json'].sort()));
const allowedPortableFiles={'README.md':'docs/portable-quickstart.md','docs/news-import.md':'docs/news-import.md','docs/candlescript.md':'docs/candlescript.md','docs/watchlist-import.md':'docs/watchlist-import.md',...(Object.hasOwn(manifest.sourceHashes,'docs/watchlist-advanced-import.md')?{'docs/watchlist-advanced-import.md':'docs/watchlist-advanced-import.md'}:{}),...(Object.hasOwn(manifest.sourceHashes,'docs/workspace-import.md')?{'docs/workspace-import.md':'docs/workspace-import.md'}:{}),...(Object.hasOwn(manifest.sourceHashes,'docs/layout-library.md')?{'docs/layout-library.md':'docs/layout-library.md'}:{}),'docs/provider-sec.md':'docs/provider-sec.md',...(Object.hasOwn(manifest.sourceHashes,'docs/fundamentals.md')?{'docs/fundamentals.md':'docs/fundamentals.md'}:{}),'docs/provider-sec-submissions.md':'docs/provider-sec-submissions.md','examples/news-synthetic.json':'examples/news-synthetic.json',...(Object.hasOwn(manifest.sourceHashes,'examples/companyfacts-LVDEMO-synthetic.json')?{'examples/companyfacts-LVDEMO-synthetic.json':'examples/companyfacts-LVDEMO-synthetic.json'}:{}),...(Object.hasOwn(manifest.sourceHashes,'examples/watchlist-advanced-synthetic.json')?{'examples/watchlist-advanced-synthetic.json':'examples/watchlist-advanced-synthetic.json'}:{}),...(Object.hasOwn(manifest.sourceHashes,'examples/bars-GME-synthetic-daily.csv')?{'examples/bars-GME-synthetic-daily.csv':'examples/bars-GME-synthetic-daily.csv','examples/bars-SPY-synthetic-daily.json':'examples/bars-SPY-synthetic-daily.json','examples/bars-LVDEMO-synthetic-5m.csv':'examples/bars-LVDEMO-synthetic-5m.csv','examples/bars-PRACTICE-synthetic-mistakes.csv':'examples/bars-PRACTICE-synthetic-mistakes.csv'}:{})};
if(manifest.modifications?.length)Object.assign(allowedPortableFiles,{'modifications/vela/apply-vela-magnet-patch.mjs':'src/chart/apply-vela-magnet-patch.mjs','modifications/vela/vela-magnet-patch-plan.json':'src/chart/vela-magnet-patch-plan.json','docs/vela-modification.md':'docs/vela-modification.md'});
if(manifest.modifications?.some(item=>['LV-VELA-COMPAT-2','LV-VELA-COMPAT-3','LV-VELA-COMPAT-4','LV-VELA-COMPAT-5','LV-VELA-COMPAT-6','LV-VELA-COMPAT-7','LV-VELA-COMPAT-8','LV-VELA-COMPAT-9','LV-VELA-COMPAT-10','LV-VELA-COMPAT-11'].includes(item.patchId)))Object.assign(allowedPortableFiles,{'modifications/vela/apply-vela-compat-patch.mjs':'src/chart/apply-vela-compat-patch.mjs','modifications/vela/vela-compat-patch-plan.json':'src/chart/vela-compat-patch-plan.json'});
if(manifest.modifications?.some(item=>item.buildComposition?.extensionId==='LV-VELA-FUTURE-CALENDAR-1'))Object.assign(allowedPortableFiles,{'modifications/vela-calendar/vela-future-calendar-plan.json':'src/chart/vela-future-calendar-plan.json','modifications/vela-calendar/vela-future-calendar-steps.mjs':'src/chart/vela-future-calendar-steps.mjs','modifications/vela-calendar/generate-vela-future-calendar-plan.mjs':'src/chart/generate-vela-future-calendar-plan.mjs','modifications/vela-calendar/vela-future-calendar-transform.mjs':'src/chart/vela-future-calendar-transform.mjs','modifications/vela-calendar/vela-future-calendar-transform.d.mts':'src/chart/vela-future-calendar-transform.d.mts','modifications/vela-calendar/vela-future-calendar.d.ts':'src/chart/vela-future-calendar.d.ts'});
if(manifest.modifications?.some(item=>item.inputFeel?.transformId==='LV-VELA-INPUT-FEEL-1'))Object.assign(allowedPortableFiles,{'modifications/vela-input-feel/vela-input-feel-transform.mjs':'src/chart/vela-input-feel-transform.mjs','modifications/vela-input-feel/vela-input-feel-transform.d.mts':'src/chart/vela-input-feel-transform.d.mts'});
Object.assign(allowedPortableFiles,{'docs/original-branding.md':'docs/original-branding.md'});
if(manifest.portableFiles){check('user documentation/example allowlist is exact',JSON.stringify(manifest.portableFiles)===JSON.stringify(allowedPortableFiles));for(const [target,source]of Object.entries(manifest.portableFiles))check('portable user file matches captured source: '+target,manifest.files[target].sha256===manifest.sourceHashes[source]);const example=JSON.parse(await readFile(path.join(latest.directory,'examples/news-synthetic.json'),'utf8'));check('portable news example is explicitly synthetic',example.kind==='synthetic'&&example.items.every(item=>item.title.startsWith('SYNTHETIC TEST:')));}
if(manifest.portableFiles?.['examples/companyfacts-LVDEMO-synthetic.json']){const bytes=await readFile(path.join(latest.directory,'examples/companyfacts-LVDEMO-synthetic.json'));check('portable companyfacts example is the reviewed synthetic fixture',createHash('sha256').update(bytes).digest('hex')==='4dcd0e33528f2c24c59ec489a787009308539d4decd581de9aa98f2e0c5056e2'&&JSON.parse(bytes.toString('utf8')).entityName==='LV SYNTHETIC DEMO COMPANY');}
if(manifest.portableFiles?.['examples/watchlist-advanced-synthetic.json']){const example=JSON.parse(await readFile(path.join(latest.directory,'examples/watchlist-advanced-synthetic.json'),'utf8'));check('portable advanced example is explicitly synthetic',example.schemaVersion===1&&example.observations.length===3&&example.observations.every(row=>row.id.startsWith('SYNTHETIC-')&&row.market.synthetic===true&&row.source.fixture===true));const guide=await readFile(path.join(latest.directory,'docs/watchlist-advanced-import.md'),'utf8');check('portable advanced guide links original shipped example',guide.includes('../examples/watchlist-advanced-synthetic.json')&&!guide.includes('(watchlist-advanced-contract.md)'));}
if(manifest.portableFiles?.['examples/bars-GME-synthetic-daily.csv']){for(const name of ["bars-GME-synthetic-daily.csv","bars-SPY-synthetic-daily.json","bars-LVDEMO-synthetic-5m.csv","bars-PRACTICE-synthetic-mistakes.csv"]){const content=await readFile(path.join(latest.directory,'examples',name),'utf8');const lines=content.trim().split(/\r?\n/);check('portable bar example is explicitly synthetic: '+name,name.endsWith('.json')?JSON.parse(content).fixture==='SYNTHETIC EXAMPLE - not market data':lines.length>1&&lines.slice(1).every(line=>/,SYNTHETIC (EXAMPLE - not market data|PRACTICE - deliberate mistakes)$/.test(line)));}}
const zipExpected=(await readFile(path.join(path.dirname(latest.manifest),'zip-sha256.txt'),'utf8')).trim().split(/\s+/)[0];
check('portable ZIP SHA-256 matches release record',await hash(latest.zip)===zipExpected);
const verifiedZip=spawnSync('python',['scripts/security-portable-zip.py','--manifest',latest.manifest,'--zip',latest.zip],{encoding:'utf8',windowsHide:true,timeout:60000});
check('portable ZIP content verification completed',verifiedZip.status===0);
const zipInventory=JSON.parse(verifiedZip.stdout);
check('portable ZIP every file matches captured manifest',zipInventory.buildId===manifest.buildId&&zipInventory.allFileHashesMatch===true&&zipInventory.verifiedFiles===Object.keys(manifest.files).length+1);
const sbom=JSON.parse(extractFile(asar,'sbom.json').toString('utf8'));
for(const modification of manifest.modifications??[]){
 const leftovers=modification.patchId==='LV-VELA-COMPAT-11',groups=leftovers||modification.patchId==='LV-VELA-COMPAT-10',forward=groups||modification.patchId==='LV-VELA-COMPAT-9',left=forward||modification.patchId==='LV-VELA-COMPAT-8',nav=left||modification.patchId==='LV-VELA-COMPAT-7',cursor=nav||modification.patchId==='LV-VELA-COMPAT-6',scale=cursor||modification.patchId==='LV-VELA-COMPAT-5',hook=scale||modification.patchId==='LV-VELA-COMPAT-4',clip=hook||modification.patchId==='LV-VELA-COMPAT-3',cumulative=clip||modification.patchId==='LV-VELA-COMPAT-2';
 check('modified Vela identity and exact upstream input count',(cumulative||modification.patchId==='LV-VELA-MAGNET-1')&&modification.package==='@luxalgo/vela'&&modification.version==='0.8.4'&&modification.upstreamInputs.length===(cumulative?9:5));
 if(cumulative){check('cumulative Vela component identities',JSON.stringify(modification.components)===JSON.stringify(leftovers?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1','LV-VELA-SCALE-LEFT-1','LV-VELA-FORWARD-1','LV-VELA-SCALE-GROUPS-1','LV-VELA-RENDER-LEFTOVERS-1']:groups?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1','LV-VELA-SCALE-LEFT-1','LV-VELA-FORWARD-1','LV-VELA-SCALE-GROUPS-1']:forward?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1','LV-VELA-SCALE-LEFT-1','LV-VELA-FORWARD-1']:left?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1','LV-VELA-SCALE-LEFT-1']:nav?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1','LV-VELA-NAV-1']:cursor?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1','LV-VELA-CURSOR-KIND-1']:scale?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1','LV-VELA-SCALE-BUTTONS-1','LV-VELA-SCALE-PLACEMENT-1','LV-VELA-TIME-FORMAT-1']:hook?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1','LV-VELA-DRAWING-PAINT-HOOK-1']:clip?['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1','LV-VELA-PAINT-CLIP-1']:['LV-VELA-MAGNET-1','LV-VELA-DRAWING-IDS-1']));check('cumulative Vela exact runtime and declaration inputs',JSON.stringify(modification.upstreamInputs.map(row=>row.path).sort())===JSON.stringify(['dist/chunk-UNUVPQFW.js','dist/index.cjs','dist/vela.global.js','dist/widget.cjs','dist/workspace.cjs','dist/index.d.ts','dist/index.d.cts','dist/contributions-BY3zSYiZ.d.ts','dist/contributions-DOm40g5-.d.cts'].sort()));}
 if(clip)check('pane cleanup prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat2Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat2Sha256)));
 if(hook)check('paint hook prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat3Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat3Sha256)));
 if(scale)check('scale and time-format prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat4Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat4Sha256)));
 if(cursor)check('cursor-kind prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat5Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat5Sha256)));
 if(nav)check('navigation-bounds prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat6Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat6Sha256)));
 if(left)check('left-scale prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat7Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat7Sha256)));
 if(forward)check('forward-projection prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat8Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat8Sha256)));
 if(groups)check('scale-group prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat9Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat9Sha256)));
 if(leftovers)check('render-leftovers prior cumulative hashes have SHA-256 format',modification.upstreamInputs.every(row=>typeof row.compat10Sha256==='string'&&/^[a-f0-9]{64}$/.test(row.compat10Sha256)));
 check('modified Vela metadata matches embedded identity',JSON.stringify(identity.modifications)===JSON.stringify(manifest.modifications));
 for(const bundle of modification.deliveredRendererBundles){const bytes=extractFile(asar,path.normalize(bundle.path));check('modified renderer hash and retained notice: '+bundle.path,createHash('sha256').update(bytes).digest('hex')===bundle.sha256&&manifest.sourceHashes[bundle.path]===bundle.sha256&&retainedVelaNotice(bytes.toString('utf8'),modification.patchId));}
 check('modified renderer bundle exists',modification.deliveredRendererBundles.length>0);
 check('readable modification notices include exact hashes',extractFile(asar,'THIRD-PARTY-NOTICES.txt').toString('utf8').includes(JSON.stringify(modification,null,2)));
 if(modification.buildComposition){
  const extra=modification.buildComposition,metadata=extra.metadata,body=extractFile(asar,path.normalize(metadata.path));
  check('future calendar composition is separately identified from its installed base',extra.extensionId==='LV-VELA-FUTURE-CALENDAR-1'&&extra.baseId===modification.patchId&&extra.installed.includes('Unmodified pinned COMPAT-11')&&metadata.path==='dist/vela-future-calendar.json');
  check('future calendar delivered metadata hash',createHash('sha256').update(body).digest('hex')===metadata.sha256&&manifest.sourceHashes[metadata.path]===metadata.sha256);
  const delivered=JSON.parse(body.toString('utf8'));
  check('future calendar delivered composition matches source metadata',delivered.extensionId===extra.extensionId&&delivered.baseId===extra.baseId&&delivered.extensionPlanSHA256===extra.extensionPlanSHA256&&JSON.stringify(delivered.files)===JSON.stringify(extra.files)&&delivered.transformed.includes('dist/chunk-UNUVPQFW.js'));
  check('future calendar preserves all nine base inputs and changes only runtime composition',extra.files.length===9&&new Set(extra.files.map(row=>row.path)).size===9&&extra.files.every(row=>modification.upstreamInputs.some(base=>base.path===row.path&&base.afterSha256===row.baseSHA256)&&/^[a-f0-9]{64}$/.test(row.composedSHA256)&&(!row.path.endsWith('.d.ts')&&!row.path.endsWith('.d.cts')||row.composedSHA256===row.baseSHA256)));
  check('future calendar recipe sources and augmentation are captured',Object.entries(extra.recipeSources).every(([file,wanted])=>manifest.sourceHashes[file]===wanted)&&extra.typeExtension.path==='src/chart/vela-future-calendar.d.ts'&&manifest.sourceHashes[extra.typeExtension.path]===extra.typeExtension.sha256);
  check('future calendar actual renderer method and prominent change notice retained',modification.deliveredRendererBundles.some(bundle=>{const text=extractFile(asar,path.normalize(bundle.path)).toString('utf8');return text.includes('lvSetFutureTimeSpine')&&text.includes('LarryVision LV-VELA-FUTURE-CALENDAR-1 modification, 2026-10-24.');}));
 }
 if(modification.inputFeel){
  const feel=modification.inputFeel;
  check('input feel transform is identified after the calendar composition on its base',feel.transformId==='LV-VELA-INPUT-FEEL-1'&&feel.baseId===modification.patchId&&feel.after===modification.buildComposition?.extensionId&&JSON.stringify(feel.runtimes)===JSON.stringify(['dist/chunk-UNUVPQFW.js','dist/index.cjs','dist/vela.global.js','dist/widget.cjs','dist/workspace.cjs']));
  check('input feel recipe sources are captured',JSON.stringify(Object.keys(feel.recipeSources))===JSON.stringify(['src/chart/vela-input-feel-transform.mjs','src/chart/vela-input-feel-transform.d.mts'])&&Object.entries(feel.recipeSources).every(([file,wanted])=>manifest.sourceHashes[file]===wanted));
  check('input feel prominent change notice retained in the delivered renderer',typeof feel.notice==='string'&&feel.notice.includes('LarryVision LV-VELA-INPUT-FEEL-1 modification')&&modification.deliveredRendererBundles.some(bundle=>extractFile(asar,path.normalize(bundle.path)).toString('utf8').includes(feel.notice)));
 }
 const vela=sbom.components.find(component=>component.name==='@luxalgo/vela');check('SBOM records exact Vela modification and separates upstream integrity',vela?.properties.some(property=>property.name==='lv:modification-metadata'&&property.value===JSON.stringify(modification))&&vela.properties.some(property=>property.name==='lv:registry-integrity-scope'));
}
check('SBOM build identity matches',sbom.bomFormat==='CycloneDX'&&sbom.metadata.properties.some(property=>property.name==='lv:buildId'&&property.value===manifest.buildId));
check('PineTS research candidate absent from product SBOM',sbom.components.every(component=>component.name!=='pinets'));
check('product SBOM has no AGPL component',sbom.components.every(component=>!(component.licenses||[]).some(license=>JSON.stringify(license).includes('AGPL'))));
for(const filename of ['APPLICATION-LICENSE.txt','NOTICE','SECURITY.md','THIRD_PARTY.md','THIRD-PARTY-NOTICES.txt','sbom.json'])check('license/security document present: '+filename,entries.includes(filename));
const report={buildId:manifest.buildId,createdAt:new Date().toISOString(),executableSha256:manifest.executableSha256,asarSha256:manifest.asarSha256,checks,archiveEntries:entries.length,zipInventory,scope:'Static package security verification only; no native launch/UI evidence.'};
await writeFile(path.join(path.dirname(latest.manifest),'security-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({buildId:report.buildId,checksPassed:checks.length,archiveEntries:report.archiveEntries,executableSha256:report.executableSha256,asarSha256:report.asarSha256,scope:report.scope}));
