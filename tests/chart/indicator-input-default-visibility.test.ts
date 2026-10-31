import {afterEach,expect,it,vi} from 'vitest';
import {monthlyLocal,ownedNativePipelineFixture} from '../fixtures/seasonality-native-pipeline';

type Fixture=Awaited<ReturnType<typeof ownedNativePipelineFixture>>;
const held:Fixture[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const f of held.splice(0).reverse())try{f.dispose();}catch(error){failures.push(error);}vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'SYNTHETIC default-visibility cleanup failed.');});

async function own(){
 const f=await ownedNativePipelineFixture({dataset:monthlyLocal()});held.push(f);
 const id=f.id,row=f.port.list().find(row=>row.id===id)!;
 const record=f.records.get(row.rendererId)!;
 // This is the original SDK async add/start record, not an edited fixture copy.
 expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
 expect(Object.hasOwn(record,'hidden')).toBe(false);
 expect(record.native.instance.ctx).not.toBeNull();
 expect(f.native.scene.indicators.get(row.rendererId)).toBe(record.model);
 expect(last(f,id)).toBe(138.5);
 return{f,id,record,model:record.native.instance};
}
function last(f:Fixture,id:string){return f.port.values(id).series.find(plot=>plot.id==='sma')!.values.at(-1);}
function rejected(h:Awaited<ReturnType<typeof own>>,restore:()=>void){
 const before=h.f.port.serialize(),values=h.record.inputValues;
 const apply=vi.spyOn(h.f.core,'applyInputs');
 try{
  expect(()=>h.f.port.update(h.id,{inputs:{length:3}})).toThrow();
  expect(apply).not.toHaveBeenCalled();
  expect(h.record.inputValues).toBe(values);
  expect(h.f.port.serialize()).toEqual(before);
 }finally{restore();apply.mockRestore();}
}

it('genuine SDK default absence accepts a partial input update without materializing visibility',async()=>{
 const h=await own();h.f.port.update(h.id,{inputs:{length:3}});
 expect(h.f.port.list().find(row=>row.id===h.id)!.inputs.length).toBe(3);
 expect(h.record.inputValues.length).toBe(3);expect(last(h.f,h.id)).toBeCloseTo(407/3,10);
 expect(Object.hasOwn(h.record,'hidden')).toBe(false);
 expect(h.f.native.scene.indicators.get(h.record.id)).toBe(h.record.model);
});
it('genuine own hidden false after the public visibility route keeps partial-update compatibility',async()=>{
 const h=await own();h.f.port.update(h.id,{visible:false});h.f.port.update(h.id,{visible:true});
 expect(Object.getOwnPropertyDescriptor(h.record,'hidden')?.value).toBe(false);
 h.f.port.update(h.id,{inputs:{length:3}});expect(last(h.f,h.id)).toBeCloseTo(407/3,10);
 expect(Object.getOwnPropertyDescriptor(h.record,'hidden')?.value).toBe(false);
});
it('a partial presentation edit keeps original default visibility and input ownership',async()=>{
 const h=await own(),values=h.record.inputValues;h.f.port.update(h.id,{offset:1});
 expect(h.f.port.list().find(row=>row.id===h.id)!.offset).toBe(1);
 expect(h.record.inputValues).toBe(values);expect(last(h.f,h.id)).toBe(138.5);
 expect(Object.hasOwn(h.record,'hidden')).toBe(false);
});
it('the actual hidden true route still accepts saved inputs and resumes the updated calculation',async()=>{
 const h=await own();h.f.port.update(h.id,{visible:false});expect(h.record.hidden).toBe(true);
 h.f.port.update(h.id,{inputs:{length:3}});expect(h.record.inputValues.length).toBe(3);
 expect(h.f.port.list().find(row=>row.id===h.id)!.visible).toBe(false);
 h.f.port.update(h.id,{visible:true});expect(h.record.hidden).toBe(false);expect(last(h.f,h.id)).toBeCloseTo(407/3,10);
});
it.each([undefined,null,0,'false'])('a present invalid visibility value refuses before native callbacks (%s)',async value=>{
 const h=await own();Object.defineProperty(h.record,'hidden',{value,writable:true,configurable:true,enumerable:true});
 rejected(h,()=>{delete h.record.hidden;});
});
it('an own visibility accessor refuses without invoking its getter',async()=>{
 const h=await own(),read=vi.fn(()=>false);Object.defineProperty(h.record,'hidden',{get:read,configurable:true,enumerable:true});
 rejected(h,()=>{delete h.record.hidden;});expect(read).not.toHaveBeenCalled();
});
it('inherited visibility accessors refuse without invoking them',async()=>{
 const h=await own(),prototype=Object.getPrototypeOf(h.record),read=vi.fn(()=>false),foreign=Object.create(prototype);
 Object.defineProperty(foreign,'hidden',{get:read});Object.setPrototypeOf(h.record,foreign);
 rejected(h,()=>Object.setPrototypeOf(h.record,prototype));expect(read).not.toHaveBeenCalled();
});
it('an unknown prototype cannot grant default visibility by absence',async()=>{
 const h=await own(),prototype=Object.getPrototypeOf(h.record);Object.setPrototypeOf(h.record,Object.create(null));
 rejected(h,()=>Object.setPrototypeOf(h.record,prototype));
});
it('visibility inherited from the otherwise known Object prototype is not SDK default absence',async()=>{
 const h=await own();expect(Object.getOwnPropertyDescriptor(Object.prototype,'hidden')).toBeUndefined();
 Object.defineProperty(Object.prototype,'hidden',{value:false,configurable:true});
 rejected(h,()=>{delete (Object.prototype as {hidden?:unknown}).hidden;});
});
it('an observed post-callback visibility mismatch terminally refuses continuation even after restoration',async()=>{
 const h=await own(),status=h.model.ctx.setStatus;
 h.model.ctx.setStatus=function(...args:unknown[]){const value=Reflect.apply(status,this,args);h.record.hidden=true;return value;};
 expect(()=>h.f.port.update(h.id,{inputs:{length:3}})).toThrow();
 h.model.ctx.setStatus=status;delete h.record.hidden;
 expect(()=>h.f.port.update(h.id,{inputs:{length:2}})).toThrow(/rollback|recovery|retired|reopen|incomplete/i);
});
it('a genuine source replacement during a partial update retains the existing source-retirement refusal',async()=>{
 const h=await own(),status=h.model.ctx.setStatus,next=monthlyLocal(),priorRows=h.f.raw();let switched=false;
 h.model.ctx.setStatus=function(...args:unknown[]){const value=Reflect.apply(status,this,args);if(!switched){switched=true;h.f.stage(next);}return value;};
 expect(()=>h.f.port.update(h.id,{inputs:{length:3}})).toThrow();expect(switched).toBe(true);
 h.model.ctx.setStatus=status;expect(h.f.raw()).not.toBe(priorRows);
 expect(h.record.inputValues.length).toBe(3);
});
