/** Literal definitions promoted from the separately preserved 89-case draft.
 * Expectations below are authored independently of the implementation. This is
 * authored coverage, not an independent reviewer or native/UI result.
 */
import {describe,expect,it} from 'vitest';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {
 assertFibLevelPresentationPatchValues,cloneFibPresentationMember,composeFibBackgroundAlpha,
 fibBackgroundMultiplier,patchFibLevelPresentationProps,placeFibCustomText,
 readFibBackground,readFibText,retainFibLevelPresentationMembers,
 validateFibBackground,validateFibText,
} from '../../src/chart/fib-level-presentation-data';

type Data=Record<string,unknown>;
const background=(opacity:number)=>({schemaVersion:1,opacity});
const text=(enabled:boolean,position:string)=>({schemaVersion:1,enabled,position});

describe('draft independent literal background scalars',()=>{
 it.each([[0,0],[6,0.06],[25,0.25],[100,1]])('opacity %s gives multiplier %s',(opacity,expected)=>{
  expect(fibBackgroundMultiplier(opacity)).toBe(expected);
 });
 it.each([[0.8,50,0.4],[0.8,6,0.048],[1,25,0.25],[0,100,0],[1,0,0]])('incoming %s and opacity %s give %s',(incoming,opacity,expected)=>{
  expect(composeFibBackgroundAlpha(incoming,opacity)).toBe(expected);
 });
 it('preserves signed zero without treating it as a missing member',()=>{
  expect(Object.is(fibBackgroundMultiplier(-0),-0)).toBe(true);
  expect(Object.is(composeFibBackgroundAlpha(1,-0),-0)).toBe(true);
  expect(Object.is(validateFibBackground(background(-0)).opacity,-0)).toBe(true);
 });
 it.each([NaN,Infinity,-Infinity,-1,101,'6',null,undefined])('rejects invalid opacity %# without coercion',value=>{
  expect(()=>fibBackgroundMultiplier(value)).toThrow();
 });
 it.each([NaN,Infinity,-1,1.001,'0.8',null,undefined])('rejects invalid incoming alpha %#',value=>{
  expect(()=>composeFibBackgroundAlpha(value,25)).toThrow();
 });
 it('reports positive scalar or composed underflow instead of claiming zero opacity',()=>{
  expect(()=>fibBackgroundMultiplier(Number.MIN_VALUE)).toThrow(/too small to represent/);
  expect(()=>composeFibBackgroundAlpha(Number.MIN_VALUE,50)).toThrow(/too small to represent/);
  expect(composeFibBackgroundAlpha(Number.MIN_VALUE,100)).toBe(Number.MIN_VALUE);
 });
 it('does not accept or inspect an object-valued opacity',()=>{
  let calls=0;
  const value={valueOf(){calls++;return 25;}};
  expect(()=>fibBackgroundMultiplier(value)).toThrow();
  expect(calls).toBe(0);
 });
});

