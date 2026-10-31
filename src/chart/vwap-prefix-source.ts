import type {Bar} from '../domain/types';

const MAX_ROWS=100000,CHUNK_ROWS=128,SLICE_MS=4;
const FIELDS=['time','open','high','low','close','volume'] as const;
// Time price opportunity is time-based and calculates on the standard bars.
const STANDARD_STYLES=new Set(['line','linemarkers','step','area','hlcarea','baseline','columns','bars','hlcbars','highlow','candles','hollow','volumecandles','tpo','sessionvp','footprint']);
const signalAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const addAbortListener=EventTarget.prototype.addEventListener,removeAbortListener=EventTarget.prototype.removeEventListener;
export interface VwapPrefixBasis {
 readonly epoch:object;readonly source:object;readonly bars:readonly Bar[];
 readonly style:string;readonly executionIdentity:string;readonly disposed:boolean;
}
export interface OwnedVwapPrefix {
 readonly rows:number;readonly executionIdentity:string;readonly transform:'standard'|'heikin-ashi';
 assertCurrent():void;
 prepare(signal:AbortSignal):Promise<ArrayBuffer>;
 readRows(start:number,count:number):Bar[];
}
interface Host {readBasis():VwapPrefixBasis}

/** Internal adapter boundary: the supplied graph must already be a private
 * detached committed input. This is not an importer or a Proxy detector. */
