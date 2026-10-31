import {it,expect,vi} from 'vitest';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources} from '../../src/domain/technical-alerts';
import {validateTechnicalAlertSource} from '../../src/domain/alert-observation';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {indicatorDefaults,defaultIndicatorPresentation,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {tradingSessions} from '../../src/domain/indicators-ext/trading-sessions';
import {inputs,bars,windows,syntheticSource} from '../fixtures/r42-trading-sessions';
import type {Bar} from '../../src/domain/types';
const row:IndicatorInstanceSettings={id:'SYNTHETIC-session-study',kind:'tradingsessions',inputs:{...indicatorDefaults.tradingsessions,...inputs},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('tradingsessions')};
const forged={kind:'indicator',instanceId:row.id,snapshotId:'SYNTHETIC',indicator:'tradingsessions',plotId:'session1',inputs:row.inputs,inputBasis:'standard-ohlc',transformId:'standard'} as const;
it('capture explicitly refuses the chart-only visual study on every plot',()=>{
 expect(indicatorAlertBlock('tradingsessions')).toContain('chart-only visual study');for(const plot of ['session1','session2','session3'])expect(()=>captureIndicatorAlertSource(row,plot,'standard','SYNTHETIC')).toThrow('chart-only visual study');
});
it('saved or forged background sources cannot bypass the same refusal or execute another evaluator',async()=>{
 expect(()=>validateTechnicalAlertSource(forged)).toThrow('chart-only visual study');const evaluateScript=vi.fn();await expect(evaluateTechnicalAlertSources(bars,[forged] as never,'USD',{evaluateScript})).rejects.toThrow('chart-only visual study');expect(evaluateScript).not.toHaveBeenCalled();
});
it('invalid enabled configuration refuses before observing a supplied history row',()=>{
 let reads=0;const hostile=Object.defineProperty({},'time',{get(){reads++;return 0;},enumerable:true}) as Bar;
 expect(()=>tradingSessions([hostile],windows({start:''}),syntheticSource)).toThrow('HH:mm');expect(reads).toBe(0);
});
it('the earlier prefix cannot receive the final historical box average as a scalar',()=>{
 const early=tradingSessions(bars.slice(0,2),windows({}),syntheticSource),later=tradingSessions(bars,windows({}),syntheticSource);
 expect(early.series[0]).toEqual([null,10]);expect(later.sessions[0].average).toBe(12);expect(later.series[0].slice(0,2)).toEqual([null,10]);expect(later.series[0][1]).not.toBe(later.sessions[0].average);
});