describe('draft closed tuples and feature-local interpretation',()=>{
 it('uses explicit local compatibility defaults only for absence',()=>{
  expect(readFibBackground(undefined)).toEqual({state:'legacy',settings:{schemaVersion:1,opacity:6}});
  expect(readFibBackground({})).toEqual({state:'legacy',settings:{schemaVersion:1,opacity:6}});
  expect(readFibText(undefined)).toEqual({state:'legacy',settings:{schemaVersion:1,enabled:true,position:'center'}});
  expect(readFibText({})).toEqual({state:'legacy',settings:{schemaVersion:1,enabled:true,position:'center'}});
 });
 it.each([undefined,null,{schemaVersion:2,opacity:6},{schemaVersion:1,opacity:6,extra:undefined}])('does not turn present invalid background %# into absence',value=>{
  expect(readFibBackground({lvFibBackground:value}).state).toBe('unavailable');
 });
 it.each([undefined,null,{schemaVersion:2,enabled:true,position:'center'},{schemaVersion:1,enabled:false,position:'outside'}])('does not turn present invalid text %# into absence',value=>{
  expect(readFibText({lvFibText:value}).state).toBe('unavailable');
 });
 it('returns detached frozen supported tuples',()=>{
  const bg=background(25),label=text(false,'right');
  const checkedBg=validateFibBackground(bg),checkedText=validateFibText(label);
  bg.opacity=100;label.position='left';
  expect(checkedBg).toEqual({schemaVersion:1,opacity:25});
  expect(checkedText).toEqual({schemaVersion:1,enabled:false,position:'right'});
  expect(Object.isFrozen(checkedBg)).toBe(true);expect(Object.isFrozen(checkedText)).toBe(true);
 });
 it('validates dormant text position and strict boolean types',()=>{
  expect(()=>validateFibText(text(false,'outside'))).toThrow();
  expect(()=>validateFibText({schemaVersion:1,enabled:0,position:'left'})).toThrow();
  expect(()=>validateFibBackground({schemaVersion:'1',opacity:6})).toThrow();
 });
 it('keeps unknown background separate from known text and the reverse',()=>{
  const first={lvFibBackground:{schemaVersion:9,future:undefined},lvFibText:text(true,'right')};
  const second={lvFibBackground:background(25),lvFibText:{schemaVersion:9,future:-0}};
  expect(readFibBackground(first).state).toBe('unavailable');
  expect(readFibText(first)).toEqual({state:'supported',settings:{schemaVersion:1,enabled:true,position:'right'}});
  expect(readFibBackground(second)).toEqual({state:'supported',settings:{schemaVersion:1,opacity:25}});
  expect(readFibText(second).state).toBe('unavailable');
 });
 it('does not read an unrelated sibling getter',()=>{
  let calls=0;
  const bgProps={lvFibBackground:background(25)},textProps={lvFibText:text(true,'left')};
  Object.defineProperty(bgProps,'lvFibText',{enumerable:true,get(){calls++;throw Error('sibling getter');}});
  Object.defineProperty(textProps,'lvFibBackground',{enumerable:true,get(){calls++;throw Error('sibling getter');}});
  expect(readFibBackground(bgProps).state).toBe('supported');
  expect(readFibText(textProps).state).toBe('supported');expect(calls).toBe(0);
 });
 it('rejects accessors, hidden members, symbols and custom tuple prototypes without getters',()=>{
  let calls=0;
  const getter={schemaVersion:1};
  Object.defineProperty(getter,'opacity',{enumerable:true,get(){calls++;return 6;}});
  const hidden={schemaVersion:1};Object.defineProperty(hidden,'opacity',{value:6,enumerable:false});
  const symbol={schemaVersion:1,opacity:6,[Symbol('extra')]:1};
  const inherited=Object.assign(Object.create({future:1}),{schemaVersion:1,opacity:6});
  for(const value of [getter,hidden,symbol,inherited])expect(()=>validateFibBackground(value)).toThrow();
  expect(calls).toBe(0);
 });
 it('accepts safe null-prototype own-data tuples without inheriting fields',()=>{
  const value=Object.assign(Object.create(null),{schemaVersion:1,enabled:false,position:'left'});
  expect(validateFibText(value)).toEqual({schemaVersion:1,enabled:false,position:'left'});
  expect(()=>validateFibText(Object.create({schemaVersion:1,enabled:true,position:'center'}))).toThrow();
 });
});

