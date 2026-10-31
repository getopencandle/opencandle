import {describe,expect,it} from 'vitest';
import {type SerializedDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {planTrendlineMarkers} from '../../src/chart/trendline-markers-painter';
import {planChannelLevels} from '../../src/chart/channel-levels-painter';
import {readTrendlineMarkers,readTrendlineStats} from '../../src/chart/trendline-stats-data';
import {readChannelLevels,seedNewChannel} from '../../src/chart/channel-levels-data';
import {readPositionInputs,seedNewPosition,positionInputLines} from '../../src/chart/position-inputs';
import {readFibLayout} from '../../src/chart/fib-level-presentation-data';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {enableAllConsumers,bars,trendline,fib,channel,position,T0,T1} from './dwb3-helpers';
enableAllConsumers();

// New LV defaults apply ONLY to drawings created after the update. Every "saved" document below is hand-written JSON shaped like a pre-wave
// workspace (none of it is produced by a createDrawing call or by the new modules) and is sent through the real load normalizers.
const style={lineColor:'#2962FF',lineWidth:2,lineStyle:'solid'};
const base={paneId:'price',locked:false,visible:true,zIndex:0};
const SAVED:Record<string,Record<string,unknown>>={
 trendline:{...base,id:'old-tl',type:'trendline',anchors:[{time:T0,price:100},{time:T1,price:120}],style,props:{lvTrendlineStats:{schemaVersion:1,priceRange:true,percentChange:false,barsRange:false,dateTimeRange:false,alwaysShow:false,position:'above'}}},
 channel:{...base,id:'old-ch',type:'parallelchannel',anchors:[{time:T0,price:100},{time:T1,price:120},{time:T0,price:105}],style:{lineColor:'#38c0fd',lineWidth:2,lineStyle:'solid',fillColor:'rgba(255,0,0,0.25)'}},
 long:{...base,id:'old-long',type:'position',anchors:[{time:T0,price:100},{time:T1,price:90},{time:T1,price:120}],style:{lineColor:'#808080',lineWidth:1,lineStyle:'solid'},props:{riskPercent:1,accountBalance:1000,showText:true,showHeader:true,showPrices:false,showLossSize:true,showTargetLabel:true,showStopLabel:true,profitColor:'#0ecb81',lossColor:'#f6465d'}},
 short:{...base,id:'old-short',type:'lvshortposition',anchors:[{time:T0,price:100},{time:T1,price:90},{time:T1,price:120}],style:{lineColor:'#808080',lineWidth:1,lineStyle:'solid'},props:{riskPercent:1,accountBalance:10000,showText:true,showHeader:true,showPrices:false,showLossSize:true,showTargetLabel:true,showStopLabel:true,profitColor:'#0ecb81',lossColor:'#f6465d'}},
 fib:{...base,id:'old-fib',type:'fibretracement',anchors:[{time:T0,price:100},{time:T1,price:120}],style:{lineColor:'#38c0fd',lineWidth:2,lineStyle:'solid'},props:{levels:[{ratio:0,color:'#808080',enabled:true},{ratio:0.5,color:'#4caf50',enabled:true},{ratio:1,color:'#808080',enabled:true},{ratio:-0.5,color:'#F23645',enabled:false},{ratio:1.618,color:'#2962FF',enabled:true}],numbersSize:'small',labelsSize:'normal',showRatios:true,showPrices:true,labelSide:'left',background:true,reverse:false}},
};
const WORKSPACE=JSON.stringify({version:1,drawings:Object.values(SAVED)});
const rows=():SerializedDrawing[]=>(JSON.parse(WORKSPACE).drawings as SerializedDrawing[]);
const row=(key:string)=>rows().find(item=>item.id===SAVED[key].id)!;
const proj={xOf:(time:number)=>time/10,yOf:(price:number)=>1000-price};
const bounds={left:0,right:500,top:0,bottom:1000};

describe('saved pre-wave documents are unchanged by the members',()=>{
 it('the workspace load normalizer returns the hand-written document byte for byte',()=>{
  expect(JSON.stringify(prepareWorkspaceJSON(JSON.parse(WORKSPACE)))).toBe(WORKSPACE);
 });
 it('the canonical drawing document loads and serializes the hand-written rows byte for byte, and an unrelated edit leaves the others alone',()=>{
  const doc=new LosslessDrawingDocument();doc.load(JSON.parse(WORKSPACE));
  const before=doc.serialize() as {drawings:unknown[]};
  expect(JSON.stringify(before.drawings)).toBe(JSON.stringify(rows()));
  const edited=patchDrawingEdit(row('trendline'),bars,{'style.lineWidth':4});
  expect(edited.style.lineWidth).toBe(4);
  expect(JSON.stringify(rows().filter(item=>item.id!=='old-tl'))).toBe(JSON.stringify((before.drawings as SerializedDrawing[]).filter(item=>item.id!=='old-tl')));
 });
 it('trendline: no markers member is read or created, the statistics member is kept, painter plan is empty',()=>{
  const record=row('trendline');
  expect(readTrendlineMarkers(record.props).state).toBe('legacy');
  expect(planTrendlineMarkers(undefined,record.anchors,proj,bounds,{color:'#fff'})).toEqual([]);
  expect(readTrendlineStats(record.props)).toMatchObject({state:'supported',settings:{priceRange:true}});
  expect(patchDrawingEdit(record,bars,{'props.lvTrendlineStats.priceRange':true})).toBe(record);
  const edited=patchDrawingEdit(record,bars,{'style.lineWidth':3});
  expect(edited.props).toEqual(record.props);
  expect(Object.keys(edited.props!)).toEqual(['lvTrendlineStats']);
 });
 it('channel: legacy settings draw nothing; editing a level keeps the non-hex fill byte for byte; the only added member is lvChannel',()=>{
  const record=row('channel'),state=readChannelLevels(record.props);
  expect(state.state).toBe('legacy');
  expect(planChannelLevels(state.state==='legacy'?state.settings:undefined,record.anchors,proj,bounds,{color:'#38c0fd',width:2,style:'solid'})).toEqual([]);
  expect(drawingEditor(record,bars).priceOffset).toBe(-5);
  const edited=patchDrawingEdit(record,bars,{'props.lvChannel.extendLeft':true});
  expect(edited.style.fillColor).toBe('rgba(255,0,0,0.25)');
  expect(Object.keys(edited.props!)).toEqual(['lvChannel']);
  expect({...edited,props:undefined}).toEqual({...record,props:undefined});
 });
 it.each(['long','short'])('%s position: no inputs member, no extra lines; an edit adds only lvPositionInputs',key=>{
  const record=row(key);
  expect(readPositionInputs(record.props).state).toBe('legacy');
  expect(positionInputLines(readPositionInputs(record.props))).toEqual([]);
  const edited=patchDrawingEdit(record,bars,{'props.lvPositionInputs.lotSize':3});
  expect({...edited.props,lvPositionInputs:undefined}).toEqual({...record.props,lvPositionInputs:undefined});
  expect(edited.anchors).toEqual(record.anchors);
 });
 it('fib: no layout member; a layout edit keeps negative and greater-than-one ratios and every other prop',()=>{
  const record=row('fib');
  expect(readFibLayout(record.props).state).toBe('legacy');
  expect(patchDrawingEdit(record,bars,{'lvFibLayout.logScale':false})).toBe(record);
  const edited=patchDrawingEdit(record,bars,{'lvFibLayout.fontSize':'20'});
  expect((edited.props!.levels as Array<{ratio:number}>).map(level=>level.ratio)).toEqual([0,0.5,1,-0.5,1.618]);
  expect({...edited.props,lvFibLayout:undefined}).toEqual({...record.props,lvFibLayout:undefined});
 });
 it('newly created drawings are the only ones seeded; a trendline is never seeded',()=>{
  expect(Object.hasOwn(seedNewChannel(channel()).props!,'lvChannel')).toBe(true);
  expect(Object.hasOwn(seedNewPosition(position()).props!,'lvPositionInputs')).toBe(true);
  expect(Object.hasOwn(trendline().props??{},'lvTrendlineMarkers')).toBe(false);
  expect(Object.hasOwn(fib().props!,'lvFibLayout')).toBe(false);
  expect(seedNewChannel(row('channel'))).not.toBe(row('channel')); // seeding is the creation path only; nothing in the load path calls it
  expect(JSON.stringify(prepareWorkspaceJSON(JSON.parse(WORKSPACE)))).toBe(WORKSPACE);
 });
});

describe('the new members survive the workspace JSON preparation used by save and load',()=>{
 it('markers, fib layout, channel and position members come back byte identical',()=>{
  const made=[
   patchDrawingEdit(trendline(),bars,{'props.lvTrendlineMarkers.middlePoint':true,'props.lvTrendlineMarkers.angle':true}),
   patchDrawingEdit(fib(),bars,{'lvFibLayout.fontSize':'20','lvFibLayout.logScale':true}),
   seedNewChannel(channel()),seedNewPosition(position()),seedNewPosition(position('lvshortposition')),
  ];
  const prepared=prepareWorkspaceJSON({version:1,drawings:made}) as {drawings:unknown[]};
  made.forEach((item,index)=>expect(JSON.stringify(prepared.drawings[index])).toBe(JSON.stringify(item)));
 });
});
