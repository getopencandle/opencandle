import {afterEach,describe,expect,it,vi} from 'vitest';
import React from 'react';
import {getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext} from '@luxalgo/vela';
import {clearTickLabels,publishReservedAxisRanges,reservedAxisPanes,reservedAxisRanges,subscribeReservedAxisRanges} from '../../src/chart/axis-labels';
import {compileLVScript,describeCompilation} from '../../src/ui/script-editor-commands';
import {scriptLintDiagnostics} from '../../src/ui/script-editor-intel';
import {scriptLegendButtons} from '../../src/ui/script-legend-inputs';
import {fixtureDataset} from '../../src/domain/fixtures';

// SYNTHETIC data only.
const scale=vi.hoisted(()=>({port:null as null|{mode:string;state:()=>{mode:string};execute:ReturnType<typeof vi.fn>}}));
vi.mock('../../src/chart/price-scale-port',()=>({priceScalePortFor:()=>scale.port}));
vi.mock('../../src/chart/indicator-scale',()=>({setIndicatorNativeScale:()=>undefined}));
const {createComparisonPort}=await import('../../src/chart/compare-port');

afterEach(()=>{vi.useRealTimers();scale.port=null;});

describe('axis tick labels under value tags (row 13)',()=>{
 it('blanks only the tick labels a reserved range covers; the tick (grid line) stays',()=>{
  const ticks=[{price:30,label:'30.00'},{price:40,label:'40.00'},{price:50,label:'50.00'}],yOf=(price:number)=>200-price*2;
  // 40.00 sits at y=120; a value tag 40.01 drawn at 112..128 covers it.
  const out=clearTickLabels(ticks,yOf,[[112,128]]);
  expect(out.map(row=>row.label)).toEqual(['30.00','','50.00']);expect(out.map(row=>row.price)).toEqual([30,40,50]);
  expect(clearTickLabels(ticks,yOf,[])).toEqual(ticks);
 });
 it('keeps reserved ranges per pane and notifies observers on publish',()=>{
  const scene={},seen=vi.fn(),off=subscribeReservedAxisRanges(scene,seen);
  publishReservedAxisRanges(scene,'indicators',[[10,26]]);publishReservedAxisRanges(scene,'indicators',[[300,316]],'pane-rsi');
  expect(reservedAxisRanges(scene)).toEqual([[10,26]]);expect(reservedAxisRanges(scene,'pane-rsi')).toEqual([[300,316]]);
  expect(reservedAxisPanes(scene).sort()).toEqual(['pane-rsi','price']);expect(seen).toHaveBeenCalledTimes(2);
  off();publishReservedAxisRanges(scene,'indicators',[]);expect(seen).toHaveBeenCalledTimes(2);expect(reservedAxisPanes(scene)).toEqual(['pane-rsi']);
 });
});

describe('script compile feedback (row 11)',()=>{
 it('a passing compile inside a run does not claim nothing was executed',()=>{
  const ok=compileLVScript('({ onBar(ctx) { ctx.plot("C", ctx.bar.close, "#fff"); } })');
  expect(describeCompilation(ok,{running:true})).toBe('Compiled without errors.');
  expect(describeCompilation(ok)).toBe('Compiled without errors. Nothing was executed.');
  const bad=compileLVScript('({ onBar(ctx) { ctx.plot("C", ctx.bar.close');
  expect(describeCompilation(bad,{running:true})).toMatch(/^Compilation failed: .*Nothing was executed\.$/);
 });
 it('an error at the end of the text marks the last character, never an empty range',()=>{
  const text='({ onBar(ctx) { ctx.plot("C", ctx.bar.close',rows=compileLVScript(text).diagnostics.filter(row=>row.severity==='error');
  expect(rows.length).toBeGreaterThan(0);
  for(const mark of scriptLintDiagnostics(text,rows)){expect(mark.to).toBeGreaterThan(mark.from);expect(mark.to).toBeLessThanOrEqual(text.length);}
 });
});

