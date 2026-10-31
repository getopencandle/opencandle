import {describe,expect,it} from 'vitest';
import {deserializeDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingEdit,patchDrawingProperties,drawingDraftChanges} from '../../src/chart/drawing-port';
import {CHANNEL_LEVELS_FACTORY_DEFAULTS,CHANNEL_LEVELS_LEGACY,readChannelLevels,validateChannelLevels,seedNewChannel,composeChannelFill} from '../../src/chart/channel-levels-data';
import {planChannelLevels,paintChannelLevels} from '../../src/chart/channel-levels-painter';
import {enableAllConsumers,bars,channel,roundTrip} from './dwb3-helpers';
enableAllConsumers();

// The parallel channel has no reference fact for its settings (SDD2 status: factory defaults unknown).
// Every default below is our own choice and applies to NEW channels only.
const L=(i:number,key:string)=>`props.lvChannel.levels.${i}.${key}`;
describe('CHANNEL.PARALLEL_CHANNEL levels, extends and background (props.lvChannel)',()=>{
 it('a saved channel has no member, reads as legacy (no levels, no extend) and stays byte-identical on a no-op',()=>{
  const record=channel(),before=JSON.stringify(record);
  expect(record.props).toBeUndefined();
  expect(readChannelLevels(record.props)).toEqual({state:'legacy',settings:CHANNEL_LEVELS_LEGACY});
  expect(CHANNEL_LEVELS_LEGACY.levels.every(level=>!level.enabled)).toBe(true);
  expect(CHANNEL_LEVELS_LEGACY.extendLeft||CHANNEL_LEVELS_LEGACY.extendRight).toBe(false);
  const editor=drawingEditor(record,bars);
  expect(editor.values[L(0,'enabled')]).toBe(false);
  expect(patchDrawingEdit(record,bars,{[L(0,'enabled')]:false,'props.lvChannel.extendLeft':false})).toBe(record);
  expect(JSON.stringify(record)).toBe(before);
 });
 it('NEW channels are seeded with the OpenCandle defaults: one midline at 0.5, extend off, background on ',()=>{
  const seeded=seedNewChannel(channel());
  const state=readChannelLevels(seeded.props);
  expect(state.state).toBe('supported');
  const settings=state.state==='supported'?state.settings:undefined!;
  expect(settings).toEqual(CHANNEL_LEVELS_FACTORY_DEFAULTS);
  expect(settings.levels.filter(level=>level.enabled).map(level=>level.ratio)).toEqual([0.5]);
  expect(settings.extendLeft||settings.extendRight).toBe(false);expect(settings.background.enabled).toBe(true);
  // the background composes to the native fill the channel was created with, so the picture does not change
  expect(composeChannelFill(settings.background)).toBe(channel().style.fillColor);
  expect(seedNewChannel(seeded)).toBe(seeded); // seeding is idempotent and never touches a record that already has a member
  const legacy={...channel(),props:{other:1}};
  expect(seedNewChannel(legacy).props).toMatchObject({other:1,lvChannel:expect.any(Object)});
 });
 it.each([
  [L(0,'enabled'),false],[L(1,'enabled'),true],[L(0,'ratio'),0.75],[L(0,'color'),'#aa3355'],[L(0,'opacity'),40],[L(0,'width'),3],[L(0,'style'),'dotted'],
  ['props.lvChannel.extendLeft',true],['props.lvChannel.extendRight',true],
  ['props.lvChannel.background.enabled',false],['props.lvChannel.background.color','#102030'],['props.lvChannel.background.opacity',33],
 ] as Array<[string,unknown]>)('%s edits, applies, undoes, round trips and cancels',(path,value)=>{
  const record=seedNewChannel(channel()),before=JSON.stringify(record),applied=patchDrawingEdit(record,bars,{[path]:value});
  expect(drawingEditor(applied,bars).values[path]).toBe(value);
  expect(JSON.stringify(record)).toBe(before);
  expect(drawingEditor(roundTrip(applied),bars).values[path]).toBe(value);
  const editor=drawingEditor(record,bars);expect(drawingDraftChanges(editor,{...editor.values},editor.anchors).properties).toEqual({});
 });
 it('editing a level on a saved channel creates the member from legacy values and keeps the native fill',()=>{
  const record=channel(),applied=patchDrawingEdit(record,bars,{[L(0,'enabled')]:true});
  const state=readChannelLevels(applied.props);
  expect(state.state).toBe('supported');
  expect(applied.style.fillColor).toBe(record.style.fillColor);
  expect(deserializeDrawing(applied)!.serialize().anchors).toEqual(record.anchors);
 });
 it('the background fields drive the native fill and turning the background off removes it',()=>{
  const record=seedNewChannel(channel());
  const off=patchDrawingEdit(record,bars,{'props.lvChannel.background.enabled':false});
  expect(off.style.fillColor).toBe('#2962ff00');
  const on=patchDrawingEdit(off,bars,{'props.lvChannel.background.enabled':true,'props.lvChannel.background.opacity':50});
  expect(on.style.fillColor).toBe('#2962ff80');
  const direct=patchDrawingEdit(record,bars,{'style.fillColor':'#112233cc'});
  expect(drawingEditor(direct,bars).values['props.lvChannel.background.color']).toBe('#112233');
  expect(drawingEditor(direct,bars).values['props.lvChannel.background.opacity']).toBe(80);
 });
 it('rejects bad values and retained malformed members stay opaque',()=>{
  for(const [path,value] of ([[L(0,'ratio'),99],[L(0,'opacity'),101],[L(0,'width'),0],[L(0,'style'),'wavy'],[L(0,'color'),'nope'],['props.lvChannel.extendLeft','yes'],[L(4,'enabled'),true]] as Array<[string,unknown]>))
   expect(()=>patchDrawingProperties(seedNewChannel(channel()),{[path]:value}),path).toThrow();
  const bad={...channel(),props:{lvChannel:{schemaVersion:1}}};
  expect(readChannelLevels(bad.props).state).toBe('unavailable');
  expect(()=>patchDrawingProperties(bad,{[L(0,'enabled')]:true})).toThrow();
  expect(()=>validateChannelLevels({...CHANNEL_LEVELS_FACTORY_DEFAULTS,levels:CHANNEL_LEVELS_FACTORY_DEFAULTS.levels.slice(0,3)})).toThrow();
 });
});

