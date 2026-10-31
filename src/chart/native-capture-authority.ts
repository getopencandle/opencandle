import {chartInputCommitted,type ChartInputSnapshot} from './input-visibility';
import {sameChartSourceBasis} from './source-context';
import {sameBarsInput} from './bar-input-identity';
export interface NativeCaptureState<C>{controller:C|null;desired:ChartInputSnapshot;accepted:ChartInputSnapshot|null;executionIdentity:string;configuration:object;acceptedConfiguration:object|null;applying:boolean;loading:boolean;settled:boolean}
/** A notification is evidence only for the exact subscription owner and committed
 * input/configuration. Reading latest callbacks alone cannot authorize adoption. */
export function createNativeCaptureAuthority<C>(owner:C,opening:Pick<NativeCaptureState<C>,'desired'|'executionIdentity'|'configuration'>,read:()=>NativeCaptureState<C>,inputCurrent:(controller:C,input:ChartInputSnapshot)=>boolean){
 let alive=true;
 const matches=(current:NativeCaptureState<C>)=>alive&&current.controller===owner&&!current.applying&&!current.loading&&current.settled&&current.configuration===opening.configuration&&current.acceptedConfiguration===current.configuration&&current.executionIdentity===opening.executionIdentity&&sameBarsInput(current.desired.bars,opening.desired.bars)&&current.desired.style===opening.desired.style&&sameChartSourceBasis(current.desired.source,opening.desired.source,true)&&chartInputCommitted(current.accepted,current.desired)&&sameChartSourceBasis(current.accepted!.source,current.desired.source,true);
 const isCurrent=()=>{if(!alive)return false;const current=read();if(!matches(current)||!inputCurrent(owner,current.desired)||!alive)return false;return matches(read());};
 return{isCurrent,retire:()=>{alive=false;},capture<T>(operation:()=>T):T|undefined{return isCurrent()?operation():undefined;},publish<T,R>(stage:()=>T,commit:(value:T)=>R):R|undefined{if(!isCurrent())return;const value=stage();return isCurrent()?commit(value):undefined;}};
}
