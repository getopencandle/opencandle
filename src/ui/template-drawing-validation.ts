/** Validate native/opaque drawing JSON before template preparation reads or copies it. */
export const TEMPLATE_DRAWING_LIMITS={bytes:32*1024*1024,nodes:500000,depth:32} as const;
export function assertTemplateDrawingData(value:unknown):void{
 let bytes=0,nodes=0;
 const add=(size:number)=>{bytes+=size;if(bytes>TEMPLATE_DRAWING_LIMITS.bytes)throw new Error('Template drawing data exceeds 32 MiB.');};
 // Exact UTF-8 size of a JSON string, including control and lone-surrogate escapes.
 // Counting before stringify avoids creating an oversized expanded JSON string.
 const string=(text:string)=>{
  if(text.length>TEMPLATE_DRAWING_LIMITS.bytes-bytes-2)throw new Error('Template drawing data exceeds 32 MiB.');add(2);
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);
   if(c===34||c===92)add(2);
   else if(c<32)add([8,9,10,12,13].includes(c)?2:6);
   else if(c<128)add(1);
   else if(c<2048)add(2);
   else if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){add(4);i++;}else add(6);}
   else add(c>=0xdc00&&c<=0xdfff?6:3);
  }
 };
 const pending:Array<{value:unknown;depth:number}>=[{value,depth:0}];
 while(pending.length){const current=pending.pop()!,item=current.value;
  if(++nodes>TEMPLATE_DRAWING_LIMITS.nodes||current.depth>TEMPLATE_DRAWING_LIMITS.depth)throw new Error('Template drawing data exceeds node or nesting limits.');
  if(item===null){add(4);continue;}if(typeof item==='boolean'){add(item?4:5);continue;}if(typeof item==='string'){string(item);continue;}
  if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('Template drawing numbers must be finite.');add(JSON.stringify(item).length);continue;}
  if(!item||typeof item!=='object')throw new Error('Template drawing data must contain plain JSON values only.');
  const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new Error('Template drawing data has a custom prototype.');
  const keys=Reflect.ownKeys(item);let count=0;
  if(keys.length-(array?1:0)>TEMPLATE_DRAWING_LIMITS.nodes-nodes-pending.length)throw new Error('Template drawing data exceeds node limits.');
  add(2);
  for(const key of keys){
   if(typeof key!=='string')throw new Error('Template drawing symbols are unsupported.');
   const descriptor=Object.getOwnPropertyDescriptor(item,key)!;
   if(!Object.hasOwn(descriptor,'value'))throw new Error('Template drawing accessors are unsupported.');
   if(array&&key==='length')continue;
   if(!descriptor.enumerable)throw new Error('Hidden template drawing fields are unsupported.');
   if(array){if(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=(item as unknown[]).length)throw new Error('Invalid template drawing array property.');}
   else{string(key);add(1);}
   if(count++)add(1);pending.push({value:descriptor.value,depth:current.depth+1});
  }
  if(array&&count!==(item as unknown[]).length)throw new Error('Sparse template drawing arrays are unsupported.');
 }
}
