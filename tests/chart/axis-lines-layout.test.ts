import {describe,expect,it} from 'vitest';
import {hlineLabelLayout,vlineLabelLayout,readLineText,validateLineText,HLINE_TEXT_FACTORY,VLINE_TEXT_FACTORY,LINE_TEXT_FIELD,type LineTextSettings} from '../../src/chart/lv-types/axis-lines';

// Pure label placement of the horizontal and vertical line text (12 px text: native line height 17).
const s=(vertical:LineTextSettings['vertical'],horizontal:LineTextSettings['horizontal'],orientation:LineTextSettings['orientation']='horizontal'):LineTextSettings=>({schemaVersion:1,vertical,horizontal,orientation});

describe('hlineLabelLayout',()=>{
 it('legacy (no member) keeps the native label: 8 px right of the anchor, above the line',()=>{
  expect(hlineLabelLayout(null,100,200,800,1,12)).toEqual({x:108,top:200-4-17,align:'left'});
  expect(hlineLabelLayout(null,100,200,800,2,12)).toEqual({x:108,top:200-4-34,align:'left'});
 });
 it('horizontal Left / Center / Right pin to the pane edges or its middle',()=>{
  expect(hlineLabelLayout(s('top','left'),100,200,800,1,12)).toMatchObject({x:8,align:'left'});
  expect(hlineLabelLayout(s('top','center'),100,200,800,1,12)).toMatchObject({x:400,align:'center'});
  expect(hlineLabelLayout(s('top','right'),100,200,800,1,12)).toMatchObject({x:792,align:'right'});
 });
 it('vertical Top / Middle / Bottom sit above, on and below the line',()=>{
  expect(hlineLabelLayout(s('top','left'),0,200,800,1,12).top).toBe(179);
  expect(hlineLabelLayout(s('middle','left'),0,200,800,1,12).top).toBe(191.5);
  expect(hlineLabelLayout(s('bottom','left'),0,200,800,1,12).top).toBe(204);
  expect(hlineLabelLayout(HLINE_TEXT_FACTORY,0,200,800,1,12)).toEqual({x:400,top:191.5,align:'center'});
 });
});

describe('vlineLabelLayout',()=>{
 const pane={top:50,height:300};
 it('legacy (no member) paints at the anchor point',()=>{
  expect(vlineLabelLayout(null,120,90,pane,1,12)).toEqual({x:120,top:90,align:'left'});
 });
 it('horizontal orientation: Left / Center / Right of the line, Top / Middle / Bottom of the pane',()=>{
  expect(vlineLabelLayout(s('top','left'),120,90,pane,1,12)).toEqual({x:114,top:54,align:'right'});
  expect(vlineLabelLayout(s('middle','center'),120,90,pane,1,12)).toEqual({x:120,top:191.5,align:'center'});
  expect(vlineLabelLayout(s('bottom','right'),120,90,pane,2,12)).toEqual({x:126,top:350-4-34,align:'left'});
 });
 it('vertical orientation rotates -90 degrees about a point on the line',()=>{
  const middle=vlineLabelLayout(VLINE_TEXT_FACTORY,120,90,pane,1,12);
  expect(middle).toEqual({x:0,top:-8.5,align:'center',rotate:{cx:120,cy:200,angle:-Math.PI/2}});
  expect(vlineLabelLayout(s('top','left','vertical'),120,90,pane,1,12)).toEqual({x:0,top:-21,align:'right',rotate:{cx:120,cy:54,angle:-Math.PI/2}});
  expect(vlineLabelLayout(s('bottom','right','vertical'),120,90,pane,1,12)).toEqual({x:0,top:4,align:'left',rotate:{cx:120,cy:346,angle:-Math.PI/2}});
 });
});

describe('lvLineText member states',()=>{
 it('absent is legacy, valid is supported, anything else is unavailable',()=>{
  expect(readLineText(undefined).state).toBe('legacy');
  expect(readLineText({}).state).toBe('legacy');
  expect(readLineText({[LINE_TEXT_FIELD]:{...VLINE_TEXT_FACTORY}})).toEqual({state:'supported',settings:VLINE_TEXT_FACTORY});
  expect(readLineText({[LINE_TEXT_FIELD]:{...VLINE_TEXT_FACTORY,extra:1}}).state).toBe('unavailable');
  expect(readLineText({[LINE_TEXT_FIELD]:{...VLINE_TEXT_FACTORY,vertical:'center'}}).state).toBe('unavailable');
  expect(()=>validateLineText({...HLINE_TEXT_FACTORY,schemaVersion:2})).toThrow();
 });
});
