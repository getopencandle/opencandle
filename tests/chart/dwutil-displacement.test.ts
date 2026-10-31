import {describe,expect,it} from 'vitest';
import {parseDisplacement,planDisplacement,DISPLACEMENT_REFUSAL,BAR_CLAMP} from '../../src/chart/drawing-displacement';
const sel=[{id:'a',anchors:[{bar:10,price:100},{bar:20,price:200}]},{id:'b',anchors:[{bar:30,price:50}]}];
describe(' displacement parser (DD-17)',()=>{
 it('bar field',()=>{
  expect(parseDisplacement('bar','+5')).toEqual({ok:true,op:'+',value:5});expect(parseDisplacement('bar','-3')).toEqual({ok:true,op:'+',value:-3});expect(parseDisplacement('bar','5')).toEqual({ok:true,op:'+',value:5});
  expect(parseDisplacement('bar','')).toEqual({ok:true,noop:true});expect(parseDisplacement('bar','  ')).toEqual({ok:true,noop:true});
  for(const bad of ['*2','/4','1.5','+1.5','abc','+','5x','Infinity','1e3x'])expect(parseDisplacement('bar',bad).ok,bad).toBe(false);
 });
 it('price field',()=>{
  expect(parseDisplacement('price','+5')).toEqual({ok:true,op:'+',value:5});expect(parseDisplacement('price','-3.5')).toEqual({ok:true,op:'+',value:-3.5});
  expect(parseDisplacement('price','*2')).toEqual({ok:true,op:'*',value:2});expect(parseDisplacement('price','/4')).toEqual({ok:true,op:'/',value:4});expect(parseDisplacement('price','2.5')).toEqual({ok:true,op:'+',value:2.5});
  expect(parseDisplacement('price','')).toEqual({ok:true,noop:true});
  for(const bad of ['/0','*','abc','/ 0','NaN','--3'])expect(parseDisplacement('price',bad).ok,bad).toBe(false);
 });
});
describe(' displacement planner',()=>{
 it('applies every anchor of every selected drawing',()=>{
  const r=planDisplacement(sel,'+5','*2');expect(r).toEqual({ok:true,rows:[{id:'a',anchors:[{bar:15,price:200},{bar:25,price:400}]},{id:'b',anchors:[{bar:35,price:100}]}]});
  expect(planDisplacement(sel,'','/4')).toMatchObject({ok:true,rows:[{id:'a',anchors:[{bar:10,price:25},{bar:20,price:50}]},{id:'b',anchors:[{bar:30,price:12.5}]}]});
  expect(planDisplacement(sel,'','')).toEqual({ok:true,rows:[],noop:true});
 });
 it('refuses the whole batch outside the clamp or at price <= 0',()=>{
  expect(BAR_CLAMP).toEqual({min:-50000,max:15000});expect(DISPLACEMENT_REFUSAL).toBe('Some drawings would move outside the allowed range.');
  expect(planDisplacement(sel,'+14971','')).toEqual({ok:false,message:DISPLACEMENT_REFUSAL});expect(planDisplacement(sel,'+14970','')).toMatchObject({ok:true});
  expect(planDisplacement(sel,'-50011','')).toEqual({ok:false,message:DISPLACEMENT_REFUSAL});expect(planDisplacement(sel,'-50010','')).toMatchObject({ok:true});
  expect(planDisplacement(sel,'','-60')).toEqual({ok:false,message:DISPLACEMENT_REFUSAL});expect(planDisplacement(sel,'','*0')).toEqual({ok:false,message:DISPLACEMENT_REFUSAL});
  expect(planDisplacement(sel,'','-49')).toMatchObject({ok:true});
 });
 it('parse failure is reported with a field and no rows',()=>{const r=planDisplacement(sel,'*2','');expect(r.ok).toBe(false);expect((r as any).field).toBe('bar');expect(planDisplacement(sel,'','/0')).toMatchObject({ok:false,field:'price'});});
});
