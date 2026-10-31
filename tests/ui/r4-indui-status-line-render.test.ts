import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {statusLineParts,type StatusLineSettings} from '../../src/chart/status-line-model';
import * as view from '../../src/ui/indicator-legend-view';

// R4 (root wiring): the status line render test, written failing first before App renders the
// status line. It drives the status line model through the root view functions App uses, and reads the
// rendered markup. SYNTHETIC values. Server markup only: no DOM, native window or packaged claim.
const defaults=():StatusLineSettings=>({logo:true,title:{visible:true,source:'name'},chartValues:true,barChange:true,volume:false,lastDayChange:false,indicatorTitles:true,indicatorInputs:true,background:{visible:true,transparency:50}});
const series={symbol:'GME',name:'GameStop synthetic fixture',exchange:'LOCAL',interval:'1D'};
const bar={time:2,open:10,high:12,low:9,close:11,volume:1234};
const previous={time:1,open:9,high:10.5,low:8.5,close:10,volume:900};
function markup(settings:StatusLineSettings,options:{bar?:typeof bar|null;previous?:typeof previous|null}={}){
 const status=statusLineParts(settings,series,options.bar===undefined?bar:options.bar,options.previous===undefined?previous:options.previous,[],{legendVisible:true});
 return renderToStaticMarkup(createElement('div',null,view.statusLineLead(status,null),createElement('div',{className:'ohlc'},view.statusLineValues(status,{text:'+1.00 (10.00%)',positive:true}))));
}
const parts=(html:string)=>[...html.matchAll(/data-status-part="([a-zA-Z]+)"/g)].map(match=>match[1]);

describe('R4 status line render (failing first)',()=>{
 it('default settings render logo, title, interval, exchange, chart values and bar change in fact order',()=>{
  const html=markup(defaults());
  expect(parts(html)).toEqual(['logo','title','interval','exchange','chartValues','chartValues','chartValues','chartValues','barChange']);
  expect(html).toMatch(/data-status-part="logo"[^>]*>G</);
  expect(html).toMatch(/width:18px/);
  expect(html).toMatch(/data-status-part="title"[^>]*title="Change symbol"[^>]*>GameStop synthetic fixture</);
  expect(html).toMatch(/data-status-part="interval"[^>]*>[^<]*1D</);
  expect(html).toMatch(/data-status-part="exchange"[^>]*>[^<]*LOCAL</);
  for(const [label,value] of [['O','10.00'],['H','12.00'],['L','9.00'],['C','11.00']])expect(html).toContain(label+' <b class="positive">'+value+'</b>');
  expect(html).toContain('+1.00 (10.00%)');
 });
 it('each toggle gates its own part, and the title source picks the wording',()=>{
  expect(parts(markup({...defaults(),logo:false,title:{visible:false,source:'name'},chartValues:false,barChange:false}))).toEqual(['interval','exchange']);
  const both=markup({...defaults(),title:{visible:true,source:'symbolAndName'},volume:true});
  expect(both).toMatch(/data-status-part="title"[^>]*>GME, GameStop synthetic fixture</);
  expect(both).toMatch(/data-status-part="volume"[^>]*>Vol <b>1.23K<\/b>/);
  expect(markup({...defaults(),title:{visible:true,source:'symbol'}})).toMatch(/data-status-part="title"[^>]*>GME</);
 });
 it('an unavailable part shows its reason and is never blank',()=>{
  const html=markup({...defaults(),lastDayChange:true});
  const part=/<span data-status-part="lastDayChange"[^>]*data-state="unavailable"[^>]*title="([^"]+)"[^>]*>([^<]+)</.exec(html);
  expect(part).not.toBeNull();
  expect(part![1]).toBe('The previous session close is not available from this source.');
  expect(part![2].trim().length).toBeGreaterThan(0);
  const first=markup(defaults(),{previous:null});
  expect(first).toMatch(/data-status-part="barChange"[^>]*data-state="unavailable"[^>]*title="There is no previous bar to compare with."/);
 });
 it('the background follows the visible flag and transparency',()=>{
  const status=(visible:boolean,transparency:number)=>statusLineParts({...defaults(),background:{visible,transparency}},series,bar,previous,[],{legendVisible:true});
  expect(view.statusLineBackground(status(false,50))).toBeUndefined();
  expect(view.statusLineBackground(status(true,0))).toMatch(/100%/);
  expect(view.statusLineBackground(status(true,75))).toMatch(/25%/);
 });
 it('user-visible text has no em dash',()=>{
  expect(markup({...defaults(),volume:true,lastDayChange:true})).not.toContain('—');
 });
});