describe('channel levels painter plan',()=>{
 // SYNTHETIC: x = time/10, y = 1000 - price. Base line runs (100,100)->(300,150) in price units; third anchor sets an offset of +20.
 const proj={xOf:(time:number)=>time/10,yOf:(price:number)=>1000-price};
 const anchors=[{time:1000,price:100},{time:3000,price:150},{time:1000,price:135}];
 const bounds={left:0,right:500,top:0,bottom:1000};
 const settings=(over:Record<string,unknown>={})=>({...CHANNEL_LEVELS_FACTORY_DEFAULTS,...over}) as typeof CHANNEL_LEVELS_FACTORY_DEFAULTS;
 const level=(ratio:number,enabled=true)=>({enabled,ratio,color:'#336699',opacity:50,width:2,style:'dashed' as const});
 const rows=(ratios:number[])=>ratios.map(ratio=>level(ratio)).concat(Array.from({length:4-ratios.length},()=>level(0.5,false))) as unknown as typeof CHANNEL_LEVELS_FACTORY_DEFAULTS.levels;
 // channelOffset: anchors[2].price - (anchors[0].price+anchors[1].price)/2 = 135-125 = 10
 it('levels at ratio 0, 0.5 and 1 land on the base line, the middle and the parallel line',()=>{
  const ops=planChannelLevels(settings({levels:rows([0,0.5,1])}),anchors,proj,bounds,{color:'#fff',width:1,style:'solid'});
  const lines=ops.filter(op=>op.kind==='line');
  expect(lines).toHaveLength(3);
  expect(lines.map(op=>[op.x1,op.y1,op.x2,op.y2])).toEqual([[100,900,300,850],[100,895,300,845],[100,890,300,840]]);
  expect(lines[0]).toMatchObject({color:'#336699',alpha:0.5,width:2,dash:[8,6]});
 });
 it('a disabled level draws nothing and the legacy settings draw nothing at all',()=>{
  expect(planChannelLevels(settings({levels:rows([])}),anchors,proj,bounds,{color:'#fff',width:1,style:'solid'})).toEqual([]);
  expect(planChannelLevels(CHANNEL_LEVELS_LEGACY,anchors,proj,bounds,{color:'#fff',width:1,style:'solid'})).toEqual([]);
  expect(planChannelLevels(undefined,anchors,proj,bounds,{color:'#fff',width:1,style:'solid'})).toEqual([]);
 });
 it('extend right and left continue the channel lines and levels to the pane edge on the same slope',()=>{
  const ops=planChannelLevels(settings({levels:rows([0.5]),extendLeft:true,extendRight:true}),anchors,proj,bounds,{color:'#fff',width:1,style:'solid'});
  const lines=ops.filter(op=>op.kind==='line');
  // slope is -0.25 px/px (the segment rises 50 over 200). Midline: single extended line from x 0 to 500.
  const mid=lines.find(op=>op.color==='#336699')!;
  expect([mid.x1,mid.x2]).toEqual([0,500]);expect(mid.y1).toBeCloseTo(895+25,9);expect(mid.y2).toBeCloseTo(845-50,9);
  // the base and the parallel line get tails only (their native segment is drawn by the renderer)
  const tails=lines.filter(op=>op.color==='#fff');
  expect(tails).toHaveLength(4);
  expect(tails.every(op=>op.x2<=100||op.x1>=300)).toBe(true);
  const right=planChannelLevels(settings({levels:rows([]),extendRight:true}),anchors,proj,bounds,{color:'#fff',width:1,style:'solid'}).filter(op=>op.kind==='line');
  expect(right).toHaveLength(2);expect(right.every(op=>op.x1===300&&op.x2===500)).toBe(true);
 });
 it('paints with balanced state and ignores non-finite geometry',()=>{
  const calls:string[]=[],ctx:any=new Proxy({},{get:(_,key)=>typeof key==='string'?(...args:unknown[])=>{calls.push(String(key));}:undefined,set:()=>true});
  const ops=planChannelLevels(settings({levels:rows([0.5])}),anchors,proj,bounds,{color:'#fff',width:1,style:'solid'});
  paintChannelLevels(ctx,ops);expect(calls.filter(call=>call==='save')).toHaveLength(calls.filter(call=>call==='restore').length);expect(calls).toContain('stroke');
  expect(planChannelLevels(settings({levels:rows([0.5])}),anchors,{xOf:()=>NaN,yOf:()=>NaN},bounds,{color:'#fff',width:1,style:'solid'})).toEqual([]);
 });
});