describe('script legend row buttons (row 15)',()=>{
 it('uses the indicator row icon buttons (hover revealed) with the script accessible names',()=>{
  const press={hide:vi.fn(),settings:vi.fn(),remove:vi.fn()},nodes=scriptLegendButtons('My script',true,press) as React.ReactElement<any>[];
  expect(nodes.map(node=>node.props['aria-label'])).toEqual(['Hide My script','Settings for My script','Remove script My script']);
  for(const node of nodes){expect(String(node.props.className)).toContain('lv-legend-button');expect(node.props.children).not.toBe('Hide');}
  nodes[2].props.onClick();expect(press.remove).toHaveBeenCalledOnce();
  expect((scriptLegendButtons('My script',false,press) as React.ReactElement<any>[])[0].props['aria-label']).toBe('Show My script');
 });
});

describe('Compare removal returns the main scale (row 12)',()=>{
 const dataset=fixtureDataset('GME',5),other=fixtureDataset('SPY',5),bars=dataset.bars.map(bar=>({...bar,time:bar.time*1000}));
 function nativeChart(){
  let sequence=0;const live=new Map<string,NativeIndicator>();
  const chart={renderer:{},on:()=>()=>undefined,panes:{list:()=>[{id:'price',indicators:[]}]},getVisibleRange:()=>({from:bars[0].time,to:bars.at(-1)!.time}),addNativeIndicator:(type:string)=>{
   const descriptor=getNativeIndicator(type)!,id=`native-${++sequence}`,model=descriptor.create();live.set(id,model);
   model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>bars,emit:()=>{},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,descriptor.defaultInputs());
   return {id,setInputs:()=>{},setVisible:()=>{},moveTo:()=>{},remove:()=>{model.stop();live.delete(id);}};
  }};
  return chart as unknown as Vela;
 }
 const fakeScale=(mode:string)=>{const port={mode,state:()=>({mode:port.mode}),execute:vi.fn((command:string)=>{port.mode=command;return{ok:true};})};scale.port=port;return port;};
 it('removing the last Same % scale comparison returns Regular; a mode picked meanwhile is kept',async()=>{
  vi.useFakeTimers();const main=fakeScale('regular'),port=createComparisonPort(nativeChart());
  port.add(other,{id:'spy',placement:'same-scale'});main.mode='percent';
  port.remove('spy');await vi.advanceTimersByTimeAsync(5);
  expect(main.execute).toHaveBeenCalledWith('regular',{paneId:'price',origin:'toolbar'});expect(main.mode).toBe('regular');
  port.add(other,{id:'spy2',placement:'same-scale'});main.mode='indexed';port.remove('spy2');await vi.advanceTimersByTimeAsync(5);
  expect(main.execute).toHaveBeenCalledTimes(1);
 });
 it('logarithmic comes back as logarithmic, only after the last same-scale comparison, and restores never move the scale',async()=>{
  vi.useFakeTimers();const main=fakeScale('logarithmic'),port=createComparisonPort(nativeChart());
  port.add(other,{id:'a',placement:'same-scale'});port.add(dataset,{id:'b',placement:'same-scale'});main.mode='percent';
  port.remove('a');await vi.advanceTimersByTimeAsync(5);expect(main.execute).not.toHaveBeenCalled();
  port.remove('b');await vi.advanceTimersByTimeAsync(5);expect(main.execute).toHaveBeenCalledWith('logarithmic',{paneId:'price',origin:'toolbar'});
  main.execute.mockClear();main.mode='regular';port.add(other,{id:'c',placement:'same-scale'});main.mode='percent';
  port.restore([]);await vi.advanceTimersByTimeAsync(5);expect(main.execute).not.toHaveBeenCalled();
 });
 it('a busy refusal is retried until the scale accepts',async()=>{
  vi.useFakeTimers();const main=fakeScale('regular'),port=createComparisonPort(nativeChart());let refusals=2;
  main.execute.mockImplementation((command:string)=>{if(refusals-->0)return{ok:false,message:'This chart cannot save a scale change right now. Try again when it finishes updating.'};main.mode=command;return{ok:true};});
  port.add(other,{id:'spy',placement:'same-scale'});main.mode='percent';port.remove('spy');await vi.advanceTimersByTimeAsync(400);
  expect(main.execute).toHaveBeenCalledTimes(3);expect(main.mode).toBe('regular');
 });
});
