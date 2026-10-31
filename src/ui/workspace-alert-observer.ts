import type {Bar,BarDataset,PriceSource} from '../domain/types';
import type {AlertEvent} from '../domain/alerts';
import {LiveCloseTracker} from './technical-alert-observer';
import {closedBarDataset,isFredDatasetId,isLiveDatasetId} from '../domain/live-provider';
import {alertDatasetKey,createAlertObservationSession,liveHistoryCorrected,observeAlertSnapshot,priceSourceFields,type AlertObservationContext,type AlertObservationSession} from '../domain/alert-observation';

export interface WorkspaceAlertInput {dataset:BarDataset;priceSource:PriceSource;replay:{runId:string;cursor:number}|null;assumeReplayCompletion:boolean}
export interface WorkspaceAlertView {key:string;event:AlertEvent|null;context:AlertObservationContext|null;diagnostics:string[];now:number;
 /** Events from live bars that just closed (barClosed, observed-closed); App processes these before `event`. */
 closedEvents?:AlertEvent[]}
export function workspaceAlertKey(input:WorkspaceAlertInput):string{return JSON.stringify([alertDatasetKey(input.dataset),input.dataset.provenance.fixture,input.replay?.runId??null,input.replay?input.dataset.provenance.revision:null,input.priceSource,!!input.replay&&input.assumeReplayCompletion]);}
/** One local observation session per exact selection. Reopening the app never resumes a hidden clock. */
export class WorkspaceAlertObserver {
 private key:string|null=null;private session:AlertObservationSession|null=null;private event:AlertEvent|null=null;private pendingGap=false;private priorBars:readonly Bar[]|null=null;
 private readonly tracker:LiveCloseTracker;
 constructor(private readonly newId:()=>string,private readonly onBarClosed?:(view:WorkspaceAlertView)=>void){
  this.tracker=new LiveCloseTracker(closed=>{
   const session=this.session;if(!session||!this.onBarClosed)return;
   const result=observeAlertSnapshot(session,{dataset:closed,observedAt:Math.floor(Date.now()/1000),barIndex:closed.bars.length-1,reason:'source-observation',barClosed:true});
   this.session=result.session;if(result.event)this.onBarClosed({key:this.key??'',event:result.event,context:result.context,diagnostics:result.diagnostics,now:result.event.time,closedEvents:[result.event]});
  });
 }
 /** Dispose the live bar-close watcher (dataset or feed removed). */
 dispose():void{this.tracker.stop();}
 observe(input:WorkspaceAlertInput,now:number,reason:'source-observation'|'explicit-evaluation'='source-observation'):WorkspaceAlertView{
  const key=workspaceAlertKey(input),index=input.replay?.cursor??input.dataset.bars.length-1;
  const movedBack=this.session?.lastBarIndex!==null&&this.session?.lastBarIndex!==undefined&&index<this.session.lastBarIndex;
  if(key!==this.key||!this.session||movedBack){
   this.key=key;this.event=null;this.pendingGap=false;this.priorBars=null;
   this.session=createAlertObservationSession(input.dataset,{sessionId:this.newId(),mode:input.replay?'replay':'ordinary',startedAt:now,replayRunId:input.replay?.runId,assumeReplayCompletion:!!input.replay&&input.assumeReplayCompletion,source:{kind:'price',field:input.priceSource}});
  }
  const closedEvents:AlertEvent[]=[];
  if(input.replay)this.tracker.stop();
  else for(const bar of this.tracker.feed(input.dataset,input.dataset.bars)){
   const closed=closedBarDataset(input.dataset,bar.time);if(!closed)continue;
   const done=observeAlertSnapshot(this.session,{dataset:closed,observedAt:now,barIndex:closed.bars.length-1,reason,barClosed:true});
   this.session=done.session;if(done.event)closedEvents.push(done.event);
  }
  const liveForming=!input.replay&&!input.dataset.provenance.fixture&&isLiveDatasetId(input.dataset.provenance.datasetId)&&!isFredDatasetId(input.dataset.provenance.datasetId);
  // Revising the forming or just-closed bar is finalization, never a correction (see
  // liveHistoryCorrected). Older bars count only for the fields this price source reads: a volume change cannot change an
  // earlier price value and must not clear crossing or bar-close baselines.
  const correction=liveForming&&liveHistoryCorrected(this.priorBars,input.dataset.bars,priceSourceFields(input.priceSource));
  this.priorBars=liveForming?input.dataset.bars.map(bar=>({...bar})):null;
  const result=observeAlertSnapshot(this.session,{dataset:input.dataset,observedAt:now,barIndex:index,replayRunId:input.replay?.runId,reason,continuity:this.pendingGap?'gap':undefined,...(correction?{correction:true}:{})});
  this.session=result.session;
  if(result.event){this.event=result.event;this.pendingGap=false;}else if(result.diagnostics.length){this.event=null;this.pendingGap=true;}
  return {key,event:this.event,context:result.context,diagnostics:result.diagnostics,now,...(closedEvents.length?{closedEvents}:{})};
 }
 reset(){this.tracker.stop();this.priorBars=null;this.key=null;this.session=null;this.event=null;this.pendingGap=false;}
}
