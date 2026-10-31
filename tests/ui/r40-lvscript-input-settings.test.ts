import {describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {scriptInputProblem,scriptInputDraft,scriptInputsToSave,parseScriptInputText,scriptInputTimeText,type ScriptSettingsInputDeclaration} from '../../src/ui/script-settings-model';
import {ScriptSettingsDialog} from '../../src/ui/ScriptSettingsDialog';
vi.mock('../../src/chart/script-port',()=>({isScriptVisualStyleId:()=>false}));
vi.mock('../../src/ui/Modal',()=>({Modal:({children}:any)=>React.createElement('div',null,children)}));
vi.mock('../../src/ui/script-outputs',()=>({scriptOutputs:{get:()=>null,subscribe:()=>()=>{}}}));
const spec=(type:ScriptSettingsInputDeclaration['type'],fallback:any,extra:Partial<ScriptSettingsInputDeclaration>={}):ScriptSettingsInputDeclaration=>({id:'synthetic',title:'Synthetic input',type,default:fallback,min:null,max:null,step:null,options:null,...extra});
describe(' typed script settings use the runtime grammar',()=>{
 it('validates each new kind, options, bounds and seconds',()=>{
  for(const [type,good,bad] of [['color','#123456ff','red'],['source','hlc3','volume'],['timeframe','60','1 D'],['symbol','NASDAQ:AAPL','bad symbol'],['session','1800-0200:23456','0930-2500'],['time',1700000000,1700000000.5],['price',1.25,NaN]] as const){expect(scriptInputProblem(spec(type,good),good)).toBeNull();expect(scriptInputProblem(spec(type,good),bad)).not.toBeNull();}
  expect(scriptInputProblem(spec('source','close',{options:['close','high']}),'open')).not.toBeNull();expect(scriptInputProblem(spec('time',0),-1)).not.toBeNull();expect(scriptInputProblem(spec('time',0),253402300800)).not.toBeNull();expect(scriptInputProblem(spec('price',1,{min:0,max:2}),3)).not.toBeNull();
 });
 it('converts UTC input text to Unix seconds without accepting normalized or incomplete dates',()=>{
  const row=spec('time',0);expect(scriptInputTimeText(0)).toBe('1970-01-01T00:00:00');expect(parseScriptInputText(row,'2023-11-14T22:13:20')).toBe(1700000000);expect(parseScriptInputText(row,'2023-11-14T22:13')).toBe(1699999980);expect(scriptInputTimeText(253402300799)).toBe('9999-12-31T23:59:59');
  for(const text of ['','2023-02-31T00:00','2023-01-01T25:00','2023-11-14'])expect(parseScriptInputText(row,text)).toBeNaN();expect(parseScriptInputText(spec('price',0),'1.25')).toBe(1.25);expect(parseScriptInputText(spec('price',0),'')).toBeNaN();
 });
 it('restores only fitting saved values and saves only edits away from defaults',()=>{
  const rows=[spec('color','#112233',{id:'tint'}),spec('source','close',{id:'src',options:['close','high']}),spec('time',0,{id:'time'})];
  const draft=scriptInputDraft(rows,{tint:'red',src:'high',time:0.5,old:'drop'});expect(draft).toEqual({tint:'#112233',src:'high',time:0});expect(scriptInputsToSave(rows,draft)).toEqual({src:'high'});expect(()=>scriptInputsToSave(rows,{...draft,time:-1})).toThrow();
 });
 it('renders color, source, time and price controls with explicit UTC time',()=>{
  const rows=[spec('color','#112233aa',{id:'tint',title:'Tint'}),spec('source','close',{id:'src',title:'Source',options:['close','high']}),spec('time',1700000000,{id:'time',title:'Start'}),spec('price',1.25,{id:'level',title:'Level',step:0.25})];
  const binding={id:'synthetic-script',documentId:'synthetic-doc',name:'Synthetic script',source:'({onBar(ctx){}})',version:1,pane:'price',visible:true,plots:{}} as any,entry={declarations:{inputs:rows,requests:[],conditions:[]}} as any;
  const html=renderToStaticMarkup(React.createElement(ScriptSettingsDialog,{binding,entry,renderedPlots:{},onApply:()=>{},onClose:()=>{}}));
  expect(html).toContain('type="color"');expect(html).toContain('value="#112233aa"');expect(html).toContain('<select aria-label="Source"');expect(html).toContain('aria-label="Start (UTC)"');expect(html).toContain('type="datetime-local"');expect(html).toContain('2023-11-14T22:13:20');expect(html).toContain('aria-label="Level" type="number"');expect(html).toContain('step="0.25"');
 });
});
