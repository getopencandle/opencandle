import {acceptChartInput} from './input-lifecycle';
import type {ChartInputSnapshot} from './input-visibility';

type InputPort=Parameters<typeof acceptChartInput>[0]&{
 setExecutionIdentity(identity:string):void;
 getExecutionIdentity():string;
 waitForAnalysisCalculations():Promise<void>;
};

/** A replay run is an input owner even when its current bar prefix is unchanged. */
export async function acceptChartExecutionInput(chart:InputPort,input:ChartInputSnapshot,executionIdentity:string,current:()=>boolean){
 if(!current())return{accepted:false as const};
 chart.setExecutionIdentity(executionIdentity);
 const owns=()=>current()&&chart.getExecutionIdentity()===executionIdentity;
 if(!owns())return{accepted:false as const};
 const result=await acceptChartInput(chart,input,owns);
 if(!result.accepted||!owns())return{accepted:false as const};
 await chart.waitForAnalysisCalculations();
 if(!owns()||!chart.isInputCurrent(input)||!owns())return{accepted:false as const};
 return{...result,executionIdentity};
}
