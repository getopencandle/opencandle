import {expect,it} from 'vitest';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {heikinAshiBars} from '../../src/chart/calculation-bars';
it('native built-ins consume the selected transformed prefix and recalculate when the basis changes',()=>{
 let transformed=true,model:any,emitted:any,alive=true;
 const raw=[{time:1000,open:10,high:16,low:8,close:14,volume:10},{time:2000,open:14,high:22,low:12,close:20,volume:20}];
 const chart={panes:{list:()=>[{id:'price',indicators:alive?[{id:'native',ownScale:false}]:[]}]},addNativeIndicator(type:string){const spec=getNativeIndicator(type)!;model=spec.create();model.start({id:'native',bars:()=>raw,emit:(value:any)=>{emitted=value;},setStatus:()=>{}} as any,spec.defaultInputs());return{id:'native',remove(){model.stop();alive=false;},setVisible(value:boolean){value?model.resume():model.suspend();},setInputs(value:any){model.setInputs(value);}};}};
 const port=createIndicatorPort(chart as unknown as Vela,undefined,bars=>transformed?heikinAshiBars(bars):bars.map(row=>({...row}))),id=port.add('sma',{length:2});
 expect(port.values(id).series[0].values).toEqual([null,14.5]);expect(emitted.series[0].points).toEqual([{time:1000,value:null},{time:2000,value:14.5}]);
 port.update(id,{inputs:{source:'open'}});expect(port.values(id).series[0].values).toEqual([null,12]);port.update(id,{inputs:{source:'close'}});
 transformed=false;port.recompute();expect(port.values(id).series[0].values).toEqual([null,17]);expect(raw[1].close).toBe(20);port.dispose();
});
