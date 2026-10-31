import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {mapAppearance} from '../../src/chart/appearance';
import {appearanceBoolean,APPEARANCE_LAYER} from '../../src/chart/appearance-layer';
import {indicatorDisplayOptionsFromAppearance} from '../../src/chart/indicator-display-options';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';
import {serializeAppearance,themePresets} from '../../src/ui/themes';

/** Runs the current adapter's appearance method with controlled native sinks.
 * This covers its transaction boundary, not a mounted window or actual repaint. */
function fixture(){
 const source=readFileSync('src/chart/adapter.ts','utf8'),start=source.indexOf('    applyAppearance: (settings:'),end=source.indexOf('    getAppearance:',start);
 if(start<0||end<0)throw Error('Appearance adapter boundary changed; review this integration test.');
 const original=serializeAppearance({...themePresets[0].appearance,indicatorLabelsVisible:false,indicatorValuesVisible:true});
 const code=`(function(injected){
 const {mapAppearance,appearanceBoolean,APPEARANCE_LAYER,indicatorDisplayOptionsFromAppearance,attemptEveryCleanup,original}=injected;
 let lastAppearance=structuredClone(original),diagnostics=[{code:'OLD'}],config={layout:{background:'#old'}},options={labelsVisible:false,valuesVisible:true},broken='',writes=0,failStyle=false,failRecovery=false;
 const container={style:{background:'original-css'}},chart={renderer:{getConfig:()=>config,applyConfig:next=>{writes++;if(failRecovery&&writes>1)throw Error('SYNTHETIC failed config recovery');config=structuredClone(next);}}};
 const indicatorDisplay={setOptions:next=>{options={...next};}},unavailable=message=>{broken=message;},applyRequestedStyle=()=>{if(failStyle)throw Error('SYNTHETIC style publication failure');};
  const retireStatisticsSource=()=>{};const applyRendererConfig=next=>chart.renderer.applyConfig(next);const gateIndicatorLabels=next=>next; // lane A gate: the price scale port is not mounted here
 const controller={${source.slice(start,end)}};
 return {apply:controller.applyAppearance,fail:recovery=>{failStyle=true;failRecovery=recovery;},state:()=>structuredClone({lastAppearance,diagnostics,config,options,broken,writes,background:container.style.background})};
 })`;
 const create=new Function('return '+stripTypeScriptTypes(code,{mode:'strip'}))();
 return{original,host:create({mapAppearance,appearanceBoolean,APPEARANCE_LAYER,indicatorDisplayOptionsFromAppearance,attemptEveryCleanup,original})};
}
it('explicit labels and legend choices reach the adapter and legacy preview restoration resolves visible defaults',()=>{
 const {host,original}=fixture();host.apply({...original,'lv.indicatorLabelsVisible':true,'lv.indicatorValuesVisible':false});expect(host.state().options).toEqual({labelsVisible:true,valuesVisible:false});
 host.apply(serializeAppearance(themePresets[1].appearance));expect(host.state().options).toEqual({labelsVisible:true,valuesVisible:true});expect(Object.keys(host.state().lastAppearance)).toHaveLength(33);
});
it('failed style publication restores exact prior appearance, options, native config and background',()=>{
 const {host,original}=fixture(),before=host.state();host.fail(false);expect(()=>host.apply({...original,'lv.indicatorLabelsVisible':true,'lv.indicatorValuesVisible':false})).toThrow('style publication failure');
 expect(host.state()).toEqual({...before,writes:2});
});
it('failed rollback marks the chart unavailable while preserving both primary and recovery errors',()=>{
 const {host,original}=fixture();host.fail(true);let failure:any;try{host.apply({...original,'lv.indicatorValuesVisible':false});}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(AggregateError);expect(String(failure.errors[0])).toContain('style publication failure');expect(String(failure.errors[1])).toContain('appearance recovery failed');expect(host.state().broken).toContain('Reopen');expect(host.state().options).toEqual({labelsVisible:false,valuesVisible:true});
});
it('malformed explicit display flags reject before any appearance or native mutation',()=>{
 const {host,original}=fixture(),before=host.state();expect(()=>host.apply({...original,'lv.indicatorLabelsVisible':'false'})).toThrow('boolean');expect(host.state()).toEqual(before);
});
