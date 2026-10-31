import {expect,it} from 'vitest';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {isAnalysisPublicationFailure} from '../../src/chart/analysis-publication';

it('source retirement cannot certify an initial emission whose mounted scene row was replaced before return',async()=>{
 const h=await nativeCoreHarness();let source={},first=true,replacement:unknown;const quarantines:unknown[]=[];
 const port=createIndicatorPort(h.chart,undefined,undefined,undefined,h.bridge.claim,undefined,{captureOwner(){const captured=source;return{isCurrent:()=>source===captured,quarantine(error){quarantines.push(error);}};}});
 try{
  const mount=h.renderer.mountIndicator.bind(h.renderer);h.renderer.mountIndicator=model=>{const handle=mount(model);if(first){first=false;replacement={...model,series:[]};mount(replacement as typeof model);source={};}return handle;};
  let error:unknown;try{port.add('sma',{length:1});}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(Error);expect(isAnalysisPublicationFailure(error)).toBe(false);expect([...h.native.scene.indicators.values()]).toContain(replacement);expect(quarantines).toEqual([]);
 }finally{port.dispose();h.dispose();}
});
