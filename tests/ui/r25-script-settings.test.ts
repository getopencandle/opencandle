import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {ChartController} from '../../src/chart/adapter';
import {restoreScriptBindings,type ScriptBinding} from '../../src/ui/script-library';
import type {executeScriptOnBars,ScriptInputDeclaration,ScriptResult} from '../../src/ui/script-jobs';
import {applyScriptSettings,scriptInputDraft,scriptInputProblems,scriptInputsToSave} from '../../src/ui/script-settings-model';
import {scriptOutputs} from '../../src/ui/script-outputs';
import {ScriptSettingsDialog} from '../../src/ui/ScriptSettingsDialog';
import {compileLVScript} from '../../src/ui/script-editor-commands';

// Declared script inputs in the instance Settings dialog, saved on the binding. SYNTHETIC data only.
const declarations:ScriptInputDeclaration[]=[
 {id:'length',type:'int',title:'Length',default:20,min:1,max:500,step:null,options:null},
 {id:'mult',type:'float',title:'Multiplier',default:2,min:null,max:null,step:0.1,options:null},
 {id:'fill',type:'bool',title:'Fill bands',default:true,min:null,max:null,step:null,options:null},
 {id:'mode',type:'string',title:'Mode',default:'fast',min:null,max:null,step:null,options:['fast','slow']},
];
const binding:ScriptBinding={id:'bound',documentId:'doc',version:1,name:'Bands',source:'({onBar(){}})',pane:'price',visible:true,plots:{},paneId:null,ownScale:false};

describe(' input model',()=>{
 it('drafts saved values that still fit, defaults otherwise, and drops stale names',()=>{
  expect(scriptInputDraft(declarations,{length:50,mult:9,stale:1,mode:'gone'})).toEqual({length:50,mult:9,fill:true,mode:'fast'});
  expect(scriptInputDraft(declarations,{length:900})).toMatchObject({length:20});
 });
 it('validates against the declaration and saves only non-default values',()=>{
  expect(scriptInputProblems(declarations,{length:2.5,mult:NaN,fill:true,mode:'other'})).toEqual(['Length must be a whole number.','Multiplier must be a number.','Mode must be one of: fast, slow.']);
  expect(scriptInputProblems(declarations,{length:0,mult:1,fill:true,mode:'fast'})).toEqual(['Length must be at least 1.']);
  expect(scriptInputsToSave(declarations,{length:20,mult:2,fill:true,mode:'fast'})).toBeUndefined();
  expect(scriptInputsToSave(declarations,{length:30,mult:2,fill:false,mode:'slow'})).toEqual({length:30,fill:false,mode:'slow'});
  expect(()=>scriptInputsToSave(declarations,{length:-1,mult:2,fill:true,mode:'fast'})).toThrow('at least 1');
 });
 it('saved bindings carry bounded input values through restore, and Settings apply replaces or clears them',()=>{
  expect(restoreScriptBindings([{...binding,inputs:{length:30}}])[0].inputs).toEqual({length:30});
  expect(restoreScriptBindings([binding])[0]).not.toHaveProperty('inputs');
  for(const bad of [{__proto__x:1},{x:{nested:1}},{x:Infinity},Object.fromEntries(Array.from({length:33},(_,index)=>['k'+index,1]))])expect(()=>restoreScriptBindings([{...binding,inputs:bad}])).toThrow('input values');
  const changed=applyScriptSettings([binding],'bound',{inputs:{length:30},plots:{}});expect(changed[0].inputs).toEqual({length:30});
  expect(applyScriptSettings(changed,'bound',{inputs:undefined})[0]).not.toHaveProperty('inputs');
  expect(()=>applyScriptSettings([],'bound',{inputs:undefined})).toThrow('removed');
 });
 it('the editor check knows the new ctx members',()=>{
  const result=compileLVScript("({onBar(ctx){ctx.input('n');ctx.request('d');ctx.alertcondition('c',true,'m');}})");
  expect(result.diagnostics.filter(row=>row.message.includes('not part of LVScript'))).toEqual([]);
 });
});

describe(' chart instances use saved inputs',()=>{
 function setup(){
  const pending:{resolve:(value:any)=>void;input:any}[]=[];
  const port={add:()=>{},update:()=>{},remove:()=>{},replaceStyles:()=>{},show:()=>{},move:()=>{},place:()=>{},rename:()=>{}} as unknown as ChartController['scripts'];
  const execute:typeof executeScriptOnBars=input=>new Promise(resolve=>pending.push({resolve,input}));
  return{port,pending,runtime:new ScriptBindingRuntime(port,()=>{},()=>{},execute)};
 }
 const result=(inputs:Record<string,number>):{result:ScriptResult;barIds:string[]}=>({barIds:['b'],result:{plots:[{id:'lvplot:Basis',title:'Basis',color:'#123456',values:[{time:1,value:1}]}],orders:[],alerts:[],conditions:[],declarations:{inputs:declarations,requests:[]},inputs,diagnostics:[],elapsedMs:1,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic test'}}});
 const context={bars:[{time:1,open:1,high:2,low:1,close:2,volume:1}],identity:'one',fixture:true,ready:true};
 it('passes saved inputs to the worker, recalculates when they change, and publishes the declarations for Settings',async()=>{
  const t=setup();
  t.runtime.update({...context,bindings:[{...binding,inputs:{length:30}}]});
  expect(t.pending[0].input.inputs).toEqual({length:30});
  t.pending[0].resolve(result({length:30}));await new Promise(resolve=>setTimeout(resolve,0));
  const entry=scriptOutputs.get(t.port,'bound')!;
  expect(entry.declarations.inputs.map(row=>row.id)).toEqual(['length','mult','fill','mode']);expect(entry.inputs).toEqual({length:30});expect(entry.savedInputs).toEqual({length:30});
  t.runtime.update({...context,bindings:[{...binding,inputs:{length:30}}]});expect(t.pending).toHaveLength(1);
  t.runtime.update({...context,bindings:[{...binding,inputs:{length:40}}]});expect(t.pending).toHaveLength(2);expect(t.pending[1].input.inputs).toEqual({length:40});
  t.runtime.update({...context,bindings:[]});expect(scriptOutputs.get(t.port,'bound')).toBeNull();
  t.runtime.dispose();
 });
 it('the Settings dialog lists declared inputs with the saved values, like an indicator Inputs tab',()=>{
  const entry={bindingId:'bound',title:'Bands',source:binding.source,inputs:{length:30},savedInputs:{length:30},declarations:{inputs:declarations,requests:[]},conditions:[],alertNames:[],plots:[{id:'lvplot:Basis',title:'Basis'}]};
  const html=renderToStaticMarkup(React.createElement(ScriptSettingsDialog,{binding:{...binding,inputs:{length:30}},entry,renderedPlots:{},onApply:()=>true,onClose:()=>{}}));
  expect(html).toContain('Settings: Bands');expect(html).toContain('class="indicator-settings"');
  for(const title of ['Length','Multiplier','Fill bands','Mode'])expect(html).toContain('aria-label="'+title+'"');
  expect(html).toMatch(/aria-label="Length"[^>]*value="30"|value="30"[^>]*aria-label="Length"/);
  const before=renderToStaticMarkup(React.createElement(ScriptSettingsDialog,{binding,entry:null,renderedPlots:{},onApply:()=>true,onClose:()=>{}}));
  expect(before).toContain('Inputs appear after the script has calculated once on this chart.');
 });
});
