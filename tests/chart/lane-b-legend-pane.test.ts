import {describe,expect,it} from 'vitest';
import {groupLegendByPane,legendValueParts} from '../../src/chart/legend-pane-model';

// One legend per pane, colored live values at the crosshair bar (last bar when not hovering).
const style=(color:string,extra:object={})=>({visible:true,color,width:1,lineStyle:'solid',kind:'line',...extra}) as any;
describe('groupLegendByPane',()=>{
 it('puts price first, keeps first-seen order for other panes and sends unmounted rows to price',()=>{
  const groups=groupLegendByPane([{id:'a',paneId:'lv-pane-1'},{id:'b',paneId:'price'},{id:'c',paneId:'lv-pane-2'},{id:'d',paneId:'lv-pane-1'},{id:'e',paneId:null}]);
  expect(groups.map(g=>[g.paneId,g.rows.map(r=>r.id)])).toEqual([['price',['b','e']],['lv-pane-1',['a','d']],['lv-pane-2',['c']]]);
 });
 it('returns no price group when nothing sits on price', ()=>{
  expect(groupLegendByPane([{id:'a',paneId:'lv-pane-1'}]).map(g=>g.paneId)).toEqual(['lv-pane-1']);
 });
});
describe('legendValueParts',()=>{
 const result={series:[{id:'rsi',label:'RSI',values:[10,20,30.456]},{id:'ma',label:'MA',values:[1,Number.NaN,3]}]};
 const plots={rsi:style('#7e57c2'),ma:style('#ffeb3b')};
 it('reads the last bar when not hovering',()=>{
  expect(legendValueParts(result,plots,null)).toEqual([{plot:'rsi',text:'30.46',color:'#7e57c2'},{plot:'ma',text:'3.00',color:'#ffeb3b'}]);
 });
 it('reads the crosshair bar and shows a placeholder for gaps',()=>{
  expect(legendValueParts(result,plots,1)).toEqual([{plot:'rsi',text:'20.00',color:'#7e57c2'},{plot:'ma',text:'∅',color:'#ffeb3b'}]);
 });
 it('skips hidden plots and plots with the legend flag off',()=>{
  expect(legendValueParts(result,{rsi:style('#1',{visible:false}),ma:style('#2',{legend:false})},null)).toEqual([]);
 });
 it('uses the supplied formatter and tolerates an out of range index',()=>{
  expect(legendValueParts(result,plots,99,v=>v.toFixed(1))).toEqual([{plot:'rsi',text:'∅',color:'#7e57c2'},{plot:'ma',text:'∅',color:'#ffeb3b'}]);
  expect(legendValueParts(result,plots,0,v=>v.toFixed(1))[0].text).toBe('10.0');
 });
});

import {indicatorLegendValues} from '../../src/chart/legend-pane-model';
describe('indicatorLegendValues',()=>{
 const port={values:(id:string)=>{if(id==='gone')throw new Error('Unknown indicator instance: gone');return {series:[{id:'rsi',label:'RSI',values:[1,2,3]}]};}};
 const row=(id:string)=>({id,kind:'rsi',plots:{rsi:style('#7e57c2')}}) as any;
 it('reads the port values with the row plot styles, falling back to a default style',()=>{
  expect(indicatorLegendValues(port,row('a'),null,()=>style('#000'))).toEqual([{plot:'rsi',text:'3.00',color:'#7e57c2'}]);
  expect(indicatorLegendValues(port,{id:'a',kind:'rsi',plots:{}} as any,1,()=>style('#123456'))).toEqual([{plot:'rsi',text:'2.00',color:'#123456'}]);
 });
 it('returns no values when the port has no such instance',()=>{
  expect(indicatorLegendValues(port,row('gone'),null,()=>style('#000'))).toEqual([]);
 });
});
