import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const nodeRequire=createRequire(import.meta.url);
// Source checks for layout windows, the same conditions scripts/security-package.mjs applies to a packaged build
// whose manifest lists electron/windows.cjs. Added checks only; no other security assertion is changed.
const mainText=readFileSync('electron/main.cjs','utf8'),preloadText=readFileSync('electron/preload.cjs','utf8'),windowsText=readFileSync('electron/windows.cjs','utf8'),packageCheck=readFileSync('scripts/security-package.mjs','utf8');
// approved 2026-10-29: cache compiled code on first launch (v8CacheOptions bypassHeatCheck).
const HARDENED="function createAppWindow(options){return new BrowserWindow({...options, webPreferences:{ preload:path.join(__dirname, 'preload.cjs'), contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true, allowRunningInsecureContent:false, devTools:false, backgroundThrottling:false, v8CacheOptions:'bypassHeatCheck' } });}";
const FORBIDDEN=['lv:workspace:save','lv:workspace:reset','lv:workspace:export','lv:bars:import','lv:data:import','lv:alpaca:key-save','lv:alpaca:key-clear','lv:alpaca:test','lv:barcache:clear','lv:alert:notify','lv:alert:webhook','lv:tray:set','lv:app:quit','lv:window:open-layout','lv:window:list','lv:window:layout-saved','lv:startup:open-symbol','lv:startup:open-symbols'];

describe(' security',()=>{
 it('the window registry needs only ./validation.cjs and has no network, process, shell or window-creation access',()=>{
  const requires=[...windowsText.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(match=>match[1]);
  expect(requires).toEqual(['./validation.cjs']);expect(windowsText).not.toMatch(/\bimport\s*\(/);
  expect(windowsText).not.toMatch(/globalThis\.fetch|fetch\(|WebSocket|https?:\/\/|wss?:\/\/|child_process|openExternal|require\(\s*['"`]electron['"`]\s*\)|new BrowserWindow/);
 });
 it('main loads the registry once, lazily, and builds every window in one place with the hardened preferences and navigation denial',()=>{
  expect(mainText.match(/require\(['"]\.\/windows\.cjs['"]\)/g)).toHaveLength(1);
  expect(mainText).toMatch(/function windows\(\)\{\s*if\(!windowRegistry\)\{\s*const \{createWindowRegistry\}=require\('\.\/windows\.cjs'\);/);
  expect(mainText.match(/new BrowserWindow\(/g)).toHaveLength(1);expect(mainText).toContain(HARDENED);
  for(const line of ["window.webContents.setWindowOpenHandler(() => ({action:'deny'}));","window.webContents.on('will-navigate', event => event.preventDefault());","window.webContents.on('will-attach-webview', event => event.preventDefault());",'hardenWindow(mainWindow);','const window=hardenWindow(createAppWindow({'])expect(mainText).toContain(line);
  expect(mainText).toContain("connect-src 'none'");expect(mainText).not.toMatch(/alpaca\.markets|coinbase\.com|new WebSocket|fetch\(/);
 });
 it('a layout window is trusted only for its fixed subset, checked by sender, main frame and app origin',()=>{
  expect(mainText).toContain("if (!trusted(event)) { if (!windowRegistry?.trustedSecondary(event, channel)) throw new validation.BoundaryError('DENIED', 'Untrusted sender.'); }");
  expect(windowsText).toContain('event.senderFrame !== entry.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url)');
  const {SECONDARY_CHANNELS}=nodeRequire('../../electron/windows.cjs');
  expect(SECONDARY_CHANNELS.length).toBeGreaterThan(0);for(const channel of FORBIDDEN)expect(SECONDARY_CHANNELS).not.toContain(channel);
  for(const channel of ['lv:window:open-layout','lv:window:list','lv:window:layout-save','lv:window:layout-saved']){expect(mainText).toContain("'"+channel+"': async");expect(preloadText).toContain("invoke('"+channel+"'");}
 });
 it('the package security check covers layout windows when the manifest lists electron/windows.cjs',()=>{
  expect(packageCheck).toContain("if(Object.hasOwn(manifest.sourceHashes,'electron/windows.cjs')){");
  for(const name of ['window registry matches the manifest source hash','window registry requires only ./validation.cjs','window registry has no network, process, shell or window-creation access','main.cjs loads the window registry once, lazily','main.cjs builds every window in one place with the hardened web preferences','every window denies window.open, navigation and webviews','layout windows cannot write the workspace, touch the key, notify, use the tray, quit or open windows'])expect(packageCheck).toContain(name);
 });
});
