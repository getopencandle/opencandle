import {expect,it,vi} from 'vitest';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import type {ScriptRenderSettings} from '../../src/chart/script-port';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {executeScriptOnBars} from '../../src/ui/script-jobs';

// Runtime ownership and exact raw-settings inspection with a controlled native
// port. Actual native placement and executable interaction are separate checks.
const binding:ScriptBinding={id:'s',documentId:'d',version:1,name:'Synthetic',source:'({onBar(){}})',pane:'new',paneId:null,ownScale:false,visible:true,plots:{}};
const bars=[{time:1,open:2,high:3,low:1,close:2,volume:4}];
const context={bars,identity:'synthetic-run-1',fixture:true,bindings:[binding],ready:true};
const output={barIds:['synthetic-bar-1'],result:{plots:[],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic readiness'}}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
 const settings=new Map<string,ScriptRenderSettings>(),listeners=new Set<()=>void>(),pending:Array<{resolve:(value:any)=>void;reject:(error:Error)=>void}>=[];
 let placed=true;
 const changed=()=>{for(const fn of [...listeners])fn();};
 const port={
  add:(_result:any,value:ScriptRenderSettings)=>{settings.set(value.id,{...structuredClone(value),paneId:value.paneId??'synthetic-generated-pane'});changed();return value.id;},
  update:()=>changed(),remove:(id:string)=>{settings.delete(id);changed();},
  replaceStyles:(id:string,value:ScriptRenderSettings['plots'])=>{settings.get(id)!.plots=structuredClone(value);changed();},
  show:(id:string,value:boolean)=>{settings.get(id)!.visible=value;changed();},
  rename:(id:string,value:string)=>{settings.get(id)!.title=value;changed();},
  place:(id:string,value:any)=>{Object.assign(settings.get(id)!,value);changed();},
  configurationSnapshot:()=>structuredClone([...settings.values()]),
  placementStatus:()=>({ready:placed,diagnostics:placed?[]:['Synthetic placement pending']}),
  subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
 } as unknown as ChartController['scripts'];
 const execute:typeof executeScriptOnBars=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));
 const runtime=new ScriptBindingRuntime(port,()=>{},()=>{},execute);
 return{runtime,settings,pending,port,listeners,changed,setPlaced:(value:boolean)=>{placed=value;changed();}};
}
it('requires exact ready input, live handles and native placement before claiming configuration readiness',async()=>{
 const s=setup();expect(s.runtime.configurationStatus(context).state).toBe('pending');
 s.runtime.update(context);expect(s.runtime.configurationStatus(context).state).toBe('pending');
 s.setPlaced(false);s.pending[0].resolve(output);await tick();
 expect(s.runtime.configurationStatus(context)).toMatchObject({state:'pending',calculations:'complete'});
 s.setPlaced(true);expect(s.runtime.configurationStatus(context)).toEqual({state:'ready',calculations:'complete',diagnostics:[]});
 for(const changed of [{...context,identity:'other-run'},{...context,fixture:false},{...context,bars:[{...bars[0],close:2.5}]},{...context,bindings:[{...binding,visible:false}]}])expect(s.runtime.configurationStatus(changed).state).toBe('pending');
 s.runtime.update({...context,ready:false});expect(s.runtime.configurationStatus(context).state).toBe('pending');s.runtime.dispose();
});
it('distinguishes installed configuration from still-running or failed numerical calculations',async()=>{
 const s=setup(),lease=s.runtime.prepareBindings([binding],context);lease.pauseAndCapture();lease.stage();
 expect(s.runtime.configurationStatus(context).state).toBe('pending');lease.resume(true);
 s.runtime.update(context);expect(s.runtime.configurationStatus(context)).toEqual({state:'ready',calculations:'pending',diagnostics:[]});
 s.pending[0].reject(Error('Synthetic compile error'));await tick();
 expect(s.runtime.configurationStatus(context)).toMatchObject({state:'ready',calculations:'error',diagnostics:['Synthetic compile error']});s.runtime.dispose();
});
it('a failed job without a placed handle cannot serve as a ready configuration',async()=>{
 const s=setup();s.runtime.update(context);s.pending[0].reject(Error('Synthetic compile error'));await tick();
 expect(s.runtime.configurationStatus(context)).toMatchObject({state:'error',calculations:'error'});s.runtime.dispose();
});
it('detects unowned handles and raw style drift, then removes an old override exactly',async()=>{
 const s=setup(),style=defaultPlotStyle('sma','line',0),styled={...binding,plots:{line:style}},saved={...context,bindings:[styled]};
 s.runtime.update(saved);s.pending[0].resolve(output);await tick();expect(s.runtime.configurationStatus(saved).state).toBe('ready');
 s.settings.get('s')!.plots.line.color='#ff0000';expect(s.runtime.configurationStatus(saved).state).toBe('error');
 s.runtime.update(context);expect(s.settings.get('s')!.plots).toEqual({});expect(s.runtime.configurationStatus(context).state).toBe('ready');
 s.settings.set('foreign',{...s.settings.get('s')!,id:'foreign'});expect(s.runtime.configurationStatus(context).diagnostics.join()).toMatch(/unowned/);s.runtime.dispose();
});
it('compares style values independently of object property insertion order',async()=>{
 const s=setup(),style=defaultPlotStyle('sma','line',0),reordered=Object.fromEntries(Object.entries(style).reverse()) as typeof style,saved={...context,bindings:[{...binding,plots:{line:reordered}}]};
 s.runtime.update(saved);s.pending[0].resolve(output);await tick();expect(s.runtime.configurationStatus(saved).state).toBe('ready');s.runtime.dispose();
});
it('requires a ready context even for an empty binding set',()=>{
 const s=setup(),empty={...context,bindings:[]};expect(s.runtime.configurationStatus(empty).state).toBe('pending');s.runtime.update(empty);expect(s.runtime.configurationStatus(empty)).toEqual({state:'ready',calculations:'complete',diagnostics:[]});s.runtime.dispose();
});
it('observes delayed placement and retires subscribers on unsubscribe or disposal',()=>{
 const s=setup(),first=vi.fn(),second=vi.fn(),off=s.runtime.subscribeConfigurationStatus(first);
 s.setPlaced(false);expect(first).toHaveBeenCalledOnce();off();off();s.changed();expect(first).toHaveBeenCalledOnce();
 s.runtime.subscribeConfigurationStatus(second);s.runtime.dispose();s.changed();expect(second).not.toHaveBeenCalled();expect(s.listeners.size).toBe(0);expect(s.runtime.configurationStatus(context).state).toBe('error');
});
it('attempts every readiness observer and reports an observer failure',()=>{
 const s=setup(),second=vi.fn();s.runtime.subscribeConfigurationStatus(()=>{throw Error('Synthetic observer failure');});s.runtime.subscribeConfigurationStatus(second);s.changed();
 expect(second).toHaveBeenCalledOnce();expect(s.runtime.configurationStatus(context).diagnostics.join()).toContain('Synthetic observer failure');s.runtime.dispose();
});