export function createOwnedVwapPrefixSource(host:Host){
 const descriptor=Object.getOwnPropertyDescriptor(host,'readBasis');
 if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('VWAP prefix host requires an own data method.');
 const read=descriptor.value as Host['readBasis'],sealed=new WeakSet<object>(),preparing=new Set<()=>void>();
 let disposed=false,capturing=false;
 const installed=()=>{const field=Object.getOwnPropertyDescriptor(host,'readBasis');if(disposed||!field||!Object.hasOwn(field,'value')||field.value!==read||field.writable!==descriptor.writable||field.configurable!==descriptor.configurable||field.enumerable!==descriptor.enumerable)throw Error('VWAP prefix source is retired.');};
 const basis=()=>{
  installed();const raw=Reflect.apply(read,host,[]) as VwapPrefixBasis;installed();
  if(!raw||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('VWAP prefix basis is unavailable.');
  const values:Record<string,unknown>={};for(const key of ['epoch','source','bars','style','executionIdentity','disposed']){const field=Object.getOwnPropertyDescriptor(raw,key);if(!field||!Object.hasOwn(field,'value')||!field.enumerable)throw Error('VWAP prefix basis requires data fields.');values[key]=field.value;}
  if(!values.epoch||typeof values.epoch!=='object'||!values.source||typeof values.source!=='object'||!Array.isArray(values.bars)||typeof values.style!=='string'||typeof values.executionIdentity!=='string'||!values.executionIdentity||values.executionIdentity.length>4096||values.disposed!==false)throw Error('VWAP prefix source is unavailable.');
  return values as unknown as VwapPrefixBasis;
 };
 const same=(a:VwapPrefixBasis,b:VwapPrefixBasis)=>a.epoch===b.epoch&&a.source===b.source&&a.bars===b.bars&&a.style===b.style&&a.executionIdentity===b.executionIdentity;
 const rowCount=(bars:readonly Bar[])=>{
  const length=Object.getOwnPropertyDescriptor(bars,'length');
  if(Object.getPrototypeOf(bars)!==Array.prototype||!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>MAX_ROWS)throw Error('VWAP prefix requires at most100000 ordinary rows.');
  return length.value as number;
 };
 const source={
  capture():OwnedVwapPrefix{
   installed();if(capturing)throw Error('VWAP prefix capture reentered.');capturing=true;
   try{
    const opening=basis();if(opening.style!=='heikinashi'&&!STANDARD_STYLES.has(opening.style))throw Error('VWAP calculation inputs are unavailable for this chart topology.');const count=rowCount(opening.bars);if(!same(opening,basis()))throw Error('VWAP prefix changed during admission.');
    // This lease initially owns metadata/source identity only. The trusted
    // adapter has no supported mutable raw-row alias; preparation must finish
    // before any consumer may read numerical rows from this handle.
    let live=true,checking=false,prepared=false,complete=false;
    const assert=()=>{if(!live||checking){live=false;throw Error('VWAP prefix handle is retired.');}checking=true;try{installed();if(!same(opening,basis())||rowCount(opening.bars)!==count)throw Error('VWAP prefix ownership changed.');if(!live)throw Error('VWAP prefix handle retired during its ownership callback.');}catch(error){live=false;throw error;}finally{checking=false;}};
    const receiver=(self:unknown)=>{if(self!==handle)throw Error('Foreign VWAP prefix receiver.');};
    const copy=(index:number):Bar=>{const row=opening.bars[index];return{time:row.time,open:row.open,high:row.high,low:row.low,close:row.close,volume:Object.hasOwn(row,'volume')?row.volume:NaN};};
    const handle:OwnedVwapPrefix=Object.freeze({
     rows:count,executionIdentity:opening.executionIdentity,transform:opening.style==='heikinashi'?'heikin-ashi':'standard',
     assertCurrent(this:OwnedVwapPrefix){receiver(this);assert();},
     readRows(this:OwnedVwapPrefix,start:number,length:number){receiver(this);assert();if(!complete)throw Error('VWAP prefix preparation is not complete.');if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||length>CHUNK_ROWS||start+length>count)throw Error('VWAP row chunk is outside its owned prefix.');const result=Array.from({length},(_,index)=>copy(start+index));assert();return result;},
     async prepare(this:OwnedVwapPrefix,signal:AbortSignal):Promise<ArrayBuffer>{
      receiver(this);assert();if(prepared)throw Error('VWAP prefix packing is already consumed.');prepared=true;
      type Task={timer:ReturnType<typeof setTimeout>|undefined;consumed:boolean;reject:(error:unknown)=>void};
      let pending:Task|undefined,abortAttempted=false,stopped=false,stopCause:unknown,lastClock=-Infinity;
      const stopFailures:unknown[]=[];
      const combined=(cause:unknown,failures:unknown[])=>failures.length?new AggregateError([cause,...failures],'VWAP prefix preparation and cleanup failed.'):cause;
      const clearTask=(task:Task)=>{const timer=task.timer;task.timer=undefined;if(timer!==undefined)clearTimeout(timer);};
      const cleanup=()=>{
       const failures:unknown[]=[],task=pending;pending=undefined;preparing.delete(disposePreparation);
       if(task){task.consumed=true;try{clearTask(task);}catch(error){failures.push(error);}}
       if(abortAttempted){abortAttempted=false;try{Reflect.apply(removeAbortListener,signal,['abort',onAbort]);}catch(error){failures.push(error);}}
       return{task,failures};
      };
      const stop=(cause:unknown)=>{
       if(stopped)return;stopped=true;live=false;stopCause=cause;
       const released=cleanup();stopFailures.push(...released.failures);released.task?.reject(cause);
      };
      const onAbort=()=>stop(Error('VWAP prefix packing was cancelled.'));
      const disposePreparation=()=>stop(Error('VWAP prefix source was disposed during preparation.'));
      const local=()=>{if(stopped)throw stopCause;};
      const check=()=>{local();assert();local();if(Reflect.apply(signalAborted,signal,[]))throw Error('VWAP prefix packing was cancelled.');assert();local();if(Reflect.apply(signalAborted,signal,[]))throw Error('VWAP prefix packing was cancelled.');};
      const now=()=>{const time=performance.now();if(!Number.isFinite(time)||time<0||time<lastClock)throw Error('VWAP prefix clock is unavailable.');lastClock=time;return time;};
      const pause=()=>new Promise<void>((resolve,reject)=>{
       check();const task:Task={timer:undefined,consumed:false,reject};pending=task;let acquiring=true,synchronous=false;
       const resume=()=>{if(task.consumed||pending!==task)return;task.consumed=true;if(acquiring){synchronous=true;return;}pending=undefined;try{clearTask(task);check();resolve();}catch(error){reject(error);}};
       try{task.timer=setTimeout(resume,0);acquiring=false;if(stopped||pending!==task){clearTask(task);local();return;}check();if(synchronous)throw Error('VWAP prefix timer must yield asynchronously.');}
       catch(error){acquiring=false;if(pending===task)pending=undefined;task.consumed=true;try{clearTask(task);}catch(cleanupError){error=combined(error,[cleanupError]);}if(stopped&&error!==stopCause)stopFailures.push(error);reject(error);}
      });
      try{
       check();preparing.add(disposePreparation);abortAttempted=true;Reflect.apply(addAbortListener,signal,['abort',onAbort,{once:true}]);check();
       const result=new Float64Array(count*FIELDS.length),alreadySealed=sealed.has(opening.bars);check();
       let index=0;
       while(index<count){
        check();const started=now();let visited=0;
        do{
         const offset=index*FIELDS.length;
         if(alreadySealed){const row=opening.bars[index];for(let column=0;column<FIELDS.length;column++){const key=FIELDS[column];result[offset+column]=key==='volume'&&!Object.hasOwn(row,key)?NaN:row[key];}}
         else{
          const key=String(index),item=Object.getOwnPropertyDescriptor(opening.bars,key);if(!item||!Object.hasOwn(item,'value')||!item.enumerable)throw Error('VWAP prefix must be dense ordinary data.');
          const row=item.value;if(!row||![Object.prototype,null].includes(Object.getPrototypeOf(row)))throw Error('VWAP prefix row must be ordinary data.');
          const fields=FIELDS.map(name=>{const field=Object.getOwnPropertyDescriptor(row,name);if(!field&&name==='volume')return undefined;if(!field||!Object.hasOwn(field,'value')||!field.enumerable||typeof field.value!=='number')throw Error('VWAP prefix requires numeric data fields.');return field;});
          for(let column=0;column<FIELDS.length;column++){const field=fields[column];if(field)Object.defineProperty(row,FIELDS[column],{...field,writable:false,configurable:false});result[offset+column]=field?field.value:NaN;}
          Object.preventExtensions(row);Object.defineProperty(opening.bars,key,{...item,writable:false,configurable:false});
         }
         index++;visited++;
        }while(index<count&&visited<CHUNK_ROWS&&now()-started<SLICE_MS);
        check();if(index<count){await pause();check();}
       }
       check();if(!alreadySealed)Object.freeze(opening.bars);check();
       const released=cleanup();if(released.failures.length)throw new AggregateError(released.failures,'VWAP prefix preparation cleanup failed.');check();
       // Only complete, current preparation may certify this private graph.
       sealed.add(opening.bars);complete=true;return result.buffer;
      }catch(error){live=false;const released=cleanup();if(stopped&&error!==stopCause&&!stopFailures.includes(error))stopFailures.push(error);throw combined(stopped?stopCause:error,[...stopFailures,...released.failures]);}
     },
    });assert();return handle;
   }finally{capturing=false;}
  },
  dispose(){if(disposed)return;disposed=true;const failures:unknown[]=[];for(const cancel of [...preparing])try{cancel();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'VWAP prefix disposal cleanup failed.');},
 };
 return Object.freeze(source);
}
