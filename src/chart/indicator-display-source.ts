import type {NativeIndicatorDescriptor,SeriesSpec} from '@luxalgo/vela';
import type {IndicatorPrecision} from './indicator-number-format';

export interface IndicatorDisplayPlot {id:string;nativeId:string;value:number;color:string}
export interface IndicatorDisplayOwner {
 id:string;rendererId:string;type:string;descriptor:NativeIndicatorDescriptor;instance:object;
 input:readonly unknown[]|null;series:readonly SeriesSpec[];plots:readonly IndicatorDisplayPlot[];precision?:IndicatorPrecision;valueSuffix?:string;
 /** Volume-unit values (OBV, EFI, A/D, ...): automatic labels and the pane axis read abbreviated (K, M, B). */
 compact?:boolean;
}
interface Registration {chart:object;read:()=>readonly IndicatorDisplayOwner[];active:boolean}
const registrations=new WeakMap<object,Registration>();

/** Trusted port-factory seam. No serialized object or copied port can acquire this capability. */
export function registerIndicatorDisplayPort(port:object,chart:object,read:Registration['read']):()=>void{
 if(registrations.has(port))throw Error('Indicator display port is already registered.');
 const registration={chart,read,active:true};registrations.set(port,registration);
 return()=>{registration.active=false;if(registrations.get(port)===registration)registrations.delete(port);};
}
export function acquireIndicatorDisplayPort(port:object,chart:object):{assertCurrent():void;read():readonly IndicatorDisplayOwner[]}{
 const registration=registrations.get(port);if(!registration||!registration.active||registration.chart!==chart)throw Error('Indicator display requires the exact current domain port and chart.');
 const assertCurrent=()=>{if(!registration.active||registrations.get(port)!==registration)throw Error('Indicator display port authority is retired.');};
 return{assertCurrent,read(){assertCurrent();return registration.read();}};
}
