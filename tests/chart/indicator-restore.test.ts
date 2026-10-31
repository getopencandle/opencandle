import { it,expect } from 'vitest';
import { getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext } from '@luxalgo/vela';
import { createIndicatorPort } from '../../src/chart/indicator-port';
const full=[1,2,3,4,5].map((close,index)=>({time:(1700000000+index*60)*1000,open:close,high:close+1,low:close-1,close,volume:10}));
// Renderer-free lifecycle stand-in; this is deliberately not executable UI evidence.
function lifecycleChart(){
  let loaded=full,sequence=0;const live=new Map<string,{model:NativeIndicator;pane:string}>();
  const chart={
    panes:{list:()=>[...new Set(['price',...[...live.values()].map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.pane===id).map(([id])=>({id}))}))},
    addNativeIndicator(type:string){
      const descriptor=getNativeIndicator(type)!,id=`renderer-${++sequence}`,model=descriptor.create();const row={model,pane:descriptor.paneHint==='price'?'price':`pane-${sequence}`};live.set(id,row);
      const inputs=descriptor.defaultInputs();let visible=true;
      const handle={id,title:descriptor.title,setInputs:(values:any)=>model.setInputs(values),setVisible:(value:boolean)=>{visible=value;value?model.resume():model.suspend();},get visible(){return visible;},moveTo:(target:any)=>{row.pane=typeof target==='string'?target:target.pane??`new-pane-${++sequence}`;},remove:()=>{model.stop();live.delete(id);}};
      model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>loaded,emit:()=>{},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,inputs);
      return handle;
    },
  };
  return {chart:chart as unknown as Vela,setPrefix:(length:number)=>{loaded=full.slice(0,length);for(const row of live.values())row.model.onBars();},live};
}
it('serialized logical pane IDs survive renderer recreation and preserve shared panes',()=>{
  const first=lifecycleChart(),port=createIndicatorPort(first.chart),a=port.add('rsi',{length:3}),b=port.add('atr',{length:3});
  port.move(b,{pane:port.list().find(row=>row.id===a)!.paneId!});
  const saved=port.serialize();expect(saved[0].paneId).toBe(saved[1].paneId);expect(saved[0].paneId).toMatch(/^lv-pane-/);
  const second=lifecycleChart(),restored=createIndicatorPort(second.chart);let notifications=0;restored.subscribe(()=>notifications++);
  expect(restored.restore(saved)).toEqual({changed:true});expect(notifications).toBe(1);expect(restored.serialize()).toEqual(saved);
  expect(restored.restore(saved)).toEqual({changed:false});expect(notifications).toBe(1);
  expect(restored.list()[0].paneId).toBe(restored.list()[1].paneId);
  port.dispose();restored.dispose();
});
it('invalid restoration preserves all prior instances and changes no renderer objects',()=>{
  const source=lifecycleChart(),port=createIndicatorPort(source.chart);port.add('sma',{length:3});const saved=port.serialize(),count=source.live.size;
  expect(()=>port.restore([{...saved[0],inputs:{length:-1,source:'close'}}])).toThrow();expect(port.serialize()).toEqual(saved);expect(source.live.size).toBe(count);port.dispose();
});
it('domain computation receives exactly the available context prefix',()=>{
  const source=lifecycleChart(),port=createIndicatorPort(source.chart),id=port.add('sma',{length:3});source.setPrefix(3);
  expect(port.list()[0].informationBars).toBe(3);expect(port.values(id).series[0].values).toEqual([null,null,2]);
  source.setPrefix(4);expect(port.values(id).series[0].values).toEqual([null,null,2,3]);port.dispose();
});
