import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createAlertObservationSession,observeAlertSnapshot,alertObservationContext,alertObservationDescription} from '../../src/domain/alert-observation';
import {createLocalAlert,processAlertEvent} from '../../src/domain/alerts';
function data(close=9){const dataset=fixtureDataset('GME',1);dataset.bars=[{time:1000,open:10,high:12,low:9,close,volume:100}];dataset.provenance.asOf=1000;dataset.provenance.revision='review-1';return dataset;}
function alert(session:ReturnType<typeof createAlertObservationSession>,dataset:ReturnType<typeof data>,frequency:'every-time'|'once-per-bar-close'='every-time',kind:'greater'|'crossing-up'='crossing-up'){
 const context=alertObservationContext(session,dataset);return createLocalAlert({id:'review-alert',instrumentId:context.instrumentId,sourceId:context.sourceId,name:'Synthetic review',message:'Synthetic review event',condition:{kind,value:10},frequency,createdAt:2000,expiresAt:null,mode:context.mode,runId:context.runId,observationBinding:context.binding});
}
it('identical polling heartbeats preserve continuity for a later newly appended snapshot crossing',()=>{
 const dataset=data(),session=createAlertObservationSession(dataset,{sessionId:'heartbeat',mode:'ordinary',startedAt:2000,maxObservationGapSeconds:60}),first=observeAlertSnapshot(session,{dataset,observedAt:2000});let state=first.session,local=processAlertEvent(alert(session,dataset),first.event!).alert;
 for(let at=2010;at<=2090;at+=10){const polled=observeAlertSnapshot(state,{dataset,observedAt:at});expect(polled.event).toBeNull();expect(polled.session.sequence).toBe(1);state=polled.session;}
 const appended=structuredClone(dataset);appended.bars.push({time:1060,open:9,high:12,low:9,close:11,volume:100});const observed=observeAlertSnapshot(state,{dataset:appended,observedAt:2091});expect(observed.event!.observation!.continuity).toBe('continuous');expect(observed.event!.observation!.correction).toBe(false);expect(processAlertEvent(local,observed.event!).notification!.value).toBe(11);
});
it('an identical snapshot after genuine observation silence emits a gap instead of retaining its old crossing baseline',()=>{
 const dataset=data(),session=createAlertObservationSession(dataset,{sessionId:'sleep',mode:'ordinary',startedAt:2000,maxObservationGapSeconds:60}),first=observeAlertSnapshot(session,{dataset,observedAt:2000}),slept=observeAlertSnapshot(first.session,{dataset,observedAt:2061});expect(slept.event!.observation!.continuity).toBe('gap');expect(slept.event!.sequence).toBe(2);expect(slept.event!.observation!.sourceAvailableAt).toBeNull();
});
it('events from distinct replay seeks cannot reach a previous alert even if the supplied session nonce was reused',()=>{
 const dataset=data(11),a=createAlertObservationSession(dataset,{sessionId:'same-nonce',mode:'replay',replayRunId:'seek-a',assumeReplayCompletion:true,startedAt:2000}),b=createAlertObservationSession(dataset,{sessionId:'same-nonce',mode:'replay',replayRunId:'seek-b',assumeReplayCompletion:true,startedAt:2000}),old=alert(a,dataset,'once-per-bar-close','greater'),event=observeAlertSnapshot(b,{dataset,barIndex:0,replayRunId:'seek-b',observedAt:2001}).event!;
 expect(a.binding).not.toEqual(b.binding);expect(event.barClosed).toBe(true);const processed=processAlertEvent(old,event);expect(processed.alert).toBe(old);expect(processed.notification).toBeNull();expect(processed.diagnostics.length).toBeGreaterThan(0);
});
it('local observation clock remains separate from historical source time, with unknown actual completion',()=>{
 const dataset=data(11),session=createAlertObservationSession(dataset,{sessionId:'ordinary',mode:'ordinary',startedAt:2000}),observed=observeAlertSnapshot(session,{dataset,observedAt:2005}),event=observed.event!;expect(event.time).toBe(2005);expect(event.availableAt).toBe(2005);expect(event.observation!.sourceTime).toBe(1000);expect(event.observation!.sourceAvailableAt).toBeNull();expect(event.barClosed).toBe(false);expect(processAlertEvent(alert(session,dataset,'once-per-bar-close','greater'),event).notification).toBeNull();
});
it('same-length source correction clears crossing continuity without pretending a new market tick',()=>{
 const dataset=data(),session=createAlertObservationSession(dataset,{sessionId:'correction',mode:'ordinary',startedAt:2000}),first=observeAlertSnapshot(session,{dataset,observedAt:2000}),local=processAlertEvent(alert(session,dataset),first.event!).alert,corrected=structuredClone(dataset);corrected.bars[0].close=11;const observed=observeAlertSnapshot(first.session,{dataset:corrected,observedAt:2001});expect(observed.event!.observation!.correction).toBe(true);expect(processAlertEvent(local,observed.event!).notification).toBeNull();
});
it('completion assumptions cannot upgrade an old alert under the same replay run and session nonce',()=>{
 const dataset=data(11),unknown=createAlertObservationSession(dataset,{sessionId:'same',mode:'replay',replayRunId:'same-run',startedAt:2000}),completed=createAlertObservationSession(dataset,{sessionId:'same',mode:'replay',replayRunId:'same-run',assumeReplayCompletion:true,startedAt:2000}),old=alert(unknown,dataset,'once-per-bar-close','greater'),event=observeAlertSnapshot(completed,{dataset,replayRunId:'same-run',observedAt:2001}).event!;
 expect(unknown.binding.completionPolicy).toBe('unknown');expect(completed.binding.completionPolicy).toBe('replay-supplied-row');expect(event.barClosed).toBe(true);expect(processAlertEvent(old,event).notification).toBeNull();
});
it('synthetic labeling is part of replay alert identity and remains visible in the replay description',()=>{
 const dataset=data(11),synthetic=createAlertObservationSession(dataset,{sessionId:'same',mode:'replay',replayRunId:'same-run',startedAt:2000}),supplied=structuredClone(dataset);supplied.provenance.fixture=false;
 const other=createAlertObservationSession(supplied,{sessionId:'same',mode:'replay',replayRunId:'same-run',startedAt:2000}),event=observeAlertSnapshot(other,{dataset:supplied,replayRunId:'same-run',observedAt:2001}).event!;
 expect(processAlertEvent(alert(synthetic,dataset,'every-time','greater'),event).notification).toBeNull();expect(observeAlertSnapshot(synthetic,{dataset:supplied,replayRunId:'same-run',observedAt:2001}).event).toBeNull();
 expect(alertObservationDescription({kind:'replay-snapshot',completion:'unknown',binding:synthetic.binding})).toContain('synthetic');
});
