import {describe,expect,it} from 'vitest';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {seedNewChannel,readChannelLevels,deriveChannelBackground} from '../../src/chart/channel-levels-data';
import {enableAllConsumers,bars,channel} from './dwb3-helpers';
import type {SerializedDrawing} from '@luxalgo/vela';
enableAllConsumers();

// A saved channel's fill is an unrelated saved property. Only an edit of a background field may rewrite it.
// Fills are hand-written in every form the app produces or accepts.
const FILLS=['rgba(255,0,0,0.25)','rgb(10,20,30)','#f00','#f008','#12345678','#abcdef','red','hsl(120,50%,50%)','rgba(1, 2, 3, 0.5)','transparent'];
const saved=(fill:string):SerializedDrawing=>({...channel(),style:{...channel().style,fillColor:fill}} as SerializedDrawing);
const EDITS:Array<[string,unknown]>=[['props.lvChannel.extendLeft',true],['props.lvChannel.extendRight',true],['props.lvChannel.levels.0.enabled',true],['props.lvChannel.levels.1.ratio',0.4],['props.lvChannel.levels.2.color','#336699']];

describe('saved channel fills survive every non-background edit byte for byte',()=>{
 it.each(FILLS.flatMap(fill=>EDITS.map(([path,value])=>[fill,path,value] as [string,string,unknown])))('fill %s, edit %s',(fill,path,value)=>{
  const record=saved(fill),applied=patchDrawingEdit(record,bars,{[path]:value});
  expect(applied).not.toBe(record);
  expect(applied.style.fillColor).toBe(fill);
  expect(readChannelLevels(applied.props).state).toBe('supported');
 });
 it('a seeded channel keeps its fill through level and extend edits too',()=>{
  const record=seedNewChannel(channel());
  for(const [path,value] of EDITS)expect(patchDrawingEdit(record,bars,{[path]:value}).style.fillColor).toBe(record.style.fillColor);
 });
});

describe('the editor tells the truth about a saved fill',()=>{
 it.each([
  ['rgba(255,0,0,0.25)',true,'#ff0000',25],['#f00',true,'#ff0000',100],['red',true,'#ff0000',100],['rgb(10,20,30)',true,'#0a141e',100],['transparent',false,'#000000',0],['#12345680',true,'#123456',50],
 ] as Array<[string,boolean,string,number]>)('%s',(fill,enabled,color,opacity)=>{
  const values=drawingEditor(saved(fill),bars).values;
  expect(values['props.lvChannel.background.enabled']).toBe(enabled);
  expect(values['props.lvChannel.background.color']).toBe(color);
  expect(values['props.lvChannel.background.opacity']).toBe(opacity);
 });
 it('an unsupported fill derives nothing',()=>{expect(deriveChannelBackground('not a color')).toBeUndefined();});
});

describe('backgrounds accept every color the color control produces',()=>{
 it('a native fill edit to rgba on a seeded channel is applied and mirrored into the member',()=>{
  const record=seedNewChannel(channel()),applied=patchDrawingEdit(record,bars,{'style.fillColor':'rgba(1,2,3,0.5)'});
  expect(applied.style.fillColor).toBe('rgba(1,2,3,0.5)');
  const values=drawingEditor(applied,bars).values;
  expect(values['props.lvChannel.background.color']).toBe('#010203');expect(values['props.lvChannel.background.opacity']).toBe(50);
 });
 it('the Background color control may write rgba, and opacity edits compose the native fill',()=>{
  const record=seedNewChannel(channel()),applied=patchDrawingEdit(record,bars,{'props.lvChannel.background.color':'rgba(1,2,3,0.4)','props.lvChannel.background.opacity':50});
  expect(applied.style.fillColor).toBe('#01020380');
  const off=patchDrawingEdit(saved('rgba(255,0,0,0.25)'),bars,{'props.lvChannel.background.enabled':false});
  expect(off.style.fillColor).toBe('#ff000000');
 });
});
