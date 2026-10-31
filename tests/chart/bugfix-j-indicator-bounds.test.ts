import {describe,expect,it} from 'vitest';
import {getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext} from '@luxalgo/vela';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {type IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {createIndicatorLibrary,factoryIndicatorDefault,instanceDefaults,restoreIndicatorLibrary,saveIndicatorDefault} from '../../src/ui/indicator-library';
import type {IndicatorId} from '../../src/domain/indicators';

// PRE-R7-1 (new values meet the fact (edit) bounds on the
// Save as default and Add paths; restored legacy values (workspaces, saved defaults, the instance being copied) still
// load. Renderer-free lifecycle stand-in with SYNTHETIC bars; not executable UI evidence.
function lifecycleChart(){
 const full=Array.from({length:30},(_,i)=>({time:(1700000000+i*60)*1000,open:10+i%4,high:12+i%5,low:9+i%3*0.1,close:10.5+i%6*0.3,volume:100+i}));
 let sequence=0;const live=new Map<string,{model:NativeIndicator;pane:string}>();
 const chart={
  panes:{list:()=>[...new Set(['price',...[...live.values()].map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.pane===id).map(([id])=>({id}))}))},
  addNativeIndicator(type:string){
   const descriptor=getNativeIndicator(type)!,id=`renderer-${++sequence}`,model=descriptor.create();const row={model,pane:descriptor.paneHint==='price'?'price':`pane-${sequence}`};live.set(id,row);
   const inputs=descriptor.defaultInputs();let visible=true;
   const handle={id,title:descriptor.title,setInputs:(values:any)=>model.setInputs(values),setVisible:(value:boolean)=>{visible=value;value?model.resume():model.suspend();},get visible(){return visible;},moveTo:(target:any)=>{row.pane=typeof target==='string'?target:target.pane??`new-pane-${++sequence}`;},remove:()=>{model.stop();live.delete(id);}};
   model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>full,emit:()=>{},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,inputs);
   return handle;
  },
 };
 return chart as unknown as Vela;
}
const snap=(id:string,kind:IndicatorId,inputs:Record<string,unknown>,offset=0):IndicatorSnapshot=>({id,kind,inputs,plots:{},offset,visible:true,paneId:null} as unknown as IndicatorSnapshot);
const factory=(kind:IndicatorId,inputs:Record<string,unknown>={},offset=0)=>{const value=factoryIndicatorDefault(kind);return {...value,inputs:{...value.inputs,...inputs},offset};};

describe('PRE-R7-1 Save as default: new values meet the fact bounds',()=>{
 it('a newly typed CCI Length 5000 (over the 2000 fact bound) is refused, naming the bound',()=>{
  expect(()=>saveIndicatorDefault(createIndicatorLibrary(),'cci',factory('cci',{length:5000}))).toThrow(/1 through 2000/);
 });
 it('a newly typed WMA offset 2000 (over the 500 fact bound) is refused',()=>{
  expect(()=>saveIndicatorDefault(createIndicatorLibrary(),'wma',factory('wma',{},2000))).toThrow(/-500 through 500/);
 });
 it('values inside the fact bounds still save',()=>{
  const library=saveIndicatorDefault(createIndicatorLibrary(),'cci',factory('cci',{length:2000}));
  expect(library.defaults.cci!.inputs).toEqual({length:2000,source:'hlc3',maType:'SMA',maLength:14,bbMult:2});// New CCIs carry the Smoothing section; New CCIs default to hlc3 + SMA 14
  expect(saveIndicatorDefault(createIndicatorLibrary(),'wma',factory('wma',{},-500)).defaults.wma!.offset).toBe(-500);
 });
 it('restored legacy: a pre-fix stored default still loads, and replacing it with itself or with an unrelated change keeps it',()=>{
  const stored=restoreIndicatorLibrary({schemaVersion:1,favorites:[],defaults:{cci:factory('cci',{length:5000}),wma:factory('wma',{},2000)}});
  expect(stored.defaults.cci!.inputs.length).toBe(5000);expect(stored.defaults.wma!.offset).toBe(2000);
  const restyled=saveIndicatorDefault(stored,'cci',{...stored.defaults.cci!,visible:false});
  expect(restyled.defaults.cci).toMatchObject({visible:false,inputs:{length:5000,source:'hlc3'}});// The factory CCI is a new instance, so source hlc3
  expect(saveIndicatorDefault(stored,'wma',{...stored.defaults.wma!,inputs:{...stored.defaults.wma!.inputs,length:7}}).defaults.wma).toMatchObject({offset:2000,inputs:{length:7}});
  expect(()=>saveIndicatorDefault(stored,'cci',{...stored.defaults.cci!,inputs:{length:6000,source:'close'}})).toThrow(/1 through 2000/);
 });
 it('restored legacy: copying an instance that holds a pre-fix value (named as the source) is not new input',()=>{
  const instance=factory('cci',{length:5000});
  expect(saveIndicatorDefault(createIndicatorLibrary(),'cci',instance,instance).defaults.cci!.inputs.length).toBe(5000);
  const far=factory('wma',{},2000);expect(saveIndicatorDefault(createIndicatorLibrary(),'wma',far,far).defaults.wma!.offset).toBe(2000);
  // A value that differs from the named source is new, even when the source itself is legacy.
  expect(()=>saveIndicatorDefault(createIndicatorLibrary(),'cci',factory('cci',{length:4000}),instance)).toThrow(/1 through 2000/);
 });
 it('retired legacy keys carried from an instance (asymmetric ENV pair, AO lengths) are kept, not refused',()=>{
  const env=factory('env',{});delete (env.inputs as Record<string,unknown>).percent;Object.assign(env.inputs,{upperPercent:10,lowerPercent:5});
  expect(saveIndicatorDefault(createIndicatorLibrary(),'env',env,env).defaults.env!.inputs).toMatchObject({upperPercent:10,lowerPercent:5});
 });
});

