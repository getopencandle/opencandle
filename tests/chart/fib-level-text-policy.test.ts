/** Authored literal policy tests. These are not Supercharts execution,
 * independent-review evidence, native-route tests or Unicode reference oracles.
 */
import {describe,expect,it} from 'vitest';
import {
 FIB_LEVEL_TEXT_MAX_UNITS,FIB_LEVEL_TEXT_RETAINED_MAX_UNITS,
 assertNewFibLevelLabel,assertRetainedFibLevelLabel,validateFibLevelLabelChange,
} from '../../src/chart/fib-level-text-policy';

describe('new Fib custom text: documented ASCII boundary and explicit OpenCandle Unicode rule',()=>{
 it('keeps the new edit limit separate from retained-data resource admission',()=>{
  expect(FIB_LEVEL_TEXT_MAX_UNITS).toBe(50);
  expect(FIB_LEVEL_TEXT_RETAINED_MAX_UNITS).toBe(20000);
 });
 it.each(['','a'.repeat(49),'a'.repeat(50),'a'.repeat(49)+' ',' '.repeat(50),' a ','a\tb'])('accepts exact ASCII/space input %#',value=>{
  expect(()=>assertNewFibLevelLabel(value)).not.toThrow();
 });
 it.each(['a'.repeat(51),' '.repeat(51),'a'.repeat(20001)])('refuses oversized input %# without truncation',value=>{
  expect(()=>assertNewFibLevelLabel(value)).toThrow(/50 characters or fewer/);
 });
 it.each([
  ['emoji', '\ud83d\ude00'.repeat(25),50],
  ['decomposed', 'e\u0301'.repeat(25),50],
  ['BMP', '\u00e9'.repeat(50),50],
  ['lone high surrogate', '\ud800'+'a'.repeat(49),50],
  ['lone low surrogate', '\udc00'+'a'.repeat(49),50],
  ['NUL preserved by existing safe-string policy', 'a\u0000b',3],
 ] as const)('accepts OpenCandle code-unit boundary: %s',(_name,value,units)=>{
  expect(value.length).toBe(units);
  expect(()=>assertNewFibLevelLabel(value)).not.toThrow();
 });
 it.each([
  '\ud83d\ude00'.repeat(26),'\ud83d\ude00'.repeat(25)+'a',
  'e\u0301'.repeat(26),'\u00e9'.repeat(51),
 ])('refuses OpenCandle Unicode length overflow %#',value=>{
  expect(()=>assertNewFibLevelLabel(value)).toThrow(/some Unicode symbols count as two/i);
 });
 it.each([
  ['CR','\r'],['LF','\n'],['CRLF','\r\n'],['VT','\u000b'],
  ['FF','\u000c'],['NEL','\u0085'],['LS','\u2028'],['PS','\u2029'],
 ] as const)('refuses the approved separator %s',(_name,separator)=>{
  expect(()=>assertNewFibLevelLabel('a'+separator+'b')).toThrow(/one line/);
  expect(()=>assertNewFibLevelLabel('a'+separator)).toThrow(/one line/);
 });
 it.each([undefined,null,false,0,NaN,{},[],new String('text'),Symbol('text'),1n,()=>{}].map(value=>[value]))('refuses non-string input %# without coercion',value=>{
  expect(()=>assertNewFibLevelLabel(value)).toThrow(/must be a string/);
 });
 it('reports a bounded useful error without copying an oversized label into it',()=>{
  const label='private-label-content:'.repeat(1000);
  let failure:unknown;
  try{assertNewFibLevelLabel(label);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(/Fibonacci level text.*50/);
  expect((failure as Error).message).not.toContain('private-label-content');
  expect((failure as Error).message.length).toBeLessThan(160);
 });
});

describe('retained Fib labels keep their separate old resource bound',()=>{
 it.each([undefined,'','a'.repeat(51),'a'.repeat(20000),'a\r\nb','\u000b\u000c\u0085\u2028\u2029'])('admits retained input %# without new edit policy',value=>{
  expect(()=>assertRetainedFibLevelLabel(value)).not.toThrow();
 });
 it('does not grandfather a retained string beyond the existing 20000 limit',()=>{
  expect(()=>assertRetainedFibLevelLabel('a'.repeat(20001))).toThrow(/20000/);
  expect(()=>validateFibLevelLabelChange('a'.repeat(20001),'a'.repeat(20001))).toThrow(/20000/);
 });
 it.each([null,false,5,{},[],new String('old'),Symbol('old')].map(value=>[value]))('refuses unsupported retained type %# without widening old admission',value=>{
  expect(()=>assertRetainedFibLevelLabel(value)).toThrow(/string or absent/);
  expect(()=>validateFibLevelLabelChange(value,'valid')).toThrow(/string or absent/);
  expect(()=>validateFibLevelLabelChange(value,value)).toThrow(/string or absent/);
 });
});

describe('changed-label validation uses exact prior scalar values without ownership claims',()=>{
 it.each(['a'.repeat(51),'b'.repeat(20000),'old\r\nlabel','\u2028','\ud83d\ude00'.repeat(100)])('retains an exact existing label %# as unchanged',value=>{
  expect(validateFibLevelLabelChange(value,value)).toBe('unchanged');
 });
 it('keeps absent and own-undefined prior values unmaterialized on an empty no-op',()=>{
  const absent=Object.freeze({}),present=Object.freeze({label:undefined});
  expect(validateFibLevelLabelChange(undefined,'')).toBe('unchanged');
  expect(validateFibLevelLabelChange(Object.getOwnPropertyDescriptor(present,'label')!.value,'')).toBe('unchanged');
  expect(Object.hasOwn(absent,'label')).toBe(false);
  expect(Object.hasOwn(present,'label')).toBe(true);
 });
 it.each([undefined,'','old','x'.repeat(20000),'old\nlabel'])('admits a deliberate valid replacement of prior %#',previous=>{
  expect(validateFibLevelLabelChange(previous,'new label')).toBe('changed');
 });
 it('admits explicit clearing but retains an already empty no-op',()=>{
  expect(validateFibLevelLabelChange('old\nlabel','')).toBe('changed');
  expect(validateFibLevelLabelChange('','')).toBe('unchanged');
 });
 it('refuses a different invalid string even if shorter than a retained legacy label',()=>{
  expect(()=>validateFibLevelLabelChange('a'.repeat(20000),'b'.repeat(51))).toThrow(/50/);
  expect(()=>validateFibLevelLabelChange('old\nlabel','new\nlabel')).toThrow(/one line/);
  expect(()=>validateFibLevelLabelChange('a'.repeat(20000),'b'.repeat(20001))).toThrow(/50/);
 });
 it('does not treat explicit undefined as a new deletion command or equal no-op',()=>{
  expect(()=>validateFibLevelLabelChange(undefined,undefined)).toThrow(/must be a string/);
  expect(()=>validateFibLevelLabelChange('old',undefined)).toThrow(/must be a string/);
 });
 it('does not trim, normalize or collapse distinct Unicode representations',()=>{
  expect(validateFibLevelLabelChange('same',' same ')).toBe('changed');
  expect(validateFibLevelLabelChange('\u00e9','e\u0301')).toBe('changed');
  expect(validateFibLevelLabelChange('e\u0301','e\u0301')).toBe('unchanged');
  expect(validateFibLevelLabelChange('a b','a\tb')).toBe('changed');
 });
});

describe('scalar policy does not invoke caller getters or conversion hooks',()=>{
 it('rejects an object without reading length, valueOf, toString or Symbol.toPrimitive',()=>{
  let reads=0;
  const value=Object.defineProperties({},Object.fromEntries([
   'length','valueOf','toString',Symbol.toPrimitive,
  ].map(key=>[key,{get(){reads++;throw Error('unreachable input getter');}}])));
  expect(()=>assertNewFibLevelLabel(value)).toThrow(/must be a string/);
  expect(()=>assertRetainedFibLevelLabel(value)).toThrow(/string or absent/);
  expect(()=>validateFibLevelLabelChange('old',value)).toThrow(/must be a string/);
  expect(()=>validateFibLevelLabelChange(value,'new')).toThrow(/string or absent/);
  expect(reads).toBe(0);
 });
 it('does not enumerate or reflect on a Proxy-valued label',()=>{
  let traps=0;
  const fail=()=>{traps++;throw Error('unreachable Proxy trap');};
  const value=new Proxy({}, {get:fail,getPrototypeOf:fail,ownKeys:fail,getOwnPropertyDescriptor:fail});
  expect(()=>assertNewFibLevelLabel(value)).toThrow(/must be a string/);
  expect(()=>assertRetainedFibLevelLabel(value)).toThrow(/string or absent/);
  expect(()=>validateFibLevelLabelChange(undefined,value)).toThrow(/must be a string/);
  expect(traps).toBe(0);
 });
 it('rejects a revoked Proxy using primitive type validation alone',()=>{
  const item=Proxy.revocable({},{});item.revoke();
  expect(()=>assertNewFibLevelLabel(item.proxy)).toThrow(/must be a string/);
  expect(()=>validateFibLevelLabelChange(item.proxy,'a')).toThrow(/string or absent/);
 });
});
