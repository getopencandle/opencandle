import {afterEach,it,expect} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {inputs,bars} from '../fixtures/r42-trading-sessions';
const ports:ReturnType<typeof createIndicatorPort>[]=[];
afterEach(()=>{for(const port of ports.splice(0))port.dispose();});
function rig(){
 const nativeBars=bars.map(bar=>({...bar,time:bar.time*1000})),host=nativeHost(nativeBars),context={resolution:'1m',exchangeZone:'UTC',style:'candles',tickSize:1};
 const port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,undefined,undefined,()=>context);ports.push(port);
 const model=(id:string)=>host.live.get(port.list().find(row=>row.id===id)!.rendererId);
 return{port,host,model,nativeBars,context};
}
it('the real port publishes observed session geometry while retaining causal readout values',()=>{
 const {port,model}=rig(),id=port.add('tradingsessions',inputs),output=model(id).emitted;
 expect(output.boxes).toHaveLength(1);expect(output.labels[0].text).toBe('SYNTHETIC afternoon\n6 ticks\nAverage 12');expect(port.values(id).series[0].values).toEqual([null,10,12,null]);
});
it('remove, undo-style restore, redo-style removal and fresh layout restore rebuild current observations',()=>{
 const {port,host,model,nativeBars}=rig(),id=port.add('tradingsessions',inputs),saved=structuredClone(port.serialize());port.remove(id);expect(host.live.size).toBe(0);
 nativeBars[2].close=18;nativeBars[2].high=19;port.restore(structuredClone(saved));expect(model(id).emitted.lines.find((line:any)=>line.style==='dotted').y1).toBe(14);
 port.restore([]);expect(host.live.size).toBe(0);nativeBars[2].close=22;nativeBars[2].high=23;port.restore(structuredClone(saved));expect(model(id).emitted.boxes[0].top).toBe(23);expect(port.values(id).series[0].values).toEqual([null,10,16,null]);
});
it('Hide/Show recomputes corrected supplied prices and dispose removes the owned native model',()=>{
 const {port,host,model,nativeBars}=rig(),id=port.add('tradingsessions',inputs);port.update(id,{visible:false});expect(model(id).visible).toBe(false);
 nativeBars[2].close=18;nativeBars[2].high=19;port.update(id,{visible:true});expect(model(id).visible).toBe(true);expect(port.values(id).series[0].values).toEqual([null,10,14,null]);port.dispose();ports.splice(ports.indexOf(port),1);expect(host.live.size).toBe(0);
});
it('source zone/style replacement retires prior geometry and refuses unsupported derived prices',()=>{
 const {port,model,context}=rig(),id=port.add('tradingsessions',{...inputs,session1Zone:''});expect(model(id).emitted.boxes).toHaveLength(1);
 context.exchangeZone='America/New_York';model(id).model.onBars();expect(model(id).emitted.boxes).toEqual([]);expect(port.values(id).series[0].values).toEqual([null,null,null,null]);
 context.exchangeZone='UTC';model(id).model.onBars();expect(model(id).emitted.boxes).toHaveLength(1);
 context.style='renko';model(id).model.onBars();expect(model(id).emitted.boxes).toEqual([]);expect(port.list()[0].diagnostics.join(' ')).toContain('supported time-based price chart');
});
