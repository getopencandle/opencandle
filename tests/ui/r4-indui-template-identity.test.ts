import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {templateIdentityEffect} from '../../src/ui/template-application';
import {applyTemplateIdentityEffect} from '../../src/ui/template-identity-host';

// R4 REPLAY_POLICY wiring: App applies the TemplateIdentityEffect when a template is applied. The helper is
// exercised directly; the App call site is pinned in source (the template apply path needs the grid transaction owner,
// which these unit tests do not mount). Unit and source evidence only, not a packaged flow. SYNTHETIC.
const host=()=>({retireReplay:vi.fn(),retireAlerts:vi.fn(),retireScripts:vi.fn(),freshExecutionIdentity:vi.fn()});

describe('R4 template identity effect host',()=>{
 it('a source-changing template retires replay, alert and script identities and mints a fresh execution identity',()=>{
  const h=host();
  expect(applyTemplateIdentityEffect(templateIdentityEffect({sourceChanged:true}),h)).toEqual(['replay','alerts','scripts','execution']);
  for(const fn of Object.values(h))expect(fn).toHaveBeenCalledOnce();
 });
 it('a same-source template keeps the replay prefix and still mints a fresh execution identity',()=>{
  const h=host();
  expect(applyTemplateIdentityEffect(templateIdentityEffect({sourceChanged:false}),h)).toEqual(['execution']);
  expect(h.retireReplay).not.toHaveBeenCalled();expect(h.retireAlerts).not.toHaveBeenCalled();expect(h.retireScripts).not.toHaveBeenCalled();
  expect(h.freshExecutionIdentity).toHaveBeenCalledOnce();
 });
 it('refuses a malformed effect before calling any hook',()=>{
  const h=host();
  expect(()=>applyTemplateIdentityEffect({retireReplay:'yes',retireAlerts:false,retireScripts:false,freshExecutionIdentity:true} as never,h)).toThrow(/explicit effect/);
  expect(()=>applyTemplateIdentityEffect({retireReplay:false,retireAlerts:false,retireScripts:false,freshExecutionIdentity:false} as never,h)).toThrow(/explicit effect/);
  for(const fn of Object.values(h))expect(fn).not.toHaveBeenCalled();
 });
});

describe('R4 App template apply call site (source pin)',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 const preview=app.slice(app.indexOf(' async function previewTemplate('),app.indexOf(' function comparisonSnapshot('));
 it('decides the effect from the prepared application before apply and applies it inside the committed model step',()=>{
  expect(preview).toMatch(/prepared=prepareTemplateApplication\(/);
  expect(preview).toMatch(/const identityEffect=templateIdentityEffect\(prepared\);/);
  const commitModel=preview.slice(preview.indexOf('commitModel:'));
  expect(commitModel).toMatch(/applyTemplateIdentityEffect\(identityEffect,\{retireReplay:/);
  // Alert identities retire through the financial generation (WorkspaceAlerts remounts); paper history is not touched.
  expect(commitModel).toMatch(/retireAlerts:\(\)=>\{financialGeneration\.current\+\+;setFinancialEpoch\(financialGeneration\.current\);\}/);
  expect(commitModel).toMatch(/freshExecutionIdentity:\(\)=>\{setScriptEpoch\(/);
  const effectCall=commitModel.slice(commitModel.indexOf('applyTemplateIdentityEffect('),commitModel.indexOf('followReplayGuard('));
  expect(effectCall).not.toMatch(/setPaper\(|financial\.current\.paper=/);
 });
 it('the replay prefix is dropped only when the source changed',()=>{
  expect(preview).toMatch(/nextReplay=prepared\.sourceChanged\?null:snapshot\.replay/);
 });
});
