import {it,expect} from 'vitest';
import {WorkspaceAlertObserver,type WorkspaceAlertInput} from '../../src/ui/workspace-alert-observer';
import {fixtureDataset} from '../../src/domain/fixtures';
const now=Date.UTC(2026,9,14)/1000;
function setup(){let ids=0;const observer=new WorkspaceAlertObserver(()=>`session-${++ids}`),input:WorkspaceAlertInput={dataset:fixtureDataset('GME',3),priceSource:'close',replay:null,assumeReplayCompletion:false};return{observer,input};}
it('uses actual observation time and keeps completed historical rows unknown outside explicit replay',()=>{
 const {observer,input}=setup(),view=observer.observe(input,now);
 expect(view.event).toMatchObject({time:now,availableAt:now,barClosed:false,observation:{sourceTime:input.dataset.bars[2].time,sourceAvailableAt:null,completion:'unknown'}});
 expect(observer.observe(input,now+1).event).toBe(view.event);
 const explicit=observer.observe(input,now+2,'explicit-evaluation');expect(explicit.event!.sequence).toBe(2);expect(explicit.event!.time).toBe(now+2);
});
it('starts isolated sessions on source/field/replay seek and completion policy changes',()=>{
 const {observer,input}=setup(),ordinary=observer.observe(input,now);
 const replay={...input,replay:{runId:'replay-1',cursor:0}},first=observer.observe(replay,now+1);
 const step=observer.observe({...replay,replay:{runId:'replay-1',cursor:1}},now+2);expect(step.context!.binding.sessionId).toBe(first.context!.binding.sessionId);
 const complete=observer.observe({...replay,assumeReplayCompletion:true},now+3);expect(complete.event!.barClosed).toBe(true);expect(complete.context!.binding.sessionId).not.toBe(first.context!.binding.sessionId);
 const seek=observer.observe({...replay,replay:{runId:'replay-2',cursor:0}},now+4);expect(seek.context!.binding.replayRunId).toBe('replay-2');
 const field=observer.observe({...input,priceSource:'open'},now+5);expect(field.context!.sourceId).toBe('price:open');expect(field.context!.binding.sessionId).not.toBe(ordinary.context!.binding.sessionId);
});
it('drops prior events when current data is invalid and keeps correction and gap labels',()=>{
 const {observer,input}=setup();observer.observe(input,now);observer.observe(input,now+20);
 const gap=observer.observe(input,now+100);expect(gap.event!.observation!.continuity).toBe('gap');
 const changed=structuredClone(input);changed.dataset.bars[2].close=changed.dataset.bars[2].high;
 expect(observer.observe(changed,now+101).event!.observation!.correction).toBe(true);
 const bad=structuredClone(changed);bad.dataset.bars[2].close=Number.NaN;expect(observer.observe(bad,now+102).event).toBeNull();
});
