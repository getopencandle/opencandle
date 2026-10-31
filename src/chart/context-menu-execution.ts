import {contextPriceTargetError} from './context-price-target';
import type {ChartContextActionOptions,ChartContextActions,ChartMenuSnapshot,RootChartMenuAction} from './context-menu';
const BODY_ONLY:readonly RootChartMenuAction[]=['reset-view','chart-type-focus','remove-drawings','remove-indicators'];
/** The chart-wide rows are offered from the chart body, series and axes, never from a drawing target. Rechecked at execution so a caller that bypasses the disabled row still cannot run them. */
export function workspaceActionError(action:RootChartMenuAction,snapshot:ChartMenuSnapshot):string|null{
 return BODY_ONLY.includes(action)&&snapshot.entity.kind==='drawing'?'This action is available from the chart body, not from a drawing.':null;
}
/** Asynchronous callbacks retain only their own opening; they cannot dismiss a later menu. */
export function createContextMenuExecution(snapshot:ChartMenuSnapshot,port:{current:()=>boolean;actions:()=>ChartContextActions;close:()=>void;error:(value:string)=>void;busy:(value:boolean)=>void;beforeAction?:()=>void}){
 let running=false,disposed=false;
 return{async execute(action:RootChartMenuAction,options?:ChartContextActionOptions){if(disposed||running||!port.current()||!snapshot.controller.contextMenu.isCurrent(snapshot))return;running=true;let lease,transferred=false;const failures:unknown[]=[];
 try{const bodyError=workspaceActionError(action,snapshot);if(bodyError)throw Error(bodyError);if(action==='price-alert'||action==='paper-ticket'){const error=contextPriceTargetError(snapshot);if(error)throw Error(error);}if(options?.order&&action!=='paper-ticket')throw Error('Only a virtual ticket can carry an order preset.');const callback=port.actions()[action];if(!callback)throw Error('This action is unavailable.');lease=snapshot.controller.contextMenu.handoff(snapshot);port.busy(true);port.beforeAction?.();const result=await callback(snapshot,lease,options),ok=typeof result==='boolean'?result:result.ok;if(!ok)throw Error(typeof result==='object'?result.message??'The target was not accepted.':'The target was not accepted.');transferred=true;if(!disposed&&port.current())port.close();}catch(cause){failures.push(cause);}finally{
 if(lease&&!transferred)try{lease.release();}catch(cleanup){failures.push(cleanup);}running=false;if(!disposed&&port.current()){try{port.busy(false);}catch(cleanup){failures.push(cleanup);}if(failures.length)port.error(failures.map(cause=>cause instanceof Error?cause.message:String(cause)).join('; '));}
 }},dispose(){disposed=true;}};
}
