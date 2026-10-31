import {buildContextPriceRequestData,type ContextPriceRequest,type ContextPriceRequestInput} from './context-price-request';

type Phase='seed'|'use';
/** Public draft data is never authority. Only this instance's currently issued
 * object can act; the root dialog owns and releases the separate native lease. */
export function createContextPriceAuthority(){
 const issued=new WeakMap<ContextPriceRequest,{assertOwner:(phase:Phase)=>void}>();
 let current:ContextPriceRequest|null=null,creating=false;
 const record=(request:ContextPriceRequest)=>{const owner=issued.get(request);if(!owner||current!==request)throw new Error('The clicked-price request was closed, replaced or was not issued here.');return owner;};
 return{
  mint(input:ContextPriceRequestInput,assertOwner:(phase:Phase)=>void):ContextPriceRequest{
   if(current||creating)throw new Error('Finish the current clicked-price request first.');
   creating=true;
   try{assertOwner('seed');const request=buildContextPriceRequestData(input);assertOwner('seed');issued.set(request,{assertOwner});current=request;return request;}finally{creating=false;}
  },
  assert(request:ContextPriceRequest,phase:Phase='use'){
   const owner=record(request);owner.assertOwner(phase);if(record(request)!==owner)throw new Error('The clicked-price request changed during validation.');
  },
  retire(request:ContextPriceRequest):boolean{
   if(current!==request||!issued.has(request))return false;
   issued.delete(request);current=null;return true;
  }
 };
}