describe('draft raw patch admission and pure effective merge',()=>{
 it.each([
  {'lvFibBackground.opacity':undefined},{'lvFibText.enabled':undefined},{'lvFibText.position':undefined},
  {lvFibBackground:{schemaVersion:1,opacity:25}},{'lvFibBackground.schemaVersion':1},
  {'lvFibText.future':true},{'props.lvFibText.position':'left'},{'lvFibText.enabled':'false'},
 ])('refuses explicit invalid raw path %# before detachment',patch=>{
  expect(()=>assertFibLevelPresentationPatchValues(patch)).toThrow();
 });
 it('rejects a recognized getter without reading it but leaves unrelated fields to outer admission',()=>{
  let calls=0;
  const recognized={};Object.defineProperty(recognized,'lvFibText.enabled',{enumerable:true,get(){calls++;return false;}});
  const unrelated={};Object.defineProperty(unrelated,'unrelated',{enumerable:true,get(){calls++;return true;}});
  expect(()=>assertFibLevelPresentationPatchValues(recognized)).toThrow();
  expect(()=>assertFibLevelPresentationPatchValues(unrelated)).not.toThrow();
  expect(()=>patchFibLevelPresentationProps(undefined,unrelated)).toThrow();
  expect(calls).toBe(0);
 });
 it('does not materialize legacy effective defaults and preserves no-op identity',()=>{
  const legacy=Object.freeze({other:1});
  const defaults={'lvFibBackground.opacity':6,'lvFibText.enabled':true,'lvFibText.position':'center'};
  expect(patchFibLevelPresentationProps(undefined,defaults)).toBeUndefined();
  expect(patchFibLevelPresentationProps(legacy,defaults)).toBe(legacy);
  const explicit=Object.freeze({lvFibBackground:Object.freeze(background(25)),lvFibText:Object.freeze(text(false,'left'))});
  expect(patchFibLevelPresentationProps(explicit,{'lvFibBackground.opacity':25,'lvFibText.enabled':false})).toBe(explicit);
 });
 it('creates complete validated tuples only for requested effective changes',()=>{
  expect(patchFibLevelPresentationProps(undefined,{'lvFibBackground.opacity':25})).toEqual({lvFibBackground:{schemaVersion:1,opacity:25}});
  expect(patchFibLevelPresentationProps(undefined,{'lvFibText.position':'left'})).toEqual({lvFibText:{schemaVersion:1,enabled:true,position:'left'}});
  expect(patchFibLevelPresentationProps(undefined,{'lvFibText.enabled':false})).toEqual({lvFibText:{schemaVersion:1,enabled:false,position:'center'}});
 });
 it('preserves an untouched future background while editing known text',()=>{
  const future={schemaVersion:8,nested:{optional:undefined,zero:-0}};
  const props={lvFibBackground:future,lvFibText:text(true,'center'),other:undefined};
  const result=patchFibLevelPresentationProps(props,{'lvFibText.position':'right'}) as Data;
  expect(result.lvFibText).toEqual({schemaVersion:1,enabled:true,position:'right'});
  expect(result.lvFibBackground).toEqual({schemaVersion:8,nested:{optional:undefined,zero:-0}});
  const retained=(result.lvFibBackground as Data).nested as Data;
  expect(Object.hasOwn(retained,'optional')).toBe(true);expect(Object.is(retained.zero,-0)).toBe(true);
  expect(result.lvFibBackground).not.toBe(future);expect(Object.hasOwn(result,'other')).toBe(true);
  expect(props.lvFibText.position).toBe('center');
 });
 it('preserves an untouched future text while editing known background',()=>{
  const props={lvFibBackground:background(6),lvFibText:{schemaVersion:8,optional:undefined,zero:-0}};
  const result=patchFibLevelPresentationProps(props,{'lvFibBackground.opacity':100}) as Data;
  expect(result.lvFibBackground).toEqual({schemaVersion:1,opacity:100});
  expect(result.lvFibText).toEqual({schemaVersion:8,optional:undefined,zero:-0});
  expect(Object.hasOwn(result.lvFibText as Data,'optional')).toBe(true);
 });
 it('does not reinterpret a requested unknown member or partially change a mixed patch',()=>{
  const props=Object.freeze({lvFibBackground:Object.freeze(background(6)),lvFibText:Object.freeze({schemaVersion:8,enabled:false,position:'center'})});
  expect(()=>patchFibLevelPresentationProps(props,{'lvFibBackground.opacity':25,'lvFibText.enabled':true})).toThrow();
  expect(props.lvFibBackground.opacity).toBe(6);
  expect(props.lvFibText).toEqual({schemaVersion:8,enabled:false,position:'center'});
  expect(()=>patchFibLevelPresentationProps({lvFibText:text(false,'bad')},{'lvFibText.enabled':false})).toThrow();
 });
 it('retains signed-zero distinction on explicit settings',()=>{
  const original={lvFibBackground:background(0)};
  const result=patchFibLevelPresentationProps(original,{'lvFibBackground.opacity':-0}) as Data;
  expect(result).not.toBe(original);
  expect(Object.is((result.lvFibBackground as Data).opacity,-0)).toBe(true);
  expect(Object.is(original.lvFibBackground.opacity,0)).toBe(true);
 });
});

