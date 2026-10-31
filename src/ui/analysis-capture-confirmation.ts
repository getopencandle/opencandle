import {AnalysisPublicationError} from '../chart/analysis-publication';
export interface AnalysisCaptureHost {assertCurrent():void;readSaved():unknown;readNative():unknown;refresh():void;quarantine(error:AnalysisPublicationError):void}
/** Plain data only. Record insertion order is irrelevant; array order and omissions are not. */
function recordIdentity(value:unknown):string{
 let nodes=0,characters=0;const seen=new Set<object>();
 function visit(next:unknown,depth:number):string{
  if(++nodes>300000||depth>40)throw Error('Analysis readback exceeds the structural comparison limit.');
  if(next===null)return'null';if(typeof next==='boolean')return next?'true':'false';
  if(typeof next==='number'){if(!Number.isFinite(next))throw Error('Analysis readback contains a nonfinite number.');return Object.is(next,-0)?'number:-0':'number:'+String(next);}
  if(typeof next==='string'){characters+=next.length;if(characters>16*1024*1024)throw Error('Analysis readback exceeds the text comparison limit.');return'string:'+JSON.stringify(next);}
  if(!next||typeof next!=='object'||seen.has(next))throw Error('Analysis readback requires acyclic plain data.');
  const array=Array.isArray(next),prototype=Object.getPrototypeOf(next);if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw Error('Analysis readback contains a non-plain record.');
  seen.add(next);try{
   const keys=Reflect.ownKeys(next);if(keys.some(key=>typeof key!=='string'))throw Error('Analysis readback contains symbol fields.');
   const field=(key:string)=>{const descriptor=Object.getOwnPropertyDescriptor(next,key);if(!descriptor||!('value' in descriptor)||!descriptor.enumerable)throw Error('Analysis readback requires enumerable data fields.');return visit(descriptor.value,depth+1);};
   if(array){const length=Object.getOwnPropertyDescriptor(next,'length')!.value as number;if(keys.length!==length+1||length>300000)throw Error('Analysis readback array is sparse or has extra fields.');return'array:['+Array.from({length},(_,ordinal)=>field(String(ordinal))).join(',')+']';}
   return'record:{'+(keys as string[]).sort().map(key=>JSON.stringify(key)+':'+field(key)).join(',')+'}';
  }finally{seen.delete(next);}
 }
 return visit(value,0);
}
/** Compare actual accepted records, independently of the presentation refresh. */
export function confirmAnalysisPublication(domain:string,host:AnalysisCaptureHost):true{
 host.assertCurrent();const saved=recordIdentity(host.readSaved());host.assertCurrent();
 const native=recordIdentity(host.readNative());host.assertCurrent();
 const finalSaved=recordIdentity(host.readSaved());host.assertCurrent();
 if(saved!==native||saved!==finalSaved){
  const error=new AnalysisPublicationError(domain,[Error('The saved workspace does not match the accepted native analysis.')]);
  try{host.quarantine(error);}catch(cause){throw new AnalysisPublicationError(domain,[...error.causes,cause]);}throw error;
 }
 host.refresh();host.assertCurrent();return true;
}
