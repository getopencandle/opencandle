import {expect,it} from 'vitest';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {createIndicatorPort,defaultPlotStyle} from '../../src/chart/indicator-port';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
// Inject native boundary failures. This tests model transactions, not desktop rendering.
function boundary(closes:readonly number[]=[1,2,3,4]){
 let sequence=0,failures=0;const live=new Map<string,any>();
 const bars=closes.map((close,index)=>({time:1700000000000+index*60000,open:close,high:close,low:close,close,volume:1}));
 const boundaryCall=()=>{if(failures>0){failures--;throw new Error('Injected native boundary failure');}};
 const chart={panes:{list:()=>[...new Set(['price',...[...live.values()].map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.pane===id).map(([id])=>({id}))}))},addNativeIndicator(type:string){
  boundaryCall();const descriptor=getNativeIndicator(type)!,id='native-'+ ++sequence,model=descriptor.create();let visible=true;const state={model,pane:'price',inputs:descriptor.defaultInputs(),emitted:null as any};live.set(id,state);
  const handle={id,remove:()=>{model.stop();live.delete(id);},moveTo:(target:any)=>{state.pane=typeof target==='string'?target:target.pane??'new-'+ ++sequence;boundaryCall();},setInputs:(inputs:any)=>{state.inputs=structuredClone(inputs);model.setInputs(inputs);boundaryCall();},setVisible:(next:boolean)=>{visible=next;next?model.resume():model.suspend();boundaryCall();},get visible(){return visible;}};
  model.start({id,bars:()=>bars,emit:(value:any)=>{state.emitted=value;boundaryCall();},setStatus:()=>{}} as any,state.inputs);return handle;
 }};
 return {port:createIndicatorPort(chart as unknown as Vela),live,fail:(count:number)=>{failures=count;}};
}
it('failed input emission restores model, native inputs and plots without success notification',()=>{
 const test=boundary(),id=test.port.add('sma',{length:2}),before=test.port.serialize(),values=test.port.values(id);let changes=0;test.port.subscribe(()=>changes++);
 test.fail(1);expect(()=>test.port.update(id,{inputs:{length:3}})).toThrow(/Injected/);
 expect(test.port.serialize()).toEqual(before);expect(test.port.values(id)).toEqual(values);expect([...test.live.values()][0].inputs.length).toBe(2);expect(changes).toBe(0);
 test.port.update(id,{inputs:{length:3}});expect(test.port.values(id).series[0].values).toEqual([null,null,2,3]);expect(changes).toBe(1);test.port.dispose();
});
it('incomplete native rollback produces explicit unavailable state and aggregate error',()=>{
 const test=boundary(),id=test.port.add('sma',{length:2}),before=test.port.serialize();test.fail(10);
 expect(()=>test.port.update(id,{visible:false})).toThrow(AggregateError);expect(test.port.serialize()).toEqual(before);expect(test.port.values(id).series).toEqual([]);expect(test.port.values(id).diagnostics[0]).toContain('rollback was incomplete');test.fail(0);test.port.dispose();
});
it('failed restore recreates original logical collection without publishing partial success',()=>{
 const test=boundary();test.port.add('sma',{length:2});const saved=test.port.serialize();let changes=0;test.port.subscribe(()=>changes++);test.fail(1);
 expect(()=>test.port.restore([{...saved[0],id:'replacement'}])).toThrow(/Injected/);expect(test.port.serialize()).toEqual(saved);expect(test.live.size).toBe(1);expect(changes).toBe(0);test.port.dispose();
});
it('caller edits cannot change model ownership or mutate an already accepted style',()=>{
 const test=boundary(),plots={sma:defaultPlotStyle('sma','sma',0)},id=test.port.add('sma',{length:2},{plots});plots.sma.color='#000000';
 expect(test.port.serialize()[0].plots.sma.color).toBe('#4fc3d9');/* Palette */expect(()=>test.port.update(id,{id:'other'} as any)).toThrow(/Unsupported/);expect(test.port.serialize()[0].id).toBe(id);test.port.dispose();
});
it('a move that changes native placement before failing restores the original pane',()=>{
 const test=boundary(),id=test.port.add('sma',{length:2}),before=test.port.serialize();let changes=0;test.port.subscribe(()=>changes++);test.fail(1);
 expect(()=>test.port.move(id,{newPane:true})).toThrow(/Injected/);expect(test.port.serialize()).toEqual(before);expect(test.port.list()[0].paneId).toBe('price');expect(changes).toBe(0);test.port.dispose();
});
it('a failed guide/fill/palette edit restores exact accepted native output and canonical settings',()=>{
 const test=boundary(),id=test.port.add('rsi',{length:2}),before=test.port.serialize(),output=structuredClone([...test.live.values()][0].emitted);let changes=0;test.port.subscribe(()=>changes++);
 const presentation=defaultIndicatorPresentation('rsi');presentation.guides.upper!.value=95;presentation.fills.band!.color='rgba(10,20,30,.5)';presentation.fills.band!.opacity=50;
 test.fail(1);expect(()=>test.port.update(id,{presentation})).toThrow(/Injected/);expect(test.port.serialize()).toEqual(before);expect([...test.live.values()][0].emitted).toEqual(output);expect(changes).toBe(0);
 test.port.update(id,{presentation});expect([...test.live.values()][0].emitted.fills[0].color).toBe('rgba(10,20,30,0.25)');expect(test.port.list()[0].series.map(row=>row.id)).toEqual(['rsi']);expect(test.port.values(id).series.map(row=>row.id)).toEqual(['rsi']);test.port.dispose();
});
it('legacy restore keeps absent presentation and smoothing inputs absent across native updates',()=>{
 const test=boundary(),saved={id:'legacy-rsi',kind:'rsi' as const,inputs:{length:2,source:'close'},plots:{},offset:0,visible:true,paneId:'price'};
 test.port.restore([saved]);expect(test.port.serialize()).toEqual([saved]);expect([...test.live.values()][0].emitted.priceLines).toEqual([]);expect([...test.live.values()][0].emitted.fills).toEqual([]);
 test.port.update(saved.id,{plots:{rsi:{...defaultPlotStyle('rsi','rsi',0),trackPrice:true}}});expect(Object.hasOwn(test.port.serialize()[0],'presentation')).toBe(false);expect(test.port.serialize()[0].inputs).toEqual(saved.inputs);test.port.dispose();
});
it('presentation diagnostics stay outside numerical signals and retained smoothing does not fabricate bands',()=>{
 const test=boundary();try{
  const id=test.port.add('sma',{length:2}),inactive=test.port.list()[0];
  expect(inactive.inputs.smoothingType).toBe('None');expect(inactive.presentation?.fills.smoothing?.visible).toBe(true);
  expect(inactive.presentationDiagnostics).toEqual([]);expect(test.port.values(id).diagnostics).toEqual([]);
  expect([...test.live.values()][0].emitted.series).toHaveLength(1);expect([...test.live.values()][0].emitted.fills).toEqual([]);
  test.port.update(id,{inputs:{smoothingType:'SMA+BB',smoothingLength:2}});expect(test.port.list()[0].presentationDiagnostics).toEqual([]);expect([...test.live.values()][0].emitted.series).toHaveLength(6);expect(test.port.values(id).series).toHaveLength(4);
  const saved=test.port.serialize();test.port.restore(saved);expect(test.port.serialize()).toEqual(saved);
 }finally{test.port.dispose();}
});
it('active smoothing variance overflow preserves base values and separates numerical from presentation warnings',()=>{
 const test=boundary([1e304,2e304]);try{
  // These artificial prices are finite. Squaring their centered offsets overflows
  // population variance before the band multiplier runs; length-1 SMA stays finite.
  const id=test.port.add('sma',{length:1,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:100000});
  const row=test.port.list()[0],values=test.port.values(id),output=[...test.live.values()][0].emitted;
  const numericWarning='Standard-deviation arithmetic overflowed; the bands are unavailable.';
  const presentationWarning='smoothing fill is unavailable because its required boundaries are absent or unavailable.';
  expect(row.informationBars).toBe(2);expect(row.inputs.smoothingType).toBe('SMA+BB');expect(row.presentation?.fills.smoothing?.visible).toBe(true);
  expect(values.series.find(plot=>plot.id==='sma')?.values).toEqual([1e304,2e304]);
  expect(values.series.filter(plot=>plot.id!=='sma').map(plot=>({id:plot.id,values:plot.values}))).toEqual([
   {id:'smooth',values:[null,null]},{id:'smoothUpper',values:[null,null]},{id:'smoothLower',values:[null,null]},
  ]);
  expect(values.diagnostics).toEqual([]);expect(values).toHaveProperty('plotDiagnostics',{smooth:[numericWarning],smoothUpper:[numericWarning],smoothLower:[numericWarning]});
  expect(row.presentationDiagnostics).toEqual([presentationWarning]);expect(row.diagnostics).toContain(numericWarning);expect(row.diagnostics).toContain(presentationWarning);
  expect(output.series).toHaveLength(4);expect(output.fills).toEqual([]);
 }finally{test.port.dispose();}
});
it('collection capacity rejects native add and restore before allocating another handle',()=>{
 let calls=0;const rows=Array.from({length:100000},(_,index)=>({time:1700000000+index*60,open:1,high:1,low:1,close:1,volume:1}));
 const chart={panes:{list:()=>[]},addNativeIndicator(){calls++;return {id:'native-'+calls,remove(){},setVisible(){}};}} as unknown as Vela;
 // One 100k SMA costs 10.8m with native output; an eighth exceeds the 80m batch cap (four single-study caps).
 const port=createIndicatorPort(chart,undefined,undefined,()=>rows);for(let i=0;i<7;i++)port.add('sma',{length:2},{id:'sma-'+i});const before=port.serialize();
 expect(()=>port.add('sma',{length:2},{id:'overflow'})).toThrow(/batch exceeds/);expect(calls).toBe(7);expect(port.serialize()).toEqual(before);
 expect(()=>port.restore([...before,{...before[0],id:'overflow'}])).toThrow(/batch exceeds/);expect(calls).toBe(7);expect(port.serialize()).toEqual(before);expect(()=>port.update('sma-0',{inputs:{smoothingType:'SMA+BB',smoothingLength:2}})).toThrow(/batch exceeds/);expect(port.serialize()).toEqual(before);port.dispose();
});
it('disposal attempts every native/listener cleanup, unregisters descriptors and retires the port after faults',()=>{
 const removed:string[]=[],types:string[]=[],offs:string[]=[];
 const chart={panes:{list:()=>[]},on:(event:string)=>()=>{offs.push(event);if(event==='indicator:removed')throw Error('off failure');},addNativeIndicator(type:string){types.push(type);return{id:type,remove(){removed.push(type);if(removed.length===1)throw Error('remove failure');},setVisible(){}};}} as unknown as Vela;
 const port=createIndicatorPort(chart);port.add('sma',{length:2});port.add('ema',{length:2});expect(()=>port.dispose()).toThrow(AggregateError);expect(removed).toEqual(types);expect(offs).toEqual(['indicator:removed','indicator:moved']);for(const type of types)expect(getNativeIndicator(type)).toBeUndefined();expect(()=>port.add('sma')).toThrow(/disposed/);expect(()=>port.dispose()).not.toThrow();
});
it('rejects behavioral descendants before cloning saved or edited presentation and plot settings',()=>{
 const test=boundary();let reads=0;const style=defaultPlotStyle('sma','sma',0);Object.defineProperty(style,'color',{enumerable:true,get(){reads++;return '#ff0000';}});
 expect(()=>test.port.add('sma',{length:2},{plots:{sma:style}})).toThrow();expect(reads).toBe(0);expect(test.live.size).toBe(0);
 const id=test.port.add('rsi',{length:2}),before=test.port.serialize(),presentation=defaultIndicatorPresentation('rsi');Object.defineProperty(presentation.guides.upper!,'value',{enumerable:true,get(){reads++;return 99;}});
 expect(()=>test.port.update(id,{presentation})).toThrow();expect(reads).toBe(0);expect(test.port.serialize()).toEqual(before);expect(()=>test.port.update(id,{plots:{rsi:style}})).toThrow();expect(reads).toBe(0);test.port.dispose();
});
