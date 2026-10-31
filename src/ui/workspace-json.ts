export const WORKSPACE_JSON_LIMITS={bytes:32*1024*1024,nodes:1000000,depth:80} as const;
const credentials=/^(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|private[_-]?key)$/i;
/** Explicitly omit optional own enumerable object fields whose value is undefined.
 * All other behavior/non-JSON values reject. Null-prototype data maps become
 * ordinary own-property records compatible with the strict main JSON boundary.
 * No toJSON callback or raw JSON.stringify/structuredClone is invoked. */
export interface WorkspaceJSONMetrics {bytes:number;nodes:number;depth:number;}
function inspectWorkspaceJSON(value:unknown,materialize:boolean):{value:Record<string,unknown>;metrics:WorkspaceJSONMetrics}{
 let bytes=0,scheduled=1,maximumDepth=0;const ancestors=new Set<object>(),keyBytes=new Map<string,number>();
 const add=(count:number)=>{bytes+=count;if(bytes>WORKSPACE_JSON_LIMITS.bytes)throw new Error('Workspace exceeds the 32 MiB JSON limit.');};
 const string=(text:string)=>{
  if(text.length>WORKSPACE_JSON_LIMITS.bytes-bytes-2)throw new Error('Workspace exceeds the 32 MiB JSON limit.');add(2);
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c===34||c===92)add(2);else if(c<32)add(c===8||c===9||c===10||c===12||c===13?2:6);else if(c<128)add(1);else if(c<2048)add(2);else if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){add(4);i++;}else add(6);}else add(c>=0xdc00&&c<=0xdfff?6:3);}
 };
 const copy=(item:unknown,depth:number):any=>{
  maximumDepth=Math.max(maximumDepth,depth);
  if(depth>WORKSPACE_JSON_LIMITS.depth)throw new Error('Workspace exceeds the JSON nesting limit.');
  if(item===null){add(4);return null;}if(typeof item==='boolean'){add(item?4:5);return item;}if(typeof item==='string'){string(item);return item;}
  if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('Workspace numbers must be finite.');add(JSON.stringify(item).length);return item;}
  if(!item||typeof item!=='object')throw new Error('Workspace requires plain JSON values.');
  if(ancestors.has(item))throw new Error('Workspace JSON cannot contain cycles.');
  const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new Error('Workspace custom prototypes are unsupported.');
  const keys=Reflect.ownKeys(item);scheduled+=keys.length-(array?1:0);if(scheduled>WORKSPACE_JSON_LIMITS.nodes)throw new Error('Workspace exceeds the JSON node limit.');
  ancestors.add(item);add(2);const output:any=materialize?(array?[]:{}):undefined;let entries=0;
  try{for(const key of keys){
   if(typeof key!=='string')throw new Error('Workspace symbol properties are unsupported.');const descriptor=Object.getOwnPropertyDescriptor(item,key)!;
   if(!Object.hasOwn(descriptor,'value'))throw new Error('Workspace accessors are unsupported.');
   if(array&&key==='length')continue;if(!descriptor.enumerable)throw new Error('Workspace hidden properties are unsupported.');
   if(['__proto__','constructor','prototype'].includes(key)||credentials.test(key))throw new Error('Unsafe or credential workspace fields are unsupported.');
   if(array&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=(item as unknown[]).length))throw new Error('Workspace arrays cannot contain extra fields.');
   if(descriptor.value===undefined){if(array)throw new Error('Workspace arrays cannot contain undefined values.');continue;}
   if(entries++)add(1);
   if(!array){const cached=keyBytes.get(key);if(cached!==undefined)add(cached);else{const before=bytes;string(key);if(key.length<=256&&keyBytes.size<1024)keyBytes.set(key,bytes-before);}add(1);}
   const copied=copy(descriptor.value,depth+1);if(materialize)output[key]=copied;
  }if(array&&entries!==(item as unknown[]).length)throw new Error('Workspace sparse arrays are unsupported.');}finally{ancestors.delete(item);}
  return output;
 };
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Workspace data must be a plain object.');
 const normalized=copy(value,0);return{value:normalized,metrics:{bytes,nodes:scheduled,depth:maximumDepth}};
}
export function prepareWorkspaceJSON(value:unknown):Record<string,unknown>{return inspectWorkspaceJSON(value,true).value;}
/** Same exact JSON boundary as preparation, without allocating a normalized tree. */
export function measureWorkspaceJSON(value:unknown):WorkspaceJSONMetrics{return inspectWorkspaceJSON(value,false).metrics;}