describe('draft bounded semantic copies and post-normalizer retention',()=>{
 it('copies safe unknown members without losing own undefined or signed zero',()=>{
  const original={schemaVersion:9,future:undefined,values:[{optional:undefined},-0]};
  const copied=cloneFibPresentationMember(original) as typeof original;
  expect(copied).toEqual({schemaVersion:9,future:undefined,values:[{optional:undefined},-0]});
  expect(Object.hasOwn(copied,'future')).toBe(true);expect(Object.is(copied.values[1],-0)).toBe(true);
  expect(copied).not.toBe(original);expect(copied.values).not.toBe(original.values);
  expect(copied.values[0]).not.toBe(original.values[0]);
 });
 it('normalizes null-prototype data maps while retaining their own data',()=>{
  const original=Object.assign(Object.create(null),{optional:undefined,zero:-0});
  const copied=cloneFibPresentationMember(original) as Data;
  expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
  expect(Object.hasOwn(copied,'optional')).toBe(true);expect(Object.is(copied.zero,-0)).toBe(true);
 });
 it('rejects behavior, sparse/undefined arrays, cycles and extra array methods before copying',()=>{
  let reads=0;
  const accessor={};Object.defineProperty(accessor,'value',{enumerable:true,get(){reads++;return 1;}});
  const toJSON={toJSON(){reads++;return {};}};
  const extra=[1];Object.defineProperty(extra,'map',{value(){reads++;return [];},enumerable:true});
  const cycle:Data={};cycle.self=cycle;
  for(const value of [accessor,toJSON,extra,Array(2),[undefined],cycle])expect(()=>cloneFibPresentationMember(value)).toThrow();
  expect(reads).toBe(0);
 });
 it('retains only the two raw semantic members after existing normalization',()=>{
  const raw={id:'fib-1',type:'fibretracement',rawOptional:undefined,props:{otherOptional:undefined,lvFibBackground:{schemaVersion:7,nested:{optional:undefined,zero:-0}},lvFibText:undefined}};
  const prepared=prepareWorkspaceJSON(raw),result=retainFibLevelPresentationMembers(raw,prepared);
  expect(Object.hasOwn(prepared,'rawOptional')).toBe(false);
  expect(Object.hasOwn(prepared.props as Data,'lvFibText')).toBe(false);
  expect(Object.hasOwn(result,'rawOptional')).toBe(false);
  const props=result.props as Data,nested=(props.lvFibBackground as Data).nested as Data;
  expect(Object.hasOwn(props,'otherOptional')).toBe(false);
  expect(Object.hasOwn(props,'lvFibText')).toBe(true);expect(props.lvFibText).toBeUndefined();
  expect(Object.hasOwn(nested,'optional')).toBe(true);expect(Object.is(nested.zero,-0)).toBe(true);
  expect(result).not.toBe(prepared);expect(props.lvFibBackground).not.toBe(raw.props.lvFibBackground);
  expect(readFibBackground(props).state).toBe('unavailable');expect(readFibText(props).state).toBe('unavailable');
 });
 it('keeps unchanged prepared identity when no eligible raw member exists',()=>{
  const prepared={id:'fib-1',type:'fibretracement',props:{value:1}};
  expect(retainFibLevelPresentationMembers({id:'fib-1',type:'fibretracement',props:{}},prepared)).toBe(prepared);
  expect(retainFibLevelPresentationMembers({id:'fib-1',type:'trendline',props:{lvFibText:undefined}},prepared)).toBe(prepared);
 });
 it('rejects changed row identity and unsafe raw members without getter invocation',()=>{
  const raw={id:'fib-1',type:'fibretracement',props:{lvFibBackground:undefined}};
  expect(()=>retainFibLevelPresentationMembers(raw,{id:'other',type:'fibretracement'})).toThrow(/identity/);
  expect(()=>retainFibLevelPresentationMembers(raw,{id:'fib-1',type:'trendline'})).toThrow(/identity/);
  let reads=0;
  const props={};Object.defineProperty(props,'lvFibText',{enumerable:true,get(){reads++;return text(true,'left');}});
  expect(()=>retainFibLevelPresentationMembers({id:'fib-1',type:'fibretracement',props},{id:'fib-1',type:'fibretracement'})).toThrow();
  expect(reads).toBe(0);
 });
});

