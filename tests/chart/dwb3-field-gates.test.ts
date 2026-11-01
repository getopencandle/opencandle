import {afterAll,describe,expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {drawingEditor,drawingFields,setDrawingFieldConsumer,drawingFieldConsumers,DRAWING_FIELD_CONSUMER_NAMES} from '../../src/chart/drawing-port';
import {bars,fib,trendline,channel,position,enableAllConsumers} from './dwb3-helpers';

// With every consumer flag off (the default), the dialog field list of each tool is exactly what it was before this wave.
// The lists below were recorded from the tree before the wave (drawingFields of a fresh native drawing).
afterAll(()=>enableAllConsumers(false));
const A=[{time:1000,price:100},{time:3000,price:120}],A3=[{time:1000,price:100},{time:3000,price:120},{time:1000,price:105}],AP=[{time:1000,price:100},{time:3000,price:90},{time:3000,price:120}];
const paths=(type:string,anchors:unknown)=>drawingFields(createDrawing(type as never,{paneId:'price',anchors:anchors as never})!).map(field=>field.path);
const LINE=['style.lineColor','style.lineWidth','style.lineStyle','style.arrowRight','style.extendLeft','style.extendRight','text.value','text.color','text.size','text.bold','text.italic','locked','visible','style.arrowLeft'];
const STATS=['priceRange','percentChange','barsRange','dateTimeRange','alwaysShow','position'].map(key=>'props.lvTrendlineStats.'+key);
const BEFORE:Record<string,string[]>={
 trendline:[...LINE,...STATS,'text.lvAnnotation.enabled','text.place','text.side'],
 fibretracement:['style.lineWidth','style.lineStyle','style.extendLeft','style.extendRight','lvFibLevelFormat','lvFibTrendLine.enabled','lvFibTrendLine.color','lvFibTrendLine.width','lvFibTrendLine.style','lvFibBackground.opacity','lvFibText.enabled','lvFibText.position','locked','visible','reverse','showPrices','showRatios','background','labelSide','numbersSize','labelsSize'],
 parallelchannel:['style.lineColor','style.lineWidth','style.lineStyle','style.fillColor','text.value','text.color','text.size','text.bold','text.italic','locked','visible'],
 // retarget: the LV position model offers the reference Inputs/Style settings (lvPosition.*, not a consumer
 // member) and keeps the native-only settings as hidden fields after them.
 // 0.8.2: the Stop from ATR settings (lvPosition.atrStop/atrMultiplier/atrLength) are LV position inputs, not a consumer
 // flag, so they join the default list after the stop price.
 position:['accountBalance','lvPosition.lotSize','lvPosition.risk','lvPosition.riskUnit','lvPosition.leverage','entryPrice','lvPosition.profitTicks','targetPrice','lvPosition.stopTicks','stopPrice','lvPosition.atrStop','lvPosition.atrMultiplier','lvPosition.atrLength','lvPosition.precision','lvPosition.currency','style.lineColor','style.lineWidth','style.lineStyle','lossColor','profitColor','text.color','text.size','lvPosition.priceLabels','lvPosition.compactStats','lvPosition.alwaysShowStats','riskPercent','quantity','direction','showText','showHeader','showLossSize','showTargetLabel','showStopLabel','showPrices','locked','visible'],
};
BEFORE.lvshortposition=BEFORE.position;
const anchorsOf:Record<string,unknown>={trendline:A,fibretracement:A,parallelchannel:A3,position:AP,lvshortposition:AP};
// retarget: the box.extend flag (Rectangle Extend, props.lvBoxExtend) joins the per-flag checks below.
const box=()=>createDrawing('box',{id:'dwb3-box',paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120}]})!.serialize();

describe('every consumer flag defaults off and the dialog field lists are unchanged',()=>{
 it('no flag is on at start',()=>{expect(drawingFieldConsumers()).toEqual([]);});
 it.each(Object.keys(BEFORE))('%s keeps its pre-wave field list',type=>{
  expect(paths(type,anchorsOf[type])).toEqual(BEFORE[type]);
 });
 it('the editor of a saved record of each tool offers none of the new paths',()=>{
  const records=[trendline(),fib(),channel(),position(),position('lvshortposition'),box()];
  for(const record of records){
   const list=drawingEditor(record,bars).fields.map(field=>field.path);
   expect(list.filter(path=>/lvTrendlineMarkers|lvFibLayout|lvChannel|lvPositionInputs|lvBoxExtend/.test(path)),record.type).toEqual([]);
  }
 });
});

describe('each flag emits only its own fields',()=>{
 it.each(DRAWING_FIELD_CONSUMER_NAMES.map(name=>[name]))('%s',name=>{
  enableAllConsumers(false);setDrawingFieldConsumer(name,true);
  const all=[trendline(),fib(),channel(),position(),position('lvshortposition'),box()].flatMap(record=>drawingEditor(record,bars,undefined,{priceScaleLog:true}).fields.map(field=>field.path)).filter(path=>/lvTrendlineMarkers|lvFibLayout|lvChannel|lvPositionInputs|lvBoxExtend/.test(path));
  expect(all.length,name).toBeGreaterThan(0);
  const stem=name.split('.')[1];
  for(const path of all){
   const ok=name==='box.extend'?/^props\.lvBoxExtend\.(left|right)$/.test(path):name==='channel.levels'?path.includes('.levels.'):name==='channel.extend'?/extend(Left|Right)$/.test(path):name==='channel.background'?path.includes('background.'):name==='position.riskMode'?/riskMode|riskDisplay/.test(path):path.endsWith('.'+stem);
   expect(ok,path+' under '+name).toBe(true);
  }
  enableAllConsumers(false);
 });
 it('the fib log-scale field is never offered on a linear scale, even with its flag on',()=>{
  enableAllConsumers(false);setDrawingFieldConsumer('fib.logScale',true);
  expect(drawingEditor(fib(),bars).fields.map(f=>f.path)).not.toContain('lvFibLayout.logScale');
  expect(drawingEditor(fib(),bars,undefined,{priceScaleLog:false}).fields.map(f=>f.path)).not.toContain('lvFibLayout.logScale');
  expect(drawingEditor(fib(),bars,undefined,{priceScaleLog:true}).fields.map(f=>f.path)).toContain('lvFibLayout.logScale');
  enableAllConsumers(false);
 });
 it('an unknown flag is refused',()=>{expect(()=>setDrawingFieldConsumer('nope')).toThrow();});
});
