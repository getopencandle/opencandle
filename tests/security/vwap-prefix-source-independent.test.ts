import {expect,it} from 'vitest';
import {createOwnedVwapPrefixSource,type VwapPrefixBasis} from '../../src/chart/vwap-prefix-source';

function harness(){
 const basis:VwapPrefixBasis={epoch:{},source:{synthetic:true},bars:[{time:1700000000,open:1,high:3,low:1,close:2,volume:4}],style:'candles',executionIdentity:'ordinary',disposed:false};
 let onRead=()=>{};
 const source=createOwnedVwapPrefixSource({readBasis(){onRead();return basis;}});
 const prefix=source.capture();
 return{source,prefix,onRead(action:()=>void){onRead=action;}};
}

it('a swallowed nested assertion cannot make the outer assertion return current for a permanently retired prefix',()=>{
 const f=harness();let armed=true,innerFailure:unknown,outerFailure:unknown;
 f.onRead(()=>{if(armed){armed=false;try{f.prefix.assertCurrent();}catch(error){innerFailure=error;}}});
 try{f.prefix.assertCurrent();}catch(error){outerFailure=error;}
 expect(innerFailure).toBeInstanceOf(Error);
 expect(outerFailure).toBeInstanceOf(Error);
 expect(()=>f.prefix.assertCurrent()).toThrow(/retired/);
});

it('readRows publishes no copy if an ownership callback swallows a nested retired assertion',()=>{
 const f=harness();let armed=true,innerFailure:unknown,rows:unknown;
 f.onRead(()=>{if(armed){armed=false;try{f.prefix.assertCurrent();}catch(error){innerFailure=error;}}});
 expect(()=>{rows=f.prefix.readRows(0,1);}).toThrow(/retired/);
 expect(innerFailure).toBeInstanceOf(Error);expect(rows).toBeUndefined();
});

it('packing never evaluates an arbitrary aborted getter in place of an intrinsic AbortSignal',async()=>{
 const f=harness();let reads=0;
 const fake=Object.defineProperty({},'aborted',{get(){reads++;return false;}});
 await expect(f.prefix.prepare(fake as AbortSignal)).rejects.toThrow();
 expect(reads).toBe(0);expect(()=>f.prefix.assertCurrent()).toThrow(/retired/);
});
