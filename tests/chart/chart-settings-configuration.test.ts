import {describe,expect,it} from 'vitest';
import {createConfigurationEditor,publishConfigurationEdit} from '../../src/chart/configuration-edit';
import {commitPayload,openSession,setControl} from '../../src/chart/chart-settings-session';
import {factoryAppearance,factoryPriceScale,LV_ROW_KEYS,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {settingsDefaults} from '../../src/chart/chart-settings';

// The merged Settings Ok sends chart type and scale type changes through this lease (the same editor the retired
// Chart options and Chart type dialogs used). These cases keep their rejection and seal-failure guarantees.
function editor(failSeal=false){
 let native='old',pending=false;const events:string[]=[];
 const port=createConfigurationEditor<any,string,any>({exclusive:async action=>action({isCurrent:()=>true}),validate(){},capture:()=>native,
  hold:()=>({release(publish){events.push('release:'+publish);if(publish&&failSeal)throw Error('publication failure');}}),
  apply(){native='new';return{chartOptions:{},config:{},book:{},appearance:null};},restore:value=>{native=value;events.push('restore');},pending:value=>{pending=value;},broken(){events.push('broken');}});
 return{port,events,native:()=>native,pending:()=>pending};
}
describe('frame-safe apply of the merged Ok',()=>{
 it('a rejected model restores the native configuration and reports the refusal',async()=>{
  const test=editor(),lease=await test.port.prepare({});
  await expect(publishConfigurationEdit(lease,()=>false)).rejects.toThrow('saved configuration was retained');
  expect(test.native()).toBe('old');expect(test.pending()).toBe(false);expect(test.events).toEqual(['restore','release:false']);
 });
 it('an accepted edit whose publication fails stays committed and is reported, never rolled back',async()=>{
  const test=editor(true),lease=await test.port.prepare({});
  const outcome=await publishConfigurationEdit(lease,()=>true);
  expect(test.native()).toBe('new');expect(outcome.publicationErrors.join(' ')).toContain('was saved');expect(test.events).not.toContain('restore');
 });
});
describe('commit payload routes chart-owned stores',()=>{
 const sources=():ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:null,style:'line',typeSettings:settingsDefaults('line'),timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true}});
 it('scale type and type settings appear as chartOptions and typeSettings, apart from appearance and document',()=>{
  let session=openSession(sources(),{themeId:'lv-dark'});
  session=setControl(session,LV_ROW_KEYS.scaleType,{selected:'percent'});
  session=setControl(session,'type.line.width',{number:3});
  const commit=commitPayload(session);
  expect(commit.chartOptions).toEqual({scale:'percent',invert:false,auto:true});expect(commit.typeSettings?.style).toBe('line');
  expect(commit.changed.sort()).toEqual(['chartOptions','typeSettings']);expect(commit.appearance).toEqual(factoryAppearance());
 });
 it('an unchanged scale mode is not part of the commit', ()=>{
  expect(commitPayload(openSession(sources(),{themeId:'lv-dark'})).changed).toEqual([]);
 });
 it('without a connected chart the scale rows refuse edits',()=>{
  const session=openSession({...sources(),scaleMode:null},{themeId:'lv-dark'});
  expect(setControl(session,LV_ROW_KEYS.invert,{checked:true}).error).toContain('not connected');
 });
});
