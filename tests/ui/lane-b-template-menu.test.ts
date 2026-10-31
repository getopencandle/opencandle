import React from 'react';
import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {templateMenuItems} from '../../src/ui/indicator-template-menu-model';
import {IndicatorTemplatesMenu} from '../../src/ui/IndicatorTemplatesMenu';
import {createIndicatorTemplates,saveIndicatorTemplate} from '../../src/ui/indicator-templates';

// A dropdown with saved templates (click applies, Undo reverts), "Save indicator template...", Manage.
const content={indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
const lib=(...names:string[])=>{let library=createIndicatorTemplates();let n=0;for(const name of names)library=saveIndicatorTemplate(library,name,content,()=>'id'+(n++));return library;};
const h=React.createElement;

describe('templateMenuItems',()=>{
 it('lists saved templates by name, then Save and Manage after a separator',()=>{
  const items=templateMenuItems(lib('Zeta','alpha'),null);
  expect(items.map(i=>i.kind==='separator'?'-':i.label)).toEqual(['alpha','Zeta','-','Save indicator template…','Manage templates…']);
 });
 it('shows a quiet empty row and still offers Save and Manage',()=>{
  const items=templateMenuItems(createIndicatorTemplates(),null);
  expect(items[0]).toMatchObject({kind:'empty',label:'No saved templates'});
  expect(items.filter(i=>i.kind==='action').map(i=>i.id)).toEqual(['save','manage']);
 });
 it('offers Undo first when a template was just applied, naming it',()=>{
  const items=templateMenuItems(lib('Alpha'),{name:'Alpha'});
  expect(items[0]).toMatchObject({kind:'action',id:'undo',label:'Undo apply of Alpha'});
 });
 it('marks the last applied template',()=>{
  const items=templateMenuItems(lib('Alpha','Beta'),{name:'Beta'});
  expect(items.find(i=>i.kind==='template'&&i.label==='Beta')).toMatchObject({applied:true});
 });
});
describe('IndicatorTemplatesMenu',()=>{
 const library=lib('Alpha');
 it('renders a menu with one menuitem per entry and no JSON or review wording',()=>{
  const html=renderToStaticMarkup(h(IndicatorTemplatesMenu,{library,applied:null,onApply:vi.fn(),onSave:vi.fn(),onManage:vi.fn(),onUndo:vi.fn(),onClose:vi.fn()}));
  expect(html).toContain('role="menu"');expect(html).toContain('>Alpha<');expect(html).toContain('Save indicator template…');expect(html).toContain('Manage templates…');
  expect(html).not.toMatch(/JSON|8 MiB|Remember symbol/);
 });
 it('click handlers route to the host',()=>{
  const calls:string[]=[];const tree:any=IndicatorTemplatesMenu({library,applied:{name:'Alpha'},onApply:t=>calls.push('apply:'+t.name),onSave:()=>calls.push('save'),onManage:()=>calls.push('manage'),onUndo:()=>calls.push('undo'),onClose:()=>calls.push('close')});
  const buttons:any[]=[];const walk=(n:any)=>{if(Array.isArray(n))return n.forEach(walk);if(!n?.props)return;if(n.type==='button')buttons.push(n);walk(n.props.children);};walk(tree);
  for(const b of buttons)b.props.onClick();
  expect(calls).toEqual(['undo','close','apply:Alpha','close','save','close','manage','close']);
 });
});

import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
describe('IndicatorTemplatesDialog initialTab',()=>{
 const base={library:createIndicatorTemplates(),onLibraryChange:vi.fn(),capture:vi.fn(),previewApply:vi.fn(),onClose:vi.fn()};
 it('opens on the Save tab when asked, and on Saved templates otherwise',()=>{
  const save=renderToStaticMarkup(h(IndicatorTemplatesDialog,{...base,initialTab:'save'}));
  expect(save).toContain('>Save</button>');expect(save).toContain('Template name');
  const saved=renderToStaticMarkup(h(IndicatorTemplatesDialog,base));
  expect(saved).toContain('Search templates');expect(saved).not.toContain('Template name<input');
 });
});