describe('PRE-R7-1 Add: explicit inputs are new input; saved records are stored state',()=>{
 it('direct add of CCI Length 99999 is refused with the fact bound; inside the bound it adds',()=>{
  const port=createIndicatorPort(lifecycleChart());
  expect(()=>port.add('cci',{length:99999,source:'close'} as never)).toThrow(/1 through 2000/);
  expect(port.list()).toHaveLength(0);
  const id=port.add('cci',{length:2000,source:'close'} as never);expect(port.list().find(row=>row.id===id)!.inputs.length).toBe(2000);
  port.dispose();
 });
 it('explicit inputs that differ from the saved default meet the fact bound',()=>{
  const port=createIndicatorPort(lifecycleChart()),saved=factory('cci',{length:5000});
  expect(()=>port.add('cci',{length:6000,source:'close'} as never,saved)).toThrow(/1 through 2000/);
  port.dispose();
 });
 it('the reviewer probe: a CCI 5000 default typed now can no longer be saved, so it cannot be added from it',()=>{
  const port=createIndicatorPort(lifecycleChart());let library=createIndicatorLibrary();
  expect(()=>{library=saveIndicatorDefault(library,'cci',factory('cci',{length:5000}));}).toThrow(/1 through 2000/);
  const saved=instanceDefaults(library,'cci'),id=port.add('cci',saved.inputs,saved);
  expect(port.list().find(row=>row.id===id)!.inputs).toEqual({length:20,source:'hlc3',maType:'SMA',maLength:14,bbMult:2});// New-instance CCI defaults
  port.dispose();
 });
 it('restored legacy: a pre-fix saved default (CCI 5000, WMA offset 2000) still adds from the library and from a workspace',()=>{
  const port=createIndicatorPort(lifecycleChart());
  const library=restoreIndicatorLibrary({schemaVersion:1,favorites:[],defaults:{cci:factory('cci',{length:5000}),wma:factory('wma',{},2000)}});
  for(const kind of ['cci','wma'] as const){const saved=instanceDefaults(library,kind);port.add(kind,saved.inputs,saved);}
  expect(port.list().map(row=>[row.kind,row.inputs.length,row.offset])).toEqual([['cci',5000,0],['wma',9,2000]]);
  port.restore([snap('cci-long','cci',{length:5000,source:'close'}),snap('wma-far','wma',{length:4,source:'close'},2000),snap('ao-custom','ao',{fast:3,slow:5})]);
  expect(port.serialize().map(row=>[row.id,row.inputs,row.offset])).toEqual([['cci-long',{length:5000,source:'close'},0],['wma-far',{length:4,source:'close'},2000],['ao-custom',{fast:3,slow:5},0]]);
  port.dispose();
 });
 it('retired keys in explicit inputs are legacy by definition (AO 3/5, KC true range, ENV pair) and still migrate',()=>{
  const port=createIndicatorPort(lifecycleChart());
  const inputs=(id:string)=>port.list().find(row=>row.id===id)!.inputs;
  expect(inputs(port.add('ao',{fast:3,slow:5} as never))).toEqual({fast:3,slow:5});
  expect(inputs(port.add('kc',{length:20,multiplier:1,source:'close',exponential:true,trueRange:false} as never))).toEqual({length:20,multiplier:1,source:'close',exponential:true,bandsStyle:'range',atrLength:10});
  expect(inputs(port.add('env',{length:20,upperPercent:12,lowerPercent:8,source:'close',exponential:false} as never))).toEqual({length:20,upperPercent:12,lowerPercent:8,source:'close',exponential:false});
  port.dispose();
 });
 it('R-INDFIX-3 unchanged: on update only changed fields meet the edit bounds',()=>{
  const port=createIndicatorPort(lifecycleChart());port.restore([snap('cci-long','cci',{length:5000,source:'close'}),snap('wma-far','wma',{length:4,source:'close'},2000)]);
  port.update('cci-long',{inputs:{length:5000,source:'open'}});expect(port.serialize()[0].inputs).toEqual({length:5000,source:'open'});
  expect(()=>port.update('cci-long',{inputs:{length:4000}})).toThrow(/1 through 2000/);
  port.update('wma-far',{offset:2000,visible:false});expect(()=>port.update('wma-far',{offset:1000})).toThrow(/-500 through 500/);
  port.dispose();
 });
});