describe('draft actual-entry placement literals',()=>{
 it.each([
  [20,260,'left',24],[20,260,'center',140],[20,260,'right',256],
  [260,20,'left',24],[260,20,'center',140],[260,20,'right',256],
  [20,26,'left',23],[20,26,'center',23],[20,26,'right',23],
  [20,20,'left',20],[20,20,'center',20],[20,20,'right',20],
  [20,28,'left',24],[20,28,'center',24],[20,28,'right',24],
  [0,400,'left',4],[0,400,'center',200],[0,400,'right',396],
 ] as const)('x1=%s x2=%s %s yields x=%s',(x1,x2,align,x)=>{
  const entry=Object.freeze({x1,x2,y1:150,y2:150});
  const placement=placeFibCustomText(entry,align);
  expect(placement).toEqual({x,y:143,align});expect(Object.isFrozen(placement)).toBe(true);
 });
 it('uses actual resolved endpoints and ignores unrelated entry data',()=>{
  let reads=0;
  const entry={x1:10,x2:30,y1:70,y2:70};
  Object.defineProperty(entry,'anchors',{enumerable:true,get(){reads++;throw Error('not a geometry source');}});
  expect(placeFibCustomText(entry,'right')).toEqual({x:26,y:63,align:'right'});expect(reads).toBe(0);
 });
 it.each([
  {x1:NaN,x2:20,y1:0,y2:0},{x1:0,x2:Infinity,y1:0,y2:0},
  {x1:0,x2:20,y1:Infinity,y2:Infinity},{x1:0,x2:20,y1:0,y2:1},
  {x1:-Number.MAX_VALUE,x2:Number.MAX_VALUE,y1:0,y2:0},
  {x1:Number.MAX_VALUE,x2:Number.MAX_VALUE,y1:0,y2:0},
 ])('refuses nonfinite, nonhorizontal or overflowed resolved entry %#',entry=>{
  expect(()=>placeFibCustomText(entry,'center')).toThrow();
 });
 it('rejects unsupported alignment and coordinate accessors without coercion or getters',()=>{
  let reads=0;
  const entry={x2:20,y1:0,y2:0};Object.defineProperty(entry,'x1',{enumerable:true,get(){reads++;return 0;}});
  expect(()=>placeFibCustomText(entry,'left')).toThrow();
  expect(()=>placeFibCustomText({x1:0,x2:20,y1:0,y2:0},'outside')).toThrow();
  expect(()=>placeFibCustomText({x1:'0',x2:20,y1:0,y2:0},'left')).toThrow();expect(reads).toBe(0);
 });
});
