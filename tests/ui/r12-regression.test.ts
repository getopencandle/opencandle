import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {statusLineParts,type StatusLineSettings} from '../../src/chart/status-line-model';
import * as view from '../../src/ui/indicator-legend-view';
import * as block from '../../src/ui/DrawingUtilityBlock';
import {freshDrawingUtility} from '../../src/chart/drawing-utility-state';

// regression lane. Each test reproduces one packaged-flow failure of release 12
// headlessly and failed before its fix. SYNTHETIC values only; server markup and element trees, no DOM or packaged claim.

const cssRules=(file:string)=>[...readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^}]*)\}/g)].map(match=>({selectors:match[1].split(',').map(text=>text.trim()),body:match[2]}));

describe(' cause 1: the utility menus were clipped by the scrolling drawing toolbar',()=>{
 it('the toolbar aside is a scroll container, so the utility menu must not be absolutely placed inside it',()=>{
  const aside=cssRules('src/ui/components.css').filter(rule=>rule.selectors.includes('.drawing-toolbar'));
  expect(aside.some(rule=>/overflow(-y)?\s*:\s*auto/.test(rule.body))).toBe(true);
  const menu=cssRules('src/ui/drawing-utility.css').filter(rule=>rule.selectors.includes('.lv-utility-menu'));
  expect(menu.length).toBeGreaterThan(0);
  for(const rule of menu)expect(rule.body).not.toMatch(/position\s*:\s*absolute/);
  expect(menu.some(rule=>/position\s*:\s*fixed/.test(rule.body))).toBe(true);
 });
 it('the menu is placed beside its group and kept inside the viewport',()=>{
  expect(block.utilityMenuPosition({right:52,top:681},120,921)).toEqual({left:56,top:681});
  expect(block.utilityMenuPosition({right:52,top:820},180,921)).toEqual({left:56,top:733});
  expect(block.utilityMenuPosition({right:52,top:10},2000,921).top).toBe(4);
 });
 it('Escape closes an open menu and a press outside its group closes it; a press inside does not',()=>{
  expect(block.utilityMenuDismiss({type:'keydown',key:'Escape',insideGroup:true})).toBe('escape');
  expect(block.utilityMenuDismiss({type:'keydown',key:'Escape',isComposing:true,insideGroup:true})).toBeNull();
  expect(block.utilityMenuDismiss({type:'keydown',key:'a',insideGroup:true})).toBeNull();
  expect(block.utilityMenuDismiss({type:'pointerdown',insideGroup:false})).toBe('outside');
  expect(block.utilityMenuDismiss({type:'pointerdown',insideGroup:true})).toBeNull();
 });
 it('every open menu is a UtilityMenu whose dismissal closes it through the host',()=>{
  const find=(node:any,out:any[]=[]):any[]=>{if(Array.isArray(node))for(const child of node)find(child,out);else if(node?.props){if(node.type===block.UtilityMenu)out.push(node);find(node.props.children,out);}return out;};
  for(const openMenu of ['lock','hide','sync','remove'] as const){
   const onOpenMenu=vi.fn();
   const root=block.DrawingUtilityBlock({utility:freshDrawingUtility(),canZoomOut:false,zoomArmed:false,counts:{drawings:2,indicators:1,removeLocked:false},openMenu,
    onOpenMenu,onZoomIn:vi.fn(),onZoomOut:vi.fn(),onToggleLock:vi.fn(),onToggleHide:vi.fn(),onToggleSync:vi.fn(),onSelectLock:vi.fn(),onSelectHide:vi.fn(),onSelectSync:vi.fn(),onRemove:vi.fn(),onToggleRemoveLocked:vi.fn()});
   const menus=find(root);
   expect(menus.length,openMenu).toBe(1);
   menus[0].props.onClose(true);
   expect(onOpenMenu).toHaveBeenCalledWith(null);
  }
 });
});

describe(' cause 2: the chart header change at the first bar',()=>{
 const settings:StatusLineSettings={logo:true,title:{visible:true,source:'name'},chartValues:true,barChange:true,volume:false,lastDayChange:false,indicatorTitles:true,indicatorInputs:true,background:{visible:true,transparency:50}};
 const series={symbol:'GME',name:'GameStop synthetic fixture',exchange:'LOCAL',interval:'1D'};
 const bar={time:2,open:10,high:12,low:9,close:11,volume:1234},previous={time:1,open:9,high:10.5,low:8.5,close:10,volume:900};
 const changeText=(prev:typeof previous|null)=>{
  const html=renderToStaticMarkup(createElement('div',null,view.statusLineValues(statusLineParts(settings,series,bar,prev,[],{legendVisible:true}),prev?{text:'+1.00 (10.00%)',positive:true}:null)));
  return /<span data-status-part="barChange"[^>]*>([^<]*)<\/span>/.exec(html)![1];
 };
 it('an unavailable change shows the same unlabelled form as a shown change, and (FIX-RI7) no glyph at all',()=>{
  expect(changeText(previous)).toBe('+1.00 (10.00%)');
  expect(changeText(null)).toBe('');
 });
});

describe(' cause 3: the checked switch row changed its own accessible name',()=>{
 it('the check mark of "Always remove locked drawings" is decoration with empty alternative text, so the row keeps its name when checked',()=>{
  const marks=cssRules('src/ui/drawing-utility.css').filter(rule=>rule.selectors.some(selector=>/menuitemcheckbox/.test(selector)&&/::?before|::?after/.test(selector))&&/content\s*:/.test(rule.body));
  expect(marks.length).toBeGreaterThan(0);
  // Generated content is part of the accessible name unless it carries alternative text (content: "x" / "").
  for(const rule of marks)expect(rule.body,rule.selectors.join(',')).toMatch(/content\s*:\s*(['"])[^'"]*\1\s*\/\s*(['"])\2/);
 });
});
