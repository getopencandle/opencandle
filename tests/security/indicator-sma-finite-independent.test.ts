import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import oracle from '../fixtures/indicator-sma-finite-oracle.json';
import {sma} from '../../src/domain/indicators';

function value(bits:string|null):number|null{
 if(bits===null)return null;
 const data=new DataView(new ArrayBuffer(8));data.setBigUint64(0,BigInt('0x'+bits),false);return data.getFloat64(0,false);
}
function bits(value:number|null):string|null{
 if(value===null)return null;
 const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value,false);return data.getBigUint64(0,false).toString(16).padStart(16,'0');
}

it('uses a separately generated synthetic Python Fraction oracle with declared exactness scope',()=>{
 expect(oracle.synthetic).toBe(true);expect(oracle.cases.length).toBeGreaterThan(20);
 expect(createHash('sha256').update(readFileSync(oracle.generator)).digest('hex')).toBe(oracle.generatorSha256);
 expect(oracle.scope).toContain('No once-rounded-rational requirement');
});

it.each(oracle.cases)('$id has independent binary64 fallback/identity bits and exact prefix causality',test=>{
 const input=test.inputBits.map(value),before=input.map(bits),actual=sma(input,test.period);
 expect(actual.map(bits)).toEqual(test.expectedBits);
 expect(input.map(bits)).toEqual(before);
 for(let end=0;end<=input.length;end++){
  const prefix=input.slice(0,end),snapshot=prefix.map(bits),result=sma(prefix,test.period);
  expect(result.map(bits),`prefix${end}`).toEqual(test.expectedBits.slice(0,end));
  expect(result.map(bits),`full-result prefix${end}`).toEqual(actual.slice(0,end).map(bits));
  expect(prefix.map(bits)).toEqual(snapshot);
 }
});
