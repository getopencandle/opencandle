import {describe,expect,it} from 'vitest';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

// Alert capture records chart-timeframe inputs only, so an instance on its own timeframe is refused visibly.
const settings=(timeframe?:{schemaVersion:1;interval:string|null;waitForClose:boolean})=>{const base=factoryIndicatorDefault('rsi');return {id:'rsi-1',kind:'rsi' as const,...base,presentation:timeframe?{...base.presentation!,timeframe}:base.presentation};};
describe(' alert capture',()=>{
 it('refuses an indicator calculated on its own 1D timeframe',()=>{
  expect(()=>captureIndicatorAlertSource(settings({schemaVersion:1,interval:'1D',waitForClose:true}) as never,'rsi','standard','s')).toThrow(/Alerts are unavailable for an indicator calculated on its own 1D timeframe/);
 });
 it('still captures Chart timeframe (absent or explicit null)',()=>{
  expect(captureIndicatorAlertSource(settings() as never,'rsi','standard','s').indicator).toBe('rsi');
  expect(captureIndicatorAlertSource(settings({schemaVersion:1,interval:null,waitForClose:false}) as never,'rsi','standard','s').indicator).toBe('rsi');
 });
});
