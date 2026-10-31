import {expect,it} from 'vitest';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,TECHNICAL_ALERT_LIMITS,technicalSourceKey} from '../../src/domain/technical-alerts';
import type {Bar} from '../../src/domain/types';
it('measures a 100000-row batch close to the declared calculation limit',async()=>{
 const bars:Bar[]=Array.from({length:100000},(_,index)=>{const close=100+(index%31)/10;return{time:1700000000+index*60,open:close,high:close+1,low:close-1,close,volume:100};});
 // The additional bounded SD passes make the old27-period workload exceed20m;19 is a distinct admitted workload.
 const source=captureIndicatorAlertSource({id:'performance',kind:'bb',inputs:{length:19,multiplier:2,basisType:'WMA',source:'close'},plots:{},offset:0,visible:true},'upper','standard','performance');
 const start=performance.now(),result=await evaluateTechnicalAlertSources(bars,[source],'USD'),durationMs=performance.now()-start;
 expect(result.estimatedWork).toBeLessThanOrEqual(TECHNICAL_ALERT_LIMITS.operations);expect(result.estimatedWork).toBeGreaterThan(19000000);expect(result.results.get(technicalSourceKey(source))?.sample.value).not.toBeNull();
 console.log(JSON.stringify({case:'TA.LIMIT.100000_BB19_WMA',bars:bars.length,estimatedOperations:result.estimatedWork,durationMs:Math.round(durationMs*100)/100,targetMs:2000,targetMet:durationMs<2000,evidence:'model calculation only, no GUI timing; distinct workload after approved SD operation estimate change'}));
 expect(durationMs).toBeLessThan(2000);
});
