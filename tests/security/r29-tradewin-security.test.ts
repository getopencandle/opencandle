import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const nodeRequire=createRequire(import.meta.url);
// Source checks for the new layout-window channels, the same conditions scripts/security-package.mjs adds to its
// layout-window block. Added checks only; no other security assertion is changed.
const mainText=readFileSync('electron/main.cjs','utf8'),preloadText=readFileSync('electron/preload.cjs','utf8'),packageCheck=readFileSync('scripts/security-package.mjs','utf8');

describe(' security',()=>{
 it('a layout window may relay a paper action, but never answer one or reload windows',()=>{
  const {SECONDARY_CHANNELS,SHARED_WORKSPACE_KEYS}=nodeRequire('../../electron/windows.cjs');
  expect(SECONDARY_CHANNELS).toContain('lv:window:paper-action');
  for(const channel of ['lv:window:paper-done','lv:window:refresh','lv:workspace:save','lv:workspace:reset'])expect(SECONDARY_CHANNELS).not.toContain(channel);
  for(const key of ['layoutLibrary','grid','watchBook','watchAdvanced','listAlerts','alerts','paper','paperBook','imports'])expect(SHARED_WORKSPACE_KEYS).not.toContain(key);
 });
 it('the three channels are fixed handler-table entries and fixed preload invokes; the paper relay checks its sender',()=>{
  for(const channel of ['lv:window:paper-action','lv:window:paper-done','lv:window:refresh']){expect(mainText).toContain("'"+channel+"': async");expect(preloadText).toContain("invoke('"+channel+"'");}
  expect(mainText).toContain("'lv:window:paper-action': async (value,event) => { if (!windowRegistry?.isSecondary(event)) throw new validation.BoundaryError('DENIED'");
  expect(mainText).toContain("if (!trusted(event)) { if (!windowRegistry?.trustedSecondary(event, channel)) throw new validation.BoundaryError('DENIED', 'Untrusted sender.'); }");
 });
 it('the package security check covers them',()=>{
  for(const name of ['layout windows cannot answer paper actions or reload windows','layout window saves carry no layouts, watchlists, alerts, paper or imports'])expect(packageCheck).toContain(name);
 });
});
