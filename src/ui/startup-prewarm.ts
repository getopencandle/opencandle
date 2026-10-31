import {universeDemoSymbols} from '../domain/demo-mode';
import {demoDataset,demoIntradaySources} from './workspace-grid';

/** The first App render reads every demo symbol's generated daily history (the source universe) and the default
 * chart's intraday set. Generating them inside that render made it one ~150 ms task. They are the same cached values
 * (workspace-grid.ts demoDataset / demoIntradaySources), generated here first, one symbol per task, so the render finds
 * them ready. Nothing is generated that the first render would not generate anyway; a failed step is left to the render. */
export function startupPrewarmSteps():Array<()=>void>{
 // Only what the current demo mode can show (nothing in normal use; demo-mode.ts).
 const symbols=universeDemoSymbols();
 return symbols.length?[...symbols.map(symbol=>()=>{demoDataset(symbol);}),()=>{demoIntradaySources('GME');/* GME, the default chart */}]:[];
}

/** Runs each step in its own task (MessageChannel: no timer clamp, input and paint can run between), then `then`. */
export function runInSeparateTasks(steps:ReadonlyArray<()=>void>,then:()=>void):void{
 if(typeof MessageChannel!=='function'){for(const step of steps){try{step();}catch{/* left to the caller */}}then();return;}
 const channel=new MessageChannel();let index=0;
 channel.port1.onmessage=()=>{
  if(index<steps.length){try{steps[index]();}catch{/* left to the caller */}index++;channel.port2.postMessage(0);return;}
  channel.port1.onmessage=null;channel.port1.close();then();
 };
 channel.port2.postMessage(0);
}
