import React from 'react';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {legendValuesView,legendPaneView} from '../../src/ui/indicator-legend-view';

const h=React.createElement;
describe('lane B legend views',()=>{
 it('renders colored live values, one span per plot',()=>{
  const html=renderToStaticMarkup(h(React.Fragment,null,legendValuesView([{plot:'rsi',text:'30.46',color:'#7e57c2'},{plot:'ma',text:'∅',color:'#ffeb3b'}])));
  expect(html).toContain('data-legend-values="true"');
  expect(html).toContain('data-plot="rsi" style="color:#7e57c2">30.46<');
  expect(html).toContain('data-plot="ma" style="color:#ffeb3b">∅<');
 });
 it('renders nothing for a row with no values',()=>{
  expect(legendValuesView([])).toBeNull();
 });
 it('wraps a pane group with its own stack hook',()=>{
  const html=renderToStaticMarkup(h(React.Fragment,null,legendPaneView('lv-pane-1',[h('i',{key:'x'},'row')])));
  expect(html).toContain('class="lv-legend-pane"');expect(html).toContain('data-legend-pane="lv-pane-1"');expect(html).toContain('<i>row</i>');
 });
});
