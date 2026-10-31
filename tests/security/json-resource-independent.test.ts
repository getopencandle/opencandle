import {expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {jsonData,MAX_JSON_BYTES}=require('../../electron/validation.cjs') as {
  jsonData:(value:unknown)=>Record<string,any>;
  MAX_JSON_BYTES:number;
};

// Actual boundary module; no file fixtures, Electron process or worker execution.
// The stringify sentinel prevents a regression from allocating the large output.
function rejectedBeforeSerialization(input:unknown,pattern:RegExp){
  let failed=false,cause:unknown,calls=0;
  const sentinel=new Error('SYNTHETIC unexpected whole JSON serialization');
  const stringify=vi.spyOn(JSON,'stringify').mockImplementation(()=>{calls++;throw sentinel;});
  try{jsonData(input);}catch(error){failed=true;cause=error;}finally{stringify.mockRestore();}
  expect(failed).toBe(true);expect(cause).not.toBe(sentinel);
  expect(cause).toMatchObject({code:'INVALID_ARGUMENT'});
  expect(String(cause)).toMatch(pattern);expect(calls).toBe(0);
}

it('refuses a maximum-length sparse array before inspecting its end getter or serializing',()=>{
  const sparse=new Array(0xffffffff);let reads=0;
  Object.defineProperty(sparse,'4294967294',{enumerable:true,get(){reads++;return 'SYNTHETIC forbidden';}});
  rejectedBeforeSerialization({rows:sparse},/structure exceeds limits/);expect(reads).toBe(0);
});

it.each([
  ['a leading hole',()=>{const rows=new Array(2);rows[1]=1;return rows;}],
  ['a trailing hole',()=>{const rows=new Array(2);rows[0]=1;return rows;}],
  ['a hidden indexed value',()=>Object.defineProperty([1],'0',{value:1,enumerable:false})],
  ['an enumerable non-index property',()=>Object.assign([1],{extra:'SYNTHETIC'})]
] as Array<[string,()=>unknown]>)('refuses %s before whole serialization',(_label,make)=>{
  rejectedBeforeSerialization({rows:make()},/dense JSON arrays/);
});

it.each(['object','array'] as const)('does not invoke an own enumerable %s accessor',kind=>{
  let reads=0;const value=kind==='array'?new Array(1):{};
  Object.defineProperty(value,kind==='array'?'0':'value',{enumerable:true,get(){reads++;return 'SYNTHETIC forbidden';}});
  rejectedBeforeSerialization({value},/JSON data properties/);expect(reads).toBe(0);
});

it.each([
  ['object',false],['object',true],['array',false],['array',true]
] as const)('refuses a hidden %s serializer (accessor=%s) without invoking it',(kind,accessor)=>{
  let calls=0;const value=kind==='array'?[]:{};
  Object.defineProperty(value,'toJSON',accessor
    ?{enumerable:false,get(){calls++;return ()=>({changed:true});}}
    :{enumerable:false,value(){calls++;return {changed:true};}});
  rejectedBeforeSerialization({value},/Custom JSON serializers/);expect(calls).toBe(0);
});

it.each([
  ['object',()=>Object.create({inherited:'SYNTHETIC'})],
  ['array',()=>Object.setPrototypeOf([1],Object.create(Array.prototype))]
] as Array<[string,()=>unknown]>)('refuses a custom %s prototype before serialization',(_label,make)=>{
  rejectedBeforeSerialization({value:make()},/plain JSON objects and arrays/);
});

it('counts escaped bytes at every repeated string occurrence before whole serialization',()=>{
  // One 8 KiB string, reused 683 times: JSON escapes every NUL as six ASCII
  // bytes. Literal envelope/punctuation adds 10+3*683 bytes, totaling33,572,875.
  const chunk='\u0000'.repeat(8192),input={rows:Array(683).fill(chunk)};
  expect(MAX_JSON_BYTES).toBe(33_554_432);
  expect(10+683*(6*8192+3)).toBe(33_572_875);
  rejectedBeforeSerialization(input,/32 MiB limit/);
});

it('round-trips independent small JSON escape and Unicode literals without coercion',()=>{
  const input={text:'"\\\b\t\n\f\r\u0000\u001f',unicode:'A\u00e9\u20ac\ud83d\ude42\ud800X\udc00\u2028\u2029','key\n\ud800':'value',numbers:[0,-0,1e21,Number.MIN_VALUE],values:[true,false,null,''],toJSON:'ordinary data'};
  const result=jsonData(input);
  expect(result.text).toBe('"\\\b\t\n\f\r\u0000\u001f');
  expect(result.unicode).toBe('A\u00e9\u20ac\ud83d\ude42\ud800X\udc00\u2028\u2029');
  expect(result['key\n\ud800']).toBe('value');expect(result.toJSON).toBe('ordinary data');
  expect(result.numbers).toEqual([0,0,1e21,Number.MIN_VALUE]);expect(Object.is(result.numbers[1],-0)).toBe(false);
  expect(result.values).toEqual([true,false,null,'']);
  expect(JSON.stringify(result.text)).toBe('"\\\"\\\\\\b\\t\\n\\f\\r\\u0000\\u001f"');
});

it('accepts dense ordinary arrays and copies a shared acyclic object per occurrence',()=>{
  const shared={label:'SYNTHETIC shared value',values:[null,2]},input={first:shared,again:[shared],empty:[]};
  const result=jsonData(input);
  expect(result).toEqual({first:{label:'SYNTHETIC shared value',values:[null,2]},again:[{label:'SYNTHETIC shared value',values:[null,2]}],empty:[]});
  expect(result.first).not.toBe(shared);expect(result.first).not.toBe(result.again[0]);
  result.first.values[1]=9;expect(shared.values).toEqual([null,2]);expect(result.again[0].values).toEqual([null,2]);
});

it('rejects an actual cycle without confusing it with an allowed shared object',()=>{
  const first:Record<string,unknown>={},second={first};first.second=second;
  rejectedBeforeSerialization({first},/acyclic JSON/);
});

it.each([
  {nested:{api_key:'SYNTHETIC forbidden credential field'}},
  JSON.parse('{"nested":{"__proto__":1}}'),
  {nested:{constructor:'SYNTHETIC unsafe key'}}
])('retains unsafe and credential-key refusal before whole serialization (%#)',input=>{
  rejectedBeforeSerialization(input,/Credentials|Unsafe object keys/);
});

it.each([NaN,Infinity,-Infinity,undefined,1n,Symbol('SYNTHETIC'),()=>1])('refuses a non-JSON value before whole serialization (%#)',value=>{
  rejectedBeforeSerialization({value},/Non-finite|acyclic JSON/);
});
